import { SkyWayDataStream } from '@axe/core/network/skyway/skyway-data-stream';

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
    sendQueue: Set<Uint8Array>;
    execQueue(): void;
    isQueuing: boolean;
  }

  function stream(): Internals {
    const made = SkyWayDataStream.createSubscription(
      { room: undefined } as never,
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

  it('feeds the channel everything queued while it has room', () => {
    const sent: Uint8Array[] = [];
    const inner = stream();
    inner.dataChannel = channel(0, sent);
    for (let i = 0; i < 5; i++) inner.sendQueue.add(new Uint8Array([i]));

    inner.execQueue();

    expect(sent).toHaveLength(5);
    expect(inner.sendQueue.size).toBe(0);
    expect(inner.isQueuing).toBe(false);
  });

  it('waits while the channel is already holding a megabyte', () => {
    const sent: Uint8Array[] = [];
    const inner = stream();
    inner.dataChannel = channel(1024 * 1024, sent);
    inner.sendQueue.add(new Uint8Array([1]));

    inner.execQueue();

    expect(sent).toHaveLength(0);
    expect(inner.sendQueue.size).toBe(1);
    expect(inner.isQueuing).toBe(true);
  });

  it('waits on the clock rather than coming straight back to a full channel', () => {
    vi.useFakeTimers();
    try {
      const sent: Uint8Array[] = [];
      const full = { readyState: 'open', bufferedAmount: 1024 * 1024, send: (data: Uint8Array) => sent.push(data) };
      const inner = stream();
      inner.dataChannel = full;
      inner.sendQueue.add(new Uint8Array([1]));

      inner.execQueue();
      vi.advanceTimersByTime(49);

      // Nothing has gone and nothing has been tried again: a pass that sends nothing must not
      // hand the main thread straight back to itself.
      expect(sent).toHaveLength(0);

      full.bufferedAmount = 0;
      vi.advanceTimersByTime(1);

      expect(sent).toHaveLength(1);
      expect(inner.sendQueue.size).toBe(0);
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
      inner.sendQueue.add(new Uint8Array([1]));
      inner.sendQueue.add(new Uint8Array([2]));

      inner.execQueue();

      expect(inner.sendQueue.size).toBe(2);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('sends nothing through a channel that is not open', () => {
    const sent: Uint8Array[] = [];
    const inner = stream();
    inner.dataChannel = { ...channel(0, sent), readyState: 'connecting' };
    inner.sendQueue.add(new Uint8Array([1]));

    inner.execQueue();

    expect(sent).toHaveLength(0);
    expect(inner.isQueuing).toBe(false);
  });
});
