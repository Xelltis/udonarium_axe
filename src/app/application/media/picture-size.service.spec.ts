import { TestBed } from '@angular/core/testing';
import { PictureSizeService } from '@axe/application/media/picture-size.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

/** A picture that comes in at once at the size its address says, or never for one that says none. */
class PictureStub {
  static made = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;

  constructor() {
    PictureStub.made++;
  }

  set src(url: string) {
    const [width, height] = url.split('x').map(Number);
    queueMicrotask(() => {
      if (width > 0 && height > 0) {
        this.naturalWidth = width;
        this.naturalHeight = height;
        this.onload?.();
      } else {
        this.onerror?.();
      }
    });
  }
}

describe('PictureSizeService', () => {
  let sizes: PictureSizeService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    vi.stubGlobal('Image', PictureStub);
    PictureStub.made = 0;
    sizes = TestBed.inject(PictureSizeService);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('reads a picture once for every caller, knowing its size only once it has come in', async () => {
    expect(sizes.sizeOf('1000x333')).toBeNull();
    const [first, second] = await Promise.all([sizes.read('1000x333'), sizes.read('1000x333')]);

    expect(first).toEqual({ width: 1000, height: 333 });
    expect(second).toBe(first);
    expect(sizes.sizeOf('1000x333')).toBe(first);
    expect(await sizes.read('1000x333')).toBe(first);
    expect(PictureStub.made).toBe(1);
  });

  it('measures nothing of a picture that will not load, nor of no address', async () => {
    expect(await sizes.read('broken')).toEqual({ width: 0, height: 0 });
    expect(sizes.sizeOf('')).toBeNull();
    expect(PictureStub.made).toBe(1);
  });
});
