import { PeerContext } from '@axe/core/network/peer-context';
import { SkyWayDataStream } from '@axe/core/network/skyway/skyway-data-stream';

export class SkyWayDataStreamList implements Iterable<SkyWayDataStream> {
  private streams: SkyWayDataStream[] = [];
  /** How many streams the list holds, open or not. */
  get length(): number {
    return this.streams.length;
  }

  /** Iterates over a copy of the streams, so the list may change during the loop. */
  [Symbol.iterator]() {
    return [...this.streams][Symbol.iterator]();
  }

  private needsRefreshPeers = false;
  private _peers: PeerContext[] = [];
  /** Peer contexts of every stream, sorted by peer id and cached until the next refresh. */
  get peers(): PeerContext[] {
    if (this.needsRefreshPeers) {
      this.needsRefreshPeers = false;
      this._peers = this.streams.map((stream) => stream.peer).sort((a, b) => a.peerId.localeCompare(b.peerId));
    }
    return this._peers;
  }

  private needsRefreshPeerIds = false;
  private _peerIds: string[] = [];
  /**
   * Ids of the peers whose stream is open, sorted and cached until the next refresh.
   *
   * A stream opening or closing does not refresh the cache by itself; call refresh when it does.
   */
  get peerIds(): string[] {
    if (this.needsRefreshPeerIds) {
      this.needsRefreshPeerIds = false;
      this._peerIds = this.streams
        .filter((s) => s.open)
        .map((s) => s.peer.peerId)
        .sort((a, b) => a.localeCompare(b));
    }
    return this._peerIds;
  }

  /**
   * Adds a stream, settling a second stream for the same peer by keeping the lower sort key.
   *
   * That settles two peers dialling each other at once. Gives the stream when it was added and null
   * when it was not, either because it is already in the list or because it lost and was disconnected.
   */
  add(stream: SkyWayDataStream): SkyWayDataStream | null {
    const existStream = this.find(stream.peer.peerId);
    if (existStream) {
      if (existStream !== stream) {
        if (existStream.sortKey < stream.sortKey) {
          stream.removeAllListeners();
          stream.disconnect();
        } else {
          existStream.removeAllListeners();
          existStream.disconnect();
          this.remove(existStream);
          this.streams.push(stream);
          this.refresh();
          return stream;
        }
      }
      return null;
    }
    this.streams.push(stream);
    this.refresh();
    return stream;
  }

  /** Takes a stream out of the list without closing it; null when it was not there. */
  remove(stream: SkyWayDataStream): SkyWayDataStream | null {
    const index = this.streams.indexOf(stream);
    if (index < 0) return null;
    this.streams.splice(index, 1);
    this.refresh();
    return stream;
  }

  /** The stream for a peer id, open or not, or undefined. */
  find(peerId: string): SkyWayDataStream | undefined {
    return this.streams.find((stream) => stream.peer.peerId === peerId);
  }

  /** Marks the cached peers and peer ids stale, so the next read rebuilds them. */
  refresh() {
    this.needsRefreshPeers = true;
    this.needsRefreshPeerIds = true;
  }
}
