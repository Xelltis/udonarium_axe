import { Logger } from '@axe/core/logging/logger';
import { PeerContext } from '@axe/core/network/peer-context';
import { PeerReconnectScheduler } from '@axe/core/network/peer-reconnect-scheduler';
import { SkyWayConnection } from '@axe/core/network/skyway/skyway-connection';
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

  describe('sending', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed to reach a private method
    let connAny: Record<string, any>;
    let sent: { data: Uint8Array; isCompressed?: boolean }[];

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
      vi.spyOn(connAny, 'sendBroadcast').mockImplementation((container: unknown) => {
        sent.push(container as { data: Uint8Array; isCompressed?: boolean });
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

    it('keeps the order of a batch that mixes pieces of a file with other messages', async () => {
      const batch: { eventName: string; data: unknown }[] = [
        { eventName: 'START_FILE_TRANSMISSION', data: { taskIdentifier: 'some-image' } },
        { eventName: 'FILE_SEND_CHUNK_some-image', data: { index: 0, length: 3, chunk: compressible() } },
        { eventName: 'FILE_SEND_CHUNK_some-image', data: { index: 1, length: 3, chunk: compressible() } },
        { eventName: 'UPDATE_GAME_OBJECT', data: compressible() },
        { eventName: 'FILE_SEND_CHUNK_some-image', data: { index: 2, length: 3, chunk: compressible() } },
      ];
      connAny.send(batch);
      await connAny.outboundQueue;

      const received: { eventName: string; data: { index?: number } }[] = [];
      for (const container of sent) {
        const messages = await messagesIn(container);
        if (messages.some((m) => m.eventName.startsWith('FILE_SEND_CHUNK_')))
          expect(container.isCompressed).toBeFalsy();
        received.push(...messages);
      }
      expect(received.map((m) => [m.eventName, m.data.index])).toEqual(
        batch.map((m) => [m.eventName, (m.data as { index?: number }).index])
      );
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
  });
});
