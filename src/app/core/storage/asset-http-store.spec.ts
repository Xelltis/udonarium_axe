import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { sha256Hex } from '@axe/core/util/crypto-util';
import type { MockInstance } from 'vitest';

const BASE = 'https://assets.example';
const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

describe('AssetHttpStore', () => {
  const store = AssetHttpStore.instance;
  const originalDelay = store.delay;
  let id: string;
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(async () => {
    id = await sha256Hex(bytes.buffer);
    store.configure(BASE);
    store.delay = vi.fn(() => Promise.resolve());
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    store.configure(null);
    store.delay = originalDelay;
    vi.restoreAllMocks();
  });

  const respond = (...responses: Response[]) => {
    for (const response of responses) fetchSpy.mockResolvedValueOnce(response);
  };
  const callsOf = () => fetchSpy.mock.calls.map(([url, init]) => [init?.method, String(url)]);

  describe('configure', () => {
    it('is off until an address is given, and off again for an empty one', () => {
      store.configure(null);
      expect(store.isEnabled).toBe(false);
      store.configure('  ');
      expect(store.isEnabled).toBe(false);
      store.configure(BASE);
      expect(store.isEnabled).toBe(true);
    });

    it('drops trailing slashes from the address', async () => {
      store.configure(`${BASE}//`);
      respond(new Response(null, { status: 200 }));

      await store.upload(id, new Blob([bytes]));

      expect(callsOf()).toEqual([['HEAD', `${BASE}/v1/assets/${id}`]]);
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
    it('stores bytes the server lacks', async () => {
      respond(new Response(null, { status: 404 }), new Response('{}', { status: 201 }));
      const blob = new Blob([bytes]);

      expect(await store.upload(id, blob)).toBe('stored');
      expect(callsOf()).toEqual([
        ['HEAD', `${BASE}/v1/assets/${id}`],
        ['PUT', `${BASE}/v1/assets/${id}`],
      ]);
      expect((fetchSpy.mock.calls[1][1] as RequestInit).body).toBe(blob);
    });

    it('sends nothing when the server already has the bytes', async () => {
      respond(new Response(null, { status: 200 }));

      expect(await store.upload(id, new Blob([bytes]))).toBe('exists');
      expect(callsOf()).toEqual([['HEAD', `${BASE}/v1/assets/${id}`]]);
    });

    it.each([400, 413, 415])('gives up for good on %i', async (status) => {
      respond(new Response(null, { status: 404 }), new Response('{}', { status }));
      expect(await store.upload(id, new Blob([bytes]))).toBe('refused');
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
      expect(callsOf()).toEqual([['GET', `${BASE}/v1/assets/${id}`]]);
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

    it('does not ask for names that are not hashes', async () => {
      expect(await store.download('none_icon')).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
