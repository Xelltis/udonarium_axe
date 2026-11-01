import { TestBed } from '@angular/core/testing';
import { PictureSizeService } from '@axe/application/storage/picture-size.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A picture that comes a moment after it is asked for, 40 by 30, unless its address says it is broken. */
class ArrivingPicture {
  static asked = 0;
  onload: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;

  set src(url: string) {
    ArrivingPicture.asked++;
    if (url.includes('broken')) return;
    queueMicrotask(() => {
      this.naturalWidth = 40;
      this.naturalHeight = 30;
      this.onload?.();
    });
  }
}

describe('PictureSizeService', () => {
  let sizes: PictureSizeService;

  beforeEach(() => {
    ArrivingPicture.asked = 0;
    vi.stubGlobal('Image', ArrivingPicture);
    sizes = TestBed.inject(PictureSizeService);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('knows a picture’s size once it has come, and says so by going up a version', async () => {
    const version = sizes.version();

    expect(sizes.sizeOf('blob:picture')).toBeNull();
    await Promise.resolve();

    expect(sizes.version()).toBe(version + 1);
    expect(sizes.sizeOf('blob:picture')).toEqual({ width: 40, height: 30 });
  });

  it('loads a picture once however often it is asked about, and knows nothing of one that never comes', async () => {
    sizes.sizeOf('blob:broken');
    sizes.sizeOf('blob:broken');
    await Promise.resolve();

    expect(sizes.sizeOf('blob:broken')).toBeNull();
    expect(ArrivingPicture.asked).toBe(1);
    expect(sizes.sizeOf('')).toBeNull();
  });
});
