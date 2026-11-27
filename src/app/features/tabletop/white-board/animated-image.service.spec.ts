import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ImageState } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { AnimatedImageService } from '@axe/features/tabletop/white-board/animated-image.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('AnimatedImageService', () => {
  const gif = new Uint8Array([...[...'GIF89a'].map((char) => char.charCodeAt(0)), 0, 0, 0, 0, 0, 0]).buffer;
  const png = new Uint8Array([
    ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ...[0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...new Array(13 + 4).fill(0)],
    ...[0, 0, 0, 1, 0x49, 0x44, 0x41, 0x54, 0, 0, 0, 0, 0],
  ]).buffer;

  function serve(bytes: ArrayBuffer): void {
    vi.spyOn(ImageStorage.prototype, 'get').mockReturnValue({ url: 'blob:picture' } as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, blob: async () => new Blob([bytes]) }) as never)
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

  it('takes a picture not told a GIF as still until the bytes say otherwise', () => {
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

  it('takes every GIF as moving, one of a single image too, as the boards saved so far hang every GIF over themselves', async () => {
    const single = new Uint8Array([
      ...[...'GIF89a'].map((char) => char.charCodeAt(0)),
      ...[4, 0, 4, 0, 0, 0, 0],
      ...[0x2c, 0, 0, 0, 0, 4, 0, 4, 0, 0, 2, 1, 0, 0, 0x3b],
    ]).buffer;
    serve(single);

    expect(await service().probe('picture')).toBe(true);
  });

  it('calls a still PNG still though what it says of itself runs past the head of its file', async () => {
    const long = new Uint8Array([
      ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      ...[0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...new Array(13 + 4).fill(0)],
      ...[0, 1, 0x11, 0x70, 0x74, 0x45, 0x58, 0x74, ...new Array(70_000 + 4).fill(0)],
      ...[0, 0, 0, 1, 0x49, 0x44, 0x41, 0x54, 0, 0, 0, 0, 0],
    ]).buffer;
    serve(long);

    expect(await service().probe('picture')).toBe(false);
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
      vi.fn(
        async () => ({ ok: true, blob: async () => ({ slice: () => ({ arrayBuffer: async () => gif }) }) }) as never
      )
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

  it('rests the board, drawn again and again, on a picture that could not be read, and asks again by itself once only', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(ImageStorage.prototype, 'get').mockReturnValue({ url: 'blob:picture' } as never);
      const fetcher = vi.fn(async () => {
        throw new Error('gone');
      });
      vi.stubGlobal('fetch', fetcher);
      const animated = service();
      const asked = computed(() => animated.isAnimated('picture'));

      expect(asked()).toBe(false);
      await vi.advanceTimersByTimeAsync(0);
      expect(asked()).toBe(false);
      expect(animated.isAnimated('picture')).toBe(false);
      await vi.advanceTimersByTimeAsync(0);
      expect(fetcher).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(30_001);
      expect(asked()).toBe(false);
      await vi.advanceTimersByTimeAsync(0);
      expect(fetcher).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(120_000);
      expect(asked()).toBe(false);
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads a picture again once its rest is over when the board asked during a later rest, and not otherwise', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(ImageStorage.prototype, 'get').mockReturnValue({ url: 'blob:picture' } as never);
      const fetcher = vi.fn(async () => {
        throw new Error('gone');
      });
      vi.stubGlobal('fetch', fetcher);
      const animated = service();

      animated.isAnimated('picture');
      await vi.advanceTimersByTimeAsync(30_001);
      expect(fetcher).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(10_000);
      expect(animated.isAnimated('picture')).toBe(false);
      expect(animated.isAnimated('picture')).toBe(false);
      await vi.advanceTimersByTimeAsync(19_999);
      expect(fetcher).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(10);
      expect(fetcher).toHaveBeenCalledTimes(3);

      await vi.advanceTimersByTimeAsync(300_000);
      expect(fetcher).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the read the board asked for during the rest though the editor read the picture in the meantime', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(ImageStorage.prototype, 'get').mockReturnValue({ url: 'blob:picture' } as never);
      const fetcher = vi.fn(async () => {
        throw new Error('gone');
      });
      vi.stubGlobal('fetch', fetcher);
      const animated = service();

      animated.isAnimated('picture');
      await vi.advanceTimersByTimeAsync(30_001);
      await vi.advanceTimersByTimeAsync(5_000);
      animated.isAnimated('picture');
      await animated.probe('picture');
      expect(fetcher).toHaveBeenCalledTimes(3);

      await vi.advanceTimersByTimeAsync(30_001);
      expect(fetcher).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets no two unreadable pictures on one board wake each other on a clock', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(ImageStorage.prototype, 'get').mockReturnValue({ url: 'blob:picture' } as never);
      const fetcher = vi.fn(async () => {
        throw new Error('gone');
      });
      vi.stubGlobal('fetch', fetcher);
      const animated = service();
      const shown = signal(['one']);
      const board = computed(() => shown().map((identifier) => animated.isAnimated(identifier)));

      board();
      await vi.advanceTimersByTimeAsync(10_000);
      shown.set(['one', 'two']);
      board();
      for (let tick = 0; tick < 300; tick++) {
        await vi.advanceTimersByTimeAsync(1_000);
        board();
      }

      expect(fetcher).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads a refused picture as unread rather than still, and reads it again for one that asks', async () => {
    vi.spyOn(ImageStorage.prototype, 'get').mockReturnValue({ url: 'blob:picture' } as never);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, blob: async () => new Blob(['busy']) })
      .mockResolvedValue({ ok: true, blob: async () => new Blob([gif]) });
    vi.stubGlobal('fetch', fetcher);
    const animated = service();

    expect(await animated.probe('picture')).toBe(false);
    expect(await animated.probe('picture')).toBe(true);
    expect(animated.isAnimated('picture')).toBe(true);
  });

  it('reads a picture that could not be read for one that asks to know, as the editor saving the board, rest or no rest', async () => {
    vi.spyOn(ImageStorage.prototype, 'get').mockReturnValue({ url: 'blob:picture' } as never);
    const fetcher = vi.fn(async () => {
      throw new Error('gone');
    });
    vi.stubGlobal('fetch', fetcher);
    const animated = service();

    await animated.probe('picture');
    await animated.probe('picture');

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('reads again by itself, and tells the board, a picture that came whole while its thumbnail was read', async () => {
    const state = { value: ImageState.THUMBNAIL };
    vi.spyOn(ImageStorage.prototype, 'get').mockImplementation(
      () =>
        ({
          url: 'blob:picture',
          get state() {
            return state.value;
          },
        }) as never
    );
    let deliver: () => void = () => undefined;
    const fetcher = vi.fn(() =>
      fetcher.mock.calls.length > 1
        ? (Promise.resolve({ ok: true, blob: async () => new Blob([gif]) }) as never)
        : (new Promise((resolve) => {
            deliver = () => resolve({ ok: true, blob: async () => new Blob([png]) });
          }) as never)
    );
    vi.stubGlobal('fetch', fetcher);
    const animated = service();
    const asked = computed(() => animated.isAnimated('picture'));

    expect(asked()).toBe(false);
    const saving = animated.probe('picture');
    state.value = ImageState.COMPLETE;
    expect(asked()).toBe(false);
    deliver();
    await vi.waitFor(() => expect(asked()).toBe(true));

    expect(await saving).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('answers the board a GIF a peer told of with its thumbnail as moving, and its own bytes once it has come whole', async () => {
    const state = { value: ImageState.THUMBNAIL };
    vi.spyOn(ImageStorage.prototype, 'get').mockImplementation(
      () =>
        ({
          url: 'blob:picture',
          originalType: 'image/gif',
          get state() {
            return state.value;
          },
        }) as never
    );
    const fetcher = vi.fn(async () => ({ ok: true, blob: async () => new Blob([png]) }) as never);
    vi.stubGlobal('fetch', fetcher);
    const animated = service();
    const drawn = signal(0);
    const asked = computed(() => {
      drawn();
      return animated.isAnimated('picture');
    });

    expect(asked()).toBe(true);
    expect(await animated.probe('picture')).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();

    state.value = ImageState.COMPLETE;
    drawn.update((count) => count + 1);
    expect(asked()).toBe(true);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(asked()).toBe(false);
    expect(await animated.probe('picture')).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('answers the board a told GIF as moving all the while its own bytes are read, rather than blinking out', async () => {
    const state = { value: ImageState.THUMBNAIL };
    vi.spyOn(ImageStorage.prototype, 'get').mockImplementation(
      () =>
        ({
          url: 'blob:picture',
          originalType: 'image/gif',
          get state() {
            return state.value;
          },
        }) as never
    );
    let deliver: () => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            deliver = () => resolve({ ok: true, blob: async () => new Blob([gif]) });
          }) as never
      )
    );
    const animated = service();
    const drawn = signal(0);
    const asked = computed(() => {
      drawn();
      return animated.isAnimated('picture');
    });
    const answers: boolean[] = [asked()];

    state.value = ImageState.COMPLETE;
    drawn.update((count) => count + 1);
    answers.push(asked());
    deliver();
    await new Promise((resolve) => setTimeout(resolve, 0));
    answers.push(asked());

    expect(answers).toEqual([true, true, true]);
  });

  it('hands the editor a told GIF of which nothing has come yet as moving, as the board hangs it', async () => {
    vi.spyOn(ImageStorage.prototype, 'get').mockReturnValue({
      url: '',
      originalType: 'image/gif',
      state: ImageState.NULL,
    } as never);
    const animated = service();

    expect(await animated.probe('picture')).toBe(true);
    expect(animated.isAnimated('picture')).toBe(true);
  });

  it('hands the editor a told GIF whose bytes cannot be read as moving, as the board hangs it', async () => {
    vi.spyOn(ImageStorage.prototype, 'get').mockReturnValue({
      url: 'blob:picture',
      originalType: 'image/gif',
      state: ImageState.COMPLETE,
    } as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('gone');
      })
    );
    const animated = service();

    expect(await animated.probe('picture')).toBe(true);
    expect(animated.isAnimated('picture')).toBe(true);
  });

  it('rests the board on a picture that came empty, as on one that could not be read', async () => {
    vi.spyOn(ImageStorage.prototype, 'get').mockReturnValue({ url: 'blob:picture' } as never);
    const fetcher = vi.fn(async () => ({ ok: true, blob: async () => new Blob([]) }) as never);
    vi.stubGlobal('fetch', fetcher);
    const animated = service();

    animated.isAnimated('picture');
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let ask = 0; ask < 5; ask++) animated.isAnimated('picture');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('asks no more of a picture read from its thumbnail while only the thumbnail is held, however often the board is drawn', async () => {
    vi.spyOn(ImageStorage.prototype, 'get').mockReturnValue({
      url: 'blob:picture',
      state: ImageState.THUMBNAIL,
    } as never);
    const fetcher = vi.fn(async () => ({ ok: true, blob: async () => new Blob([png]) }) as never);
    vi.stubGlobal('fetch', fetcher);
    const animated = service();

    await animated.probe('picture');
    animated.isAnimated('picture');
    animated.isAnimated('picture');
    await Promise.resolve();

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps no answer read from a picture of which only its thumbnail has come, and reads it again once it has come whole', async () => {
    const state = { value: ImageState.THUMBNAIL };
    vi.spyOn(ImageStorage.prototype, 'get').mockImplementation(
      () =>
        ({
          url: 'blob:picture',
          get state() {
            return state.value;
          },
        }) as never
    );
    const fetcher = vi.fn(async () => ({ ok: true, blob: async () => new Blob([png]) }) as never);
    vi.stubGlobal('fetch', fetcher);
    const animated = service();

    await animated.probe('picture');
    state.value = ImageState.COMPLETE;
    await animated.probe('picture');
    await animated.probe('picture');

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('says nothing of a picture the storehouse does not have', async () => {
    vi.spyOn(ImageStorage.prototype, 'get').mockReturnValue(undefined as never);
    const animated = service();

    expect(await animated.probe('missing')).toBe(false);
  });
});
