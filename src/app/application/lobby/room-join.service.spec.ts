import { TestBed } from '@angular/core/testing';
import {
  ROOM_CONNECT_TIMEOUT_MS,
  ROOM_OPEN_TIMEOUT_MS,
  RoomJoinService,
} from '@axe/application/lobby/room-join.service';
import {
  type NetworkErrorEvent,
  type NetworkPeerEvent,
  ObjectChangeService,
} from '@axe/application/sync/object-change.service';
import { EventChannel } from '@axe/core/event/event-channel';
import { Network } from '@axe/core/index';
import { IPeerContext, PeerContext } from '@axe/core/network/peer-context';
import { IRoomInfo, RoomInfo } from '@axe/core/network/room-info';
import { sameNameMemberWait$ } from '@axe/core/network/skyway/same-name-member';
import { clearIdentity, saveIdentity } from '@axe/core/storage/identity-storage';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

class StubObjectChangeService {
  readonly networkOpen$ = new EventChannel<NetworkPeerEvent>();
  readonly peerConnect$ = new EventChannel<NetworkPeerEvent>();
  readonly peerDisconnect$ = new EventChannel<NetworkPeerEvent>();
  readonly networkError$ = new EventChannel<NetworkErrorEvent>();
}

/** This seat's id in room `abc`, which the connection has only once the room is opening. */
const MY_PEER = 'myseatabcroomname-';

function peerContext(peerId: string, roomId: string, roomName: string): IPeerContext {
  const context = PeerContext.parse(peerId);
  context.roomId = roomId;
  context.roomName = roomName;
  return context;
}

describe('RoomJoinService', () => {
  let service: RoomJoinService;
  let stubChange: StubObjectChangeService;
  let connectedPeers: IPeerContext[];
  let originalMyCursor: PeerCursor;
  let livePeerId: string;

  beforeEach(() => {
    stubChange = new StubObjectChangeService();
    connectedPeers = [];
    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS, { provide: ObjectChangeService, useValue: stubChange }],
    });
    service = TestBed.inject(RoomJoinService);

    originalMyCursor = PeerCursor.myCursor;
    PeerCursor.myCursor = { peerId: '' } as PeerCursor;
    livePeerId = 'standbypeer';
    // Opening drops the standby connection and makes the room's one only after a wait, so for a
    // while there is no peer id to read at all.
    vi.spyOn(Network, 'open').mockImplementation(() => {
      livePeerId = '???';
    });
    vi.spyOn(Network, 'openStandby').mockImplementation(() => {
      livePeerId = 'standbypeer';
    });
    vi.spyOn(Network, 'connect').mockResolvedValue(true);
    vi.spyOn(Network, 'peerId', 'get').mockImplementation(() => livePeerId);
    vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ userId: 'user' } as PeerContext);
    vi.spyOn(Network, 'peerContexts', 'get').mockImplementation(() => connectedPeers as PeerContext[]);
  });

  afterEach(() => {
    clearIdentity();
    PeerCursor.myCursor = originalMyCursor;
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  describe('findRoom', () => {
    it('returns the room whose id matches', async () => {
      const rooms: IRoomInfo[] = [new RoomInfo('abc', 'first'), new RoomInfo('xyz', 'second')];
      vi.spyOn(Network, 'listAllRooms').mockResolvedValue(rooms);

      await expect(service.findRoom('xyz')).resolves.toBe(rooms[1]);
    });

    it('returns nothing when no room matches', async () => {
      vi.spyOn(Network, 'listAllRooms').mockResolvedValue([new RoomInfo('abc', 'first')]);

      await expect(service.findRoom('xyz')).resolves.toBeNull();
    });
  });

  describe('join', () => {
    /** The room's own connection coming up under this seat's id. */
    function roomOpens(): void {
      livePeerId = MY_PEER;
      stubChange.networkOpen$.emit({ peerId: MY_PEER });
    }

    it('does nothing and reports failure with nowhere to connect', async () => {
      await expect(service.join([], '')).resolves.toBe(false);
      expect(Network.open).not.toHaveBeenCalled();
    });

    it('opens the room, then connects to every peer already there', async () => {
      const peers = [peerContext('peer-1', 'abc', 'room'), peerContext('peer-2', 'abc', 'room')];
      void service.join(peers, 'pw');

      expect(Network.open).toHaveBeenCalledWith('user', 'abc', 'room', 'pw');
      expect(Network.connect).not.toHaveBeenCalled();

      roomOpens();
      expect(Network.connect).toHaveBeenCalledTimes(2);
    });

    it('comes into the room as a player when this seat was left as game master, before anyone sees it', () => {
      PeerCursor.myCursor = { peerId: '', role: PeerRole.GameMaster } as PeerCursor;
      let roleWhenOpened: PeerRole | null = null;
      vi.mocked(Network.open).mockImplementation(() => {
        roleWhenOpened = PeerCursor.myCursor.role;
      });

      void service.join([peerContext('peer-1', 'abc', 'room')], '');

      expect(roleWhenOpened).toBe(PeerRole.Player);
      expect(PeerCursor.myCursor.role).toBe(PeerRole.Player);
    });

    it('leaves a player and a guest as they chose', () => {
      for (const role of [PeerRole.Player, PeerRole.Guest]) {
        PeerCursor.myCursor = { peerId: '', role } as PeerCursor;

        void service.join([peerContext('peer-1', 'abc', 'room')], '');

        expect(PeerCursor.myCursor.role).toBe(role);
      }
    });

    it('keeps the role when there is no room to join', async () => {
      PeerCursor.myCursor = { peerId: '', role: PeerRole.GameMaster } as PeerCursor;

      await service.join([], '');

      expect(PeerCursor.myCursor.role).toBe(PeerRole.GameMaster);
    });

    it('keeps a game master coming back to the room this tab was last in', () => {
      saveIdentity({ userId: 'user', roomId: 'abc', roomName: 'room', role: PeerRole.GameMaster, reConnectPass: '' });
      PeerCursor.myCursor = { peerId: '', role: PeerRole.GameMaster } as PeerCursor;

      void service.join([peerContext('peer-1', 'abc', 'room')], '');

      expect(PeerCursor.myCursor.role).toBe(PeerRole.GameMaster);
    });

    it('puts a game master down in any room but the one this tab was last in', () => {
      saveIdentity({ userId: 'user', roomId: 'xyz', roomName: 'other', role: PeerRole.GameMaster, reConnectPass: '' });
      PeerCursor.myCursor = { peerId: '', role: PeerRole.GameMaster } as PeerCursor;

      void service.join([peerContext('peer-1', 'abc', 'room')], '');

      expect(PeerCursor.myCursor.role).toBe(PeerRole.Player);
    });

    it('reports success when a connection survives every attempt', async () => {
      const peers = [peerContext('peer-1', 'abc', 'room'), peerContext('peer-2', 'abc', 'room')];
      const joined = service.join(peers, '');
      roomOpens();

      connectedPeers = [peers[0]];
      stubChange.peerConnect$.emit({ peerId: 'peer-1' });
      stubChange.peerDisconnect$.emit({ peerId: 'peer-2' });

      await expect(joined).resolves.toBe(true);
      expect(Network.openStandby).not.toHaveBeenCalled();
    });

    it('goes back to waiting and reports failure when nobody answers', async () => {
      const peers = [peerContext('peer-1', 'abc', 'room')];
      const joined = service.join(peers, '');
      roomOpens();

      stubChange.peerDisconnect$.emit({ peerId: 'peer-1' });

      await expect(joined).resolves.toBe(false);
      expect(Network.openStandby).toHaveBeenCalledOnce();
    });

    it('settles on the timeout when no one ever answers', async () => {
      vi.useFakeTimers();
      const joined = service.join([peerContext('peer-1', 'abc', 'room')], '');
      roomOpens();

      await vi.advanceTimersByTimeAsync(15_000);

      await expect(joined).resolves.toBe(false);
      vi.useRealTimers();
    });

    it('gives the room up to a minute to open while what a reload left of this seat is still in it', async () => {
      vi.useFakeTimers();
      const peers = [peerContext('peer-1', 'abc', 'room')];
      let settled = false;
      const joined = service.join(peers, '').then((result) => {
        settled = true;
        return result;
      });

      await vi.advanceTimersByTimeAsync(ROOM_CONNECT_TIMEOUT_MS * 3);
      expect(settled).toBe(false);

      roomOpens();
      connectedPeers = [peers[0]];
      stubChange.peerConnect$.emit({ peerId: 'peer-1' });
      await expect(joined).resolves.toBe(true);
      vi.useRealTimers();
    });

    it('gives up and goes back to waiting when the room never opens', async () => {
      vi.useFakeTimers();
      const joined = service.join([peerContext('peer-1', 'abc', 'room')], '');
      livePeerId = MY_PEER;

      await vi.advanceTimersByTimeAsync(ROOM_OPEN_TIMEOUT_MS);

      await expect(joined).resolves.toBe(false);
      expect(Network.openStandby).toHaveBeenCalledOnce();
      vi.useRealTimers();
    });

    it('ends at once on an error opening the room, but not on one from another connection', async () => {
      const joined = service.join([peerContext('peer-1', 'abc', 'room')], '');
      let settled = false;
      void joined.then(() => (settled = true));

      livePeerId = MY_PEER;

      stubChange.networkError$.emit({ peerId: 'standbypeer', errorType: 'disconnect', errorMessage: '' });
      stubChange.networkError$.emit({ peerId: 'otherpabcroomname-', errorType: 'disconnect', errorMessage: '' });
      await Promise.resolve();
      expect(settled).toBe(false);

      stubChange.networkError$.emit({ peerId: MY_PEER, errorType: 'same-name-member', errorMessage: '' });
      await expect(joined).resolves.toBe(false);
    });

    it('does not take the waiting connection opening for the room', async () => {
      const joined = service.join([peerContext('peer-1', 'abc', 'room')], '');

      stubChange.networkOpen$.emit({ peerId: 'standbypeer' });
      livePeerId = 'standbypeer';
      stubChange.networkOpen$.emit({ peerId: 'standbypeer' });
      expect(Network.connect).not.toHaveBeenCalled();

      roomOpens();
      expect(Network.connect).toHaveBeenCalledOnce();
      stubChange.peerDisconnect$.emit({ peerId: 'peer-1' });
      await joined;
    });

    it('leaves out what the listing still holds of this seat, and takes the room opening as the join where nobody else is left', async () => {
      const joined = service.join([peerContext(MY_PEER, 'abc', 'room')], '');

      roomOpens();

      await expect(joined).resolves.toBe(true);
      expect(Network.connect).not.toHaveBeenCalled();
      expect(Network.openStandby).not.toHaveBeenCalled();
    });

    it('says when it is waiting for this seat’s previous connection to drop', () => {
      sameNameMemberWait$.emit({ waiting: true });
      expect(service.waitingForPreviousConnection()).toBe(true);

      sameNameMemberWait$.emit({ waiting: false });
      expect(service.waitingForPreviousConnection()).toBe(false);
    });

    it('settles once, whatever arrives afterwards', async () => {
      const peers = [peerContext('peer-1', 'abc', 'room')];
      connectedPeers = [peers[0]];
      const joined = service.join(peers, '');
      roomOpens();

      stubChange.peerConnect$.emit({ peerId: 'peer-1' });
      stubChange.peerConnect$.emit({ peerId: 'peer-1' });

      await expect(joined).resolves.toBe(true);
    });
  });
});
