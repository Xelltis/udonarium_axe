import { IPeerContext, PeerContext } from '@axe/core/network/peer-context';

export interface IRoomInfo {
  readonly id: string;
  readonly name: string;
  readonly hasPassword: boolean;
  readonly peers: IPeerContext[];

  filterByPassword(password: string): IPeerContext[] | Promise<IPeerContext[]>;
}

export class RoomInfo implements IRoomInfo {
  /** Whether any peer in the room has a password. */
  get hasPassword(): boolean {
    return this.peers.some((peer) => peer.hasPassword);
  }

  constructor(
    public id: string = '',
    public name: string = '',
    public peers: PeerContext[] = []
  ) {}

  /** The peers whose id matches the password, which are the ones that password lets you join. */
  async filterByPassword(password: string): Promise<PeerContext[]> {
    const results = await Promise.all(this.peers.map((p) => p.verifyPassword(password).then((ok) => (ok ? p : null))));
    return results.filter((p) => p !== null);
  }

  /**
   * Groups peer ids into rooms by room id and room-name digest, sorted; ids not in a room are skipped.
   *
   * Room names are not in the ids, so they stay empty.
   */
  static listFrom(peerIds: string[]) {
    const peers = peerIds.map((peerId) => PeerContext.parse(peerId)).sort((a, b) => a.peerId.localeCompare(b.peerId));

    const roomMap: Map<string, RoomInfo> = new Map();
    for (const peer of peers) {
      if (peer.isRoom) {
        const alias = peer.roomId + peer.digestRoomName;
        const room = roomMap.get(alias) ?? new RoomInfo(peer.roomId, peer.roomName);
        room.peers.push(peer);
        roomMap.set(alias, room);
      }
    }

    if (roomMap.size === 0) return [];

    return Array.from(roomMap.values()).sort((a, b) => (a.id + a.name).localeCompare(b.id + b.name));
  }

  /** Groups lobby members into rooms like listFrom, naming each room from its first member. */
  static listFromMembers(members: { peerId: string; roomName: string }[]): RoomInfo[] {
    const peers = members
      .map(({ peerId, roomName }) => {
        const peer = PeerContext.parse(peerId);
        peer.roomName = roomName;
        return peer;
      })
      .sort((a, b) => a.peerId.localeCompare(b.peerId));

    const roomMap: Map<string, RoomInfo> = new Map();
    for (const peer of peers) {
      if (peer.isRoom) {
        const alias = peer.roomId + peer.digestRoomName;
        const room = roomMap.get(alias) ?? new RoomInfo(peer.roomId, peer.roomName);
        room.peers.push(peer);
        roomMap.set(alias, room);
      }
    }

    if (roomMap.size === 0) return [];

    return Array.from(roomMap.values()).sort((a, b) => (a.id + a.name).localeCompare(b.id + b.name));
  }
}
