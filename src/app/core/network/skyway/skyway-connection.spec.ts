import { Logger } from '@axe/core/logging/logger';
import { PeerContext } from '@axe/core/network/peer-context';
import { PeerReconnectScheduler } from '@axe/core/network/peer-reconnect-scheduler';
import { CONNECT_DEADLINE_MS, SkyWayConnection } from '@axe/core/network/skyway/skyway-connection';
import { decompressAsync } from '@axe/core/util/compress';
import * as MessagePack from '@axe/core/util/message-pack';
import { PERF_INBOUND_DRAIN, perfCounters } from '@axe/core/util/perf-counters';

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('SkyWayConnection', () => {
  it('is exported', () => {
    expect(SkyWayConnection).toBeDefined();
  });

  it('sets up its properties', () => {
    const conn = new SkyWayConnection();
    expect(conn.callback).toBeDefined();
    expect(conn.bandwidthUsage).toBe(0);
  });

  describe('opening', () => {
    it('reports a peer that could not be made, in a room or on standby', async () => {
      vi.spyOn(PeerContext, 'create').mockRejectedValue(new Error('no digest'));
      vi.spyOn(PeerContext, 'createRoom').mockRejectedValue(new Error('no room digest'));
      const conn = new SkyWayConnection();
      const errors: string[] = [];
      conn.callback.onError = (_peer, errorType, errorMessage) => errors.push(`${errorType}: ${errorMessage}`);

      conn.openStandby('user');
      conn.open('user', 'abc', 'room', '');
      await flushMicrotasks();

      expect(errors).toEqual(['Error: no digest', 'Error: no room digest']);
      vi.restoreAllMocks();
    });
  });

  describe('sending', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed to reach a private method
    let connAny: Record<string, any>;
    let sent: { data: Uint8Array; isCompressed?: boolean }[];
    let lanes: string[];

    const compressible = () => new Uint8Array(8 * 1024);

    const messagesIn = async (container: { data: Uint8Array; isCompressed?: boolean }) =>
      MessagePack.decode(container.isCompressed ? await decompressAsync(container.data) : container.data) as {
        eventName: string;
        data: { index?: number };
      }[];

    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed to reach a private method
      connAny = new SkyWayConnection() as any;
      Object.defineProperty(connAny, 'peers', { get: () => [PeerContext.parse('peer-a')], configurable: true });
      sent = [];
      lanes = [];
      vi.spyOn(connAny, 'sendBroadcast').mockImplementation((container: unknown, lane: unknown) => {
        sent.push(container as { data: Uint8Array; isCompressed?: boolean });
        lanes.push(lane as string);
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('still gzips a batch of ordinary messages', async () => {
      connAny.send([
        { eventName: 'UPDATE_GAME_OBJECT', data: compressible() },
        { eventName: 'UPDATE_GAME_OBJECT', data: compressible() },
      ]);
      await connAny.outboundQueue;

      expect(sent).toHaveLength(1);
      expect(sent[0].isCompressed).toBe(true);
    });

    it('sends a piece of a file as it is and still gzips the rest of its batch', async () => {
      connAny.send([
        { eventName: 'FILE_SEND_CHUNK_some-image', data: { index: 0, length: 2, chunk: compressible() } },
        { eventName: 'UPDATE_GAME_OBJECT', data: compressible() },
        { eventName: 'UPDATE_GAME_OBJECT', data: compressible() },
      ]);
      await connAny.outboundQueue;

      expect(sent.map((container) => !!container.isCompressed)).toEqual([false, true]);
      expect((await messagesIn(sent[0])).map((m) => m.eventName)).toEqual(['FILE_SEND_CHUNK_some-image']);
      expect((await messagesIn(sent[1])).map((m) => m.eventName)).toEqual(['UPDATE_GAME_OBJECT', 'UPDATE_GAME_OBJECT']);
    });

    it('keeps the order within the pieces of a file and within the rest of a batch that mixes them', async () => {
      const batch: { eventName: string; data: unknown }[] = [
        { eventName: 'START_FILE_TRANSMISSION', data: { taskIdentifier: 'some-image' } },
        { eventName: 'FILE_SEND_CHUNK_some-image', data: { index: 0, length: 3, chunk: compressible() } },
        { eventName: 'FILE_SEND_CHUNK_some-image', data: { index: 1, length: 3, chunk: compressible() } },
        { eventName: 'UPDATE_GAME_OBJECT', data: compressible() },
        { eventName: 'FILE_SEND_CHUNK_some-image', data: { index: 2, length: 3, chunk: compressible() } },
        { eventName: 'DELETE_GAME_OBJECT', data: {} },
      ];
      connAny.send(batch);
      await connAny.outboundQueue;

      const received: Record<string, { eventName: string; data: { index?: number } }[]> = { control: [], bulk: [] };
      for (const [index, container] of sent.entries()) {
        const messages = await messagesIn(container);
        const carriesPieces = messages.some((m) => m.eventName.startsWith('FILE_SEND_CHUNK_'));
        if (carriesPieces) expect(container.isCompressed).toBeFalsy();
        expect(lanes[index]).toBe(carriesPieces ? 'bulk' : 'control');
        received[lanes[index]].push(...messages);
      }
      expect(received['control'].map((m) => m.eventName)).toEqual([
        'START_FILE_TRANSMISSION',
        'UPDATE_GAME_OBJECT',
        'DELETE_GAME_OBJECT',
      ]);
      expect(received['bulk'].map((m) => m.data.index)).toEqual([0, 1, 2]);
    });

    it('hands the start of a transfer to the stream ahead of its first piece', async () => {
      connAny.send([
        { eventName: 'START_FILE_TRANSMISSION', data: { taskIdentifier: 'some-image' } },
        { eventName: 'FILE_SEND_CHUNK_some-image', data: { index: 0, length: 1, chunk: compressible() } },
      ]);
      await connAny.outboundQueue;

      expect(lanes).toEqual(['control', 'bulk']);
      expect((await messagesIn(sent[0])).map((m) => m.eventName)).toEqual(['START_FILE_TRANSMISSION']);
    });

    it('hands a piece of a file sent on its own to the stream as bulk, and any other lone message as control', async () => {
      connAny.send([{ eventName: 'FILE_SEND_CHUNK_some-image', data: { index: 0, length: 1, chunk: compressible() } }]);
      connAny.send([{ eventName: 'UPDATE_GAME_OBJECT', data: compressible() }]);
      connAny.send({ eventName: 'UPDATE_GAME_OBJECT', data: compressible() });
      await connAny.outboundQueue;

      expect(lanes).toEqual(['bulk', 'control', 'control']);
      expect(sent.map((container) => !!container.isCompressed)).toEqual([false, false, false]);
    });

    it('sends a container in the shape it always had, whichever lane it goes by', async () => {
      connAny.send([
        { eventName: 'FILE_SEND_CHUNK_some-image', data: { index: 0, length: 1, chunk: compressible() } },
        { eventName: 'UPDATE_GAME_OBJECT', data: compressible() },
        { eventName: 'UPDATE_GAME_OBJECT', data: compressible() },
      ]);
      await connAny.outboundQueue;

      expect(sent.map((container) => Object.keys(container).sort())).toEqual([
        ['data', 'ttl'],
        ['data', 'isCompressed', 'ttl'],
      ]);
    });
  });

  describe('the lane a container goes to a stream by', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed to reach a private method
    let connAny: Record<string, any>;
    let streamA: { peer: { peerId: string; userId: string }; open: boolean; send: ReturnType<typeof vi.fn> };
    let streamB: { peer: { peerId: string; userId: string }; open: boolean; send: ReturnType<typeof vi.fn> };

    const piece = { eventName: 'FILE_SEND_CHUNK_some-sound', data: { index: 0, length: 2, chunk: new Uint8Array(8) } };
    const update = { eventName: 'UPDATE_GAME_OBJECT', data: {} };

    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed to reach a private method
      connAny = new SkyWayConnection() as any;
      streamA = { peer: { peerId: 'peer-a', userId: 'user-a' }, open: true, send: vi.fn() };
      streamB = { peer: { peerId: 'peer-b', userId: 'user-b' }, open: true, send: vi.fn() };
      connAny.streams.streams.push(streamA, streamB);
      connAny.streams.refresh();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('is bulk for a run of pieces of a file to one peer and control for the rest', async () => {
      connAny.send([update, piece, piece, update], 'peer-a');
      await connAny.outboundQueue;

      expect(streamA.send.mock.calls.map((call) => call[1])).toEqual(['control', 'bulk', 'control']);
      expect(streamB.send).not.toHaveBeenCalled();
    });

    it('is control for what goes to everybody', async () => {
      connAny.send([update, update]);
      await connAny.outboundQueue;

      expect(streamA.send.mock.calls.map((call) => call[1])).toEqual(['control']);
      expect(streamB.send.mock.calls.map((call) => call[1])).toEqual(['control']);
    });

    it('is control for a container passed on from one peer to another', () => {
      connAny.relayingPeerIds.set('peer-a', ['peer-b']);
      const container = { data: MessagePack.encode([update]), ttl: 1 };

      connAny.onRelay(streamA, container);

      expect(streamB.send).toHaveBeenCalledExactlyOnceWith(container, 'control');
      expect(streamA.send).not.toHaveBeenCalled();
    });

    it('is control for the list of users', () => {
      connAny.notifyUserList();

      expect(streamA.send).toHaveBeenCalledTimes(1);
      expect(streamA.send.mock.calls[0][0].users).toBeDefined();
      expect(streamA.send.mock.calls[0][1]).toBe('control');
      expect(streamB.send.mock.calls[0][1]).toBe('control');
    });
  });

  describe('sending to one peer', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed to reach a private method
    let connAny: Record<string, any>;

    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed to reach a private method
      connAny = new SkyWayConnection() as any;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('logs a message dropped for want of an open stream, once for a run of them to one peer', () => {
      const warned = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
      connAny.streams.streams.push({ peer: { peerId: 'peer-closed' }, open: false, send: vi.fn() });

      for (let n = 0; n < 5; n++) connAny.sendUnicast({ data: new Uint8Array(), ttl: 1 }, 'peer-closed');
      connAny.sendUnicast({ data: new Uint8Array(), ttl: 1 }, 'peer-unknown');

      expect(warned).toHaveBeenCalledTimes(2);
      expect(warned.mock.calls[0][0]).toContain('peer-closed');
      expect(warned.mock.calls[1][0]).toContain('peer-unknown');
    });

    it('sends to a peer whose stream is open without a word', () => {
      const warned = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
      const send = vi.fn();
      connAny.streams.streams.push({ peer: { peerId: 'peer-open' }, open: true, send });

      connAny.sendUnicast({ data: new Uint8Array(), ttl: 1 }, 'peer-open');

      expect(send).toHaveBeenCalledTimes(1);
      expect(warned).not.toHaveBeenCalled();
    });
  });

  describe('the members of the room', () => {
    it('lists the others SkyWay has in the room, once each, with or without a stream', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed to reach a private field
      const connAny = new SkyWayConnection() as any;
      connAny.skyWay.peer = PeerContext.parse('me');
      connAny.skyWay.room = { members: [{ name: 'me' }, { name: 'peer-a' }, { name: 'peer-a' }, { name: undefined }] };

      expect(connAny.roomPeerIds).toEqual(['peer-a']);
    });
  });

  describe('the link to each peer', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed to reach private fields
    let connAny: Record<string, any>;
    const streamTo = (peerId: string, open: boolean) => ({ peer: PeerContext.parse(peerId), open });

    beforeEach(() => {
      vi.useFakeTimers();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed to reach private fields
      connAny = new SkyWayConnection() as any;
      connAny.skyWay.peer = PeerContext.parse('me');
      connAny.skyWay.room = { members: [{ name: 'me' }] };
      connAny.reconnectScheduler = new PeerReconnectScheduler([10, 20], 30);
      connAny.makeFriendPeer = (userId: string) => Promise.resolve(PeerContext.parse(`peer-${userId}`));
      connAny.notifyUserList = vi.fn();
    });

    afterEach(() => {
      connAny.reconnectScheduler.cancelAll();
      vi.useRealTimers();
    });

    const add = (peerId: string, open: boolean) => {
      connAny.streams.streams.push(streamTo(peerId, open));
      connAny.streams.refresh();
    };
    const retry = (peerId: string, times: number) => {
      for (let i = 0; i < times; i++) {
        connAny.reconnectScheduler.schedule(peerId, () => {});
        connAny.reconnectScheduler.cancel(peerId);
      }
    };

    it('lists every peer with a stream and every other member of the room, sorted, once each', () => {
      add('peer-b', true);
      add('peer-a', false);
      connAny.skyWay.room.members.push({ name: 'peer-b' }, { name: 'peer-c' });

      expect(connAny.peerLinks.map((link: { peerId: string }) => link.peerId)).toEqual(['peer-a', 'peer-b', 'peer-c']);
    });

    it('is direct for an open stream and reconnecting for one still opening', () => {
      add('peer-a', true);
      add('peer-b', false);

      expect(connAny.peerLinks).toEqual([
        { peerId: 'peer-a', state: 'direct' },
        { peerId: 'peer-b', state: 'reconnecting' },
      ]);
    });

    it('keeps a peer between two attempts on the list as reconnecting, though it has no stream', () => {
      retry('peer-a', 1);
      connAny.reconnectScheduler.schedule('peer-a', () => {});

      expect(connAny.peerLinks).toEqual([{ peerId: 'peer-a', state: 'reconnecting' }]);
    });

    it('is failed for a member of the room past the backoff whom nobody connected lists', () => {
      connAny.skyWay.room.members.push({ name: 'peer-a' });
      retry('peer-a', 3);

      expect(connAny.peerLinks).toEqual([{ peerId: 'peer-a', state: 'failed' }]);
    });

    it('is relayed for one past the backoff whom a connected peer lists among its users', async () => {
      connAny.skyWay.room.members.push({ name: 'peer-a' }, { name: 'peer-b' });
      add('peer-b', true);
      retry('peer-a', 3);

      await connAny.onUpdateUserIds({ peer: { peerId: 'peer-b' } }, ['b', 'a']);

      expect(connAny.peerLinks).toEqual([
        { peerId: 'peer-a', state: 'relayed' },
        { peerId: 'peer-b', state: 'direct' },
      ]);
    });

    it('takes no word from a peer whose own stream is no longer open', async () => {
      connAny.skyWay.room.members.push({ name: 'peer-a' }, { name: 'peer-b' });
      add('peer-b', false);
      retry('peer-a', 3);

      await connAny.onUpdateUserIds({ peer: { peerId: 'peer-b' } }, ['b', 'a']);

      expect(connAny.peerLinks.find((link: { peerId: string }) => link.peerId === 'peer-a').state).toBe('failed');
    });

    it('forgets what a peer listed once its stream is closed', async () => {
      connAny.skyWay.room.members.push({ name: 'peer-a' });
      const stream = { ...streamTo('peer-b', true), disconnect: vi.fn() };
      connAny.streams.streams.push(stream);
      connAny.streams.refresh();
      await connAny.onUpdateUserIds(stream, ['b', 'a']);
      expect(connAny.peerLinks.find((link: { peerId: string }) => link.peerId === 'peer-a').state).toBe('relayed');

      connAny.disconnectStream(stream);

      expect(connAny.peerLinks).toEqual([{ peerId: 'peer-a', state: 'failed' }]);
    });
  });

  describe('receiving', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed to reach a private method
    let connAny: Record<string, any>;
    let received: unknown[][];
    const stream = { peer: { peerId: 'peer-a' } };

    /** A message holding one small number, as MessagePack writes it: a one-item array of it. */
    const numberMessage = (n: number) => ({ data: new Uint8Array([0x91, n]), ttl: 0 });

    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed to reach a private method
      connAny = new SkyWayConnection() as any;
      received = [];
      connAny.callback.onData = (_peer: unknown, data: unknown[]) => received.push(data);
    });

    afterEach(() => {
      perfCounters.enabled = false;
      perfCounters.clear();
      vi.restoreAllMocks();
    });

    it('hands over what arrives together in a task or two rather than a task each', async () => {
      perfCounters.enabled = true;
      perfCounters.clear();
      for (let n = 0; n < 100; n++) connAny.onData(stream, numberMessage(n));

      await vi.waitFor(() => expect(received).toHaveLength(100));

      expect(perfCounters.drain().get(PERF_INBOUND_DRAIN) ?? 0).toBeLessThan(10);
    });

    it('hands the messages over in the order they arrived', async () => {
      for (let n = 0; n < 20; n++) connAny.onData(stream, numberMessage(n));

      await vi.waitFor(() => expect(received).toHaveLength(20));

      expect(received.map(([n]) => n)).toEqual([...Array(20).keys()]);
    });

    it('drops a message it cannot read and carries on with the ones behind it', async () => {
      vi.spyOn(Logger, 'error').mockImplementation(() => {});
      connAny.onData(stream, { data: new Uint8Array([0xc1]), ttl: 0 });
      connAny.onData(stream, numberMessage(7));

      await vi.waitFor(() => expect(received).toEqual([[7]]));
    });

    it('carries on with the messages behind one whose handling throws', async () => {
      const logged = vi.spyOn(Logger, 'error').mockImplementation(() => {});
      connAny.callback.onData = (_peer: unknown, data: unknown[]) => {
        if (data[0] === 3) throw new Error('broken handler');
        received.push(data);
      };
      connAny.onData(stream, numberMessage(3));
      connAny.onData(stream, numberMessage(7));

      await vi.waitFor(() => expect(received).toEqual([[7]]));
      expect(logged).toHaveBeenCalledTimes(1);
      expect(logged.mock.calls[0][0]).not.toContain('読めなかった');
    });
  });

  describe('leaveImmediately', () => {
    it('carries its methods', () => {
      const conn = new SkyWayConnection();
      expect(typeof conn.leaveImmediately).toBe('function');
    });

    it('survives being used unconnected', () => {
      const conn = new SkyWayConnection();
      expect(() => conn.leaveImmediately()).not.toThrow();
    });
  });

  describe('rejoinAfterLeave', () => {
    it('carries its methods', () => {
      const conn = new SkyWayConnection();
      expect(typeof conn.rejoinAfterLeave).toBe('function');
    });

    it('survives being used unconnected', async () => {
      const conn = new SkyWayConnection();
      await expect(conn.rejoinAfterLeave()).resolves.toBeUndefined();
    });
  });

  describe('onData relay timing', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed to reach a private method
    let connAny: Record<string, any>;
    let mockStream: { peer: { peerId: string } };
    let callOrder: string[];

    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed to reach a private method
      connAny = new SkyWayConnection() as any;
      mockStream = { peer: { peerId: 'peer-a' } };
      callOrder = [];
    });

    it('relays a container carrying users only once the map has been updated', async () => {
      let resolveUpdate!: () => void;
      const updatePromise = new Promise<void>((r) => {
        resolveUpdate = r;
      });

      vi.spyOn(connAny, 'onUpdateUserIds').mockImplementation(() => {
        return updatePromise.then(() => {
          callOrder.push('updateComplete');
        });
      });
      vi.spyOn(connAny, 'onRelay').mockImplementation(() => {
        callOrder.push('relay');
      });

      const container = { data: new Uint8Array(), users: ['user-c'], ttl: 1 };
      connAny.onData(mockStream, container);

      // relays nothing before the update finishes
      await flushMicrotasks();
      expect(callOrder).not.toContain('relay');

      // relays once the update finishes
      resolveUpdate();
      await flushMicrotasks();
      expect(callOrder).toEqual(['updateComplete', 'relay']);
    });

    it('makes a data-only container arriving mid-update wait for it too', async () => {
      let resolveUpdate!: () => void;
      const updatePromise = new Promise<void>((r) => {
        resolveUpdate = r;
      });

      vi.spyOn(connAny, 'onUpdateUserIds').mockImplementation(() => {
        return updatePromise.then(() => {
          callOrder.push('updateComplete');
        });
      });
      vi.spyOn(connAny, 'onRelay').mockImplementation(() => {
        callOrder.push('relay');
      });

      // first, a container carrying users, which starts the update
      connAny.onData(mockStream, { data: new Uint8Array(), users: ['user-c'], ttl: 1 });

      // second, a data container with no users and time to live
      connAny.onData(mockStream, { data: new Uint8Array(), ttl: 1 });

      await flushMicrotasks();
      expect(callOrder).not.toContain('relay');

      resolveUpdate();
      await flushMicrotasks();
      // both relay once the update completes
      expect(callOrder.filter((c) => c === 'relay')).toHaveLength(2);
    });

    it('relays at once with no update pending', () => {
      vi.spyOn(connAny, 'onRelay').mockImplementation(() => {
        callOrder.push('relay');
      });

      const container = { data: new Uint8Array(), ttl: 1 };
      connAny.onData(mockStream, container);

      expect(callOrder).toEqual(['relay']);
    });

    it('relays even when the update fails', async () => {
      vi.spyOn(connAny, 'onUpdateUserIds').mockImplementation(() => {
        return Promise.reject(new Error('makeFriendPeer failed'));
      });
      vi.spyOn(connAny, 'onRelay').mockImplementation(() => {
        callOrder.push('relay');
      });

      const container = { data: new Uint8Array(), users: ['user-c'], ttl: 1 };
      connAny.onData(mockStream, container);

      await flushMicrotasks();
      expect(callOrder).toEqual(['relay']);
    });

    it('clears the pending update once it finishes', async () => {
      let resolveUpdate!: () => void;
      const updatePromise = new Promise<void>((r) => {
        resolveUpdate = r;
      });

      vi.spyOn(connAny, 'onUpdateUserIds').mockImplementation(() => updatePromise);
      vi.spyOn(connAny, 'onRelay').mockImplementation(() => {});

      const container = { data: new Uint8Array(), users: ['user-c'], ttl: 1 };
      connAny.onData(mockStream, container);

      expect(connAny.pendingRelayMapUpdates.has('peer-a')).toBe(true);

      resolveUpdate();
      await flushMicrotasks();

      expect(connAny.pendingRelayMapUpdates.has('peer-a')).toBe(false);
    });

    it('relays nothing with no time to live left', () => {
      vi.spyOn(connAny, 'onRelay').mockImplementation(() => {
        callOrder.push('relay');
      });

      const container = { data: new Uint8Array(), ttl: 0 };
      connAny.onData(mockStream, container);

      expect(callOrder).not.toContain('relay');
    });

    it('keeps each peers pending state to itself', async () => {
      let resolveA!: () => void;
      const pendingA = new Promise<void>((r) => {
        resolveA = r;
      });

      const mockStreamB = { peer: { peerId: 'peer-b' } };

      vi.spyOn(connAny, 'onUpdateUserIds').mockImplementation(() => pendingA);
      const relaySpy = vi.spyOn(connAny, 'onRelay').mockImplementation((_s: unknown, _c: unknown) => {
        callOrder.push(`relay:${(_s as typeof mockStream).peer.peerId}`);
      });

      // one peer starts an update
      connAny.onData(mockStream, { data: new Uint8Array(), users: ['user-x'], ttl: 1 });

      // the other has none pending and relays at once
      connAny.onData(mockStreamB, { data: new Uint8Array(), ttl: 1 });

      expect(callOrder).toEqual(['relay:peer-b']);

      resolveA();
      await flushMicrotasks();
      expect(callOrder).toEqual(['relay:peer-b', 'relay:peer-a']);

      relaySpy.mockRestore();
    });

    it('the later of two updates from one peer wins', async () => {
      let resolveFirst!: () => void;
      let resolveSecond!: () => void;
      const firstUpdate = new Promise<void>((r) => {
        resolveFirst = r;
      });
      const secondUpdate = new Promise<void>((r) => {
        resolveSecond = r;
      });

      let callCount = 0;
      vi.spyOn(connAny, 'onUpdateUserIds').mockImplementation(() => {
        callCount++;
        return callCount === 1 ? firstUpdate : secondUpdate;
      });
      vi.spyOn(connAny, 'onRelay').mockImplementation(() => {
        callOrder.push('relay');
      });

      // the first update
      connAny.onData(mockStream, { data: new Uint8Array(), users: ['user-c'], ttl: 1 });
      // the second, which replaces it
      connAny.onData(mockStream, { data: new Uint8Array(), users: ['user-c', 'user-d'], ttl: 1 });

      // the first finishing clears nothing, since the pending entry points at the second
      resolveFirst();
      await flushMicrotasks();
      // the first relay still happens, having been queued behind the first update
      expect(callOrder.filter((c) => c === 'relay').length).toBeGreaterThanOrEqual(1);
      expect(connAny.pendingRelayMapUpdates.has('peer-a')).toBe(true);

      resolveSecond();
      await flushMicrotasks();
      // and the entry clears once the second finishes
      expect(connAny.pendingRelayMapUpdates.has('peer-a')).toBe(false);
      expect(callOrder.filter((c) => c === 'relay')).toHaveLength(2);
    });

    it('clears the pending update even when it fails', async () => {
      vi.spyOn(connAny, 'onUpdateUserIds').mockImplementation(() => {
        return Promise.reject(new Error('network error'));
      });
      vi.spyOn(connAny, 'onRelay').mockImplementation(() => {});

      connAny.onData(mockStream, { data: new Uint8Array(), users: ['user-c'], ttl: 1 });

      expect(connAny.pendingRelayMapUpdates.has('peer-a')).toBe(true);

      await flushMicrotasks();

      expect(connAny.pendingRelayMapUpdates.has('peer-a')).toBe(false);
    });

    it('clears the pending updates when the stream disconnects', async () => {
      let resolveUpdate!: () => void;
      const updatePromise = new Promise<void>((r) => {
        resolveUpdate = r;
      });

      vi.spyOn(connAny, 'onUpdateUserIds').mockImplementation(() => updatePromise);
      vi.spyOn(connAny, 'onRelay').mockImplementation(() => {});

      connAny.onData(mockStream, { data: new Uint8Array(), users: ['user-c'], ttl: 1 });
      expect(connAny.pendingRelayMapUpdates.has('peer-a')).toBe(true);

      // stand in for the stream disconnecting
      const fakeStream = {
        peer: { peerId: 'peer-a' },
        disconnect: vi.fn(),
      };
      connAny.streams.remove = vi.fn().mockReturnValue(fakeStream);
      connAny.notifyUserList = vi.fn();
      connAny.disconnectStream(fakeStream);

      expect(connAny.pendingRelayMapUpdates.has('peer-a')).toBe(false);

      // a late resolution has nothing left to clean up
      resolveUpdate();
      await flushMicrotasks();
    });

    it('an empty user list asks for no update', () => {
      const updateSpy = vi.spyOn(connAny, 'onUpdateUserIds').mockImplementation(() => Promise.resolve());
      vi.spyOn(connAny, 'onRelay').mockImplementation(() => {
        callOrder.push('relay');
      });

      connAny.onData(mockStream, { data: new Uint8Array(), users: [], ttl: 1 });

      expect(updateSpy).not.toHaveBeenCalled();
      expect(connAny.pendingRelayMapUpdates.has('peer-a')).toBe(false);
      // nothing pending, so it relays at once
      expect(callOrder).toEqual(['relay']);
    });

    it('keeps three containers arriving mid-update in the order they came', async () => {
      let resolveUpdate!: () => void;
      const updatePromise = new Promise<void>((r) => {
        resolveUpdate = r;
      });

      vi.spyOn(connAny, 'onUpdateUserIds').mockImplementation(() => updatePromise);

      const relayArgs: number[] = [];
      vi.spyOn(connAny, 'onRelay').mockImplementation((...args: unknown[]) => {
        relayArgs.push((args[1] as { seq: number }).seq);
      });

      // first, carrying users
      connAny.onData(mockStream, { data: new Uint8Array(), users: ['user-c'], ttl: 1, seq: 1 });
      // second, data alone
      connAny.onData(mockStream, { data: new Uint8Array(), ttl: 1, seq: 2 });
      // third, data alone
      connAny.onData(mockStream, { data: new Uint8Array(), ttl: 1, seq: 3 });

      await flushMicrotasks();
      expect(relayArgs).toHaveLength(0);

      resolveUpdate();
      await flushMicrotasks();

      expect(relayArgs).toEqual([1, 2, 3]);
    });
  });

  describe('reconnecting on its own', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed to reach a private method
    let connAny: Record<string, any>;
    let stream: { peer: PeerContext; disconnect: ReturnType<typeof vi.fn> };
    let onReconnect: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.useFakeTimers();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed to reach a private method
      connAny = new SkyWayConnection() as any;
      connAny.skyWay = { isOpen: true, close: vi.fn() };
      connAny.notifyUserList = vi.fn();
      connAny.reconnectScheduler = new PeerReconnectScheduler([10, 20]);

      onReconnect = vi.fn();
      connAny.callback.onReconnect = onReconnect;

      stream = { peer: PeerContext.parse('peer-a'), disconnect: vi.fn() };
      connAny.streams.remove = vi.fn().mockReturnValue(stream);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('schedules a reconnect after an unexpected disconnect', () => {
      connAny.disconnectStream(stream, true);

      expect(connAny.reconnectScheduler.isScheduled('peer-a')).toBe(true);
      expect(onReconnect).toHaveBeenCalledWith(stream.peer, 'retrying');
    });

    it('tries to connect once the delay has passed', async () => {
      const connectSpy = vi.spyOn(connAny, 'connect').mockResolvedValue(true);

      connAny.disconnectStream(stream, true);
      expect(connectSpy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(10);

      expect(connectSpy).toHaveBeenCalledTimes(1);
      expect(connectSpy.mock.calls[0][0]).toMatchObject({ peerId: 'peer-a' });
    });

    it('schedules nothing after a deliberate disconnect', () => {
      connAny.disconnectStream(stream);

      expect(connAny.reconnectScheduler.isScheduled('peer-a')).toBe(false);
      expect(onReconnect).not.toHaveBeenCalled();
    });

    it('cancels a scheduled reconnect on disconnect', () => {
      connAny.disconnectStream(stream, true);
      expect(connAny.reconnectScheduler.isScheduled('peer-a')).toBe(true);

      connAny.disconnect(stream.peer);

      expect(connAny.reconnectScheduler.isScheduled('peer-a')).toBe(false);
      expect(connAny.reconnectScheduler.attemptOf('peer-a')).toBe(0);
    });

    it('waits longer after each disconnect', async () => {
      vi.spyOn(connAny, 'connect').mockResolvedValue(true);

      connAny.disconnectStream(stream, true);
      await vi.advanceTimersByTimeAsync(10);

      connAny.disconnectStream(stream, true);
      expect(connAny.reconnectScheduler.attemptOf('peer-a')).toBe(2);
      expect(connAny.reconnectScheduler.isScheduled('peer-a')).toBe(true);
    });

    it('reports failure and gives up once the attempts run out', async () => {
      vi.spyOn(connAny, 'connect').mockResolvedValue(true);

      for (let i = 0; i < 2; i++) {
        connAny.disconnectStream(stream, true);
        await vi.advanceTimersByTimeAsync(20);
      }
      onReconnect.mockClear();

      connAny.disconnectStream(stream, true);

      expect(onReconnect).toHaveBeenCalledWith(stream.peer, 'failed');
      expect(connAny.reconnectScheduler.isScheduled('peer-a')).toBe(false);
      expect(connAny.reconnectScheduler.attemptOf('peer-a')).toBe(0);
    });

    it('gives up on a peer it is no longer meant to reach', async () => {
      vi.spyOn(connAny, 'connect').mockResolvedValue(false);

      connAny.disconnectStream(stream, true);
      onReconnect.mockClear();

      await vi.advanceTimersByTimeAsync(10);

      expect(onReconnect).toHaveBeenCalledWith(expect.objectContaining({ peerId: 'peer-a' }), 'failed');
      expect(connAny.reconnectScheduler.attemptOf('peer-a')).toBe(0);
    });

    it('schedules nothing while the network is closed', () => {
      connAny.skyWay.isOpen = false;

      connAny.disconnectStream(stream, true);

      expect(connAny.reconnectScheduler.isScheduled('peer-a')).toBe(false);
      expect(onReconnect).not.toHaveBeenCalled();
    });

    it('cancels every scheduled reconnect on close', () => {
      connAny.disconnectStream(stream, true);
      expect(connAny.reconnectScheduler.isScheduled('peer-a')).toBe(true);

      connAny.close();

      expect(connAny.reconnectScheduler.scheduledPeerIds).toEqual([]);
    });

    it('leaves a waiting attempt alone when the peer is reported closed again', () => {
      connAny.disconnectStream(stream, true);
      onReconnect.mockClear();

      connAny.disconnectStream(stream, true);

      expect(connAny.reconnectScheduler.isScheduled('peer-a')).toBe(true);
      expect(connAny.reconnectScheduler.attemptOf('peer-a')).toBe(1);
      expect(onReconnect).not.toHaveBeenCalled();
    });

    it('lets a peer whose attempt failed be dialled again from the user list', () => {
      connAny.maybeUnavailablePeerIds.add('peer-a');

      connAny.disconnectStream(stream, true);

      expect(connAny.maybeUnavailablePeerIds.has('peer-a')).toBe(false);
    });

    it('leaves a peer to the stream that is opening to it by the time its turn comes', async () => {
      vi.spyOn(connAny, 'connect').mockResolvedValue(false);
      connAny.disconnectStream(stream, true);
      onReconnect.mockClear();
      connAny.streams.find = vi.fn().mockReturnValue({ isDead: false });

      await vi.advanceTimersByTimeAsync(10);

      expect(onReconnect).not.toHaveBeenCalled();
      expect(connAny.reconnectScheduler.attemptOf('peer-a')).toBe(1);
    });

    describe('once the backoff has been used up', () => {
      beforeEach(() => {
        connAny.reconnectScheduler = new PeerReconnectScheduler([10, 20], 50);
      });

      const failTwice = async () => {
        vi.spyOn(connAny, 'connect').mockResolvedValue(true);
        for (let i = 0; i < 2; i++) {
          connAny.disconnectStream(stream, true);
          await vi.advanceTimersByTimeAsync(20);
        }
        onReconnect.mockClear();
      };

      it('reports the failure once and goes on trying at the steady delay', async () => {
        await failTwice();

        for (let i = 0; i < 3; i++) {
          connAny.disconnectStream(stream, true);
          expect(connAny.reconnectScheduler.isScheduled('peer-a')).toBe(true);
          await vi.advanceTimersByTimeAsync(50);
        }

        expect(onReconnect.mock.calls.map(([, state]) => state)).toEqual(['failed']);
        expect(connAny.connect).toHaveBeenCalledTimes(5);
      });

      it('stops, without reporting the failure again, once the peer can no longer be dialled', async () => {
        await failTwice();
        connAny.disconnectStream(stream, true);
        onReconnect.mockClear();
        connAny.connect.mockResolvedValue(false);

        await vi.advanceTimersByTimeAsync(50);

        expect(onReconnect).not.toHaveBeenCalled();
        expect(connAny.reconnectScheduler.isScheduled('peer-a')).toBe(false);
        expect(connAny.reconnectScheduler.attemptOf('peer-a')).toBe(0);
      });

      it('reports the peer recovered when a later attempt opens', async () => {
        await failTwice();
        connAny.disconnectStream(stream, true);
        onReconnect.mockClear();
        const handlers = new Map<string, () => void>();
        const reopened = {
          peer: PeerContext.parse('peer-a'),
          on: (name: string, handler: () => void) => handlers.set(name, handler),
          connect: vi.fn(),
          open: true,
        };
        connAny.streams.add = vi.fn().mockReturnValue(reopened);

        connAny.connectStream(reopened);
        handlers.get('open')!();

        expect(onReconnect.mock.calls.map(([, state]) => state)).toEqual(['recovered']);
        expect(connAny.reconnectScheduler.attemptOf('peer-a')).toBe(0);
      });
    });
  });

  describe('a stream that does not open', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed to reach a private method
    let connAny: Record<string, any>;
    let handlers: Map<string, () => void>;
    let stream: Record<string, unknown>;

    beforeEach(() => {
      vi.useFakeTimers();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed to reach a private method
      connAny = new SkyWayConnection() as any;
      connAny.skyWay = { isOpen: true, close: vi.fn() };
      connAny.notifyUserList = vi.fn();
      vi.spyOn(Logger, 'warn').mockImplementation(() => {});
      vi.spyOn(Logger, 'info').mockImplementation(() => {});
      handlers = new Map();
      stream = {
        peer: PeerContext.parse('peer-a'),
        open: false,
        isDead: false,
        sortKey: 'peer-a',
        on: (name: string, handler: () => void) => handlers.set(name, handler),
        connect: vi.fn(),
        disconnect: vi.fn(),
        removeAllListeners: vi.fn(),
      };
    });

    afterEach(() => {
      connAny.close();
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('is given up and tried again once the deadline passes', () => {
      connAny.connectStream(stream);
      expect(connAny.maybeUnavailablePeerIds.has('peer-a')).toBe(true);

      vi.advanceTimersByTime(CONNECT_DEADLINE_MS);

      expect(stream['disconnect']).toHaveBeenCalledTimes(1);
      expect(connAny.streams.find('peer-a')).toBeUndefined();
      expect(connAny.maybeUnavailablePeerIds.has('peer-a')).toBe(false);
      expect(connAny.reconnectScheduler.isScheduled('peer-a')).toBe(true);
    });

    it('is left alone once it has opened', () => {
      connAny.connectStream(stream);
      stream['open'] = true;
      handlers.get('open')!();

      vi.advanceTimersByTime(CONNECT_DEADLINE_MS);

      expect(stream['disconnect']).not.toHaveBeenCalled();
      expect(connAny.streams.find('peer-a')).toBe(stream);
    });

    it('keeps another connect to its peer from starting while it is still opening', async () => {
      connAny.connectStream(stream);
      connAny.skyWay.room = { members: [{ name: 'peer-a' }] };
      Object.defineProperty(connAny, 'peer', {
        get: () => ({ peerId: 'me', verifyPeer: () => Promise.resolve(true) }),
      });

      await expect(connAny.connect(PeerContext.parse('peer-a'))).resolves.toBe(false);

      stream['isDead'] = true;
      const dialled = vi.spyOn(connAny, 'connectStream').mockImplementation(() => {});
      await expect(connAny.connect(PeerContext.parse('peer-a'))).resolves.toBe(true);
      expect(dialled).toHaveBeenCalledTimes(1);
    });
  });

  describe('dialling from the user list', () => {
    it('leaves a peer with a reconnect attempt waiting to that attempt', async () => {
      vi.useFakeTimers();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed to reach a private method
      const connAny = new SkyWayConnection() as any;
      connAny.makeFriendPeer = (userId: string) => Promise.resolve(PeerContext.parse(`peer-of-${userId}`));
      Object.defineProperty(connAny, 'userIds', { get: () => ['me'] });
      const connect = vi.spyOn(connAny, 'connect').mockResolvedValue(true);
      connAny.reconnectScheduler.schedule('peer-of-waiting', () => {});

      await connAny.onUpdateUserIds({ peer: { peerId: 'peer-b' } }, ['me', 'waiting', 'unknown']);

      expect(connect.mock.calls.map(([peer]) => (peer as PeerContext).peerId)).toEqual(['peer-of-unknown']);
      connAny.reconnectScheduler.cancelAll();
      vi.useRealTimers();
      vi.restoreAllMocks();
    });
  });
});
