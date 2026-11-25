import { computed, createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShownPictureUrls } from '@axe/application/media/shown-picture-urls';
import { blobMoves } from '@axe/core/storage/animated-image';
import { ImageFile } from '@axe/core/storage/image-file';
import { movingPngBlob } from '@axe/testing/moving-picture-blob';

/** A moving picture held here in full under an identifier, shown from the URL given, once told it moves. */
async function held(identifier: string, url: string): Promise<ImageFile> {
  const blob = movingPngBlob();
  await blobMoves(blob);
  return ImageFile.create({
    identifier,
    name: `${identifier}.png`,
    type: 'image/png',
    blob,
    url,
    thumbnail: { type: '', blob: null, url: '' },
  });
}

describe('ShownPictureUrls', () => {
  afterEach(() => vi.restoreAllMocks());

  function showing(): { urls: ShownPictureUrls; end: () => void } {
    const injector = createEnvironmentInjector([ShownPictureUrls], TestBed.inject(EnvironmentInjector));
    return { urls: injector.get(ShownPictureUrls), end: () => injector.destroy() };
  }

  it('shows a picture held here from a URL of the showing’s own, the same each time, and another for another showing', async () => {
    const made = vi.spyOn(URL, 'createObjectURL');
    const picture = await held('hero', 'blob:held');
    const first = showing();
    const second = showing();

    const url = first.urls.urlOf(picture);

    expect(url).not.toBe('blob:held');
    expect(first.urls.urlOf(picture)).toBe(url);
    expect(second.urls.urlOf(picture)).not.toBe(url);
    expect(made).toHaveBeenCalledTimes(2);
    first.end();
    second.end();
  });

  it('lets go of the URLs it made once the showing ends', async () => {
    const letGo = vi.spyOn(URL, 'revokeObjectURL');
    const { urls, end } = showing();
    const url = urls.urlOf(await held('hero', 'blob:held'));

    end();

    expect(letGo).toHaveBeenCalledWith(url);
  });

  it('shows a picture whose bytes are not held here from its own URL, and nothing for none', () => {
    const { urls, end } = showing();

    expect(urls.urlOf(ImageFile.create('assets/images/hero.png'))).toBe('assets/images/hero.png');
    expect(urls.urlOf(null)).toBe('');
    end();
  });

  it('gives the full bytes a URL of their own once they come after the thumbnail, letting go of the thumbnail’s', async () => {
    const letGo = vi.spyOn(URL, 'revokeObjectURL');
    const [thumbBlob, fullBlob] = [movingPngBlob(), movingPngBlob()];
    await Promise.all([blobMoves(thumbBlob), blobMoves(fullBlob)]);
    const picture = ImageFile.create({
      identifier: 'late',
      name: 'late.png',
      type: '',
      blob: null,
      url: '',
      thumbnail: { type: 'image/png', blob: thumbBlob, url: 'blob:thumb' },
    });
    const { urls, end } = showing();
    const thumbnail = urls.urlOf(picture);

    picture.apply({
      identifier: 'late',
      name: 'late.png',
      type: 'image/png',
      blob: fullBlob,
      url: 'blob:full',
      thumbnail: { type: '', blob: null, url: '' },
    });
    const full = urls.urlOf(picture);

    expect(full).not.toBe(thumbnail);
    expect(letGo).toHaveBeenCalledWith(thumbnail);
    end();
  });

  it('shows a picture that stands still from its own URL, so it is not read again for each showing', async () => {
    const { urls, end } = showing();
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' });
    await blobMoves(blob);
    const still = ImageFile.create({
      identifier: 'still',
      name: 'still.png',
      type: 'image/png',
      blob,
      url: 'blob:still',
      thumbnail: { type: '', blob: null, url: '' },
    });

    expect(urls.urlOf(still)).toBe('blob:still');
    end();
  });

  it('shows a picture not yet told to move from its own URL, and from one of the showing’s own once it is', async () => {
    const { urls, end } = showing();
    const blob = movingPngBlob();
    const picture = ImageFile.create({
      identifier: 'untold',
      name: 'untold.png',
      type: 'image/png',
      blob,
      url: 'blob:untold',
      thumbnail: { type: '', blob: null, url: '' },
    });
    const shown = computed(() => urls.urlOf(picture));
    expect(shown()).toBe('blob:untold');

    await blobMoves(blob);
    await Promise.resolve();

    expect(shown()).not.toBe('blob:untold');
    end();
  });

  it('shows a picture of a kind that never moves from its own URL, as a JPEG', () => {
    const { urls, end } = showing();
    const photo = ImageFile.create({
      identifier: 'photo',
      name: 'photo.jpg',
      type: 'image/jpeg',
      blob: new Blob([new Uint8Array([1])], { type: 'image/jpeg' }),
      url: 'blob:photo',
      thumbnail: { type: '', blob: null, url: '' },
    });

    expect(urls.urlOf(photo)).toBe('blob:photo');
    end();
  });

  it('gives the pictures URLs of their own again for each showing named, and for each one begun, letting go of the last', async () => {
    const letGo = vi.spyOn(URL, 'revokeObjectURL');
    const picture = await held('hero', 'blob:held');
    const { urls, end } = showing();
    const first = urls.urlOf(picture, 1);

    const second = urls.urlOf(picture, 2);
    expect(second).not.toBe(first);
    expect(letGo).toHaveBeenCalledWith(first);

    urls.beginShowing();
    const third = urls.urlOf(picture, 2);
    expect(third).not.toBe(second);
    expect(letGo).toHaveBeenCalledWith(second);
    end();
  });
});
