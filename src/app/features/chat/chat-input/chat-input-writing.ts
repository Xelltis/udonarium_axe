import { signal } from '@angular/core';
import { ResettableTimeout } from '@axe/core/util/resettable-timeout';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

export class WritingPeerManager {
  private readonly peers: Map<string, ResettableTimeout> = new Map();
  readonly names = signal<string[]>([]);

  /** Marks a peer as typing, or keeps them marked for another two seconds if they already are. */
  add(peerId: string): void {
    if (!this.peers.has(peerId)) {
      this.peers.set(
        peerId,
        new ResettableTimeout(() => {
          this.peers.delete(peerId);
          this.updateNames();
        }, 2000)
      );
      this.updateNames();
    }
    this.peers.get(peerId)!.reset();
  }

  /**
   * Stops showing a peer as typing straight away, such as when their message arrives; unknown peers
   * are ignored.
   */
  remove(peerId: string): void {
    if (!this.peers.has(peerId)) return;
    this.peers.get(peerId)!.stop();
    this.peers.delete(peerId);
    this.updateNames();
  }

  /**
   * Cancels every pending expiry and forgets all peers without updating `names`, for when the owner
   * goes away.
   */
  destroy(): void {
    for (const [, timeout] of this.peers) {
      timeout.stop();
    }
    this.peers.clear();
  }

  private updateNames(): void {
    this.names.set(
      Array.from(this.peers.keys()).map((peerId) => {
        const peer = PeerCursor.findByPeerId(peerId);
        return peer ? peer.name : '';
      })
    );
  }
}
