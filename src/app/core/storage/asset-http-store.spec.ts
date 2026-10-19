import type { AssetAccess } from '@axe/core/network/connection';
import { AssetDownload, AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { sha256Hex } from '@axe/core/util/crypto-util';
import type { MockInstance } from 'vitest';

const BASE = 'https://rooms.example';
const ROOM = '0123456789abcdef0123456789abcdef';
const OTHER_ROOM = 'fedcba9876543210fedcba9876543210';
const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const urlOf = (assetId: string, room = ROOM) => `${BASE}/v1/rooms/${room}/assets/${assetId}`;

describe('AssetHttpStore', () => {
  const store = AssetHttpStore.instance;
  const originalDelay = store.delay;
  const originalSendBytes = store.sendBytes;
  let id: string;
  let fetchSpy: MockInstance<typeof fetch>;
  let access: AssetAccess | null;

  beforeEach(async () => {
    id = await sha256Hex(bytes.buffer);
    access = { roomKey: ROOM, token: 'asset-1' };
    store.configure(BASE);
    store.useAccess(() => access);
    store.delay = vi.fn(() => Promise.resolve());
    // The bytes go up through XMLHttpRequest, which the specs of its own cover; here they go by fetch.
    store.sendBytes = (url, body, headers) => fetch(url, { method: 'PUT', body, headers });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    store.configure(null);
    store.useAccess(null);
    store.delay = originalDelay;
    store.sendBytes = originalSendBytes;
    vi.restoreAllMocks();
  });

  const respond = (...responses: Response[]) => {
    for (const response of responses) fetchSpy.mockResolvedValueOnce(response);
  };
  const callsOf = () => fetchSpy.mock.calls.map(([url, init]) => [init?.method, String(url)]);
  const authorizationOf = (call: number) =>
    new Headers((fetchSpy.mock.calls[call][1] as RequestInit).headers).get('Authorization');

  describe('configure', () => {
    it('is off until an address is given, and off again for an empty one', () => {
      store.configure(null);
      expect(store.isEnabled).toBe(false);
      store.configure('  ');
      expect(store.isEnabled).toBe(false);
      store.configure(BASE);
      expect(store.isEnabled).toBe(true);
    });

    it('is off outside a room, and with nothing to tell which room the seat is in', () => {
      access = null;
      expect(store.isEnabled).toBe(false);
      store.useAccess(null);
      expect(store.isEnabled).toBe(false);
    });

    it('drops trailing slashes from the address', async () => {
      store.configure(`${BASE}//`);
      respond(new Response(null, { status: 200 }));

      await store.upload(id, new Blob([bytes]));

      expect(callsOf()).toEqual([['HEAD', urlOf(id)]]);
    });
  });

  describe('isAssetId', () => {
    it('takes 64 lowercase hex characters and nothing else', () => {
      expect(AssetHttpStore.isAssetId('0'.repeat(64))).toBe(true);
      expect(AssetHttpStore.isAssetId('A'.repeat(64))).toBe(false);
      expect(AssetHttpStore.isAssetId('https://example.com/a.png')).toBe(false);
      expect(AssetHttpStore.isAssetId('none_icon')).toBe(false);
    });
  });

  describe('upload', () => {
    it('stores bytes the room lacks, asking and sending with the room’s token', async () => {
      respond(new Response(null, { status: 404 }), new Response('{}', { status: 201 }));
      const blob = new Blob([bytes]);

      expect(await store.upload(id, blob)).toBe('stored');
      expect(callsOf()).toEqual([
        ['HEAD', urlOf(id)],
        ['PUT', urlOf(id)],
      ]);
      expect((fetchSpy.mock.calls[1][1] as RequestInit).body).toBe(blob);
      expect([authorizationOf(0), authorizationOf(1)]).toEqual(['Bearer asset-1', 'Bearer asset-1']);
    });

    it('sends nothing when the room already has the bytes', async () => {
      respond(new Response(null, { status: 200 }));

      expect(await store.upload(id, new Blob([bytes]))).toBe('exists');
      expect(callsOf()).toEqual([['HEAD', urlOf(id)]]);
    });

    it('fails for now, rather than running out of time, when asking whether the room has the bytes is cut off', async () => {
      fetchSpy.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));

      expect(await store.upload(id, new Blob([bytes]))).toBe('failed');
    });

    it.each([429, 503])(
      'sends no bytes, and fails for now, when asking whether the room has them answers %i',
      async (status) => {
        respond(new Response(null, { status }));

        expect(await store.upload(id, new Blob([bytes]))).toBe('failed');
        expect(callsOf()).toEqual([['HEAD', urlOf(id)]]);
      }
    );

    it.each([400, 403, 413, 415, 451])('gives up for good on %i', async (status) => {
      respond(new Response(null, { status: 404 }), new Response('{}', { status }));
      expect(await store.upload(id, new Blob([bytes]))).toBe('refused');
    });

    it('fails for now when the room server does not count the seat among the players yet', async () => {
      respond(
        new Response(null, { status: 404 }),
        new Response(JSON.stringify({ error: 'not-a-player' }), { status: 403 })
      );
      expect(await store.upload(id, new Blob([bytes]))).toBe('failed');
    });

    it('fails for now when the token was turned away, for a later try with a fresh one', async () => {
      respond(new Response(null, { status: 401 }), new Response('{}', { status: 401 }));
      expect(await store.upload(id, new Blob([bytes]))).toBe('failed');
    });

    it('asks for a fresh token once when the one held is turned away, and goes on with it', async () => {
      const refresh = vi.fn(async () => ({ roomKey: ROOM, token: 'asset-2' }));
      store.useAccess(() => access, refresh);
      respond(
        new Response(null, { status: 401 }),
        new Response(null, { status: 404 }),
        new Response('{}', { status: 401 }),
        new Response('{}', { status: 201 })
      );

      expect(await store.upload(id, new Blob([bytes]))).toBe('stored');
      expect(refresh).toHaveBeenCalledTimes(2);
      expect([0, 1, 2, 3].map(authorizationOf)).toEqual([
        'Bearer asset-1',
        'Bearer asset-2',
        'Bearer asset-1',
        'Bearer asset-2',
      ]);
    });

    it('fails when no fresh token comes for one turned away', async () => {
      store.useAccess(
        () => access,
        vi.fn(async () => null)
      );
      respond(new Response(null, { status: 401 }));

      expect(await store.upload(id, new Blob([bytes]))).toBe('failed');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('names what it puts up, cut to the longest name the server keeps', async () => {
      respond(new Response(null, { status: 404 }), new Response('{}', { status: 201 }));

      await store.upload(id, new Blob([bytes]), `ドラゴン${'x'.repeat(300)}`);

      const put = new Headers((fetchSpy.mock.calls[1][1] as RequestInit).headers);
      expect(decodeURIComponent(put.get('X-Asset-Name')!)).toBe(`ドラゴン${'x'.repeat(251)}`);
      expect(new Headers((fetchSpy.mock.calls[0][1] as RequestInit).headers).has('X-Asset-Name')).toBe(false);
    });

    it('sends a name with half a character in it, writing that half as the replacement character', async () => {
      respond(new Response(null, { status: 404 }), new Response('{}', { status: 201 }));

      expect(await store.upload(id, new Blob([bytes]), 'map\uD83D.png')).toBe('stored');

      const put = new Headers((fetchSpy.mock.calls[1][1] as RequestInit).headers);
      expect(decodeURIComponent(put.get('X-Asset-Name')!)).toBe('map\uFFFD.png');
    });

    it('cuts a long name before a character the cut would halve, not through it', async () => {
      respond(new Response(null, { status: 404 }), new Response('{}', { status: 201 }));

      await store.upload(id, new Blob([bytes]), `${'x'.repeat(254)}🐉🐉`);

      const put = new Headers((fetchSpy.mock.calls[1][1] as RequestInit).headers);
      expect(decodeURIComponent(put.get('X-Asset-Name')!)).toBe(`${'x'.repeat(254)}`);
    });

    it('fails for now outside a room, without asking the server anything', async () => {
      access = null;

      expect(await store.upload(id, new Blob([bytes]))).toBe('failed');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('sends a queued upload to the room the seat is in by its turn', async () => {
      const releases: (() => void)[] = [];
      fetchSpy.mockImplementation(
        () => new Promise<Response>((resolve) => releases.push(() => resolve(new Response(null, { status: 200 }))))
      );
      const ids = await Promise.all([0, 1, 2].map((n) => sha256Hex(`queued-${n}`)));

      const uploads = Promise.all(ids.map((assetId) => store.upload(assetId, new Blob([bytes]))));
      await vi.waitFor(() => expect(releases).toHaveLength(2));
      access = { roomKey: OTHER_ROOM, token: 'asset-2' };
      releases.shift()?.();
      await vi.waitFor(() => expect(releases).toHaveLength(2));
      while (releases.length > 0) releases.shift()?.();
      await uploads;

      expect(callsOf().map(([, url]) => url)).toEqual([urlOf(ids[0]), urlOf(ids[1]), urlOf(ids[2], OTHER_ROOM)]);
      expect(authorizationOf(2)).toBe('Bearer asset-2');
    });

    it('waits and tries again when the server asks for fewer uploads', async () => {
      respond(
        new Response(null, { status: 404 }),
        new Response('{}', { status: 429 }),
        new Response('{}', { status: 201 })
      );

      expect(await store.upload(id, new Blob([bytes]))).toBe('stored');
      expect(store.delay).toHaveBeenCalledTimes(1);
    });

    it('stops trying once the backoff runs out', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 404 }));
      fetchSpy.mockImplementation(() => Promise.resolve(new Response('{}', { status: 429 })));

      expect(await store.upload(id, new Blob([bytes]))).toBe('failed');
      expect(store.delay).toHaveBeenCalledTimes(3);
    });

    it('reports a failure when the server cannot be reached', async () => {
      fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
      expect(await store.upload(id, new Blob([bytes]))).toBe('failed');
    });

    it('does not ask the server about names that are not hashes, or while it is off', async () => {
      expect(await store.upload('https://example.com/a.png', new Blob([bytes]))).toBe('refused');
      store.configure(null);
      expect(await store.upload(id, new Blob([bytes]))).toBe('refused');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('lets an upload asked for first, or moved to the front, go ahead of those waiting their turn', async () => {
      const asked: string[] = [];
      const releases: (() => void)[] = [];
      fetchSpy.mockImplementation((url) => {
        asked.push(String(url).slice(-64));
        return new Promise<Response>((resolve) => releases.push(() => resolve(new Response(null, { status: 200 }))));
      });
      const ids = await Promise.all([0, 1, 2, 3, 4].map((n) => sha256Hex(`up-${n}`)));

      const done = [
        ...ids.slice(0, 4).map((assetId) => store.upload(assetId, new Blob([bytes]))),
        store.upload(ids[4], new Blob([bytes]), '', { first: true }),
      ];
      store.uploadFirst(ids[3]);
      await vi.waitFor(() => expect(asked).toHaveLength(2));
      while (asked.length < ids.length) {
        releases.shift()?.();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      releases.forEach((release) => release());
      await Promise.all(done);

      expect(asked).toEqual([ids[0], ids[1], ids[3], ids[4], ids[2]]);
    });

    it('starts a small upload at once while two big ones hold their lane, as a picture behind long sounds', async () => {
      const asked: string[] = [];
      const releases: (() => void)[] = [];
      fetchSpy.mockImplementation((url) => {
        asked.push(String(url).slice(-64));
        return new Promise<Response>((resolve) => releases.push(() => resolve(new Response(null, { status: 200 }))));
      });
      const [big1, big2, big3, small] = await Promise.all(
        ['big-1', 'big-2', 'big-3', 'small'].map((n) => sha256Hex(n))
      );
      const big = new Blob([new Uint8Array(2 * 1024 * 1024 + 1)]);

      const done = [big1, big2, big3].map((assetId) => store.upload(assetId, big));
      done.push(store.upload(small, new Blob([bytes])));

      await vi.waitFor(() => expect(asked).toEqual([big1, big2, small]));
      let finished = false;
      void Promise.all(done).then(() => (finished = true));
      while (!finished) {
        releases.shift()?.();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      expect(asked).toEqual([big1, big2, small, big3]);
    });

    it('runs at most two uploads at a time', async () => {
      let inFlight = 0;
      let mostInFlight = 0;
      const releases: (() => void)[] = [];
      fetchSpy.mockImplementation(() => {
        inFlight++;
        mostInFlight = Math.max(mostInFlight, inFlight);
        return new Promise<Response>((resolve) =>
          releases.push(() => {
            inFlight--;
            resolve(new Response(null, { status: 200 }));
          })
        );
      });

      const ids = await Promise.all([0, 1, 2, 3].map((n) => sha256Hex(`file-${n}`)));
      let results: string[] | null = null;
      void Promise.all(ids.map((assetId) => store.upload(assetId, new Blob([bytes])))).then((r) => (results = r));
      while (results === null) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        releases.shift()?.();
      }

      expect(results).toEqual(['exists', 'exists', 'exists', 'exists']);
      expect(mostInFlight).toBe(2);
    });
  });

  describe('upload straight to the store', () => {
    const TARGET = 'https://blob.example/uploads/put?signed';
    const ticketOf = (overrides: Record<string, unknown> = {}) =>
      new Response(
        JSON.stringify({
          ticket: 'ticket-1',
          upload: { url: TARGET, method: 'PUT', headers: { 'x-blob': 'private' }, expiresAt: 1 },
          ...overrides,
        }),
        { status: 201 }
      );
    const bodyOf = (call: number) => JSON.parse(String((fetchSpy.mock.calls[call][1] as RequestInit).body));

    beforeEach(() => {
      // Bigger than one request carries: the test bytes are eight.
      access = { roomKey: ROOM, token: 'asset-1', upload: { maxPutBytes: 4, directUpload: true } };
    });

    it('asks where, sends the bytes there without the room’s token, then hands the ticket back', async () => {
      respond(
        new Response(null, { status: 404 }),
        ticketOf(),
        new Response(null, { status: 200 }),
        new Response('{}', { status: 201 })
      );
      const blob = new Blob([bytes]);

      expect(await store.upload(id, blob, 'big.png')).toBe('stored');

      expect(callsOf()).toEqual([
        ['HEAD', urlOf(id)],
        ['POST', `${urlOf(id)}/uploads`],
        ['PUT', TARGET],
        ['POST', `${urlOf(id)}/uploads/complete`],
      ]);
      expect(bodyOf(1)).toEqual({ size: bytes.byteLength, name: 'big.png' });
      expect((fetchSpy.mock.calls[2][1] as RequestInit).body).toBe(blob);
      expect(new Headers((fetchSpy.mock.calls[2][1] as RequestInit).headers).get('x-blob')).toBe('private');
      expect(bodyOf(3)).toEqual({ ticket: 'ticket-1' });
      expect([authorizationOf(1), authorizationOf(2), authorizationOf(3)]).toEqual([
        'Bearer asset-1',
        null,
        'Bearer asset-1',
      ]);
    });

    it('takes what the server says of the bytes: there already, never, or not yet', async () => {
      const uploadWith = async (...responses: Response[]) => {
        fetchSpy.mockReset();
        respond(new Response(null, { status: 404 }), ...responses);
        return store.upload(id, new Blob([bytes]));
      };

      expect(await uploadWith(new Response('{}', { status: 200 }))).toBe('exists');
      expect(await uploadWith(new Response('{}', { status: 413 }))).toBe('refused');
      expect(await uploadWith(new Response('{}', { status: 500 }))).toBe('failed');
      expect(await uploadWith(ticketOf({ upload: { url: TARGET, method: 'POST' } }))).toBe('failed');
      expect(await uploadWith(ticketOf(), new Response(null, { status: 403 }))).toBe('failed');
      expect(
        await uploadWith(ticketOf(), new Response(null, { status: 200 }), new Response('{}', { status: 400 }))
      ).toBe('refused');
    });

    it('asks again after a wait when the server wants fewer uploads', async () => {
      respond(
        new Response(null, { status: 404 }),
        new Response('{}', { status: 429 }),
        ticketOf(),
        new Response(null, { status: 200 }),
        new Response('{}', { status: 201 })
      );

      expect(await store.upload(id, new Blob([bytes]))).toBe('stored');
      expect(store.delay).toHaveBeenCalledWith(10_000);
    });

    it('refuses bytes too big for one request on a server that takes nothing straight to its store', async () => {
      access = { roomKey: ROOM, token: 'asset-1', upload: { maxPutBytes: 4, directUpload: false } };
      respond(new Response(null, { status: 404 }));

      expect(await store.upload(id, new Blob([bytes]))).toBe('refused');
      expect(callsOf()).toEqual([['HEAD', urlOf(id)]]);
    });

    it('puts bytes small enough with one PUT', async () => {
      access = { roomKey: ROOM, token: 'asset-1', upload: { maxPutBytes: 8, directUpload: true } };
      respond(new Response(null, { status: 404 }), new Response('{}', { status: 201 }));

      expect(await store.upload(id, new Blob([bytes]))).toBe('stored');
      expect(callsOf()).toEqual([
        ['HEAD', urlOf(id)],
        ['PUT', urlOf(id)],
      ]);
    });

    it('leaves bytes cut off on their way to the store for a later try, without handing the ticket back', async () => {
      respond(new Response(null, { status: 404 }), ticketOf());
      fetchSpy.mockImplementationOnce(() => Promise.reject(new DOMException('aborted', 'AbortError')));

      expect(await store.upload(id, new Blob([bytes]))).toBe('failed');
      expect(callsOf()).toEqual([
        ['HEAD', urlOf(id)],
        ['POST', `${urlOf(id)}/uploads`],
        ['PUT', TARGET],
      ]);
    });

    it('sends the bytes to the store as every upload is sent, by the time on the ticket', async () => {
      access = { ...access!, clockOffset: 5_000 };
      const sent: [string, number | undefined][] = [];
      store.sendBytes = (url, body, headers, deadline) => {
        sent.push([url, deadline]);
        return fetch(url, { method: 'PUT', body, headers });
      };
      respond(
        new Response(null, { status: 404 }),
        ticketOf(),
        new Response(null, { status: 200 }),
        new Response('{}', { status: 201 })
      );

      expect(await store.upload(id, new Blob([bytes]))).toBe('stored');
      // The ticket's place is held until 1 by the server's clock, which runs 5 seconds ahead.
      expect(sent).toEqual([[TARGET, 1 - 5_000]]);
    });
  });

  describe('download', () => {
    it('hands back the name the bytes were put up under, and none it cannot read', async () => {
      respond(
        new Response(bytes, { status: 200, headers: { 'X-Asset-Name': encodeURIComponent('ドラゴン.png') } }),
        new Response(bytes, { status: 200, headers: { 'X-Asset-Name': '%E3%81' } })
      );

      expect(((await store.download(id)) as AssetDownload).name).toBe('ドラゴン.png');
      expect(((await store.download(id)) as AssetDownload).name).toBe('');
    });

    it('hands back the bytes with the type the server gave', async () => {
      respond(new Response(bytes, { status: 200, headers: { 'Content-Type': 'image/png' } }));

      const { blob, name } = (await store.download(id)) as AssetDownload;

      expect(blob.type).toBe('image/png');
      expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
      expect(name).toBe('');
      expect(callsOf()).toEqual([['GET', urlOf(id)]]);
      expect(authorizationOf(0)).toBe('Bearer asset-1');
    });

    it('throws away bytes whose hash is not the name, as bytes the server lacks', async () => {
      respond(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
      expect(await store.download(id)).toBe('missing');
    });

    it('tells an asset the server lacks from one it could not send just then', async () => {
      respond(new Response(null, { status: 404 }));
      expect(await store.download(id)).toBe('missing');
      respond(new Response(null, { status: 429 }), new Response(null, { status: 503 }));
      expect(await store.download(id)).toBe('failed');
      expect(await store.download(id)).toBe('failed');
      fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      expect(await store.download(id)).toBe('failed');
    });

    it('does not ask for names that are not hashes, or outside a room', async () => {
      expect(await store.download('none_icon')).toBe('missing');
      access = null;
      expect(await store.download(id)).toBe('failed');
      store.configure(null);
      expect(await store.download(id)).toBe('failed');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('lets one asked for first, or moved to the front, go ahead of those waiting their turn', async () => {
      const asked: string[] = [];
      const releases: (() => void)[] = [];
      fetchSpy.mockImplementation((url) => {
        asked.push(String(url).slice(-64));
        return new Promise<Response>((resolve) => releases.push(() => resolve(new Response(null, { status: 404 }))));
      });
      const ids = await Promise.all([0, 1, 2, 3, 4, 5, 6].map((n) => sha256Hex(`file-${n}`)));

      const done = [
        ...ids.slice(0, 6).map((assetId) => store.download(assetId)),
        store.download(ids[6], { first: true }),
      ];
      store.downloadFirst(ids[5]);
      await vi.waitFor(() => expect(asked).toHaveLength(4));
      while (asked.length < ids.length) {
        releases.shift()?.();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      releases.forEach((release) => release());
      await Promise.all(done);

      expect(asked).toEqual([...ids.slice(0, 4), ids[5], ids[6], ids[4]]);
    });

    it('gives up on bytes that stop coming, as a download it could not make just then', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      fetchSpy.mockImplementation((_url, init) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes.slice(0, 1));
            init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
          },
        });
        return Promise.resolve(new Response(body, { status: 200 }));
      });
      try {
        const result = store.download(id);
        await vi.advanceTimersByTimeAsync(60_000);

        expect(await result).toBe('failed');
      } finally {
        vi.useRealTimers();
      }
    });

    it('waits for bytes that keep coming, however long they take in all', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      let push: (part: Uint8Array) => void = () => {};
      let end: () => void = () => {};
      fetchSpy.mockImplementation((_url, init) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            push = (part) => controller.enqueue(part);
            end = () => controller.close();
            init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
          },
        });
        return Promise.resolve(new Response(body, { status: 200 }));
      });
      try {
        const result = store.download(id);
        for (const byte of bytes) {
          await vi.advanceTimersByTimeAsync(50_000);
          push(new Uint8Array([byte]));
        }
        await vi.advanceTimersByTimeAsync(50_000);
        end();

        expect(new Uint8Array(await ((await result) as AssetDownload).blob.arrayBuffer())).toEqual(bytes);
      } finally {
        vi.useRealTimers();
      }
    });

    it('fetches again with a fresh token when the one held is turned away', async () => {
      store.useAccess(
        () => access,
        async () => ({ roomKey: ROOM, token: 'asset-2' })
      );
      respond(
        new Response(null, { status: 401 }),
        new Response(bytes, { status: 200, headers: { 'Content-Type': 'image/png' } })
      );

      expect((await store.download(id)) as AssetDownload).toMatchObject({ blob: expect.any(Blob) });
      expect(authorizationOf(1)).toBe('Bearer asset-2');
    });
  });

  describe('listRoomAssets', () => {
    const listed = { id: 'a'.repeat(64), type: 'image/png', size: 8, name: 'dragon.png' };

    it('lists what the room holds, asking with the room’s token', async () => {
      respond(new Response(JSON.stringify({ assets: [listed] }), { status: 200 }));

      expect(await store.listRoomAssets()).toEqual([listed]);
      expect(callsOf()).toEqual([['GET', `${BASE}/v1/rooms/${ROOM}/assets`]]);
      expect(authorizationOf(0)).toBe('Bearer asset-1');
    });

    it('gives nothing when the server says nothing it can read, cannot be reached, or the seat is outside', async () => {
      respond(new Response(null, { status: 401 }), new Response('{"assets":[{"id":1}]}', { status: 200 }));
      expect(await store.listRoomAssets()).toBeNull();
      expect(await store.listRoomAssets()).toBeNull();
      fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      expect(await store.listRoomAssets()).toBeNull();
      access = null;
      expect(await store.listRoomAssets()).toBeNull();
      store.configure(null);
      expect(await store.listRoomAssets()).toBeNull();
    });
  });
});
