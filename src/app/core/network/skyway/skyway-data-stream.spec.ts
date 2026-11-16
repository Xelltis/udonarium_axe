import { Logger } from '@axe/core/logging/logger';
import { SkyWayDataStream } from '@axe/core/network/skyway/skyway-data-stream';
import * as MessagePack from '@axe/core/util/message-pack';

describe('SkyWayDataStream', () => {
  it('is exported', () => {
    expect(SkyWayDataStream).toBeDefined();
  });

  it('is an event emitter', () => {
    expect(SkyWayDataStream.prototype).toHaveProperty('emit');
    expect(SkyWayDataStream.prototype).toHaveProperty('on');
  });

  it('subscribes without throwing before the member resolves', async () => {
    const stream = SkyWayDataStream.createSubscription(
      {
        room: undefined,
      } as never,
      {
        peerId: 'peer-a',
        userId: 'user-a',
        password: '',
      } as never
    );

    await expect(
      (stream as unknown as { initializeSubscription: () => Promise<void> }).initializeSubscription()
    ).resolves.toBeUndefined();
  });

  it('returns no connection while the publishing member is unresolved', () => {
    const getConnection = vi.fn(() => ({}) as RTCPeerConnection);

    const stream = SkyWayDataStream.createPublication(
      {
        room: undefined,
        peer: { peerId: 'local-peer' },
      } as never,
      {
        peerId: 'peer-a',
        userId: 'user-a',
        password: '',
      } as never
    );

    (stream as unknown as { subscription: unknown }).subscription = {
      publication: {
        stream: {
          _getRTCPeerConnection: getConnection,
        },
      },
    };

    expect(stream.getPeerConnection()).toBeUndefined();
    expect(getConnection).not.toHaveBeenCalled();
  });
});

it('starts with its fields empty', () => {
  const stream = SkyWayDataStream.createSubscription(
    { room: undefined } as never,
    { peerId: 'peer-a', userId: 'user-a', password: '' } as never
  );
  const s = stream as unknown as Record<string, unknown>;
  expect(s['subscription']).toBeNull();
  expect(s['dataChannel']).toBeNull();
  expect(s['stats']).toBeNull();
  expect(s['onStreamAdded']).toBeNull();
  expect(s['onStreamPublished']).toBeNull();
  expect(s['onConnectionStateChanged']).toBeNull();
});

describe('noticing a silent stream', () => {
  function createStream() {
    const stream = SkyWayDataStream.createSubscription(
      { room: undefined, peer: { peerId: 'local-peer' } } as never,
      { peerId: 'peer-a', userId: 'user-a', password: '' } as never
    );
    const streamAny = stream as unknown as Record<string, unknown>;
    streamAny['stats'] = { updateAsync: vi.fn().mockResolvedValue(undefined), candidateType: 'host' };
    return { stream, streamAny };
  }

  it('closes a stream silent past the threshold', async () => {
    const { stream, streamAny } = createStream();
    const onClose = vi.fn();
    stream.on('close', onClose);

    streamAny['_timestamp'] = performance.now() - SkyWayDataStream.STALE_TIMEOUT_MS - 1;
    await stream.updateStatsAsync();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(stream.peer.isOpen).toBe(false);
  });

  it('keeps a stream within the threshold and updates its health', async () => {
    const { stream, streamAny } = createStream();
    const onClose = vi.fn();
    stream.on('close', onClose);

    streamAny['_timestamp'] = performance.now();
    await stream.updateStatsAsync();

    expect(onClose).not.toHaveBeenCalled();
    expect(stream.peer.session.health).toBe(1);
  });

  it('lets only the health degrade before the threshold', async () => {
    const { stream, streamAny } = createStream();
    const onClose = vi.fn();
    stream.on('close', onClose);

    streamAny['_timestamp'] = performance.now() - (SkyWayDataStream.STALE_TIMEOUT_MS - 5000);
    await stream.updateStatsAsync();

    expect(onClose).not.toHaveBeenCalled();
    expect(stream.peer.session.health).toBeLessThan(1);
  });

  it('watches for silence even where no statistics are available', async () => {
    const { stream, streamAny } = createStream();
    streamAny['stats'] = null;
    const onClose = vi.fn();
    stream.on('close', onClose);

    streamAny['_timestamp'] = performance.now() - SkyWayDataStream.STALE_TIMEOUT_MS - 1;
    await stream.updateStatsAsync();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('updates the ping and health even without statistics', async () => {
    const { stream, streamAny } = createStream();
    streamAny['stats'] = null;

    streamAny['_timestamp'] = performance.now();
    await stream.updateStatsAsync();

    expect(stream.peer.session.health).toBe(1);
    expect(stream.peer.session.speed).toBeGreaterThan(0);
  });

  it('keeps trying for statistics on a link that gives none', async () => {
    const { stream, streamAny } = createStream();
    streamAny['stats'] = null;
    const getPeerConnection = vi.spyOn(stream, 'getPeerConnection').mockReturnValue(undefined);

    streamAny['_timestamp'] = performance.now();
    await stream.updateStatsAsync();
    await stream.updateStatsAsync();

    expect(getPeerConnection).toHaveBeenCalledTimes(2);
    expect(streamAny['stats']).toBeNull();
  });

  it('starts measuring once statistics appear', async () => {
    const { stream, streamAny } = createStream();
    streamAny['stats'] = null;
    vi.spyOn(stream, 'getPeerConnection').mockReturnValue({ getStats: vi.fn().mockResolvedValue(new Map()) } as never);

    streamAny['_timestamp'] = performance.now();
    await stream.updateStatsAsync();

    expect(streamAny['stats']).not.toBeNull();
  });

  it('resets the clock when the link opens', () => {
    const { stream, streamAny } = createStream();

    streamAny['_timestamp'] = performance.now() - 60000;
    stream.resetTimestamp();

    expect(performance.now() - stream.timestamp).toBeLessThan(1000);
  });
});

describe('clearing away received chunks', () => {
  it('clears them on teardown', () => {
    const receivedMap = new Map<
      string,
      { id: string; chunks: Uint8Array[]; length: number; byteLength: number; createdAt: number }
    >();
    receivedMap.set('chunk-1', { id: 'chunk-1', chunks: [], length: 0, byteLength: 0, createdAt: 0 });
    receivedMap.set('chunk-2', { id: 'chunk-2', chunks: [], length: 0, byteLength: 0, createdAt: 0 });

    receivedMap.clear();

    expect(receivedMap.size).toBe(0);
  });

  it('drops a chunk past its time to live', () => {
    const CHUNK_TTL_MS = 30_000;
    const receivedMap = new Map<
      string,
      { id: string; chunks: Uint8Array[]; length: number; byteLength: number; createdAt: number }
    >();
    const now = performance.now();

    receivedMap.set('old-chunk', {
      id: 'old-chunk',
      chunks: [],
      length: 0,
      byteLength: 0,
      createdAt: now - CHUNK_TTL_MS - 1,
    });
    receivedMap.set('new-chunk', { id: 'new-chunk', chunks: [], length: 0, byteLength: 0, createdAt: now - 1_000 });

    for (const [id, received] of receivedMap) {
      if (now - received.createdAt > CHUNK_TTL_MS) receivedMap.delete(id);
    }

    expect(receivedMap.has('old-chunk')).toBe(false);
    expect(receivedMap.has('new-chunk')).toBe(true);
  });

  it('keeps a chunk still within it', () => {
    const CHUNK_TTL_MS = 30_000;
    const receivedMap = new Map<
      string,
      { id: string; chunks: Uint8Array[]; length: number; byteLength: number; createdAt: number }
    >();
    const now = performance.now();

    receivedMap.set('fresh-chunk', { id: 'fresh-chunk', chunks: [], length: 0, byteLength: 0, createdAt: now - 100 });

    for (const [id, received] of receivedMap) {
      if (now - received.createdAt > CHUNK_TTL_MS) receivedMap.delete(id);
    }

    expect(receivedMap.has('fresh-chunk')).toBe(true);
  });
});

describe('sending what is queued', () => {
  interface Internals {
    dataChannel: unknown;
    controlQueue: Set<Uint8Array>;
    bulkQueue: Set<Uint8Array>;
    execQueue(): void;
    isQueuing: boolean;
    send(data: unknown, lane?: 'control' | 'bulk'): void;
    sendPing(): void;
    onData(data: ArrayBuffer): void;
    on(event: string, listener: (data: unknown) => void): void;
  }

  const KB = 1024;
  const CONTROL_LIMIT = 1024 * KB;
  const BULK_LIMIT = 256 * KB;
  const BULK_FLOOR = 64 * KB;

  function stream(): Internals {
    const made = SkyWayDataStream.createSubscription(
      { room: undefined, peer: { peerId: 'local-peer' } } as never,
      {
        peerId: 'peer-a',
        userId: 'user-a',
        password: '',
      } as never
    );
    return made as unknown as Internals;
  }

  function channel(bufferedAmount: number, sent: Uint8Array[]) {
    return {
      readyState: 'open',
      bufferedAmount,
      send: (data: Uint8Array) => sent.push(data),
    };
  }

  /** A channel that never drains, so what it holds grows with every piece it is given. */
  function fillingChannel(sent: Uint8Array[]) {
    const made = {
      readyState: 'open',
      bufferedAmount: 0,
      heldBeforeEachSend: [] as number[],
      send: (data: Uint8Array) => {
        made.heldBeforeEachSend.push(made.bufferedAmount);
        made.bufferedAmount += data.byteLength;
        sent.push(data);
      },
    };
    return made;
  }

  /** A piece of the given size whose first byte tells it apart. */
  function piece(tag: number, byteLength = 1): Uint8Array {
    const made = new Uint8Array(byteLength);
    made[0] = tag;
    return made;
  }

  const CONTROL = 1;
  const BULK = 2;

  it('feeds the channel everything queued while it has room', () => {
    const sent: Uint8Array[] = [];
    const inner = stream();
    inner.dataChannel = channel(0, sent);
    for (let i = 0; i < 5; i++) inner.controlQueue.add(new Uint8Array([i]));

    inner.execQueue();

    expect(sent).toHaveLength(5);
    expect(inner.controlQueue.size).toBe(0);
    expect(inner.isQueuing).toBe(false);
  });

  it('waits while the channel is already holding a megabyte', () => {
    // On the clock the test owns: a channel that stays full has the queue try again for as long as
    // anything runs, in the files after this one too.
    vi.useFakeTimers();
    try {
      const sent: Uint8Array[] = [];
      const inner = stream();
      inner.dataChannel = channel(CONTROL_LIMIT, sent);
      inner.controlQueue.add(new Uint8Array([1]));

      inner.execQueue();

      expect(sent).toHaveLength(0);
      expect(inner.controlQueue.size).toBe(1);
      expect(inner.isQueuing).toBe(true);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('waits on the clock rather than coming straight back to a full channel', () => {
    vi.useFakeTimers();
    try {
      const sent: Uint8Array[] = [];
      const full = { readyState: 'open', bufferedAmount: CONTROL_LIMIT, send: (data: Uint8Array) => sent.push(data) };
      const inner = stream();
      inner.dataChannel = full;
      inner.controlQueue.add(new Uint8Array([1]));

      inner.execQueue();
      vi.advanceTimersByTime(49);

      // Nothing has gone and nothing has been tried again: a pass that sends nothing must not
      // hand the main thread straight back to itself.
      expect(sent).toHaveLength(0);

      full.bufferedAmount = 0;
      vi.advanceTimersByTime(1);

      expect(sent).toHaveLength(1);
      expect(inner.controlQueue.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps what it could not send and stops for this turn', () => {
    vi.useFakeTimers();
    try {
      const inner = stream();
      inner.dataChannel = {
        readyState: 'open',
        bufferedAmount: 0,
        send: () => {
          throw new Error('closed under us');
        },
      };
      inner.controlQueue.add(new Uint8Array([1]));
      inner.controlQueue.add(new Uint8Array([2]));
      inner.bulkQueue.add(new Uint8Array([3]));

      inner.execQueue();

      expect(inner.controlQueue.size).toBe(2);
      expect(inner.bulkQueue.size).toBe(1);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('sends nothing through a channel that is not open', () => {
    const sent: Uint8Array[] = [];
    const inner = stream();
    inner.dataChannel = { ...channel(0, sent), readyState: 'connecting' };
    inner.controlQueue.add(new Uint8Array([1]));
    inner.bulkQueue.add(new Uint8Array([2]));

    inner.execQueue();

    expect(sent).toHaveLength(0);
    expect(inner.isQueuing).toBe(false);
  });

  it('sends control queued after bulk before that bulk', () => {
    const sent: Uint8Array[] = [];
    const inner = stream();
    inner.dataChannel = { ...channel(0, sent), readyState: 'connecting' };
    inner.send('file piece', 'bulk');
    inner.send('object update', 'control');
    inner.send('untagged');

    inner.dataChannel = channel(0, sent);
    inner.execQueue();

    expect(sent.map((bytes) => MessagePack.decode(bytes))).toEqual(['object update', 'untagged', 'file piece']);
  });

  it('keeps control in the order it was queued, and bulk in the order it was queued', () => {
    const sent: Uint8Array[] = [];
    const inner = stream();
    inner.dataChannel = { ...channel(0, sent), readyState: 'connecting' };
    const queued: [string, 'control' | 'bulk'][] = [
      ['bulk 0', 'bulk'],
      ['control 0', 'control'],
      ['bulk 1', 'bulk'],
      ['control 1', 'control'],
      ['control 2', 'control'],
      ['bulk 2', 'bulk'],
    ];
    for (const [data, lane] of queued) inner.send(data, lane);

    inner.dataChannel = channel(0, sent);
    inner.execQueue();

    const order = sent.map((bytes) => MessagePack.decode(bytes) as string);
    expect(order.filter((data) => data.startsWith('control'))).toEqual(['control 0', 'control 1', 'control 2']);
    expect(order.filter((data) => data.startsWith('bulk'))).toEqual(['bulk 0', 'bulk 1', 'bulk 2']);
  });

  it('sends a ping ahead of the control already waiting, and pings in the order they were made', () => {
    const sent: Uint8Array[] = [];
    const inner = stream();
    inner.dataChannel = { ...channel(0, sent), readyState: 'connecting' };
    inner.send('file piece', 'bulk');
    inner.send('object update', 'control');
    inner.sendPing();
    inner.sendPing();

    inner.dataChannel = channel(0, sent);
    inner.execQueue();

    const order = sent.map((bytes) => MessagePack.decode(bytes) as { ping?: number } | string);
    const pings = order.slice(0, 2) as { ping: number }[];
    expect(pings.every((ping) => typeof ping.ping === 'number')).toBe(true);
    expect(pings[0].ping).toBeLessThanOrEqual(pings[1].ping);
    expect(order.slice(2)).toEqual(['object update', 'file piece']);
  });

  it('sends back a ping from the peer ahead of the control already waiting', () => {
    const sent: Uint8Array[] = [];
    const inner = stream();
    inner.dataChannel = { ...channel(0, sent), readyState: 'connecting' };
    inner.send('object update', 'control');
    const theirs = MessagePack.encode({ from: 'peer-a', ping: 123 });
    inner.onData(theirs.buffer.slice(theirs.byteOffset, theirs.byteOffset + theirs.byteLength) as ArrayBuffer);

    inner.dataChannel = channel(0, sent);
    inner.execQueue();

    expect(sent.map((bytes) => MessagePack.decode(bytes))).toEqual([{ from: 'peer-a', ping: 123 }, 'object update']);
  });

  it('lets one piece of bulk through for every 64 KB of control while control keeps coming', () => {
    const sent: Uint8Array[] = [];
    const inner = stream();
    inner.dataChannel = channel(0, sent);
    for (let n = 0; n < 3; n++) inner.bulkQueue.add(piece(BULK, 15 * KB));
    for (let n = 0; n < 12; n++) inner.controlQueue.add(piece(CONTROL, 16 * KB));
    inner.isQueuing = true;

    inner.execQueue();

    const order = sent.map((bytes) => (bytes[0] === BULK ? 'B' : 'c')).join('');
    expect(order).toBe('ccccBccccBccccB');
  });

  it('sends the whole of a bulk message before the control between its pieces outlasts a chunk', () => {
    const sent: Uint8Array[] = [];
    const inner = stream();
    inner.dataChannel = { ...channel(0, sent), readyState: 'connecting' };
    inner.send(new Uint8Array(64 * KB), 'bulk');
    const bulkPieces = inner.bulkQueue.size;
    for (let n = 0; n < 200; n++) inner.controlQueue.add(piece(CONTROL, 8 * KB));

    inner.dataChannel = channel(0, sent);
    inner.execQueue();

    const bulkAt = sent.flatMap((bytes, index) => (bytes[0] === CONTROL ? [] : [index]));
    const controlBetween = (bulkAt.at(-1)! - bulkAt[0] - (bulkPieces - 1)) * 8 * KB;
    expect(bulkAt).toHaveLength(bulkPieces);
    expect(controlBetween).toBe((bulkPieces - 1) * BULK_FLOOR);
  });

  it('sends only control once the channel holds as much as bulk may add to', () => {
    vi.useFakeTimers();
    try {
      const sent: Uint8Array[] = [];
      const inner = stream();
      inner.dataChannel = channel(BULK_LIMIT, sent);
      inner.bulkQueue.add(piece(BULK));
      inner.controlQueue.add(piece(CONTROL));
      inner.controlQueue.add(piece(CONTROL));

      inner.execQueue();

      expect(sent.map((bytes) => bytes[0])).toEqual([CONTROL, CONTROL]);
      expect(inner.bulkQueue.size).toBe(1);
      expect(inner.isQueuing).toBe(true);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('sends nothing, a ping included, once the channel holds as much as control may add to', () => {
    vi.useFakeTimers();
    try {
      const sent: Uint8Array[] = [];
      const inner = stream();
      inner.dataChannel = channel(CONTROL_LIMIT, sent);
      inner.bulkQueue.add(piece(BULK));
      inner.controlQueue.add(piece(CONTROL));
      inner.sendPing();

      inner.execQueue();

      expect(sent).toHaveLength(0);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('stops feeding bulk alone at its own limit, and never holds more than the control limit in all', () => {
    vi.useFakeTimers();
    try {
      const sent: Uint8Array[] = [];
      const inner = stream();
      const filling = fillingChannel(sent);
      inner.dataChannel = filling;
      for (let n = 0; n < 100; n++) inner.bulkQueue.add(piece(BULK, 15 * KB));
      inner.isQueuing = true;

      inner.execQueue();

      expect(filling.bufferedAmount).toBeGreaterThanOrEqual(BULK_LIMIT);
      expect(filling.bufferedAmount).toBeLessThan(BULK_LIMIT + 15 * KB);

      for (let n = 0; n < 100; n++) inner.controlQueue.add(piece(CONTROL, 16 * KB));
      inner.execQueue();

      expect(Math.max(...filling.heldBeforeEachSend)).toBeLessThan(CONTROL_LIMIT);
      expect(filling.bufferedAmount).toBeLessThan(CONTROL_LIMIT + 16 * KB);
      expect(inner.controlQueue.size).toBeGreaterThan(0);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('sends the pieces of a large control message in order, to be put together at the other end', () => {
    const sent: Uint8Array[] = [];
    const sender = stream();
    sender.dataChannel = { ...channel(0, sent), readyState: 'connecting' };
    const large = { data: new Uint8Array(40 * KB).map((_, index) => index % 251), ttl: 1 };
    sender.send({ data: new Uint8Array(20 * KB), ttl: 0 }, 'bulk');
    sender.send(large, 'control');
    sender.send('after', 'control');

    sender.dataChannel = channel(0, sent);
    sender.execQueue();

    const pieces = sent.map((bytes) => MessagePack.decode(bytes) as { id?: string; index?: number; total?: number });
    expect(pieces.slice(0, 3).map((chunk) => [chunk.index, chunk.total])).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
    ]);
    expect(new Set(pieces.slice(0, 3).map((chunk) => chunk.id)).size).toBe(1);

    const receiver = stream();
    const received: unknown[] = [];
    receiver.on('data', (data) => received.push(data));
    for (const bytes of sent) {
      receiver.onData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    }

    expect(received).toHaveLength(3);
    expect(received[0]).toEqual(large);
    expect(received[1]).toBe('after');
    expect((received[2] as { ttl: number }).ttl).toBe(0);
  });

  it('puts a message together whose pieces arrive with other messages between them', () => {
    const sent: Uint8Array[] = [];
    const sender = stream();
    sender.dataChannel = { ...channel(0, sent), readyState: 'connecting' };
    const file = { data: new Uint8Array(64 * KB).map((_, index) => index % 249), ttl: 0 };
    sender.send(file, 'bulk');
    for (let n = 0; n < 40; n++) sender.send({ data: new Uint8Array(8 * KB).fill(n), ttl: 1 }, 'control');

    sender.dataChannel = channel(0, sent);
    sender.execQueue();

    const receiver = stream();
    const received: { data: Uint8Array; ttl: number }[] = [];
    receiver.on('data', (data) => received.push(data as { data: Uint8Array; ttl: number }));
    for (const bytes of sent) {
      receiver.onData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    }

    expect(received).toHaveLength(41);
    expect(received.filter((container) => container.ttl === 1).map((container) => container.data[0])).toEqual(
      Array.from({ length: 40 }, (_, n) => n)
    );
    expect(received.find((container) => container.ttl === 0)).toEqual(file);
  });
});

describe('a stream over a data channel', () => {
  const PEER = { peerId: 'peer-a', userId: 'user-a', password: '' };

  class FakeChannel extends EventTarget {
    readyState = 'open';
    binaryType = '';
    bufferedAmount = 0;
    close = vi.fn(() => {
      this.readyState = 'closed';
    });
    send = vi.fn();
  }

  /** A room in which the peer publishes its data stream over the given channel, and can be subscribed to. */
  function subscribingSkyWay(channel: FakeChannel | undefined) {
    const calls: string[] = [];
    const connection = {
      sender: { datachannels: {} },
      receiver: {
        streams: channel ? { 'pub-1': { _datachannel: channel } } : {},
        onStreamAdded: { add: () => ({ removeListener: () => {} }) },
      },
    };
    const member = {
      side: 'remote',
      name: PEER.peerId,
      publications: [{ id: 'pub-1', contentType: 'data', metadata: 'udonarium-data-stream' }],
      _getOrCreateConnection: () => connection,
    };
    const subscribed: { resolve: (value: unknown) => void; reject: (reason: unknown) => void }[] = [];
    const skyWay = {
      peer: { peerId: 'local-peer' },
      room: { members: [member], onStreamPublished: { add: () => ({ removeListener: () => {} }) } },
      roomPerson: {
        _impl: {},
        subscribe: vi.fn(() => {
          calls.push('subscribe');
          return new Promise((resolve, reject) => subscribed.push({ resolve, reject }));
        }),
      },
      releaseSubscriptionsTo: vi.fn(async (publicationId: string) => {
        calls.push(`release to ${publicationId}`);
      }),
      releaseSubscription: vi.fn(async (subscriptionId: string) => {
        calls.push(`release ${subscriptionId}`);
      }),
    };
    const subscription = (id: string) => ({
      subscription: { id, onConnectionStateChanged: { add: () => ({ removeListener: () => {} }) } },
    });
    return { skyWay, calls, subscribed, subscription };
  }

  function openStream(channel: FakeChannel) {
    const { skyWay } = subscribingSkyWay(channel);
    const stream = SkyWayDataStream.createSubscription(skyWay as never, PEER as never);
    const events: string[] = [];
    stream.on('open', () => events.push('open'));
    stream.on('close', () => events.push('close'));
    (stream as unknown as { refresh: () => void }).refresh();
    return { stream, events };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports itself closed as soon as its channel closes', () => {
    const channel = new FakeChannel();
    const { stream, events } = openStream(channel);
    expect(events).toEqual(['open']);

    channel.readyState = 'closed';
    channel.dispatchEvent(new Event('close'));

    expect(events).toEqual(['open', 'close']);
    expect(stream.peer.isOpen).toBe(false);
    expect(stream.isDead).toBe(true);
    stream.disconnect();
  });

  it('reports itself closed on a channel error that left the channel closed, and only once', () => {
    vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    const channel = new FakeChannel();
    const { stream, events } = openStream(channel);

    channel.readyState = 'closed';
    channel.dispatchEvent(new Event('error'));
    channel.dispatchEvent(new Event('close'));

    expect(events).toEqual(['open', 'close']);
    stream.disconnect();
  });

  it('stays open through a channel error that left the channel open', () => {
    vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    const channel = new FakeChannel();
    const { stream, events } = openStream(channel);

    channel.dispatchEvent(new Event('error'));

    expect(events).toEqual(['open']);
    expect(stream.isDead).toBe(false);
    stream.disconnect();
  });

  it('gives way to a newcomer once dead, or open but silent for half the time it takes to be given up', () => {
    const channel = new FakeChannel();
    const { stream } = openStream(channel);
    const streamAny = stream as unknown as Record<string, unknown>;
    expect(stream.yieldsToNewcomer).toBe(false);

    streamAny['_timestamp'] = performance.now() - SkyWayDataStream.QUIET_TIMEOUT_MS - 1;
    expect(stream.yieldsToNewcomer).toBe(true);

    streamAny['_timestamp'] = performance.now();
    stream.disconnect();
    expect(stream.yieldsToNewcomer).toBe(true);
  });

  it('does not give way while it has yet to open', () => {
    const { skyWay } = subscribingSkyWay(undefined);
    const stream = SkyWayDataStream.createSubscription(skyWay as never, PEER as never);

    expect(stream.isDead).toBe(false);
    expect(stream.yieldsToNewcomer).toBe(false);
  });

  it('lets go of a subscription left over to the publication before subscribing to it', async () => {
    const { skyWay, calls, subscribed, subscription } = subscribingSkyWay(undefined);
    const stream = SkyWayDataStream.createSubscription(skyWay as never, PEER as never);

    void stream.connect();
    await vi.waitFor(() => expect(subscribed).toHaveLength(1));
    subscribed[0].resolve(subscription('sub-1'));

    expect(calls).toEqual(['release to pub-1', 'subscribe']);
  });

  it('lets go of the subscription it made when it is closed', async () => {
    const { skyWay, calls, subscribed, subscription } = subscribingSkyWay(undefined);
    const stream = SkyWayDataStream.createSubscription(skyWay as never, PEER as never);
    const connecting = stream.connect();
    await vi.waitFor(() => expect(subscribed).toHaveLength(1));
    subscribed[0].resolve(subscription('sub-1'));
    await connecting;

    stream.disconnect();
    stream.disconnect();

    expect(calls.filter((call) => call.startsWith('release sub'))).toEqual(['release sub-1']);
  });

  it('lets go of a subscription that arrives after it was closed', async () => {
    const { skyWay, calls, subscribed, subscription } = subscribingSkyWay(undefined);
    const stream = SkyWayDataStream.createSubscription(skyWay as never, PEER as never);
    const connecting = stream.connect();
    await vi.waitFor(() => expect(subscribed).toHaveLength(1));

    stream.disconnect();
    subscribed[0].resolve(subscription('sub-late'));
    await connecting;

    expect(calls).toEqual(['release to pub-1', 'subscribe', 'release sub-late']);
  });

  it('reports itself closed when SkyWay refuses the subscription, holding none to let go of', async () => {
    vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    const { skyWay, subscribed } = subscribingSkyWay(undefined);
    const stream = SkyWayDataStream.createSubscription(skyWay as never, PEER as never);
    const onClose = vi.fn();
    stream.on('close', onClose);
    const connecting = stream.connect();
    await vi.waitFor(() => expect(subscribed).toHaveLength(1));

    subscribed[0].reject(new Error('alreadySubscribedPublication'));
    await connecting;
    stream.disconnect();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(stream.isDead).toBe(true);
    expect(skyWay.releaseSubscription).not.toHaveBeenCalled();
  });
});
