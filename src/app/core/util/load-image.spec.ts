import { ImageCache, loadImage } from '@axe/core/util/load-image';

describe('loading pictures', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('gives up on a picture that does not arrive in time', async () => {
    vi.useFakeTimers();
    const loading = loadImage('blob:never', { timeoutMs: 50 });
    const settled = expect(loading).rejects.toThrow('image load timeout');

    await vi.advanceTimersByTimeAsync(60);

    await settled;
  });

  it('starts one load for a key however often it is asked for, and hands nothing over until it arrives', () => {
    const cache = new ImageCache('test picture');
    const src = vi.fn(() => 'blob:picture');

    expect(cache.get('one', src)).toBeNull();
    expect(cache.get('one', src)).toBeNull();
    expect(cache.load('one', src)).toBe(cache.load('one', src));
    expect(src).toHaveBeenCalledTimes(1);
  });

  it('turns down a load where the page cannot make pictures', async () => {
    vi.stubGlobal('Image', undefined);
    const cache = new ImageCache('test picture');

    expect(cache.get('one', () => 'blob:picture')).toBeNull();
    await expect(cache.load('one', () => 'blob:picture')).rejects.toThrow('Image API unavailable');
  });
});
