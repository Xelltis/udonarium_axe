import { listedRooms } from '@axe/application/lobby/listed-rooms';
import { PeerContext } from '@axe/core/network/peer-context';
import { IRoomInfo, RoomInfo } from '@axe/core/network/room-info';

describe('listedRooms', () => {
  it('gives a row for each room, ordered by id and name, with the room and its peers on it', () => {
    const peer = PeerContext.parse('peer-in-b');
    const b = new RoomInfo('b01', 'beta', [peer]);
    const a2 = new RoomInfo('a01', 'zeta');
    const a1 = new RoomInfo('a01', 'alpha');

    const rows = listedRooms([b, a2, a1]);

    expect(rows.map((row) => row.alias)).toEqual(['a01alpha', 'a01zeta', 'b01beta']);
    expect(rows.map((row) => row.roomName)).toEqual(['alpha', 'zeta', 'beta']);
    expect(rows[2].info).toBe(b);
    expect(rows[2].peerContexts).toEqual([peer]);
  });

  it('orders by code unit, as the lists always have, and leaves what it was given as it was', () => {
    const rooms: IRoomInfo[] = [new RoomInfo('b', ''), new RoomInfo('B', ''), new RoomInfo('a', '')];

    expect(listedRooms(rooms).map((row) => row.alias)).toEqual(['B', 'a', 'b']);
    expect(rooms.map((room) => room.id)).toEqual(['b', 'B', 'a']);
    expect(listedRooms([])).toEqual([]);
  });
});
