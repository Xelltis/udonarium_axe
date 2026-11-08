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
