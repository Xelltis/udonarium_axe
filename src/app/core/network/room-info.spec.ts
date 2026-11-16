import { PeerContext } from '@axe/core/network/peer-context';
import { RoomInfo } from '@axe/core/network/room-info';

describe('RoomInfo', () => {
  describe('constructor', () => {
    it('can be created from the defaults', () => {
      const room = new RoomInfo();
      expect(room.id).toBe('');
      expect(room.name).toBe('');
      expect(room.peers).toEqual([]);
    });

    it('can be created from arguments', () => {
      const room = new RoomInfo('rm1', 'テストルーム', []);
      expect(room.id).toBe('rm1');
      expect(room.name).toBe('テストルーム');
    });
  });

  describe('hasPassword', () => {
    it('reports no password when no peer carries one', async () => {
      const peer = await PeerContext.createRoom('user1', 'rm', 'Room', '');
      const room = new RoomInfo('rm', 'Room', [peer]);
      expect(room.hasPassword).toBe(false);
    });

    it('reports a password when a peer carries one', async () => {
      const peer = await PeerContext.createRoom('user1', 'rm', 'Room', 'pass');
      const room = new RoomInfo('rm', 'Room', [peer]);
      expect(room.hasPassword).toBe(true);
    });
  });

  describe('filterByPassword', () => {
    it('keeps the peers the password lets you join, in their order', async () => {
      const peerFor = (ok: boolean, peerId: string) =>
        ({ peerId, verifyPassword: async () => ok }) as unknown as PeerContext;
      const room = new RoomInfo('rm', 'Room', [peerFor(true, 'a'), peerFor(false, 'b'), peerFor(true, 'c')]);

      const peers = await room.filterByPassword('pass');

      expect(peers.map((peer) => peer.peerId)).toEqual(['a', 'c']);
    });
  });

  describe('listFrom', () => {
    it('returns nothing for an empty list', () => {
      const rooms = RoomInfo.listFrom([]);
      expect(rooms).toEqual([]);
    });

    it('builds the room list from the peers in them', async () => {
      const peer1 = await PeerContext.createRoom('user1', 'abc', 'Room1', '');
      const peer2 = await PeerContext.createRoom('user2', 'abc', 'Room1', '');
      const rooms = RoomInfo.listFrom([peer1.peerId, peer2.peerId]);
      expect(rooms.length).toBe(1);
      expect(rooms[0].peers.length).toBe(2);
    });

    it('keeps different rooms apart', async () => {
      const peer1 = await PeerContext.createRoom('user1', 'ab1', 'RoomA', '');
      const peer2 = await PeerContext.createRoom('user2', 'ab2', 'RoomB', '');
      const rooms = RoomInfo.listFrom([peer1.peerId, peer2.peerId]);
      expect(rooms.length).toBe(2);
    });

    it('ignores a peer outside any room', async () => {
      const peer = await PeerContext.create('user1');
      const rooms = RoomInfo.listFrom([peer.peerId]);
      expect(rooms).toEqual([]);
    });
  });
});
