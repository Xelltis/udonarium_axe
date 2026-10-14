import { inject, Injectable } from '@angular/core';
import { CharacterMacroService } from '@axe/application/chat/character-macro.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { centreOf, EngagementZoneService, metresPerCell } from '@axe/application/tabletop/engagement-zone.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { applyBuffEdit } from '@axe/domain/data/resource-edit-helpers';
import { Config } from '@axe/domain/peer/config';
import { sheetNumberOf } from '@axe/domain/tabletop/move/move-cells';
import {
  buffNameOf,
  cargoRoomOf,
  DEFAULT_FALL_MIN_M,
  fallDistanceM,
  fallersWhenDown,
  fallFromM,
  freeSeats,
  FrontRefusal,
  frontRefusal,
  pictureHeightOf,
  readSeatHeight,
  RideChangeRefusal,
  rideChangeRefusal,
  RideMoveRefusal,
  rideMoveRefusal,
  RideSeat,
  seatHeightIn,
  seatHeightOf,
  SeatHeightUnit,
  seatOf,
  steers,
  turnMarkOf,
  writeSeatHeight,
  writtenSeat,
} from '@axe/domain/tabletop/ride/ride-rules';
import { resolveRoomRules } from '@axe/domain/tabletop/room-rules';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { resolveZoneRules } from '@axe/domain/tabletop/zone/zone-rules';

/** Why a piece lying where it fell may not get up just now: it fell in its own turn, which is not over. */
export type ProneRefusal = 'fellThisTurn';

/** A mount a piece could get on, and where on it. */
export interface RideOffer {
  readonly id: string;
  readonly name: string;
  /**
   * The seats free on it to this piece, each with why it may not take it, or null where it may, and
   * whether it may take it once it gets up from where it fell, nothing else standing in the way.
   */
  readonly seats: readonly {
    readonly seat: RideSeat;
    readonly refusal: SeatRefusal | null;
    readonly getsUp: boolean;
  }[];
}

/**
 * Why a piece may not take a seat on a mount: it is down, held where it stands or lying where it
 * fell; the mount is down, lying where it fell or held; or the piece may not ride it in front.
 */
export type SeatRefusal = 'down' | 'held' | 'prone' | 'mountDown' | 'mountProne' | 'mountHeld' | FrontRefusal;

/** What a piece's menu offers about riding. */
export interface RideMenuModel {
  /** The mount the piece rides and where, or null. */
  readonly riding: { readonly mount: string; readonly seat: RideSeat } | null;
  /** The mounts at the piece's point it could get on. */
  readonly offers: readonly RideOffer[];
  /** Why the piece may not get on or off just now, or null where it may. */
  readonly changeRefusal: RideChangeRefusal | null;
  /** Whether the piece lies where it fell, and why it may not get up just now, or null where it may. */
  readonly prone: { readonly on: boolean; readonly refusal: ProneRefusal | null };
  /** How the piece is set up as a mount, or null where it is not one. */
  readonly mount: {
    readonly passenger: boolean;
    readonly cargo: number;
    readonly anyone: boolean;
    /** Where its riders are set to stand, as `writeSeatHeight` writes it: empty for the default. */
    readonly seatHeight: string;
    /** Where its riders stand by default: at the top of its picture where it is given a height, at half its size where not. */
    readonly seatDefault: 'top' | 'half';
    readonly aboard: number;
  } | null;
}

/**
 * Pieces riding others: who rides what and where, getting on and off, and the piece a move of a
 * rider is made by.
 *
 * A piece rides in front and steers, sits behind as a second rider, or is carried as a load. It
 * stands on its mount and goes where the mount goes. One riding in front moves by moving its mount;
 * one riding behind or carried does not move of its own will.
 *
 * While turns are being taken, a piece gets on or off once a turn, a mount moves in one turn a round,
 * and a piece that got off in its turn walks on only where it steered or was carried and the mount
 * stood still. A mount and whoever sits behind take their turn in the one riding in front's, so that
 * one getting off ends theirs.
 *
 * A piece put down on a mount is offered a seat on it, and one put down off its mount gets off. A
 * piece falls off where it, or the mount, goes down or falls over; a load also falls with the one
 * riding in front. It lies where it fell, and the room is told how far it fell, by how far the mount
 * was moving.
 *
 * Where the room writes a buff for riding two up, the one in front and the one behind carry it while
 * both are on the mount.
 */
@Injectable({ providedIn: 'root' })
export class RideService {
  private readonly objectStore = inject(ObjectStore);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly zones = inject(EngagementZoneService);
  private readonly chat = inject(ChatMessageService);
  private readonly macro = inject(CharacterMacroService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly turns = inject(TurnOrderService);
  private readonly snackbar = inject(SnackbarService);
  private readonly t = inject(TRANSLATE_FN);

  /** The mount a piece rides, where it is on the table and still a mount; null otherwise. */
  mountOf(piece: GameCharacter): GameCharacter | null {
    return this.zones.mountOf(piece);
  }

  /** Where a piece rides its mount, or null where it rides none. */
  seatOf(piece: GameCharacter): RideSeat | null {
    return this.mountOf(piece) ? seatOf(piece.rideSeat) : null;
  }

  /** The pieces on the table riding a mount. */
  aboard(mount: GameCharacter): GameCharacter[] {
    return this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((piece) => piece.ridingOn === mount.identifier && piece.isVisibleOnTable && piece !== mount);
  }

  /** The piece riding a mount in front, steering it, or null. */
  riderOf(mount: GameCharacter): GameCharacter | null {
    return this.aboard(mount).find((piece) => seatOf(piece.rideSeat) === 'rider') ?? null;
  }

  /** Whether a piece steers a mount from the front: anybody does where the room names no skill for it. */
  steers(piece: GameCharacter): boolean {
    const field = this.config()?.rideSkillField ?? null;
    return steers(field !== null, field === null ? null : sheetNumberOf(piece, field));
  }

  /**
   * The piece a move of this one is made by: its mount where it rides in front, none where it rides
   * behind or is carried, none for a mount nobody rides unless a game master moves it, and the piece
   * itself otherwise.
   */
  moverFor(piece: GameCharacter): GameCharacter | null {
    const mount = this.mountOf(piece);
    if (mount) return seatOf(piece.rideSeat) === 'rider' ? mount : null;
    if (piece.mountable === '1' && !this.riderOf(piece) && !this.rolePermission.isGameMaster) return null;
    return piece;
  }

  /**
   * How high above a mount's base its riders stand, in cells: as written down, and otherwise at the
   * top of its picture where it is given a height, at half its size where not.
   */
  seatHeight(mount: GameCharacter): number {
    return seatHeightOf(mount.mountSeatHeight, mount, this.gridSize());
  }

  private gridSize(): number {
    return this.tableSelecter.viewTable?.gridSize ?? 50;
  }

  /** What a piece's menu offers about riding. */
  menuOf(piece: GameCharacter): RideMenuModel {
    const mount = this.mountOf(piece);
    return {
      riding: mount ? { mount: mount.name, seat: seatOf(piece.rideSeat) } : null,
      offers: mount ? [] : this.offersFor(piece),
      changeRefusal: this.changeRefusal(piece),
      prone: { on: piece.prone === '1', refusal: this.proneRefusal(piece) },
      mount:
        piece.mountable === '1'
          ? {
              passenger: piece.mountPassenger === '1',
              cargo: cargoRoomOf(piece.mountCargo),
              anyone: piece.mountAnyone === '1',
              seatHeight: writeSeatHeight(readSeatHeight(piece.mountSeatHeight)),
              seatDefault: pictureHeightOf(piece, this.gridSize()) !== null ? 'top' : 'half',
              aboard: this.aboard(piece).length,
            }
          : null,
    };
  }

  /** Why a piece may not get on or off a mount just now, or null where it may. */
  changeRefusal(piece: GameCharacter): RideChangeRefusal | null {
    return rideChangeRefusal(piece.rideChangedTurn, this.turnMark());
  }

  /** Why a piece may not set out on a move just now, by the rules on riding, or null where it may. */
  moveRefusal(piece: GameCharacter): RideMoveRefusal | null {
    const mount = this.mountOf(piece);
    const onMount = mount !== null && seatOf(piece.rideSeat) === 'rider';
    if (onMount && (piece.downed === '1' || piece.heldFast === '1' || piece.grabbedBy !== '')) return 'riderHeld';
    const left = mount ? null : this.leftMountOf(piece);
    return rideMoveRefusal({
      turn: this.turnMark(),
      onMount,
      mountMovedTurn: (onMount ? mount : left)?.rideMoveTurn ?? '',
      changedTurn: piece.rideChangedTurn,
      leftSeat: !mount && piece.rideLeftFrom !== '' ? seatOf(piece.rideLeftSeat) : null,
      steers: this.steers(piece),
    });
  }

  /** The mount a piece last got off, while it is still a piece; null where it has got off none since. */
  leftMountOf(piece: GameCharacter): GameCharacter | null {
    if (piece.rideLeftFrom === '') return null;
    const mount = this.objectStore.get<GameCharacter>(piece.rideLeftFrom);
    return mount instanceof GameCharacter ? mount : null;
  }

  /**
   * Writes down a move a mount sets out on, as long as the way drawn for it, in the turn being taken.
   * Moves in one turn add up. Nothing for a piece that is not a mount.
   */
  recordMove(mover: GameCharacter, way: readonly { readonly x: number; readonly y: number }[]): void {
    const table = this.tableSelecter.viewTable;
    if (mover.mountable !== '1' || !table || table.gridSize <= 0) return;
    let px = 0;
    for (let i = 1; i < way.length; i++) px += Math.hypot(way[i].x - way[i - 1].x, way[i].y - way[i - 1].y);
    const rules = resolveRoomRules(this.config()?.roomRuleAnswers ?? null, table);
    const turn = this.turnMark();
    const before = turn !== '' && mover.rideMoveTurn === turn ? Number(mover.rideMoveM) || 0 : 0;
    const metres = before + (px / table.gridSize) * metresPerCell(rules);
    GameObject.batch(() => {
      mover.rideMoveTurn = turn;
      mover.rideMoveM = `${Math.round(metres * 10) / 10}`;
    });
  }

  /**
   * Gets a piece on a mount at its point, in a seat free on it, and says so in chat. Answers whether
   * it got on.
   */
  mount(piece: GameCharacter, mount: GameCharacter, seat: RideSeat): boolean {
    const offer = this.offersFor(piece).find((one) => one.id === mount.identifier);
    const free = offer?.seats.find((one) => one.seat === seat);
    if (!free || (free.refusal !== null && !free.getsUp) || this.changeRefusal(piece) !== null) return false;
    if (free.getsUp) this.setProne(piece, false);
    GameObject.batch(() => {
      piece.ridingOn = mount.identifier;
      piece.rideSeat = writtenSeat(seat);
      piece.rideChangedTurn = this.turnMark();
      piece.rideLeftFrom = '';
      piece.rideLeftSeat = '';
    });
    this.zones.carryBound(mount);
    this.chat.sendSystemMessage(
      this.t(`feature.ride.chat.on_${seat}`, {
        name: piece.name,
        mount: mount.name,
        action: this.actionOf(piece, seat, 'on'),
      })
    );
    this.settleTwoUp(mount.identifier);
    return true;
  }

  /**
   * Gets a piece off its mount, where the mount stands, and says so in chat. Answers whether it got
   * off. Taken off, rather than getting off, it counts for nothing against getting on or off once a
   * turn.
   */
  dismount(piece: GameCharacter, takenOff = false): boolean {
    const mount = this.mountOf(piece);
    const seat = seatOf(piece.rideSeat);
    const from = piece.ridingOn;
    if (from === '') return false;
    if (!takenOff && this.changeRefusal(piece) !== null) return false;
    this.getOff(piece, takenOff);
    if (mount) {
      this.chat.sendSystemMessage(
        this.t('feature.ride.chat.off', {
          name: piece.name,
          mount: mount.name,
          action: this.actionOf(piece, seat, 'off'),
        })
      );
    }
    this.settleTwoUp(from);
    return true;
  }

  /**
   * Settles a piece put down by hand: a mount brings those riding it along, and a piece riding one
   * that is put down off it gets off there. One that may not get off this turn is put back on.
   */
  afterPutDown(piece: GameCharacter): void {
    const mount = this.mountOf(piece);
    if (!mount) {
      if (piece.mountable === '1') {
        this.zones.carryBound(piece);
        this.dropLeftBehind(piece);
      }
      return;
    }
    if (this.isOn(piece, mount)) {
      this.zones.carryBound(mount);
      return;
    }
    if (this.dismount(piece)) return;
    this.zones.carryBound(mount);
    this.snackbar.show(this.t('feature.ride.stayedOn', { name: piece.name, mount: mount.name }));
  }

  /**
   * Offers, at the foot of the screen, to get a piece on the mount it stands on, in the first seat it
   * may take there; or says why it may take none. Nothing for a piece on no mount, or one riding.
   */
  offerRide(piece: GameCharacter): void {
    if (!this.rolePermission.canEditTabletop || this.mountOf(piece)) return;
    const offers = this.offersFor(piece);
    if (offers.length < 1) return;
    const refusal = this.changeRefusal(piece);
    for (const offer of refusal === null ? offers : []) {
      const free = offer.seats.find((one) => one.refusal === null) ?? offer.seats.find((one) => one.getsUp);
      const mount = this.objectStore.get<GameCharacter>(offer.id);
      if (!free || !(mount instanceof GameCharacter)) continue;
      const label = free.getsUp ? `feature.ride.offerActionUp_${free.seat}` : `feature.ride.offerAction_${free.seat}`;
      this.snackbar.show(this.t('feature.ride.offer', { name: piece.name, mount: mount.name }), {
        action: { label: this.t(label), run: () => this.mount(piece, mount, free.seat) },
      });
      return;
    }
    const why = refusal ?? offers[0].seats.find((one) => one.refusal !== null)?.refusal ?? null;
    if (why) {
      this.snackbar.show(
        this.t('feature.ride.offerRefused', { name: piece.name, mount: offers[0].name }) +
          this.t(`feature.ride.menu.refusal_${why}`)
      );
    }
  }

  /**
   * Whether a piece stands on a mount: at the same point as it, or with its middle over the mount's
   * base, as where it was put down on it.
   */
  private isOn(piece: GameCharacter, mount: GameCharacter): boolean {
    const here = this.zones.pointOf(piece);
    const there = this.zones.pointOf(mount);
    if (Math.hypot(there.x - here.x, there.y - here.y) <= this.samePointPx() + 1e-6) return true;
    const gridSize = this.tableSelecter.viewTable?.gridSize ?? 50;
    const middle = centreOf(piece, gridSize);
    const base = centreOf(mount, gridSize);
    const half = (Math.max(0, mount.size) * gridSize) / 2;
    return Math.abs(middle.x - base.x) <= half + 1e-6 && Math.abs(middle.y - base.y) <= half + 1e-6;
  }

  /**
   * Takes off a mount those riding it that it left behind where it moved: held where they stand,
   * or held on to by somebody else, they were not carried along.
   */
  dropLeftBehind(mount: GameCharacter): void {
    if (mount.mountable !== '1') return;
    for (const rider of this.aboard(mount)) if (!this.isOn(rider, mount)) this.dismount(rider, true);
  }

  /** Why a piece lying where it fell may not get up just now, or null where it may. */
  proneRefusal(piece: GameCharacter): ProneRefusal | null {
    const turn = this.turnMark();
    return piece.prone === '1' && turn !== '' && piece.proneTurn === turn ? 'fellThisTurn' : null;
  }

  /**
   * Says that a piece has fallen over, or got up again, and says so in chat. Answers whether it
   * changed. Falling over throws those it takes with it off their mounts; a piece that fell over in its
   * own turn gets up no sooner than the next.
   */
  setProne(piece: GameCharacter, prone: boolean): boolean {
    if (prone === (piece.prone === '1')) return false;
    if (!prone && this.proneRefusal(piece) !== null) return false;
    const thrown = prone ? this.fallersWith(piece) : [];
    GameObject.batch(() => {
      piece.prone = prone ? '1' : '';
      piece.proneTurn = prone ? this.ownTurnMark(piece) : '';
    });
    this.chat.sendSystemMessage(
      this.t(prone ? 'feature.ride.chat.prone' : 'feature.ride.chat.up', { name: piece.name })
    );
    for (const one of thrown) this.fall(one);
    return true;
  }

  /**
   * Says that a piece is down and cannot act, or up again. Going down throws those it takes with it
   * off their mounts first, so they fall where they were, in the zone they were in.
   */
  setDown(piece: GameCharacter, down: boolean): void {
    const thrown = down && piece.downed !== '1' ? this.fallersWith(piece) : [];
    for (const one of thrown) this.fall(one);
    this.zones.setDown(piece, down);
  }

  /** The pieces thrown off their mounts where this one goes down or falls over. */
  private fallersWith(piece: GameCharacter): GameCharacter[] {
    const onTable = this.objectStore.getObjects<GameCharacter>(GameCharacter).filter((one) => one.isVisibleOnTable);
    const ids = fallersWhenDown(
      piece.identifier,
      onTable.map((one) => ({
        id: one.identifier,
        ridingOn: one.ridingOn,
        rideSeat: one.rideSeat,
        mountable: one.mountable === '1',
      }))
    );
    return onTable.filter((one) => ids.includes(one.identifier));
  }

  /**
   * Throws a piece off its mount: it gets off where it stands and lies there, and the room is told
   * how far it fell, rolling what the fall does where the room says.
   */
  private fall(piece: GameCharacter): void {
    const mount = this.mountOf(piece);
    if (!mount) return;
    const fromM = fallFromM({
      turn: this.turnMark(),
      movedTurn: mount.rideMoveTurn,
      movedM: Number(mount.rideMoveM),
      actedThisRound: this.turns.isActed(mount.identifier),
    });
    const metres = fallDistanceM(fromM, this.config()?.fallMinM ?? DEFAULT_FALL_MIN_M);
    this.getOff(piece, true);
    GameObject.batch(() => {
      piece.prone = '1';
      piece.proneTurn = this.ownTurnMark(piece);
    });
    this.chat.sendSystemMessage(this.t('feature.ride.chat.fell', { name: piece.name, mount: mount.name, metres }));
    this.settleTwoUp(mount.identifier);
    const damage = this.config()?.fallDamage ?? null;
    if (damage !== null) void this.macro.sendAsCharacter(piece, damage.replaceAll('{m}', `${metres}`));
  }

  /**
   * Gives the one riding a mount in front and the one behind the room's buff for riding two up, while
   * both are on it, and takes it off whoever is not: only the buff given, where it is still there.
   */
  private settleTwoUp(mountId: string): void {
    const mount = this.objectStore.get<GameCharacter>(mountId);
    const aboard =
      mount instanceof GameCharacter && mount.isVisibleOnTable && mount.mountable === '1' ? this.aboard(mount) : [];
    const front = aboard.find((piece) => seatOf(piece.rideSeat) === 'rider');
    const behind = aboard.find((piece) => seatOf(piece.rideSeat) === 'passenger');
    const paired = front && behind ? [front, behind] : [];
    for (const piece of this.objectStore.getObjects<GameCharacter>(GameCharacter)) {
      if (piece.rideTwoUpFrom === mountId && !paired.includes(piece)) this.takeTwoUpOff(piece);
    }
    for (const piece of paired) if (piece.rideTwoUpFrom !== mountId) this.giveTwoUp(piece, mountId);
  }

  /**
   * Gives a piece the room's buff for riding two up, and writes down which it was. A piece that
   * carries a buff of that name already is given nothing, so taking the buff off later leaves that
   * one be.
   */
  private giveTwoUp(piece: GameCharacter, mountId: string): void {
    const command = this.config()?.twoUpBuff ?? null;
    const name = command === null ? null : buffNameOf(command);
    if (command === null || name === null) return;
    let given = '';
    if (!piece.buffs.find(name)) {
      const before = new Set(piece.buffs.list().map((data) => data.identifier));
      applyBuffEdit({ command: command.trim(), object: piece, targeted: false }, piece);
      given = piece.buffs.list().find((data) => !before.has(data.identifier))?.identifier ?? '';
    }
    GameObject.batch(() => {
      piece.rideTwoUpFrom = mountId;
      piece.rideTwoUpBuff = given;
    });
    if (given !== '')
      this.chat.sendSystemMessage(this.t('feature.ride.chat.twoUpOn', { name: piece.name, buff: name }));
  }

  /** Takes the buff for riding two up off a piece, where it is still the one given. */
  private takeTwoUpOff(piece: GameCharacter): void {
    const given = piece.buffs.list().find((data) => data.identifier === piece.rideTwoUpBuff);
    GameObject.batch(() => {
      piece.rideTwoUpFrom = '';
      piece.rideTwoUpBuff = '';
    });
    if (!given) return;
    const name = given.name;
    piece.buffs.remove(given);
    this.chat.sendSystemMessage(this.t('feature.ride.chat.twoUpOff', { name: piece.name, buff: name }));
  }

  /**
   * Takes a piece off its mount where it stands. Getting off ends the turns of those taking theirs in
   * the turn being taken through it: the mount and whoever sits behind, where the one riding in front
   * gets off in its turn, or the one getting off itself, where it sits behind. Taken off, rather than
   * getting off, it counts for nothing against getting on or off once a turn.
   */
  private getOff(piece: GameCharacter, takenOff: boolean): void {
    const mount = this.mountOf(piece);
    const seat = seatOf(piece.rideSeat);
    const current = this.turns.currentIdentifier;
    const sharing = mount && current !== '' ? this.turns.companionsOf(current) : [];
    const ended = piece.identifier === current ? sharing : sharing.includes(piece) ? [piece] : [];
    GameObject.batch(() => {
      piece.ridingOn = '';
      piece.rideSeat = '';
      piece.rideLeftFrom = mount?.identifier ?? '';
      piece.rideLeftSeat = writtenSeat(seat);
      if (!takenOff) piece.rideChangedTurn = this.turnMark();
    });
    this.turns.closeTurnsInPassing(ended.map((one) => one.identifier));
  }

  /** The mark of the turn being taken, where it is the piece's own or one it takes its own in; empty otherwise. */
  private ownTurnMark(piece: GameCharacter): string {
    const turn = this.turnMark();
    const current = this.turns.currentIdentifier;
    if (turn === '') return '';
    return current === piece.identifier || this.turns.companionsOf(current).includes(piece) ? turn : '';
  }

  /** Makes a piece a mount others may ride, or not; those riding it get off. */
  setMountable(piece: GameCharacter, mountable: boolean): void {
    if (!mountable) for (const rider of this.aboard(piece)) this.dismount(rider, true);
    piece.mountable = mountable ? '1' : '';
  }

  /** Whether a mount takes a second rider behind the one in front. */
  setPassenger(mount: GameCharacter, passenger: boolean): void {
    mount.mountPassenger = passenger ? '1' : '';
  }

  /** How many a mount may carry as a load. */
  setCargo(mount: GameCharacter, cargo: number): void {
    mount.mountCargo = cargo > 0 ? `${Math.floor(cargo)}` : '';
  }

  /** Whether anybody may ride a mount in front, skilled at steering or not. */
  setAnyone(mount: GameCharacter, anyone: boolean): void {
    mount.mountAnyone = anyone ? '1' : '';
  }

  /** Where a mount's riders stand, as `writeSeatHeight` writes it: cells, pixels, a part of its height, or empty for the default. */
  setSeatHeight(mount: GameCharacter, written: string): void {
    mount.mountSeatHeight = writeSeatHeight(readSeatHeight(written));
  }

  /** Writes where a mount's riders stand in another unit, leaving them where they are. */
  convertSeatHeight(mount: GameCharacter, unit: SeatHeightUnit): void {
    mount.mountSeatHeight = writeSeatHeight(seatHeightIn(unit, mount.mountSeatHeight, mount, this.gridSize()));
  }

  /**
   * The mounts a piece stands on, with the seats free on each and why it may not take each. A piece
   * down, held where it stands or lying where it fell, or on a mount down, lying where it fell or
   * held, is shown the seats it may not take; one lying where it fell may take a seat once it gets
   * up. A mount, a piece out of the fight, and a mount out of the fight or riding another, are shown
   * none.
   */
  private offersFor(piece: GameCharacter): RideOffer[] {
    if (!piece.isVisibleOnTable || piece.offField === '1' || piece.mountable === '1') return [];
    if (this.aboard(piece).length > 0) return [];
    const own = this.stateRefusal(piece);
    const getsUpFirst = own === 'prone' && this.proneRefusal(piece) === null;
    return this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((mount) => mount !== piece && mount.mountable === '1' && mount.isVisibleOnTable)
      .filter((mount) => mount.offField !== '1' && !this.mountOf(mount))
      .filter((mount) => this.isOn(piece, mount))
      .map((mount) => {
        const mountState = this.mountStateRefusal(mount);
        return {
          id: mount.identifier,
          name: mount.name,
          seats: freeSeats(
            { passenger: mount.mountPassenger === '1', cargo: cargoRoomOf(mount.mountCargo) },
            this.aboard(mount).map((rider) => seatOf(rider.rideSeat))
          ).map((seat) => {
            const beyond = mountState ?? (seat === 'rider' ? this.frontRefusal(piece, mount) : null);
            return { seat, refusal: own ?? beyond, getsUp: getsUpFirst && beyond === null };
          }),
        };
      })
      .filter((offer) => offer.seats.length > 0);
  }

  /** Why a piece's own state keeps it off a mount: it is down, held where it stands, or lying where it fell. */
  private stateRefusal(piece: GameCharacter): 'down' | 'held' | 'prone' | null {
    if (piece.downed === '1') return 'down';
    if (piece.heldFast === '1' || piece.grabbedBy !== '') return 'held';
    if (piece.prone === '1') return 'prone';
    return null;
  }

  /** Why a mount's state keeps everybody off it: it is down, lying where it fell, or held. */
  private mountStateRefusal(mount: GameCharacter): 'mountDown' | 'mountProne' | 'mountHeld' | null {
    if (mount.downed === '1') return 'mountDown';
    if (mount.prone === '1') return 'mountProne';
    if (mount.grabbedBy !== '') return 'mountHeld';
    return null;
  }

  private frontRefusal(piece: GameCharacter, mount: GameCharacter): FrontRefusal | null {
    const skillField = this.config()?.rideSkillField ?? null;
    const requireField = this.config()?.rideRequireField ?? null;
    return frontRefusal({
      skillNamed: skillField !== null,
      skill: skillField === null ? null : sheetNumberOf(piece, skillField),
      anyone: mount.mountAnyone === '1',
      required: requireField === null ? null : sheetNumberOf(mount, requireField),
    });
  }

  /**
   * What getting on or off takes, for saying so in chat: one who steers gets on and off in front as
   * a minor action, anybody else as a major one; a load is put on as a major action and gets off as
   * a minor one.
   */
  private actionOf(piece: GameCharacter, seat: RideSeat, way: 'on' | 'off'): string {
    const minor = seat === 'rider' ? this.steers(piece) : seat === 'cargo' && way === 'off';
    return this.t(minor ? 'feature.ride.chat.minorAction' : 'feature.ride.chat.majorAction');
  }

  /** How close two pieces stand, in table pixels, to be at one point. */
  private samePointPx(): number {
    const table = this.tableSelecter.viewTable;
    if (!table) return 0;
    const roomRules = resolveRoomRules(this.config()?.roomRuleAnswers ?? null, table);
    const zoneRules = resolveZoneRules(this.config()?.zoneRuleAnswers ?? null);
    return (zoneRules.samePointM * table.gridSize) / metresPerCell(roomRules);
  }

  /** The mark of the turn being taken, empty while turns are not being taken. */
  private turnMark(): string {
    return turnMarkOf(this.turns.round, this.turns.phase, this.turns.currentIdentifier);
  }

  private config(): Config | null {
    return this.objectStore.get<Config>('Config');
  }
}
