import { ReplayImageCache } from '@axe/infrastructure/replay/video/replay-image-cache';
import { BorrowedGlobals } from '@axe/testing/borrowed-globals';

interface FakeBitmap {
  width: number;
  height: number;
  closed: boolean;
  close(): void;
}

function bitmap(width: number, height: number): FakeBitmap {
  return {
    width,
    height,
    closed: false,
    close() {
      this.closed = true;
    },
  };
}

describe('ReplayImageCache', () => {
  const borrowed = new BorrowedGlobals();
  const sizes = new Map<string, [number, number]>();
  let resized: { width: number; height: number; quality: string }[];

  const storage = {
    get: (identifier: string) => (sizes.has(identifier) ? { blob: new Blob([identifier]), url: '' } : null),
  };

  beforeEach(() => {
    sizes.clear();
    resized = [];
    borrowed.lend(
      'createImageBitmap',
      async (
        source: Blob | FakeBitmap,
        options?: { resizeWidth: number; resizeHeight: number; resizeQuality: string }
      ) => {
        if (options) {
          resized.push({ width: options.resizeWidth, height: options.resizeHeight, quality: options.resizeQuality });
          return bitmap(options.resizeWidth, options.resizeHeight);
        }
        const [width, height] = sizes.get(await (source as Blob).text()) ?? [1, 1];
        return bitmap(width, height);
      }
    );
  });

  afterEach(() => borrowed.giveBack());

  it('has nothing to draw until a picture has loaded, and says when it has', async () => {
    sizes.set('a', [100, 50]);
    const loaded = vi.fn();
    const cache = new ReplayImageCache(storage, 2048, loaded);

    expect(cache.imageOf('a')).toBeNull();
    await cache.ensure(['a']);

    expect(cache.imageOf('a')).toMatchObject({ width: 100, height: 50 });
    expect(loaded).toHaveBeenCalled();
  });

  it('waits for a picture it has to ask for, as a worker asks the page', async () => {
    sizes.set('a', [100, 50]);
    const asked = { get: async (identifier: string) => storage.get(identifier) };
    const cache = new ReplayImageCache(asked, 2048);

    await cache.ensure(['a']);

    expect(cache.imageOf('a')).toMatchObject({ width: 100, height: 50 });
  });

  it('scales a picture larger than the video down once, with the best resampling', async () => {
    sizes.set('huge', [8000, 4000]);
    const cache = new ReplayImageCache(storage, 2000);
    await cache.ensure(['huge']);

    expect(resized).toEqual([{ width: 2000, height: 1000, quality: 'high' }]);
    expect(cache.imageOf('huge')).toMatchObject({ width: 2000, height: 1000 });
  });

  it('lets the full-size picture go even when scaling it down fails', async () => {
    const full = bitmap(8000, 4000);
    borrowed.lend('createImageBitmap', async (_source: unknown, options?: unknown) => {
      if (options) throw new Error('out of memory');
      return full;
    });
    sizes.set('huge', [8000, 4000]);
    const cache = new ReplayImageCache(storage, 2000);
    await cache.ensure(['huge']);

    expect(full.closed).toBe(true);
    expect(cache.imageOf('huge')).toBeNull();
  });

  it('counts a picture it does not hold as ready, and never asks again', async () => {
    const cache = new ReplayImageCache(storage, 2048);
    await cache.ensure(['gone']);

    expect(cache.has(['gone'])).toBe(true);
    expect(cache.imageOf('gone')).toBeNull();
  });

  it('loads a picture that ships with the app by its path when this browser holds no record of it', async () => {
    const fetched: string[] = [];
    borrowed.lend('fetch', async (url: string) => {
      fetched.push(url);
      sizes.set('shipped', [64, 64]);
      return { ok: true, blob: async () => new Blob(['shipped']) };
    });
    const cache = new ReplayImageCache(storage, 2048);
    await cache.ensure(['assets/images/walls/wall_ashlar.webp', 'not-a-path']);

    expect(fetched).toEqual(['assets/images/walls/wall_ashlar.webp']);
    expect(cache.imageOf('assets/images/walls/wall_ashlar.webp')).toMatchObject({ width: 64 });
  });

  it('lets the picture drawn longest ago go once past its budget', async () => {
    sizes.set('a', [10, 10]);
    sizes.set('b', [10, 10]);
    sizes.set('c', [10, 10]);
    const cache = new ReplayImageCache(storage, 2048, () => undefined, 10 * 10 * 4 * 2);
    await cache.ensure(['a', 'b']);
    const first = cache.imageOf('a') as unknown as FakeBitmap;
    cache.imageOf('b');
    cache.imageOf('a');

    await cache.ensure(['c']);

    expect(cache.has(['a', 'c'])).toBe(true);
    expect(cache.has(['b'])).toBe(false);
    expect(first.closed).toBe(false);
  });

  it('lets every picture go when done with', async () => {
    sizes.set('a', [10, 10]);
    const cache = new ReplayImageCache(storage, 2048);
    await cache.ensure(['a']);
    const kept = cache.imageOf('a') as unknown as FakeBitmap;

    cache.dispose();

    expect(kept.closed).toBe(true);
    expect(cache.imageOf('a')).toBeNull();
  });
});
