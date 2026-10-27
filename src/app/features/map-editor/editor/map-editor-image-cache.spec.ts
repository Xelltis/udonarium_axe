import { TEXTURE_ASSET_URLS, TEXTURE_IDS } from '@axe/domain/media/texture-catalog';
import { MapEditorImageCache } from '@axe/features/map-editor/editor/map-editor-image-cache';

describe('the pictures a map editor draws with', () => {
  it('fetches a picture that has not loaded once, and moves its tick when it arrives', async () => {
    const load = vi.fn().mockResolvedValue({} as HTMLImageElement);
    const cache = new MapEditorImageCache((identifier) => (identifier === 'kept' ? 'blob:kept' : undefined), load);

    expect(cache.image('kept')).toBeNull();
    expect(cache.image('kept')).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith('blob:kept');

    await Promise.resolve();
    await Promise.resolve();
    expect(cache.tick()).toBe(1);
  });

  it('draws nothing for a picture the room does not keep, and fetches nothing', () => {
    const load = vi.fn();
    const cache = new MapEditorImageCache(() => undefined, load);

    expect(cache.image('gone')).toBeNull();
    expect(cache.stamp('no-such-stamp', 64, null)).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('fetches a texture that ships with the room from where it ships', () => {
    const load = vi.fn().mockResolvedValue({} as HTMLImageElement);
    const cache = new MapEditorImageCache(() => undefined, load);
    const id = TEXTURE_IDS[0];

    const pattern = cache
      .helpersFor({} as CanvasRenderingContext2D)
      .texturePattern({ textureId: id, scale: 1, rotation: 0 }, 50);

    expect(pattern).toBeNull();
    expect(load).toHaveBeenCalledWith(TEXTURE_ASSET_URLS[id]);
  });
});
