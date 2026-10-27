import { TestBed } from '@angular/core/testing';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { AnimatedImageService } from '@axe/features/tabletop/white-board/animated-image.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('AnimatedImageService', () => {
  const gif = new Uint8Array([...[...'GIF89a'].map((char) => char.charCodeAt(0)), 0, 0, 0, 0, 0, 0]).buffer;
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).buffer;

  function serve(bytes: ArrayBuffer): void {
    vi.spyOn(ImageStorage.prototype, 'get').mockReturnValue({ url: 'blob:picture' } as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ blob: async () => ({ slice: () => ({ arrayBuffer: async () => bytes }) }) }) as never)
    );
  }

  function service(): AnimatedImageService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    return TestBed.inject(AnimatedImageService);
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('takes a picture as still until the bytes say otherwise', () => {
    serve(gif);

    expect(service().isAnimated('picture')).toBe(false);
  });

  it('reads the bytes once and remembers the answer', async () => {
    serve(gif);
    const animated = service();

    expect(await animated.probe('picture')).toBe(true);
    expect(animated.isAnimated('picture')).toBe(true);
    expect(await animated.probe('picture')).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('calls a still picture still', async () => {
    serve(png);
    const animated = service();

    expect(await animated.probe('picture')).toBe(false);
  });

  it('calls a picture it cannot read still, rather than falling over', async () => {
    vi.spyOn(ImageStorage.prototype, 'get').mockReturnValue({ url: 'blob:picture' } as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('gone');
      })
    );
    const animated = service();

    expect(await animated.probe('picture')).toBe(false);
    expect(animated.isAnimated('picture')).toBe(false);
  });

  it('asks again once a picture that had not arrived yet is there', async () => {
    const get = vi.spyOn(ImageStorage.prototype, 'get').mockReturnValue(undefined as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ blob: async () => ({ slice: () => ({ arrayBuffer: async () => gif }) }) }) as never)
    );
    const animated = service();

    expect(await animated.probe('picture')).toBe(false);

    get.mockReturnValue({ url: 'blob:picture' } as never);
    expect(await animated.probe('picture')).toBe(true);
  });

  it('reads a picture once however many ask at once', async () => {
    serve(gif);
    const animated = service();

    const asked = await Promise.all([animated.probe('picture'), animated.probe('picture')]);

    expect(asked).toEqual([true, true]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('asks again after a reading that could not be made', async () => {
    vi.spyOn(ImageStorage.prototype, 'get').mockReturnValue({ url: 'blob:picture' } as never);
    const fetcher = vi.fn(async () => {
      throw new Error('gone');
    });
    vi.stubGlobal('fetch', fetcher);
    const animated = service();

    expect(await animated.probe('picture')).toBe(false);
    expect(await animated.probe('picture')).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('says nothing of a picture the storehouse does not have', async () => {
    vi.spyOn(ImageStorage.prototype, 'get').mockReturnValue(undefined as never);
    const animated = service();

    expect(await animated.probe('missing')).toBe(false);
  });
});
