import { inject, Injectable } from '@angular/core';
import { CharacterMacroService } from '@axe/application/chat/character-macro.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { centreOf, EngagementZoneService, metresPerCell } from '@axe/application/tabletop/engagement-zone.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Config } from '@axe/domain/peer/config';
import { sheetNumberOf } from '@axe/domain/tabletop/move/move-cells';
import {
  cargoRoomOf,
  DEFAULT_FALL_MIN_M,
  fallDistanceM,
  fallersWhenDown,
  fallFromM,
  freeSeats,
  FrontRefusal,
  frontRefusal,
  RideChangeRefusal,
  rideChangeRefusal,
  RideMoveRefusal,
  rideMoveRefusal,
  RideSeat,
  seatHeightOf,
  seatOf,
  steers,
  turnMarkOf,
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
  /** The seats free on it to this piece, each with why it may not take it, or null where it may. */
  readonly seats: readonly { readonly seat: RideSeat; readonly refusal: FrontRefusal | null }[];
}

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
    /** The height its rider stands at as written, null for the default of half its size. */
    readonly seatHeight: number | null;
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
 * A piece falls off where it, or the mount, goes down or falls over, or it is taken away from the
 * mount by hand; a load also falls with the one riding in front. It lies where it fell, and the room
 * is told how far it fell, by how far the mount was moving.
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
  private readonly t = inject(TRANSLATE_FN);

  /** The mount a piece rides, where it is on the table and still a mount; null otherwise. */
  mountOf(piece: GameCharacter): GameCharacter | null {
    if (piece.ridingOn === '' || piece.ridingOn === piece.identifier) return null;
    const mount = this.objectStore.get<GameCharacter>(piece.ridingOn);
    return mount instanceof GameCharacter && mount.isVisibleOnTable && mount.mountable === '1' ? mount : null;
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

  /** How high above a mount's base its riders stand, in cells. */
  seatHeight(mount: GameCharacter): number {
    return seatHeightOf(mount.mountSeatHeight, mount.size);
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
              seatHeight: piece.mountSeatHeight.trim() === '' ? null : seatHeightOf(piece.mountSeatHeight, piece.size),
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
    if (!free || free.refusal !== null || this.changeRefusal(piece) !== null) return false;
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
    if (piece.ridingOn === '') return false;
    if (!takenOff && this.changeRefusal(piece) !== null) return false;
    this.getOff(piece, takenOff);
    if (!mount) return true;
    this.chat.sendSystemMessage(
      this.t('feature.ride.chat.off', {
        name: piece.name,
        mount: mount.name,
        action: this.actionOf(piece, seat, 'off'),
      })
    );
    return true;
  }

  /**
   * Settles a piece put down by hand: a mount brings those riding it along, and a piece riding one
   * that is put down away from it falls off there.
   */
  afterPutDown(piece: GameCharacter): void {
    const mount = this.mountOf(piece);
    if (!mount) {
      if (piece.mountable === '1') this.zones.carryBound(piece);
      return;
    }
    const gridSize = this.tableSelecter.viewTable?.gridSize ?? 50;
    const here = centreOf(piece, gridSize);
    const there = centreOf(mount, gridSize);
    if (Math.hypot(there.x - here.x, there.y - here.y) <= this.samePointPx() + 1e-6) {
      this.zones.carryBound(mount);
      return;
    }
    this.fall(piece);
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
    const damage = this.config()?.fallDamage ?? null;
    if (damage !== null) void this.macro.sendAsCharacter(piece, damage.replaceAll('{m}', `${metres}`));
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

  /** How high above its base a mount's riders stand, in cells, or null for half its size. */
  setSeatHeight(mount: GameCharacter, cells: number | null): void {
    mount.mountSeatHeight = cells === null ? '' : `${Math.max(0, cells)}`;
  }

  /**
   * The mounts at a piece's point it could get on, with the seats free on each. A piece rides
   * nothing while it is down, lying where it fell, held fast, held on to, a mount ridden by others,
   * or out of the fight, and gets on no mount down, lying where it fell, held on to, riding another or
   * out of the fight.
   */
  private offersFor(piece: GameCharacter): RideOffer[] {
    if (!this.mayGetOn(piece) || this.aboard(piece).length > 0) return [];
    const here = this.zones.pointOf(piece);
    const reach = this.samePointPx();
    return this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((mount) => mount !== piece && mount.mountable === '1' && mount.isVisibleOnTable)
      .filter((mount) => this.mayCarry(mount))
      .filter((mount) => {
        const there = this.zones.pointOf(mount);
        return Math.hypot(there.x - here.x, there.y - here.y) <= reach + 1e-6;
      })
      .map((mount) => ({
        id: mount.identifier,
        name: mount.name,
        seats: freeSeats(
          { passenger: mount.mountPassenger === '1', cargo: cargoRoomOf(mount.mountCargo) },
          this.aboard(mount).map((rider) => seatOf(rider.rideSeat))
        ).map((seat) => ({ seat, refusal: seat === 'rider' ? this.frontRefusal(piece, mount) : null })),
      }))
      .filter((offer) => offer.seats.length > 0);
  }

  private mayGetOn(piece: GameCharacter): boolean {
    return (
      piece.isVisibleOnTable &&
      piece.offField !== '1' &&
      piece.downed !== '1' &&
      piece.prone !== '1' &&
      piece.heldFast !== '1' &&
      piece.grabbedBy === '' &&
      piece.mountable !== '1'
    );
  }

  private mayCarry(mount: GameCharacter): boolean {
    return (
      mount.offField !== '1' &&
      mount.downed !== '1' &&
      mount.prone !== '1' &&
      mount.grabbedBy === '' &&
      !this.mountOf(mount)
    );
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
