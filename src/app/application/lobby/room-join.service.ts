import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { Network } from '@axe/core/index';
import { IPeerContext, PeerContext } from '@axe/core/network/peer-context';
import { IRoomInfo } from '@axe/core/network/room-info';
import { SAME_NAME_MEMBER_WAIT_MS, sameNameMemberWait$ } from '@axe/core/network/skyway/same-name-member';
import { loadIdentity } from '@axe/core/storage/identity-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';

/** How long the room may take to open: the wait for what a reload left behind, and some to spare. */
export const ROOM_OPEN_TIMEOUT_MS = SAME_NAME_MEMBER_WAIT_MS + 10_000;
/** How long the others in the room may take to answer once it is open. */
export const ROOM_CONNECT_TIMEOUT_MS = 15_000;

/** Whether this tab was last in this room, which is where a reload leaves whoever was in it. */
function wasLastIn(roomId: string): boolean {
  return roomId.length > 0 && loadIdentity()?.roomId === roomId;
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
   * A game master coming back to the room this tab was last in stays one. A reload takes them
   * out of their own table, and coming back through the lobby is how they return to it.
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

    if (PeerCursor.myCursor.role === PeerRole.GameMaster && !wasLastIn(context.roomId)) {
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
        if (!joined) this.resetNetwork(context.roomId);
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

      const offError = this.objectChange.networkError$.subscribe((event) => {
        if (isOpened || (event.peerId && !isOwnConnectionTo(context.roomId, event.peerId))) return;
        settle(false);
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
   * Goes back to waiting outside any room after a join that came to nothing, unless something else
   * has already, as the handling of a network error does.
   */
  private resetNetwork(roomId: string): void {
    if (Network.peerContexts.length > 0 || PeerContext.parse(Network.peerId).roomId !== roomId) return;
    Network.openStandby();
    PeerCursor.myCursor.peerId = Network.peerId;
  }
}
