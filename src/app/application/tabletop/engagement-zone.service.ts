import { computed, DestroyRef, effect, inject, Injectable, untracked } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Party } from '@axe/domain/party/party';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCenterOf, cellCount, CellGrid, cellGridOf, cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { sheetNumberOf } from '@axe/domain/tabletop/move/move-cells';
import { MoveKind, moveKindNamed, parseMoveKinds } from '@axe/domain/tabletop/move/move-kind';
import { convertMoveLength, parseMoveUnit } from '@axe/domain/tabletop/move/move-units';
import { resolveRoomRules } from '@axe/domain/tabletop/room-rules';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { TurnState } from '@axe/domain/tabletop/turn-state';
import { EngagementZone, zonesOn } from '@axe/domain/tabletop/zone/engagement-zone';
import { zoneCells } from '@axe/domain/tabletop/zone/zone-cells';
import { gatheredAbout, zoneCovers, ZonePoint } from '@axe/domain/tabletop/zone/zone-geometry';
import { LeaveInput, leaveReasonOf, zoneHolds, ZoneSideCounts } from '@axe/domain/tabletop/zone/zone-leave';
import { DEFAULT_ZONE_RULES, resolveZoneRules, ZoneRules } from '@axe/domain/tabletop/zone/zone-rules';
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
}

const NO_MENU: ZoneMenuModel = {
  enabled: false,
  zone: null,
  joinable: [],
  foes: [],
  offField: false,
  leave: null,
};

/** What a move is shaped by where zones stand on the table. */
export interface ZoneReachTerms {
  /** Where the move starts instead of where the token stands: the centre of the piece's zone. */
  readonly startPoint: ZonePoint | null;
  /** Whether the piece may not move at all by this kind, held in its zone. */
  readonly noReach: boolean;
  /** Cells the piece may not enter: zones already holding as many as they may. */
  readonly blocked: CellBits | null;
  /** Cells where the move ends: into a zone that holds the piece, or out of one it stood in. */
  readonly stops: CellBits | null;
}

/** Where a piece stood among the zones as a move began, to tell afterwards what the move did. */
export interface ZoneMoveStart {
  readonly zone: string;
  readonly inside: readonly string[];
}

/** What the zones need to know of the table they are on. */
interface ZoneTable {
  readonly table: GameTable;
  readonly rules: ZoneRules;
  readonly pxPerMetre: number;
  readonly snap: (point: ZonePoint) => ZonePoint;
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
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly chat = inject(ChatMessageService);
  private readonly t = inject(TRANSLATE_FN);
  private tidyTimer: ReturnType<typeof setTimeout> | null = null;

  /** The rules the room plays zones by. */
  readonly rules = computed<ZoneRules>(() => {
    this.objectChange.versionOf('Config')();
    return resolveZoneRules(this.config()?.zoneRuleAnswers ?? null);
  });

  /** The zones on the table in view, worked out from who is in them. */
  readonly state = computed<ZoneState>(() => {
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
    return this.stateNow();
  });

  constructor() {
    effect(() => {
      const writes = this.state().writes;
      if (!hasZoneWrites(writes)) return;
      untracked(() => this.scheduleTidy());
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.tidyTimer !== null) clearTimeout(this.tidyTimer);
    });
  }

  /** Whether the room plays engagement zones at all. */
  isEnabled(): boolean {
    return this.rules().enabled;
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
        zone.centre = world.snap(state.pointOf(target.identifier) ?? centreOf(target, world.table.gridSize));
        world.table.appendChild(zone);
      }
      attacker.engagementZone = zone.identifier;
      target.engagementZone = zone.identifier;
    });
    this.settle([zone!.identifier]);
    this.chat.sendSystemMessage(this.t('feature.zone.chat.declared', { attacker: attacker.name, target: target.name }));
    return zone;
  }

  /** Puts a piece in a zone, its point becoming the zone's centre. */
  join(piece: GameCharacter, zoneId: string): void {
    if (!this.zoneById(zoneId)) return;
    piece.engagementZone = zoneId;
    this.settle([zoneId]);
    this.chat.sendSystemMessage(this.t('feature.zone.chat.joined', { name: piece.name }));
  }

  /** Takes a piece out of its zone, leaving its token standing where it is. */
  leave(piece: GameCharacter): void {
    if (piece.engagementZone.length < 1) return;
    piece.engagementZone = '';
    this.settle([]);
    this.chat.sendSystemMessage(this.t('feature.zone.chat.left', { name: piece.name }));
  }

  /** Takes a piece out of the fight altogether, or puts it back in. */
  toggleOffField(piece: GameCharacter): void {
    const off = piece.offField !== '1';
    GameObject.batch(() => {
      piece.offField = off ? '1' : '';
      if (off) piece.engagementZone = '';
    });
    this.settle([]);
    this.chat.sendSystemMessage(
      this.t(off ? 'feature.zone.chat.offField' : 'feature.zone.chat.onField', { name: piece.name })
    );
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
        if (piece.engagementZone === zoneId) piece.engagementZone = '';
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
    const foes =
      self && self.side !== null && !self.offField && here
        ? pieces
            .filter(
              (other) => other.id !== self.id && !other.offField && other.side !== null && other.side !== self.side
            )
            .filter((other) => {
              const there = state.pointOf(other.id);
              return there !== null && Math.hypot(there.x - here.x, there.y - here.y) <= reach;
            })
            .map((other) => ({ id: other.id, name: this.objectStore.get<GameCharacter>(other.id)?.name ?? '' }))
        : [];
    return {
      enabled: true,
      zone: zone ? { id: zone.identifier, square: zone.isSquare, limit: zone.limit } : null,
      joinable: own ? [] : state.insideOf(piece.identifier).map((view) => view.id),
      foes: own ? [] : foes,
      offField: piece.offField === '1',
      leave: own ? { said: piece.zoneLeaveRound !== '', maySay: !own.overflowing } : null,
    };
  }

  /** The kinds of move the room plays, the plain kind alone where it names none. */
  moveKinds(): MoveKind[] {
    return parseMoveKinds(this.config()?.moveKinds ?? '');
  }

  /** Says that a piece in a zone will leave it, which it may do on a move in a later round. */
  prepareLeave(piece: GameCharacter): void {
    const turn = this.turnState();
    piece.zoneLeaveRound = turn && turn.phase !== 'idle' ? `${turn.round}` : '0';
    this.chat.sendSystemMessage(this.t('feature.zone.chat.prepareLeave', { name: piece.name }));
  }

  /** Takes back a piece's word that it will leave its zone. */
  cancelLeave(piece: GameCharacter): void {
    piece.zoneLeaveRound = '';
  }

  /**
   * What zones make of a move by a kind: where it starts, whether it may be made at all, what it may
   * not enter and where it ends. Null where zones say nothing about this piece.
   */
  reachTermsFor(piece: GameCharacter, grid: CellGrid, kindName: string): ZoneReachTerms | null {
    const snapshot = this.snapshot();
    const mover = snapshot?.pieces.find((one) => one.id === piece.identifier);
    if (!snapshot || !mover || mover.side === null || mover.offField) return null;
    const { state, pieces, world } = snapshot;
    const ratio = world.rules.outnumber;
    const own = state.zoneOf(piece.identifier);
    const counted = { side: mover.side, count: mover.count };
    const blocked = new CellBits(cellCount(grid));
    const stops = new CellBits(cellCount(grid));

    if (own && leaveReasonOf(this.leaveInput(own, mover, pieces, kindName, piece.zoneLeaveRound)) === 'held') {
      return { startPoint: own.shape.centre, noReach: true, blocked: null, stops: null };
    }
    const standingIn = own ? [] : state.insideOf(piece.identifier);
    for (const zone of state.zones) {
      if (zone === own) continue;
      const cells = zoneCells(grid, zone.shape);
      if (standingIn.includes(zone)) {
        if (zoneHolds(this.countsOf(zone, pieces), counted, 'escape', ratio)) stops.or(outside(cells));
        continue;
      }
      if (zone.count >= zone.limit) blocked.or(cells);
      else if (zoneHolds(this.countsOf(zone, pieces), counted, 'pass', ratio)) stops.or(cells);
    }
    return {
      startPoint: own?.shape.centre ?? null,
      noReach: false,
      blocked: blocked.isEmpty ? null : blocked,
      stops: stops.isEmpty ? null : stops,
    };
  }

  /** Whether a piece may move at all by a kind, as far as zones say. */
  mayMove(piece: GameCharacter, kindName: string): boolean {
    const snapshot = this.snapshot();
    const mover = snapshot?.pieces.find((one) => one.id === piece.identifier);
    if (!snapshot || !mover || mover.side === null) return true;
    const own = snapshot.state.zoneOf(piece.identifier);
    if (!own) return true;
    return leaveReasonOf(this.leaveInput(own, mover, snapshot.pieces, kindName, piece.zoneLeaveRound)) !== 'held';
  }

  /**
   * The kind a piece moves by: the one asked for where zones let it go by that kind, and otherwise
   * the first of the room's kinds they do let it go by, as a piece in an overflowing zone may leave
   * only by one. Null where zones hold it whatever kind it moves by.
   */
  kindFor(piece: GameCharacter, kindName: string): string | null {
    const kinds = this.moveKinds();
    const asked = moveKindNamed(kinds, kindName).name;
    if (this.mayMove(piece, asked)) return asked;
    return kinds.find((kind) => kind.name !== asked && this.mayMove(piece, kind.name))?.name ?? null;
  }

  /** Where a piece stands among the zones as a move begins. */
  startOfMove(piece: GameCharacter): ZoneMoveStart {
    const state = this.stateNow();
    return {
      zone: state.zoneOf(piece.identifier)?.id ?? '',
      inside: state.insideOf(piece.identifier).map((zone) => zone.id),
    };
  }

  /**
   * Settles what a move did among the zones: a piece that walked out of its zone has left it; a piece
   * held walking out of a zone it stood in, or walking into one that holds it, is pulled to that
   * zone's centre and joins it.
   */
  afterMove(piece: GameCharacter, start: ZoneMoveStart): void {
    const snapshot = this.snapshot();
    if (!snapshot) return;
    const { state, pieces, world } = snapshot;
    const mover = pieces.find((one) => one.id === piece.identifier);
    if (!mover || mover.side === null) return;
    const point = centreOf(piece, world.table.gridSize);
    if (start.zone.length > 0) {
      const left = state.zones.find((zone) => zone.id === start.zone);
      if (!left || !zoneCovers(left.shape, point)) {
        GameObject.batch(() => {
          piece.engagementZone = '';
          piece.zoneLeaveRound = '';
        });
        this.settle([]);
        this.chat.sendSystemMessage(this.t('feature.zone.chat.left', { name: piece.name }));
      }
      return;
    }
    const counted = { side: mover.side, count: mover.count };
    const ratio = world.rules.outnumber;
    const heldBack = state.zones.find(
      (zone) =>
        start.inside.includes(zone.id) &&
        !zoneCovers(zone.shape, point) &&
        zoneHolds(this.countsOf(zone, pieces), counted, 'escape', ratio)
    );
    const stopped =
      heldBack ??
      state.zones.find(
        (zone) =>
          !start.inside.includes(zone.id) &&
          zoneCovers(zone.shape, point) &&
          zone.count < zone.limit &&
          zoneHolds(this.countsOf(zone, pieces), counted, 'pass', ratio)
      );
    if (!stopped) return;
    piece.engagementZone = stopped.id;
    this.settle([stopped.id]);
    this.chat.sendSystemMessage(this.t('feature.zone.chat.held', { name: piece.name }));
  }

  private leaveInput(
    zone: ZoneView,
    mover: ZonePieceInput,
    pieces: readonly ZonePieceInput[],
    kindName: string,
    leaveRound: string
  ): LeaveInput {
    const rules = this.rules();
    const turn = this.turnState();
    return {
      counts: this.countsOf(zone, pieces),
      mover: { side: mover.side!, count: mover.count },
      ratio: rules.outnumber,
      overflowing: zone.overflowing,
      leaveRound,
      round: turn?.round ?? 0,
      roundsKept: !!turn && turn.phase !== 'idle',
      leaveKind: rules.leaveKind,
      kind: kindName,
    };
  }

  private countsOf(zone: ZoneView, pieces: readonly ZonePieceInput[]): ZoneSideCounts {
    const inside = new Map<string, number>();
    for (const id of zone.inside) {
      const piece = pieces.find((one) => one.id === id);
      if (piece?.side) inside.set(piece.side, (inside.get(piece.side) ?? 0) + piece.count);
    }
    return { members: zone.sides, inside };
  }

  private turnState(): TurnState | null {
    return this.objectStore.get<TurnState>('TurnState');
  }

  private snapshot(): { world: ZoneTable; pieces: ZonePieceInput[]; state: ZoneState } | null {
    const world = this.tableNow();
    if (!world) return null;
    const parties = this.objectStore
      .getObjects<Party>(Party)
      .map((party) => ({ identifier: party.identifier, alliedWith: party.alliedWith }));
    const roomRules = resolveRoomRules(this.config()?.roomRuleAnswers ?? null, world.table);
    const sideOf = sideOfPiece(roomRules.hostilityBy, parties);
    const gridSize = world.table.gridSize;
    const pieces: ZonePieceInput[] = this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((piece) => piece.isVisibleOnTable && surfaceOf(piece) === 'floor')
      .map((piece) => ({
        id: piece.identifier,
        point: centreOf(piece, gridSize),
        zone: piece.engagementZone,
        offField: piece.offField === '1',
        count: this.countOf(piece, world.rules),
        side: sideOf(piece),
      }));
    const zones = zonesOn(world.table).map((zone) => ({
      id: zone.identifier,
      centre: zone.centre,
      limit: zone.limit,
      square: zone.isSquare,
      forming: zone.isForming,
    }));
    const state = zoneStateOf({ zones, pieces, rules: world.rules, pxPerMetre: world.pxPerMetre, snap: world.snap });
    return { world, pieces, state };
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

  private scheduleTidy(): void {
    if (this.tidyTimer !== null) clearTimeout(this.tidyTimer);
    this.tidyTimer = setTimeout(() => {
      this.tidyTimer = null;
      if (!this.keepsOrder()) return;
      const state = this.stateNow();
      if (!hasZoneWrites(state.writes)) return;
      const moved = state.writes.updateZones.map((update) => update.id);
      this.write(state.writes);
      this.gather(this.stateNow(), moved);
    }, TIDY_DELAY_MS);
  }

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
        if (piece instanceof GameCharacter) piece.engagementZone = change.zone;
      }
      for (const update of writes.updateZones) {
        const zone = this.zoneById(update.id);
        if (!zone) continue;
        zone.centre = update.centre;
        zone.forming = update.forming ? '1' : '';
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

  private gatherOne(view: ZoneView, gridSize: number): void {
    const ring = Math.min(view.shape.reach * 0.5, gridSize * Math.max(0.6, view.members.length * 0.25));
    const spots = gatheredAbout(view.shape.centre, view.members.length, ring);
    view.members.forEach((id, index) => {
      const piece = this.objectStore.get<GameCharacter>(id);
      if (!(piece instanceof GameCharacter)) return;
      const half = (piece.size * gridSize) / 2;
      piece.location.x = spots[index].x - half;
      piece.location.y = spots[index].y - half;
      piece.update();
    });
  }

  private tableNow(): ZoneTable | null {
    const rules = resolveZoneRules(this.config()?.zoneRuleAnswers ?? null);
    if (!rules.enabled) return null;
    const table = this.tableSelecter.viewTable;
    if (!table) return null;
    const roomRules = resolveRoomRules(this.config()?.roomRuleAnswers ?? null, table);
    return { table, rules, pxPerMetre: table.gridSize / metresPerCell(roomRules), snap: snapOn(table) };
  }

  private zoneById(id: string): EngagementZone | null {
    const zone = this.objectStore.get<EngagementZone>(id);
    return zone instanceof EngagementZone ? zone : null;
  }

  private config(): Config | null {
    return this.objectStore.get<Config>('Config');
  }
}

/** The middle of a piece's token, in table pixels. */
export function centreOf(piece: GameCharacter, gridSize: number): ZonePoint {
  const half = (Math.max(0, piece.size) * gridSize) / 2;
  return { x: piece.location.x + half, y: piece.location.y + half };
}

/**
 * How many metres one cell of the table stands for: what the table says a cell is, turned into
 * metres, and a metre a cell where the table counts in cells or says nothing it can be measured by.
 */
export function metresPerCell(rules: { cellDistance: number; cellDistanceUnit: string }): number {
  const unit = parseMoveUnit(rules.cellDistanceUnit);
  if (!(rules.cellDistance > 0) || (unit !== 'metre' && unit !== 'foot')) return 1;
  return convertMoveLength(rules.cellDistance, unit, 'metre');
}

/** Every cell a set leaves out. */
function outside(cells: CellBits): CellBits {
  const rest = new CellBits(cells.count);
  for (let index = 0; index < cells.count; index++) if (!cells.get(index)) rest.set(index);
  return rest;
}

/** Where a worked-out point is put on a table: the middle of its cell on a grid, as it is without one. */
function snapOn(table: GameTable): (point: ZonePoint) => ZonePoint {
  if (table.gridType === GridType.NONE) return (point) => point;
  const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
  return (point) => {
    const index = cellIndexAt(grid, point.x, point.y);
    return index < 0 ? point : cellCenterOf(grid, index);
  };
}
