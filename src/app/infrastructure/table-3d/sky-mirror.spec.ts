import { SkyMirror } from '@axe/infrastructure/table-3d/sky-mirror';

describe('SkyMirror', () => {
  it('says whether the sky it mirrors changed', () => {
    const mirror = new SkyMirror();
    const white = { r: 1, g: 1, b: 1 };

    expect(mirror.set(white, 1, 0.6)).toBe(true);
    expect(mirror.set(white, 1, 0.6)).toBe(false);
    expect(mirror.set(white, 0.5, 0.6)).toBe(true);
    expect(mirror.set({ r: 1, g: 0.9, b: 0.8 }, 0.5, 0.6)).toBe(true);
    expect(mirror.set({ r: 1, g: 0.9, b: 0.8 }, 0.5, 0.3)).toBe(true);
  });

  it('says the ground under it changed, though the sky has no red in it', () => {
    const mirror = new SkyMirror();
    const blue = { r: 0, g: 0.4, b: 1 };

    mirror.set(blue, 1, 0.3);

    expect(mirror.set(blue, 1, 0.5)).toBe(true);
  });

  it('gives a surface something to give off for mirroring it', () => {
    expect(new SkyMirror().node).toBeTruthy();
  });
});
