import { DestroyRef, inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { Network } from '@axe/core/index';
import { IPeerContext, PeerContext } from '@axe/core/network/peer-context';
import { IRoomInfo } from '@axe/core/network/room-info';
import { loadIdentity } from '@axe/core/storage/identity-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';

const JOIN_TIMEOUT_MS = 15_000;

/** Whether this tab was last in this room, which is where a reload leaves whoever was in it. */
function wasLastIn(roomId: string): boolean {
  return roomId.length > 0 && loadIdentity()?.roomId === roomId;
}

@Injectable({ providedIn: 'root' })
export class RoomJoinService {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly destroyRef = inject(DestroyRef);

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

    return new Promise<boolean>((resolve) => {
      const triedPeerIds = new Set<string>();
      let timer: ReturnType<typeof setTimeout> | null = null;
      let isSettled = false;

      const offOpen = this.objectChange.networkOpen$.subscribe(() => {
        offOpen();
        this.objectStore.clearDeleteHistory();
        for (const peerContext of peerContexts) {
          Network.connect(peerContext);
        }
      }, this.destroyRef);

      const settle = (): void => {
        if (isSettled) return;
        isSettled = true;
        if (timer !== null) clearTimeout(timer);
        offOpen();
        offConnect();
        offDisconnect();
        this.resetNetwork();
        resolve(Network.peerContexts.length > 0);
      };

      const onTried = (event: { peerId: string }): void => {
        triedPeerIds.add(event.peerId);
        if (triedPeerIds.size < peerContexts.length) return;
        settle();
      };

      const offConnect = this.objectChange.peerConnect$.subscribe(onTried, this.destroyRef);
      const offDisconnect = this.objectChange.peerDisconnect$.subscribe(onTried, this.destroyRef);

      timer = setTimeout(settle, JOIN_TIMEOUT_MS);
      this.destroyRef.onDestroy(() => {
        if (timer !== null) clearTimeout(timer);
      });
    });
  }

  private resetNetwork(): void {
    if (Network.peerContexts.length < 1) {
      Network.openStandby();
      PeerCursor.myCursor.peerId = Network.peerId;
    }
  }
}
