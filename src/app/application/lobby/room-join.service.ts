import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { Network } from '@axe/core/index';
import { IPeerContext, PeerContext } from '@axe/core/network/peer-context';
import { IRoomInfo } from '@axe/core/network/room-info';
import { SAME_NAME_MEMBER_WAIT_MS, sameNameMemberWait$ } from '@axe/core/network/skyway/same-name-member';
import { clearIdentity, loadIdentity, PersistedIdentity, saveIdentity } from '@axe/core/storage/identity-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';

/** How long the room may take to open: the wait for what a reload left behind, and some to spare. */
export const ROOM_OPEN_TIMEOUT_MS = SAME_NAME_MEMBER_WAIT_MS + 10_000;
/** How long the others in the room may take to answer once it is open. */
export const ROOM_CONNECT_TIMEOUT_MS = 15_000;
/** The peer id a session reports before it has one of its own. */
const UNOPENED_PEER_ID = '???';

/** How long a room server may take to let this seat in. */
export const ROOM_SERVER_OPEN_TIMEOUT_MS = 30_000;

/** Whether this tab was last in this room, which is where a reload leaves whoever was in it. */
export function wasLastIn(roomId: string): boolean {
  return roomId.length > 0 && loadIdentity()?.roomId === roomId;
}

/**
 * Whether the network has been asked into a room other than this one, as one made or joined while
 * a join to this one waited: anything but waiting outside, or this room itself. It goes by the room
 * asked for, as the room's own peer id comes only once it is opening.
 */
export function isInAnotherRoom(roomId: string): boolean {
  const requested = Network.requestedRoomId;
  return requested !== '' && requested !== roomId;
}

/** Whether this tab was last in this room as its game master. */
function wasGameMasterIn(roomId: string): boolean {
  return wasLastIn(roomId) && loadIdentity()?.roomRole === PeerRole.GameMaster;
}

/**
 * Whether the peer id is this seat's own connection to the room: the one open now, and in that
 * room, rather than the standby connection or another member.
 */
function isOwnConnectionTo(roomId: string, peerId: string): boolean {
  return peerId === Network.peerId && PeerContext.parse(peerId).roomId === roomId;
}

@Injectable({ providedIn: 'root' })
export class RoomJoinService {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Whether joining is waiting for this seat's previous connection to the room to drop, as it is
   * for up to a minute after a reload.
   */
  readonly waitingForPreviousConnection = signal(false);

  constructor() {
    sameNameMemberWait$.subscribe((event) => this.waitingForPreviousConnection.set(event.waiting), this.destroyRef);
  }

  /**
   * Looks a room up on a room server by its key, which finds it however old, or by its id and name
   * in the list for a link or a saved seat from before rooms had keys; null when there is no such
   * room. A key the server cannot be asked about just then is looked for in the list too.
   */
  async findServerRoom(roomKey: string, roomId: string, roomName: string): Promise<IRoomInfo | null> {
    if (roomKey.length > 0) {
      try {
        return await Network.findRoom(roomKey);
      } catch {
        // asked again below, in the list
      }
    }
    const rooms = await Network.listAllRooms();
    return (
      (roomKey.length > 0 ? rooms.find((room) => room.roomKey === roomKey) : undefined) ??
      rooms.find((room) => room.id === roomId && room.name === roomName) ??
      null
    );
  }

  /**
   * Joins a room on a room server, which checks the password, lets the seat in and gives it its
   * role.
   *
   * There is nobody to connect to one by one: the room is joined once it opens, and an error
   * opening it, a wrong password or a full room among them, ends the join.
   */
  joinServerRoom(room: IRoomInfo, password: string): Promise<boolean> {
    const roomKey = room.roomKey;
    if (!roomKey) return Promise.resolve(false);

    const userId = Network.peerContext ? Network.peerContext.userId : PeerContext.generateUserId();
    Network.open(userId, room.id, room.name, password, roomKey);
    PeerCursor.myCursor.peerId = Network.peerId;

    return new Promise<boolean>((resolve) => {
      let isSettled = false;
      // An error is left to the handling of network errors, which goes back to waiting as whoever
      // the login says; only a join that came to nothing by itself waits again here.
      const settle = (isJoined: boolean, byError = false): void => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timer);
        offOpen();
        offError();
        if (!isJoined && !byError) this.resetNetwork(room.id, userId, true);
        resolve(isJoined);
      };
      const offOpen = this.objectChange.networkOpen$.subscribe((event) => {
        if (!isOwnConnectionTo(room.id, event.peerId)) return;
        this.objectStore.clearDeleteHistory();
        settle(true);
      }, this.destroyRef);
      // A room server's session fails before it has a peer id when the login cannot be refreshed;
      // its error carries the placeholder id, and is this join's as much as one under its own id.
      // An error under an id of this room is this join's even once the network has moved on, as the
      // handling of a network error goes back to waiting before this hears of it.
      const offError = this.objectChange.networkError$.subscribe((event) => {
        const ours =
          !event.peerId || event.peerId === UNOPENED_PEER_ID || PeerContext.parse(event.peerId).roomId === room.id;
        if (ours) settle(false, true);
      }, this.destroyRef);
      const timer = setTimeout(() => settle(false), ROOM_SERVER_OPEN_TIMEOUT_MS);
      this.destroyRef.onDestroy(() => clearTimeout(timer));
    });
  }

  /** Looks a room up by its id in the lobby listing, or null when no open room has that id. */
  async findRoom(roomId: string): Promise<IRoomInfo | null> {
    const rooms = await Network.listAllRooms();
    return rooms.find((room) => room.id === roomId) ?? null;
  }

  /**
   * Joins a room somebody else has already opened.
   *
   * A game master joining one comes in as a player. The role is chosen on this browser before
   * there is any room, and kept there from one room to the next, so a seat left as game master
   * would otherwise walk into a room that has its own and be handed everything it keeps from
   * the players. It is put down before the room is opened, so the others never see it arrive
   * as one. A role an invite hands out is given after the join and still stands; a guest stays
   * a guest.
   *
   * A game master coming back to the room this tab was last in, and its game master there, stays
   * one. A reload takes them out of their own table, and coming back through the lobby is how they
   * return to it.
   *
   * A join that comes to nothing takes back what it wrote down, the room and the role put down to
   * come in, so that a reload does not take the room it was tried on for the one the seat was in;
   * whether it or the handling of a network error went back to waiting, but not once the seat has
   * gone into another room meanwhile.
   *
   * It goes in two steps. Opening the room can wait up to a minute, while what a reload left of
   * this seat is still in it; an error opening it ends the join at once. Once it is open, the
   * others have a while to answer. What the listing still holds of this seat is not one of them:
   * where nobody else is left, as in a room its master was alone in, the room being open is the
   * join.
   *
   * The room's own connection is told by the peer id it opens with. That id is worked out from
   * digests once opening is under way, so it is not there to be read when the open is asked for.
   */
  join(peerContexts: readonly IPeerContext[], password: string): Promise<boolean> {
    const context = peerContexts[0];
    if (!context) return Promise.resolve(false);

    const identityBefore = loadIdentity();
    const roleBefore = PeerCursor.myCursor.role;
    if (roleBefore === PeerRole.GameMaster && !wasGameMasterIn(context.roomId)) {
      PeerCursor.myCursor.role = PeerRole.Player;
    }
    const userId = Network.peerContext ? Network.peerContext.userId : PeerContext.generateUserId();
    Network.open(userId, context.roomId, context.roomName, password);
    PeerCursor.myCursor.peerId = Network.peerId;
    let others: readonly IPeerContext[] = peerContexts;

    return new Promise<boolean>((resolve) => {
      const triedPeerIds = new Set<string>();
      let timer: ReturnType<typeof setTimeout> | null = null;
      let isOpened = false;
      let isSettled = false;

      const wait = (ms: number): void => {
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => settle(isOpened && others.length < 1), ms);
      };

      const settle = (isJoined: boolean): void => {
        if (isSettled) return;
        isSettled = true;
        if (timer !== null) clearTimeout(timer);
        offOpen();
        offError();
        offConnect();
        offDisconnect();
        const joined = isJoined || Network.peerContexts.length > 0;
        if (!joined) {
          this.resetNetwork(context.roomId, userId);
          if (!isInAnotherRoom(context.roomId)) this.takeBackTry(identityBefore, roleBefore);
        }
        resolve(joined);
      };

      const offOpen = this.objectChange.networkOpen$.subscribe((event) => {
        if (isOpened || !isOwnConnectionTo(context.roomId, event.peerId)) return;
        isOpened = true;
        others = peerContexts.filter((peer) => peer.peerId !== event.peerId);
        this.objectStore.clearDeleteHistory();
        if (others.length < 1) {
          settle(true);
          return;
        }
        wait(ROOM_CONNECT_TIMEOUT_MS);
        for (const peerContext of others) {
          Network.connect(peerContext);
        }
      }, this.destroyRef);

      // Before the room opens, an error under this room's id, or under none, is this join's even once
      // the handling of network errors has gone back to waiting, as there is nobody else in it yet. An
      // opening connection carries the room's id from the start, so one that says `???` was closed.
      const offError = this.objectChange.networkError$.subscribe((event) => {
        if (isOpened || isInAnotherRoom(context.roomId)) return;
        const ours = !event.peerId || PeerContext.parse(event.peerId).roomId === context.roomId;
        if (ours) settle(false);
      }, this.destroyRef);

      const onTried = (event: { peerId: string }): void => {
        triedPeerIds.add(event.peerId);
        if (triedPeerIds.size < others.length) return;
        settle(false);
      };

      const offConnect = this.objectChange.peerConnect$.subscribe(onTried, this.destroyRef);
      const offDisconnect = this.objectChange.peerDisconnect$.subscribe(onTried, this.destroyRef);

      wait(ROOM_OPEN_TIMEOUT_MS);
      this.destroyRef.onDestroy(() => {
        if (timer !== null) clearTimeout(timer);
      });
    });
  }

  /**
   * Goes back to waiting outside any room after a join that came to nothing, as the user it tried
   * to join as, unless something else has already, as the handling of a network error does. A join
   * to a room server still `unopened`, waiting on the login, is stopped too, so that it does not
   * walk into the room once the login comes.
   */
  private resetNetwork(roomId: string, userId: string, stopUnopened = false): void {
    const unopened = stopUnopened && Network.peerId === UNOPENED_PEER_ID;
    if (Network.peerContexts.length > 0 || isInAnotherRoom(roomId)) return;
    if (!unopened && PeerContext.parse(Network.peerId).roomId !== roomId) return;
    Network.openStandby(userId);
    PeerCursor.myCursor.peerId = Network.peerId;
  }

  /** Puts back who this tab was and the role it held before a join that came to nothing. */
  private takeBackTry(identity: PersistedIdentity | null, role: PeerRole): void {
    if (identity) saveIdentity(identity);
    else clearIdentity();
    PeerCursor.myCursor.role = role;
  }
}
