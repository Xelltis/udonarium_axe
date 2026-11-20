import { TestBed } from '@angular/core/testing';
import { CutInSizingService } from '@axe/application/media/cut-in-sizing.service';
import { PictureSizeService } from '@axe/application/media/picture-size.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { CutIn } from '@axe/domain/media/cut-in';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const VIDEO_URL = 'https://youtu.be/abcdEFGhij0';

describe('CutInSizingService', () => {
  let sizing: CutInSizingService;
  let own: Record<string, { width: number; height: number }>;
  let unread: Record<string, { width: number; height: number }>;

  /** A picture cut-in at the size given, showing the picture named, not at its own size. */
  function pictureCutIn(picture: string, width = 480, height = 320): CutIn {
    ImageStorage.instance.add(picture);
    const cutIn = new CutIn();
    cutIn.initialize();
    cutIn.originalSize = false;
    cutIn.imageIdentifier = picture;
    cutIn.setSize(width, height);
    return cutIn;
  }

  /** A video cut-in at the size given. */
  function videoCutIn(width: number, height: number): CutIn {
    const cutIn = new CutIn();
    cutIn.initialize();
    cutIn.originalSize = false;
    cutIn.isVideoCutIn = true;
    cutIn.videoUrl = VIDEO_URL;
    cutIn.setSize(width, height);
    return cutIn;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    own = {
      wide: { width: 1000, height: 333 },
      tall: { width: 100, height: 1000 },
      large: { width: 2400, height: 1600 },
    };
    unread = {};
    const pictures = TestBed.inject(PictureSizeService);
    vi.spyOn(pictures, 'sizeOf').mockImplementation((url) => own[url] ?? null);
    vi.spyOn(pictures, 'read').mockImplementation(async (url) => {
      own[url] = unread[url];
      return own[url];
    });
    sizing = TestBed.inject(CutInSizingService);
  });

  it('keeps the aspect of a video and of a picture by their own proportions, never the size they have', () => {
    const video = videoCutIn(800, 300);
    const picture = pictureCutIn('tall');

    sizing.keepAspect(video, true);
    sizing.keepAspect(picture, true);
    sizing.resize(picture, 'width', 300);

    expect([video.width, video.height]).toEqual([800, 450]);
    expect([picture.width, picture.height]).toEqual([120, 1200]);
  });

  it('sizes a picture not read yet once it is, while the cut-in still asks for it', async () => {
    unread['late'] = { width: 400, height: 200 };
    unread['dropped'] = { width: 400, height: 200 };
    const kept = pictureCutIn('late');
    const dropped = pictureCutIn('dropped');

    sizing.keepAspect(kept, true);
    sizing.keepAspect(dropped, true);
    sizing.keepAspect(dropped, false);
    expect([kept.width, kept.height]).toEqual([480, 320]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect([kept.width, kept.height]).toEqual([480, 240]);
    expect([dropped.width, dropped.height]).toEqual([480, 320]);
  });

  it('sizes a cut-in turned into a video to a video’s default, and one turned back to its picture', () => {
    const cutIn = pictureCutIn('wide');

    sizing.changeKind(cutIn, () => {
      cutIn.isVideoCutIn = true;
      cutIn.videoUrl = VIDEO_URL;
    });
    expect([cutIn.width, cutIn.height]).toEqual([640, 360]);

    sizing.changeKind(cutIn, () => (cutIn.isVideoCutIn = false));
    expect([cutIn.width, cutIn.height]).toEqual([1000, 333]);
  });

  it('sizes a cut-in to its own size at original size, past its bounds', () => {
    const cutIn = pictureCutIn('large');

    sizing.setOriginalSize(cutIn, true);

    expect([cutIn.width, cutIn.height]).toEqual([2400, 1600]);
  });

  it('sizes a new picture as the cut-in asks: at its own size, at its proportions, or not at all', () => {
    const original = pictureCutIn('wide');
    original.originalSize = true;
    const kept = pictureCutIn('wide');
    kept.keepImageAspect = true;
    const free = pictureCutIn('wide');

    for (const cutIn of [original, kept, free]) sizing.setPicture(cutIn, 'tall');

    expect([original.width, original.height]).toEqual([100, 1000]);
    expect([kept.width, kept.height]).toEqual([120, 1200]);
    expect([free.width, free.height, free.imageIdentifier]).toEqual([480, 320, 'tall']);
  });
});
