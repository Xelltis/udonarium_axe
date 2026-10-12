import { inject, Injectable } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { EngagementZoneService, metresPerCell } from '@axe/application/tabletop/engagement-zone.service';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Config } from '@axe/domain/peer/config';
import { sheetNumberOf } from '@axe/domain/tabletop/move/move-cells';
import {
  cargoRoomOf,
  freeSeats,
  FrontRefusal,
  frontRefusal,
  RideSeat,
  seatHeightOf,
  seatOf,
  steers,
  writtenSeat,
} from '@axe/domain/tabletop/ride/ride-rules';
import { resolveRoomRules } from '@axe/domain/tabletop/room-rules';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { resolveZoneRules } from '@axe/domain/tabletop/zone/zone-rules';

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
 */
@Injectable({ providedIn: 'root' })
export class RideService {
  private readonly objectStore = inject(ObjectStore);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly zones = inject(EngagementZoneService);
  private readonly chat = inject(ChatMessageService);
  private readonly rolePermission = inject(RolePermissionService);
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

  /**
   * Gets a piece on a mount at its point, in a seat free on it, and says so in chat. Answers whether
   * it got on.
   */
  mount(piece: GameCharacter, mount: GameCharacter, seat: RideSeat): boolean {
    const offer = this.offersFor(piece).find((one) => one.id === mount.identifier);
    const free = offer?.seats.find((one) => one.seat === seat);
    if (!free || free.refusal !== null) return false;
    GameObject.batch(() => {
      piece.ridingOn = mount.identifier;
      piece.rideSeat = writtenSeat(seat);
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

  /** Gets a piece off its mount, where the mount stands, and says so in chat. */
  dismount(piece: GameCharacter): void {
    const mount = this.mountOf(piece);
    const seat = seatOf(piece.rideSeat);
    if (piece.ridingOn === '') return;
    GameObject.batch(() => {
      piece.ridingOn = '';
      piece.rideSeat = '';
    });
    if (!mount) return;
    this.chat.sendSystemMessage(
      this.t('feature.ride.chat.off', {
        name: piece.name,
        mount: mount.name,
        action: this.actionOf(piece, seat, 'off'),
      })
    );
  }

  /**
   * Settles a piece put down by hand: a mount brings those riding it along, and a piece riding one
   * that is put down away from it gets off there, as it was taken off.
   */
  afterPutDown(piece: GameCharacter): void {
    const mount = this.mountOf(piece);
    if (!mount) {
      if (piece.mountable === '1') this.zones.carryBound(piece);
      return;
    }
    const here = this.zones.pointOf(piece);
    const there = this.zones.pointOf(mount);
    if (Math.hypot(there.x - here.x, there.y - here.y) <= this.samePointPx() + 1e-6) {
      this.zones.carryBound(mount);
      return;
    }
    this.dismount(piece);
  }

  /** Makes a piece a mount others may ride, or not; those riding it get off. */
  setMountable(piece: GameCharacter, mountable: boolean): void {
    if (!mountable) for (const rider of this.aboard(piece)) this.dismount(rider);
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
   * nothing while it is down, held fast, held on to, a mount ridden by others, or out of the fight,
   * and gets on no mount down, held on to, riding another or out of the fight.
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
      piece.heldFast !== '1' &&
      piece.grabbedBy === '' &&
      piece.mountable !== '1'
    );
  }

  private mayCarry(mount: GameCharacter): boolean {
    return mount.offField !== '1' && mount.downed !== '1' && mount.grabbedBy === '' && !this.mountOf(mount);
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

  private config(): Config | null {
    return this.objectStore.get<Config>('Config');
  }
}
