import { computed, DestroyRef, effect, inject, Injectable, untracked } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PieceLinksService } from '@axe/application/tabletop/piece-links.service';
import { RoomRulesService } from '@axe/application/tabletop/room-rules.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { TurnHooksService } from '@axe/application/turn/turn-hooks.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { debounce } from '@axe/core/util/debounce';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { Party } from '@axe/domain/party/party';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { CellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import { sheetNumberOf } from '@axe/domain/tabletop/move/move-cells';
import { squarePxOf } from '@axe/domain/tabletop/move/move-grid';
import { MoveKind, moveKindNamed, parseMoveKinds } from '@axe/domain/tabletop/move/move-kind';
import { boundBelow, boundTo } from '@axe/domain/tabletop/move/piece-bonds';
import { pieceCentreOf, pieceCentreOffsetPx } from '@axe/domain/tabletop/move/piece-on-grid';
import { frontRidersOf } from '@axe/domain/tabletop/ride/ride-rules';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { TurnState } from '@axe/domain/tabletop/turn-state';
import { EngagementZone, zonesOn } from '@axe/domain/tabletop/zone/engagement-zone';
import { FirePiece, FireReport, lineOfFire } from '@axe/domain/tabletop/zone/line-of-fire';
import { gatheredAbout, ZonePoint } from '@axe/domain/tabletop/zone/zone-geometry';
import {
  mayMoveByZones,
  metresPerCell,
  snapOn,
  ZoneInterrupters,
  zoneInterrupters,
  ZoneMoveLimits,
  zoneMoveLimits,
  zoneMoveOutcome,
  ZoneMoveStart,
  ZoneReachTerms,
  zoneReachTerms,
  ZoneSnapshot,
  ZoneTable,
} from '@axe/domain/tabletop/zone/zone-queries';
import { DEFAULT_ZONE_RULES, ZoneRules } from '@axe/domain/tabletop/zone/zone-rules';
import { sideOfPiece } from '@axe/domain/tabletop/zone/zone-sides';
import {
  hasZoneWrites,
  ZonePieceInput,
  ZoneState,
  zoneStateOf,
  ZoneView,
  ZoneWrites,
} from '@axe/domain/tabletop/zone/zone-state';

/** How long after a change the peer that keeps zones in order waits before writing what followed. */
const TIDY_DELAY_MS = 500;

const NO_ZONES: ZoneState = zoneStateOf({ zones: [], pieces: [], rules: DEFAULT_ZONE_RULES, pxPerMetre: 1 });

/** What a piece's menu offers about zones. */
export interface ZoneMenuModel {
  readonly enabled: boolean;
  /** The zone the piece is in, or null. */
  readonly zone: { readonly id: string; readonly square: boolean; readonly limit: number | null } | null;
  /** The zones the piece stands in without being in them, which it may join. */
  readonly joinable: readonly string[];
  /** The enemies standing at the same point, which it may declare a fight with. */
  readonly foes: readonly { readonly id: string; readonly name: string }[];
  readonly offField: boolean;
  /** For a piece in a zone: whether it has said it will leave, and whether it may say so. */
  readonly leave: { readonly said: boolean; readonly maySay: boolean } | null;
  /** Whether some other piece is aimed at, which a line of fire can be checked against. */
  readonly aiming: boolean;
  /** Whether nobody can see the piece, whose moves nobody may stop. */
  readonly unseen: boolean;
  /** Whether the piece is down and cannot act. */
  readonly down: boolean;
  /** Whether the piece is held fast where it stands. */
  readonly held: boolean;
  /** The piece holding on to this one, or null. */
  readonly grabbedBy: { readonly id: string; readonly name: string } | null;
  /** The pieces this one holds on to. */
  readonly grabbing: readonly { readonly id: string; readonly name: string }[];
  /** The enemies at the same point this one may take hold of. */
  readonly grabbable: readonly { readonly id: string; readonly name: string }[];
}

const NO_MENU: ZoneMenuModel = {
  enabled: false,
  zone: null,
  joinable: [],
  foes: [],
  offField: false,
  leave: null,
  aiming: false,
  unseen: false,
  down: false,
  held: false,
  grabbedBy: null,
  grabbing: [],
  grabbable: [],
};

/** Where pieces stand and the sides they fight on, as the zones had them at one moment. */
export interface ZoneReading {
  /** Where a piece counts as standing: the centre of its zone, or the middle of its token. */
  pointOf(piece: GameCharacter): ZonePoint;
  /** The side a piece fights on; null where it is on none or zones are not played. */
  sideOf(piece: GameCharacter): string | null;
}

/**
 * The engagement zones on the table in view, and what is done to them.
 *
 * A zone is made by declaring a fight between two pieces standing at the same point, and joined,
 * left or taken out of by the pieces' own menus; how big it is, which zones run into one another
 * and which end is worked out from who is in them. The peer that acts writes what followed at once,
 * and one peer, a game master where there is one, writes it a moment later for changes nobody made
 * through a zone at all, such as a piece deleted or carried off.
 */
@Injectable({ providedIn: 'root' })
export class EngagementZoneService {
  private readonly objectStore = inject(ObjectStore);
  private readonly roomRules = inject(RoomRulesService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly chat = inject(ChatMessageService);
  private readonly snackbar = inject(SnackbarService);
  private readonly vision = inject(VisionService);
  private readonly links = inject(PieceLinksService);
  private readonly t = inject(TRANSLATE_FN);

  /** The rules the room plays zones by. */
  readonly rules = computed<ZoneRules>(() => {
    this.objectChange.versionOf('Config')();
    return this.roomRules.zoneRules();
  });

  /** The zones on the table in view, worked out from who is in them. */
  private readonly current = computed<ZoneSnapshot | null>(
    () => {
      this.objectChange.versionOf('Config')();
      this.objectChange.versionOf(this.tableSelecter.identifier)();
      this.objectChange.collectionOf(GameCharacter.aliasName)();
      this.objectChange.collectionOf(EngagementZone.aliasName)();
      this.objectChange.collectionOf(Party.aliasName)();
      const table = this.tableSelecter.viewTable;
      if (table) this.objectChange.versionOf(table.identifier)();
      for (const zone of zonesOn(table)) this.objectChange.versionOf(zone.identifier)();
      for (const piece of this.objectStore.getObjects<GameCharacter>(GameCharacter)) {
        this.objectChange.versionOf(piece.identifier)();
      }
      for (const party of this.objectStore.getObjects<Party>(Party)) this.objectChange.versionOf(party.identifier)();
      return this.snapshot();
    },
    { equal: () => false }
  );

  readonly state = computed<ZoneState>(() => this.current()?.state ?? NO_ZONES);

  /**
   * What of the zones shapes a move, as one string: the zones, who is in and standing in each, and
   * what each piece brings to them. A reach worked out is kept while it stays the same, rather than
   * worked out again for every change to any piece, such as one to its sheet.
   */
  readonly moveShapingKey = computed<string>(() => {
    const snapshot = this.current();
    if (!snapshot) return '';
    const zones = snapshot.state.zones.map((zone) =>
      [
        zone.id,
        Math.round(zone.shape.centre.x),
        Math.round(zone.shape.centre.y),
        Math.round(zone.shape.reach),
        zone.shape.square,
        zone.limit,
        zone.occupants,
        zone.overflowing,
        zone.forming,
        zone.members.join(','),
        zone.inside.join(','),
      ].join(':')
    );
    const pieces = snapshot.pieces.map((one) => {
      const piece = this.objectStore.get<GameCharacter>(one.id);
      return [
        one.id,
        one.zone,
        one.side ?? '',
        one.count,
        one.offField,
        one.down,
        one.held,
        one.grabbedBy ?? '',
        one.ridingOn ?? '',
        piece?.zoneLeaveRound ?? '',
        piece?.unstoppableMove ?? '',
        piece?.unseen ?? '',
        piece?.stealth ?? '',
      ].join(':');
    });
    return `${zones.join('|')}#${pieces.join('|')}`;
  });

  constructor() {
    const hooks = inject(TurnHooksService);
    const stopTurnEnd = hooks.onTurnEnd(() => this.confirmForming());
    const stopTurnStart = hooks.onTurnStart((identifier) => this.pullInAtTurnStart(identifier));
    // Said on this peer's cursor from the moment it is here, rather than the first time a zone needs
    // tidying: the room counts on it to keep order and to answer for its pieces when a move is
    // stepped into, and a room with no zone yet would otherwise find nobody to ask.
    effect(() => {
      this.objectChange.collectionOf(PeerCursor.aliasName)();
      const mine = PeerCursor.myCursor;
      if (mine && mine.zoneProtocol !== '1') untracked(() => (mine.zoneProtocol = '1'));
    });
    effect(() => {
      const writes = this.state().writes;
      if (!hasZoneWrites(writes)) return;
      untracked(() => this.tidySoon());
    });
    inject(DestroyRef).onDestroy(() => {
      this.tidySoon.cancel();
      stopTurnEnd();
      stopTurnStart();
    });
  }

  /** Whether the room plays engagement zones at all. */
  isEnabled(): boolean {
    return this.rules().enabled;
  }

  /**
   * Whether a move is stopped by the side it runs into choosing to stop it, as the room steps into
   * moves, rather than by every zone it runs into stopping it of itself.
   */
  stopsByChoice(): boolean {
    return this.isEnabled() && this.config()?.interruptEnabled === true;
  }

  /**
   * Declares a fight between two pieces, which puts both in a zone at the second one's point.
   *
   * Where either is already in a zone, no new one is made: the other joins it. Returns the zone they
   * are in, or null where zones are not played or there is no table.
   */
  declare(attacker: GameCharacter, target: GameCharacter): EngagementZone | null {
    const world = this.tableNow();
    if (!world) return null;
    const state = this.stateNow();
    const joining = state.zoneOf(target.identifier) ?? state.zoneOf(attacker.identifier);
    let zone: EngagementZone | null = joining ? this.zoneById(joining.id) : null;
    GameObject.batch(() => {
      if (!zone) {
        zone = new EngagementZone();
        zone.initialize();
        zone.centre = world.snap(state.pointOf(target.identifier) ?? pieceCentreOf(target, world.table.gridSize));
        world.table.appendChild(zone);
      }
      for (const piece of this.links.withPartners([attacker, target])) this.putInZone(piece, zone.identifier);
    });
    this.settle([zone!.identifier]);
    this.chat.sendSystemNotice(
      'movement',
      this.t('feature.zone.chat.declared', { attacker: attacker.name, target: target.name })
    );
    return zone;
  }

  /**
   * Makes a zone at a point with the pieces given in it, as stepping into a move does: forming until
   * the turn ends where turns are being kept, and in force at once otherwise or where `atOnce` says
   * so. Null where zones are not played, or fewer than two pieces are given.
   */
  formAt(point: ZonePoint, pieces: readonly GameCharacter[], atOnce = false): EngagementZone | null {
    const world = this.tableNow();
    if (!world || pieces.length < 2) return null;
    const turn = this.turnState();
    const zone = new EngagementZone();
    GameObject.batch(() => {
      zone.initialize();
      zone.centre = world.snap(point);
      zone.forming = !atOnce && turn && turn.phase !== 'idle' ? '1' : '';
      world.table.appendChild(zone);
      for (const piece of this.links.withPartners(pieces)) this.putInZone(piece, zone.identifier);
    });
    this.settle([zone.identifier]);
    return zone;
  }

  /**
   * Puts a piece that begins its turn standing in a zone holding more than its limit, without being
   * in it, into that zone. A piece out of the fight is left alone.
   */
  pullInAtTurnStart(identifier: string): void {
    const piece = this.objectStore.get<GameCharacter>(identifier);
    if (!(piece instanceof GameCharacter) || piece.offField === '1' || !this.mayAct(piece)) return;
    const state = this.stateNow();
    if (state.zoneOf(identifier)) return;
    const crowded = state.insideOf(identifier).find((zone) => zone.overflowing);
    if (!crowded) return;
    GameObject.batch(() => {
      for (const one of this.links.withPartners([piece])) {
        one.engagementZone = crowded.id;
        one.zoneLeaveRound = '';
      }
    });
    this.settle([crowded.id]);
    this.chat.sendSystemNotice('movement', this.t('feature.zone.chat.pulledIn', { name: piece.name }));
  }

  /** Puts every zone still forming in force, as a turn ends. */
  confirmForming(): void {
    const forming = zonesOn(this.tableSelecter.viewTable).filter((zone) => zone.isForming);
    if (forming.length < 1) return;
    GameObject.batch(() => {
      for (const zone of forming) zone.forming = '';
    });
  }

  /**
   * Pulls pieces into a zone, as the zone stopping a move does: each is put on the zone's centre and
   * joins it, along with any piece holding on to it or held on to by it.
   */
  pullInto(zoneId: string, pieces: readonly GameCharacter[]): void {
    const zone = this.zoneById(zoneId);
    const world = this.tableNow();
    const centre = zone?.centre;
    if (!zone || !world || !centre || pieces.length < 1) return;
    GameObject.batch(() => {
      for (const piece of this.links.withPartners(pieces)) {
        const half = pieceCentreOffsetPx(piece, world.table.gridSize);
        piece.engagementZone = zoneId;
        piece.zoneLeaveRound = '';
        piece.location.x = centre.x - half;
        piece.location.y = centre.y - half;
      }
    });
    this.settle([zoneId]);
  }

  /**
   * Puts a piece in a zone, its point becoming the zone's centre, along with any piece holding on to
   * it or held on to by it.
   */
  join(piece: GameCharacter, zoneId: string): void {
    if (!this.zoneById(zoneId)) return;
    GameObject.batch(() => {
      for (const one of this.links.withPartners([piece])) this.putInZone(one, zoneId);
    });
    this.settle([zoneId]);
    this.chat.sendSystemNotice('movement', this.t('feature.zone.chat.joined', { name: piece.name }));
  }

  /** Takes a piece out of its zone, leaving its token standing where it is. */
  leave(piece: GameCharacter): void {
    if (piece.engagementZone.length < 1) return;
    this.putInZone(piece, '');
    this.settle([]);
    this.chat.sendSystemNotice('movement', this.t('feature.zone.chat.left', { name: piece.name }));
  }

  /** Takes a piece out of the fight altogether, or puts it back in. */
  toggleOffField(piece: GameCharacter): void {
    const off = piece.offField !== '1';
    GameObject.batch(() => {
      piece.offField = off ? '1' : '';
      if (off) this.putInZone(piece, '');
    });
    this.settle([]);
    this.chat.sendSystemNotice(
      'movement',
      this.t(off ? 'feature.zone.chat.offField' : 'feature.zone.chat.onField', { name: piece.name })
    );
  }

  /** Says that nobody can see a piece, so nobody may stop its moves, or that they can again. */
  setUnseen(piece: GameCharacter, unseen: boolean): void {
    piece.unseen = unseen ? '1' : '';
  }

  /**
   * Says that a piece is down and cannot act, or that it is up again. A piece that goes down in a zone
   * is out of it where it lies, and stays out once it is up until it joins again.
   */
  setDown(piece: GameCharacter, down: boolean): void {
    const wasIn = piece.engagementZone.length > 0;
    GameObject.batch(() => {
      piece.downed = down ? '1' : '';
      if (down) {
        piece.engagementZone = '';
        piece.zoneLeaveRound = '';
      }
    });
    this.settle([]);
    if (down && wasIn) this.chat.sendSystemNotice('movement', this.t('feature.zone.chat.down', { name: piece.name }));
  }

  /** Says that a piece is held fast where it stands, or that it may move again. */
  setHeld(piece: GameCharacter, held: boolean): void {
    piece.heldFast = held ? '1' : '';
  }

  /**
   * Has one piece take hold of another at the same point. The one held cannot move of its own will,
   * goes where the one holding it goes, and is in a zone only while the one holding it is.
   */
  grab(holder: GameCharacter, captive: GameCharacter): void {
    if (holder === captive || captive.grabbedBy === holder.identifier) return;
    GameObject.batch(() => {
      captive.grabbedBy = holder.identifier;
      this.links.standAt(captive, holder);
    });
    this.settle([]);
    this.chat.sendSystemNotice(
      'movement',
      this.t('feature.zone.chat.grabbed', { holder: holder.name, captive: captive.name })
    );
  }

  /** Lets go of a piece held on to, which stays where it is. */
  release(captive: GameCharacter): void {
    const holder = this.links.holderOf(captive);
    if (captive.grabbedBy === '') return;
    captive.grabbedBy = '';
    this.settle([]);
    this.chat.sendSystemNotice(
      'movement',
      this.t('feature.zone.chat.released', { captive: captive.name, holder: holder?.name ?? '' })
    );
  }

  /**
   * Offers to declare a fight between a piece just put down and an enemy standing at the same point,
   * where the room plays zones and the piece is in none.
   */
  offerFight(piece: GameCharacter): void {
    const menu = this.menuOf(piece);
    if (!menu.enabled || menu.zone || menu.down || menu.foes.length < 1) return;
    const foe = this.objectStore.get<GameCharacter>(menu.foes[0].id);
    if (!(foe instanceof GameCharacter)) return;
    this.snackbar.show(this.t('feature.zone.offerFight', { name: piece.name, foe: foe.name }), {
      action: { label: this.t('feature.zone.offerFightAction'), run: () => this.declare(piece, foe) },
    });
  }

  /** Sets the most a zone may hold, or null for as many as the size table allows. */
  setLimit(zoneId: string, limit: number | null): void {
    const zone = this.zoneById(zoneId);
    if (!zone) return;
    zone.capacity = limit === null ? '' : `${Math.max(1, Math.floor(limit))}`;
  }

  /** Draws a zone as a square, or as a circle again. */
  setSquare(zoneId: string, square: boolean): void {
    const zone = this.zoneById(zoneId);
    if (!zone) return;
    zone.shape = square ? 'square' : '';
    this.settle([zoneId]);
  }

  /** Ends a zone outright, taking every piece out of it. */
  remove(zoneId: string): void {
    const zone = this.zoneById(zoneId);
    if (!zone) return;
    GameObject.batch(() => {
      for (const piece of this.objectStore.getObjects<GameCharacter>(GameCharacter)) {
        if (piece.engagementZone === zoneId) this.putInZone(piece, '');
      }
      zone.destroy();
    });
  }

  /** The zones on the table in view, worked out from what is held now rather than from what was last seen. */
  stateNow(): ZoneState {
    return this.snapshot()?.state ?? NO_ZONES;
  }

  /** What a piece's menu offers about zones, worked out from what is held now. */
  menuOf(piece: GameCharacter): ZoneMenuModel {
    const snapshot = this.snapshot();
    if (!snapshot) return NO_MENU;
    const { state, pieces, world } = snapshot;
    const self = pieces.find((one) => one.id === piece.identifier);
    const own = state.zoneOf(piece.identifier);
    const zone = own ? this.zoneById(own.id) : null;
    const here = state.pointOf(piece.identifier);
    const reach = world.rules.samePointM * world.pxPerMetre + 1e-6;
    const seen = (other: { id: string }) => {
      const one = this.objectStore.get<GameCharacter>(other.id);
      return one instanceof GameCharacter && this.vision.isTokenVisible(one);
    };
    const foes =
      self && self.side !== null && !self.offField && here
        ? pieces
            .filter(
              (other) =>
                other.id !== self.id &&
                !other.offField &&
                !other.down &&
                !other.held &&
                other.side !== null &&
                other.side !== self.side
            )
            .filter((other) => {
              const there = state.pointOf(other.id);
              return there !== null && Math.hypot(there.x - here.x, there.y - here.y) <= reach;
            })
            .filter(seen)
            .map((other) => ({ id: other.id, name: this.objectStore.get<GameCharacter>(other.id)?.name ?? '' }))
        : [];
    const standing = own ? [] : state.insideOf(piece.identifier);
    const acting = this.mayAct(piece);
    const holder = this.links.holderOf(piece);
    const named = (one: { id: string }) => ({
      id: one.id,
      name: this.objectStore.get<GameCharacter>(one.id)?.name ?? '',
    });
    const grabbable =
      self && self.side !== null && !self.offField && here && acting && !holder
        ? pieces
            .filter(
              (other) =>
                other.id !== self.id &&
                !other.offField &&
                other.side !== null &&
                other.side !== self.side &&
                !this.objectStore.get<GameCharacter>(other.id)?.grabbedBy
            )
            .filter((other) => {
              const there = state.pointOf(other.id);
              return there !== null && Math.hypot(there.x - here.x, there.y - here.y) <= reach;
            })
            .filter(seen)
            .map(named)
        : [];
    return {
      enabled: true,
      zone: zone ? { id: zone.identifier, square: zone.isSquare, limit: zone.limit } : null,
      joinable: acting && !holder ? standing.map((view) => view.id) : [],
      foes: own || !acting ? [] : foes,
      offField: piece.offField === '1',
      leave: own
        ? { said: piece.zoneLeaveRound !== '', maySay: !own.overflowing }
        : standing.length > 0
          ? { said: piece.zoneLeaveRound !== '', maySay: !standing.some((view) => view.overflowing) }
          : null,
      aiming: pieces.some(
        (other) => other.id !== piece.identifier && this.objectStore.get<GameCharacter>(other.id)?.targeted
      ),
      unseen: piece.unseen === '1',
      down: piece.downed === '1',
      held: piece.heldFast === '1',
      grabbedBy: holder ? { id: holder.identifier, name: holder.name } : null,
      grabbing: this.links.captivesOf(piece).map((captive) => ({ id: captive.identifier, name: captive.name })),
      grabbable,
    };
  }

  /**
   * Puts a piece in a zone, or out of every zone with an empty identifier. Its word that it would
   * leave was given about the zone it was in, so it goes where the piece changes zones.
   */
  private putInZone(piece: GameCharacter, zoneId: string): void {
    if (piece.engagementZone !== zoneId && piece.zoneLeaveRound !== '') piece.zoneLeaveRound = '';
    piece.engagementZone = zoneId;
  }

  /** Whether a piece may act of its own will: not down, and not held fast where it stands. */
  private mayAct(piece: GameCharacter): boolean {
    return piece.downed !== '1' && piece.heldFast !== '1';
  }

  /** Whether nobody may stop a piece's move: nobody can see it, or it is making a move nobody may stop. */
  private isUnstoppable(piece: GameCharacter): boolean {
    return this.isUnseen(piece) || piece.unstoppableMove === '1';
  }

  /**
   * Whether nobody can see a piece, as the rules read it: marked so by hand, or in stealth where the
   * room counts stealth as that.
   */
  private isUnseen(piece: GameCharacter): boolean {
    return piece.unseen === '1' || (piece.stealth === '1' && this.rules().stealthUnseen);
  }

  /** The kinds of move the room plays, the plain kind alone where it names none. */
  moveKinds(): MoveKind[] {
    return parseMoveKinds(this.config()?.moveKinds ?? '');
  }

  /** Says that a piece in a zone will leave it, which it may do on a move in a later round. */
  prepareLeave(piece: GameCharacter): void {
    const turn = this.turnState();
    piece.zoneLeaveRound = turn && turn.phase !== 'idle' ? `${turn.round}` : '0';
    this.chat.sendSystemNotice('movement', this.t('feature.zone.chat.prepareLeave', { name: piece.name }));
  }

  /** Takes back a piece's word that it will leave its zone. */
  cancelLeave(piece: GameCharacter): void {
    piece.zoneLeaveRound = '';
  }

  /**
   * What zones make of a move by a kind, as the zones themselves: where it starts, whether it may be
   * made at all, which zones it may not enter, which end it on walking in, and which end it on
   * walking out. Null where zones say nothing about this piece.
   */
  moveLimitsFor(piece: GameCharacter, kindName: string): ZoneMoveLimits | null {
    const snapshot = this.snapshot();
    return snapshot ? zoneMoveLimits(snapshot, piece.identifier, kindName) : null;
  }

  /**
   * What zones make of a move by a kind on a grid: where it starts, whether it may be made at all,
   * what it may not enter and where it ends. Null where zones say nothing about this piece.
   */
  reachTermsFor(piece: GameCharacter, grid: CellGrid, kindName: string): ZoneReachTerms | null {
    const limits = this.moveLimitsFor(piece, kindName);
    return limits ? zoneReachTerms(limits, grid) : null;
  }

  /**
   * Who could stop a move by this piece, by a kind of move.
   *
   * Outside every zone, any piece on another side that is in no zone, stands in none, is on the
   * field and may act. Every zone the piece is not in that would hold it, as the sides in it count
   * against the piece: walking into one, or out of one it stands in without having said it would
   * leave; any piece of another side in such a zone may stop it there. And any piece of another side
   * standing in such a zone without being in it, that may act, within its own reach inside the zone.
   * Null where zones say nothing about this piece.
   */
  interruptersOf(mover: GameCharacter, kindName = ''): ZoneInterrupters | null {
    const snapshot = this.snapshot();
    return snapshot ? zoneInterrupters(snapshot, mover.identifier, kindName) : null;
  }

  /**
   * Where a piece counts as standing for what reaches it: the centre of its zone where it is in one,
   * and the middle of its token otherwise.
   */
  pointOf(piece: GameCharacter): ZonePoint {
    return this.reading().pointOf(piece);
  }

  /**
   * Where pieces stand and the sides they fight on, read from the zones as they are now, once: for
   * asking it of many pieces at a time, which asking piece by piece would work the zones out for again
   * every time.
   */
  reading(): ZoneReading {
    const snapshot = this.snapshot();
    const gridSize = this.tableSelecter.viewTable?.gridSize ?? 50;
    const sides = new Map(snapshot?.pieces.map((one) => [one.id, one.side]) ?? []);
    return {
      pointOf: (piece) => snapshot?.state.pointOf(piece.identifier) ?? pieceCentreOf(piece, gridSize),
      sideOf: (piece) => sides.get(piece.identifier) ?? null,
    };
  }

  /**
   * What stands between a shooter and a target as zones have it, and who the shot may land on; null
   * where the room does not play zones.
   */
  lineOfFireFor(shooter: GameCharacter, target: GameCharacter): FireReport | null {
    const snapshot = this.snapshot();
    if (!snapshot) return null;
    const { state, pieces, world } = snapshot;
    const fireOf = (piece: ZonePieceInput): FirePiece => ({
      id: piece.id,
      point: state.pointOf(piece.id) ?? piece.point,
      side: piece.side,
      zone: state.zoneOf(piece.id)?.id ?? '',
      inside: state.insideOf(piece.id).map((zone) => zone.id),
      offField: piece.offField,
    });
    const from = pieces.find((piece) => piece.id === shooter.identifier);
    const to = pieces.find((piece) => piece.id === target.identifier);
    if (!from || !to) return null;
    const clearName = world.rules.clearName;
    const clear =
      clearName.length > 0 &&
      (shooter.buffs.find(clearName) !== null ||
        (shooter.rootDataElement ? DataElement.findElementByReference(shooter.rootDataElement, clearName) : null) !==
          null);
    return lineOfFire({
      shooter: fireOf(from),
      target: fireOf(to),
      pieces: pieces.map(fireOf),
      zones: state.zones.map((zone) => ({ id: zone.id, shape: zone.shape, members: zone.members })),
      blockRadiusPx: world.rules.blockRadiusM * world.pxPerMetre,
      pxPerMetre: world.pxPerMetre,
      clear,
    });
  }

  /** The side a piece fights on, as zones tell sides apart; null where it is on none or zones are not played. */
  sideOf(piece: GameCharacter): string | null {
    return this.reading().sideOf(piece);
  }

  /** Whether a piece may move at all by a kind, as far as zones say. */
  mayMove(piece: GameCharacter, kindName: string): boolean {
    return mayMoveByZones(this.snapshot(), piece.identifier, kindName);
  }

  /** The names of the room's kinds of move zones let a piece go by, worked out from the zones once. */
  kindsAllowed(piece: GameCharacter): Set<string> {
    const snapshot = this.snapshot();
    return new Set(
      this.moveKinds()
        .filter((kind) => mayMoveByZones(snapshot, piece.identifier, kind.name))
        .map((kind) => kind.name)
    );
  }

  /**
   * The kind a piece moves by: the one asked for where zones let it go by that kind, and otherwise
   * the first of the room's kinds they do let it go by, as a piece in an overflowing zone may leave
   * only by one. Null where zones hold it whatever kind it moves by.
   */
  kindFor(piece: GameCharacter, kindName: string): string | null {
    const kinds = this.moveKinds();
    const asked = moveKindNamed(kinds, kindName).name;
    const snapshot = this.snapshot();
    if (mayMoveByZones(snapshot, piece.identifier, asked)) return asked;
    return (
      kinds.find((kind) => kind.name !== asked && mayMoveByZones(snapshot, piece.identifier, kind.name))?.name ?? null
    );
  }

  /** Where a piece stands among the zones as a move by a kind begins. */
  startOfMove(piece: GameCharacter, kindName = ''): ZoneMoveStart {
    const state = this.stateNow();
    return {
      zone: state.zoneOf(piece.identifier)?.id ?? '',
      inside: state.insideOf(piece.identifier).map((zone) => zone.id),
      kind: kindName,
    };
  }

  /**
   * Settles what a move did among the zones: a piece that walked out of its zone has left it. Where
   * zones stop moves of themselves, a piece held walking out of a zone it stood in, or walking into
   * one that holds it, is pulled to that zone's centre and joins it; where the side a move runs into
   * chooses, that was settled before the piece walked.
   */
  afterMove(piece: GameCharacter, start: ZoneMoveStart): void {
    const unstoppable = this.isUnstoppable(piece);
    if (piece.unstoppableMove !== '') piece.unstoppableMove = '';
    const snapshot = this.snapshot();
    if (!snapshot) return;
    const gridSize = snapshot.world.table.gridSize;
    const outcome = zoneMoveOutcome(snapshot, piece.identifier, start, pieceCentreOf(piece, gridSize), unstoppable);
    if (outcome.kind === 'left') {
      GameObject.batch(() => {
        piece.engagementZone = '';
        piece.zoneLeaveRound = '';
      });
      this.settle([]);
      this.chat.sendSystemNotice('movement', this.t('feature.zone.chat.left', { name: piece.name }));
    } else if (outcome.kind === 'forgetLeave') {
      piece.zoneLeaveRound = '';
    } else if (outcome.kind === 'held') {
      const stopped = outcome.zone;
      // Put on the zone's centre before it is counted in, so a piece stopped a way off is not taken
      // straight back out again for standing more than a metre outside.
      GameObject.batch(() => {
        for (const one of this.links.withPartners([piece])) {
          const half = pieceCentreOffsetPx(one, gridSize);
          one.engagementZone = stopped.id;
          one.zoneLeaveRound = '';
          one.location.x = stopped.shape.centre.x - half;
          one.location.y = stopped.shape.centre.y - half;
        }
      });
      this.settle([stopped.id]);
      this.chat.sendSystemNotice('movement', this.t('feature.zone.chat.held', { name: piece.name }));
    }
  }

  private turnState(): TurnState | null {
    return this.objectStore.get<TurnState>('TurnState');
  }

  private snapshot(): ZoneSnapshot | null {
    const world = this.tableNow();
    if (!world) return null;
    const parties = this.objectStore
      .getObjects<Party>(Party)
      .map((party) => ({ identifier: party.identifier, alliedWith: party.alliedWith }));
    const roomRules = this.roomRules.rulesFor(world.table);
    const sideOf = sideOfPiece(roomRules.hostilityBy, parties);
    const gridSize = world.table.gridSize;
    const onFloor = this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((piece) => piece.isVisibleOnTable && surfaceOf(piece) === 'floor');
    const mounts = new Map(onFloor.map((piece) => [piece.identifier, this.links.mountOf(piece)?.identifier ?? '']));
    const pieces: ZonePieceInput[] = onFloor.map((piece) => ({
      id: piece.identifier,
      point: pieceCentreOf(piece, gridSize),
      zone: piece.engagementZone,
      offField: piece.offField === '1',
      count: this.countOf(piece, world.rules),
      side: sideOf(piece),
      down: piece.downed === '1',
      held: piece.heldFast === '1',
      grabbedBy: this.links.holderOf(piece)?.identifier ?? '',
      ridingOn: mounts.get(piece.identifier) ?? '',
    }));
    const front = frontRidersOf(
      onFloor.map((piece) => ({
        id: piece.identifier,
        ridingOn: mounts.get(piece.identifier) ?? '',
        rideSeat: piece.rideSeat,
        mountable: piece.mountable === '1',
      }))
    );
    const riders = new Set(front.values());
    const carried = new Set(
      onFloor
        .filter((piece) => mounts.get(piece.identifier) !== '' && !riders.has(piece.identifier))
        .map((piece) => piece.identifier)
    );
    const zones = zonesOn(world.table).map((zone) => ({
      id: zone.identifier,
      centre: zone.centre,
      limit: zone.limit,
      square: zone.isSquare,
      forming: zone.isForming,
    }));
    const state = zoneStateOf({ zones, pieces, rules: world.rules, pxPerMetre: world.pxPerMetre, snap: world.snap });
    const turn = this.turnState();
    return {
      world,
      pieces,
      state,
      front,
      carried,
      leaveRounds: new Map(
        onFloor.filter((piece) => piece.zoneLeaveRound !== '').map((piece) => [piece.identifier, piece.zoneLeaveRound])
      ),
      unseen: new Set(onFloor.filter((piece) => this.isUnseen(piece)).map((piece) => piece.identifier)),
      unstoppable: new Set(onFloor.filter((piece) => this.isUnstoppable(piece)).map((piece) => piece.identifier)),
      turn: { round: turn?.round ?? 0, roundsKept: !!turn && turn.phase !== 'idle' },
      stopsByChoice: this.config()?.interruptEnabled === true,
    };
  }

  /** How many pixels make a metre on the table in view, or null where there is no table. */
  pxPerMetre(): number | null {
    return this.tableNow()?.pxPerMetre ?? null;
  }

  private countOf(piece: GameCharacter, rules: ZoneRules): number {
    if (rules.countField.length < 1) return 1;
    const counted = sheetNumberOf(piece, rules.countField);
    return counted !== null && counted >= 1 ? Math.floor(counted) : 1;
  }

  /**
   * Writes what followed from a change made here, at once, and gathers the tokens of the zones
   * named and of any zone that moved round its centre.
   */
  private settle(gatherIds: readonly string[]): void {
    const state = this.stateNow();
    const moved = state.writes.updateZones.map((update) => update.id);
    this.write(state.writes);
    const settled = this.stateNow();
    this.gather(settled, [...gatherIds, ...moved]);
  }

  private readonly tidySoon = debounce(() => {
    if (!this.keepsOrder()) return;
    const state = this.stateNow();
    if (!hasZoneWrites(state.writes)) return;
    const moved = state.writes.updateZones.map((update) => update.id);
    this.write(state.writes);
    this.gather(this.stateNow(), moved);
  }, TIDY_DELAY_MS);

  /**
   * Whether this peer is the one that writes what followed from changes nobody made through a zone.
   *
   * The game master with the lowest peer identifier, or the lowest of all where there is no game
   * master, among the peers whose version keeps zones in order at all.
   */
  private keepsOrder(): boolean {
    const mine = PeerCursor.myCursor;
    if (!mine) return false;
    if (mine.zoneProtocol !== '1') mine.zoneProtocol = '1';
    const able = this.objectStore
      .getObjects<PeerCursor>(PeerCursor)
      .filter((cursor) => cursor.zoneProtocol === '1' && cursor.peerId.length > 0);
    const masters = able.filter((cursor) => cursor.isGameMaster);
    const pool = (masters.length > 0 ? masters : able).sort((a, b) => (a.peerId < b.peerId ? -1 : 1));
    return pool.length < 1 || pool[0] === mine;
  }

  private write(writes: ZoneWrites): void {
    if (!hasZoneWrites(writes)) return;
    GameObject.batch(() => {
      for (const change of writes.setPieceZones) {
        const piece = this.objectStore.get<GameCharacter>(change.id);
        if (piece instanceof GameCharacter) this.putInZone(piece, change.zone);
      }
      for (const update of writes.updateZones) {
        const zone = this.zoneById(update.id);
        if (!zone) continue;
        zone.centre = update.centre;
        zone.forming = update.forming ? '1' : '';
        zone.capacity = update.limit === null ? '' : `${update.limit}`;
      }
      for (const id of writes.removeZones) this.zoneById(id)?.destroy();
    });
  }

  /** Stands the tokens of each zone named gathered about its centre, where they can still be told apart. */
  private gather(state: ZoneState, zoneIds: readonly string[]): void {
    const table = this.tableNow()?.table;
    if (!table) return;
    const wanted = new Set(zoneIds);
    const views = state.zones.filter((view) => wanted.has(view.id));
    if (views.length < 1) return;
    GameObject.batch(() => {
      for (const view of views) this.gatherOne(view, table.gridSize);
    });
  }

  /**
   * Stands a zone's tokens about its centre. Those bound to another in the zone, riding it or held
   * on to by it, stand where it stands rather than taking a spot of their own.
   */
  private gatherOne(view: ZoneView, gridSize: number): void {
    const members = view.members
      .map((id) => this.objectStore.get<GameCharacter>(id))
      .filter((piece): piece is GameCharacter => piece instanceof GameCharacter);
    const bonded = members.map((piece) => this.links.bondOf(piece));
    const inZone = new Set(bonded.map((piece) => piece.id));
    const anchors = members.filter((_, index) => boundTo(bonded[index], inZone) === '');
    const byId = new Map(members.map((piece) => [piece.identifier, piece]));
    const ring = Math.min(view.shape.reach * 0.5, gridSize * Math.max(0.6, anchors.length * 0.25));
    const spots = gatheredAbout(view.shape.centre, anchors.length, ring);
    anchors.forEach((piece, index) => {
      const half = pieceCentreOffsetPx(piece, gridSize);
      piece.location.x = spots[index].x - half;
      piece.location.y = spots[index].y - half;
      piece.update();
      for (const id of boundBelow(piece.identifier, bonded)) {
        const one = byId.get(id)!;
        this.links.standAt(one, piece);
        one.update();
      }
    });
  }

  private tableNow(): ZoneTable | null {
    const rules = this.roomRules.zoneRules();
    if (!rules.enabled) return null;
    const table = this.tableSelecter.viewTable;
    if (!table) return null;
    const roomRules = this.roomRules.rulesFor(table);
    return { table, rules, pxPerMetre: squarePxOf(table) / metresPerCell(roomRules), snap: snapOn(table) };
  }

  private zoneById(id: string): EngagementZone | null {
    const zone = this.objectStore.get<EngagementZone>(id);
    return zone instanceof EngagementZone ? zone : null;
  }

  private config(): Config | null {
    return this.objectStore.get<Config>('Config');
  }
}
