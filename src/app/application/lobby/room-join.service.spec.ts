import { TestBed } from '@angular/core/testing';
import { RoomJoinService } from '@axe/application/lobby/room-join.service';
import { type NetworkPeerEvent, ObjectChangeService } from '@axe/application/sync/object-change.service';
import { EventChannel } from '@axe/core/event/event-channel';
import { Network } from '@axe/core/index';
import { IPeerContext, PeerContext } from '@axe/core/network/peer-context';
import { IRoomInfo, RoomInfo } from '@axe/core/network/room-info';
import { clearIdentity, saveIdentity } from '@axe/core/storage/identity-storage';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

class StubObjectChangeService {
  readonly networkOpen$ = new EventChannel<NetworkPeerEvent>();
  readonly peerConnect$ = new EventChannel<NetworkPeerEvent>();
  readonly peerDisconnect$ = new EventChannel<NetworkPeerEvent>();
}

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

  beforeEach(() => {
    stubChange = new StubObjectChangeService();
    connectedPeers = [];
    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS, { provide: ObjectChangeService, useValue: stubChange }],
    });
    service = TestBed.inject(RoomJoinService);

    originalMyCursor = PeerCursor.myCursor;
    PeerCursor.myCursor = { peerId: '' } as PeerCursor;
    vi.spyOn(Network, 'open').mockImplementation(() => {});
    vi.spyOn(Network, 'openStandby').mockImplementation(() => {});
    vi.spyOn(Network, 'connect').mockResolvedValue(true);
    vi.spyOn(Network, 'peerId', 'get').mockReturnValue('my-peer');
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
    it('does nothing and reports failure with nowhere to connect', async () => {
      await expect(service.join([], '')).resolves.toBe(false);
      expect(Network.open).not.toHaveBeenCalled();
    });

    it('opens the room, then connects to every peer already there', async () => {
      const peers = [peerContext('peer-1', 'abc', 'room'), peerContext('peer-2', 'abc', 'room')];
      void service.join(peers, 'pw');

      expect(Network.open).toHaveBeenCalledWith('user', 'abc', 'room', 'pw');
      expect(Network.connect).not.toHaveBeenCalled();

      stubChange.networkOpen$.emit({ peerId: 'my-peer' });
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
      stubChange.networkOpen$.emit({ peerId: 'my-peer' });

      connectedPeers = [peers[0]];
      stubChange.peerConnect$.emit({ peerId: 'peer-1' });
      stubChange.peerDisconnect$.emit({ peerId: 'peer-2' });

      await expect(joined).resolves.toBe(true);
      expect(Network.openStandby).not.toHaveBeenCalled();
    });

    it('goes back to waiting and reports failure when nobody answers', async () => {
      const peers = [peerContext('peer-1', 'abc', 'room')];
      const joined = service.join(peers, '');
      stubChange.networkOpen$.emit({ peerId: 'my-peer' });

      stubChange.peerDisconnect$.emit({ peerId: 'peer-1' });

      await expect(joined).resolves.toBe(false);
      expect(Network.openStandby).toHaveBeenCalledOnce();
    });

    it('settles on the timeout when no one ever answers', async () => {
      vi.useFakeTimers();
      const joined = service.join([peerContext('peer-1', 'abc', 'room')], '');
      stubChange.networkOpen$.emit({ peerId: 'my-peer' });

      await vi.advanceTimersByTimeAsync(15_000);

      await expect(joined).resolves.toBe(false);
      vi.useRealTimers();
    });

    it('settles once, whatever arrives afterwards', async () => {
      const peers = [peerContext('peer-1', 'abc', 'room')];
      connectedPeers = [peers[0]];
      const joined = service.join(peers, '');
      stubChange.networkOpen$.emit({ peerId: 'my-peer' });

      stubChange.peerConnect$.emit({ peerId: 'peer-1' });
      stubChange.peerConnect$.emit({ peerId: 'peer-1' });

      await expect(joined).resolves.toBe(true);
    });
  });
});
