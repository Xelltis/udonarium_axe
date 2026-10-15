import type { AssetAccess } from '@axe/core/network/connection';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
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
  let id: string;
  let fetchSpy: MockInstance<typeof fetch>;
  let access: AssetAccess | null;

  beforeEach(async () => {
    id = await sha256Hex(bytes.buffer);
    access = { roomKey: ROOM, token: 'asset-1' };
    store.configure(BASE);
    store.useAccess(() => access);
    store.delay = vi.fn(() => Promise.resolve());
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    store.configure(null);
    store.useAccess(null);
    store.delay = originalDelay;
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

    it.each([400, 403, 413, 415, 451])('gives up for good on %i', async (status) => {
      respond(new Response(null, { status: 404 }), new Response('{}', { status }));
      expect(await store.upload(id, new Blob([bytes]))).toBe('refused');
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

  describe('download', () => {
    it('hands back the bytes with the type the server gave', async () => {
      respond(new Response(bytes, { status: 200, headers: { 'Content-Type': 'image/png' } }));

      const blob = await store.download(id);

      expect(blob?.type).toBe('image/png');
      expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(bytes);
      expect(callsOf()).toEqual([['GET', urlOf(id)]]);
      expect(authorizationOf(0)).toBe('Bearer asset-1');
    });

    it('throws away bytes whose hash is not the name', async () => {
      respond(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
      expect(await store.download(id)).toBeNull();
    });

    it('gives nothing for an asset the server lacks or cannot send', async () => {
      respond(new Response(null, { status: 404 }));
      expect(await store.download(id)).toBeNull();
      fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      expect(await store.download(id)).toBeNull();
    });

    it('does not ask for names that are not hashes, or outside a room', async () => {
      expect(await store.download('none_icon')).toBeNull();
      access = null;
      expect(await store.download(id)).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
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

      expect(await store.download(id)).not.toBeNull();
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
