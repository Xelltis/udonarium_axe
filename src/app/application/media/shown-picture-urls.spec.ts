import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShownPictureUrls } from '@axe/application/media/shown-picture-urls';
import { ImageFile } from '@axe/core/storage/image-file';

/** A picture held here in full under an identifier, shown from the URL given. */
function held(identifier: string, url: string): ImageFile {
  return ImageFile.create({
    identifier,
    name: `${identifier}.png`,
    type: 'image/png',
    blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
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

  it('shows a picture held here from a URL of the showing’s own, the same each time, and another for another showing', () => {
    const made = vi.spyOn(URL, 'createObjectURL');
    const picture = held('hero', 'blob:held');
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

  it('lets go of the URLs it made once the showing ends', () => {
    const letGo = vi.spyOn(URL, 'revokeObjectURL');
    const { urls, end } = showing();
    const url = urls.urlOf(held('hero', 'blob:held'));

    end();

    expect(letGo).toHaveBeenCalledWith(url);
  });

  it('shows a picture whose bytes are not held here from its own URL, and nothing for none', () => {
    const { urls, end } = showing();

    expect(urls.urlOf(ImageFile.create('assets/images/hero.png'))).toBe('assets/images/hero.png');
    expect(urls.urlOf(null)).toBe('');
    end();
  });
});
