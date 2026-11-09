import { pictureOfElement } from '@axe/infrastructure/image/element-picture';

describe('picturing an element of the page', () => {
  let element: HTMLElement;

  beforeEach(() => {
    element = document.createElement('div');
    element.innerHTML = '<i class="material-icons">lightbulb</i>';
    document.body.appendChild(element);
  });

  afterEach(() => {
    element.remove();
    delete (document as { fonts?: unknown }).fonts;
    vi.restoreAllMocks();
  });

  it('reads how the element is laid out only once the fonts the page is loading have come', async () => {
    let settle!: () => void;
    const ready = new Promise<void>((resolve) => (settle = resolve));
    Object.defineProperty(document, 'fonts', { configurable: true, value: { status: 'loading', ready } });
    const read = vi.spyOn(window, 'getComputedStyle');

    const taking = pictureOfElement(element, { left: 0, top: 0, width: 36, height: 36 });
    await Promise.resolve();
    await Promise.resolve();
    expect(read).not.toHaveBeenCalled();

    settle();
    await taking;
    expect(read).toHaveBeenCalledWith(element);
  });

  it('has every image in the picture read before it is drawn, none left to load later', async () => {
    element.innerHTML = '<img src="data:image/png;base64,AAAA" loading="lazy" alt="" /><p>words</p>';
    let drawn = '';
    vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementation(function (this: HTMLImageElement) {
      drawn = decodeURIComponent(this.src);
      return Promise.reject(new Error('not drawn here'));
    });

    await pictureOfElement(element, { left: 0, top: 0, width: 36, height: 36 });

    const image = /<img [^>]*>/.exec(drawn)?.[0] ?? '';
    expect(image).toContain('decoding="sync"');
    expect(image).not.toContain('loading=');
  });

  it('lays the copy out at the size of the region, to be drawn finer only onto the canvas', async () => {
    let drawn = '';
    vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementation(function (this: HTMLImageElement) {
      drawn = decodeURIComponent(this.src);
      return Promise.reject(new Error('not drawn here'));
    });

    await pictureOfElement(element, { left: 0, top: 0, width: 36, height: 24 });

    const svg = /<svg [^>]*>/.exec(drawn)?.[0] ?? '';
    expect(svg).toContain('width="36"');
    expect(svg).toContain('height="24"');
    expect(svg).not.toContain('viewBox');
  });

  it('reads it at once where no font is loading', async () => {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { status: 'loaded', ready: new Promise<void>(() => undefined) },
    });
    const read = vi.spyOn(window, 'getComputedStyle');

    await pictureOfElement(element, { left: 0, top: 0, width: 36, height: 36 });

    expect(read).toHaveBeenCalledWith(element);
  });
});
