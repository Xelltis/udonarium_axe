import { TestBed } from '@angular/core/testing';
import { SeeThroughService } from '@axe/application/ui/see-through.service';
import { AlphaMask } from '@axe/domain/ui/see-through';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

/** A picture 100 by 100 drawn at its own size: clear on its left half, solid on its right. */
const HALF_CLEAR: AlphaMask = { width: 2, height: 1, alpha: new Uint8Array([0, 255]) };

type Probe = { offsetOf(element: Element, x: number, y: number): { x: number; y: number } | null };
type Hit = { elementAt(x: number, y: number): Element | null };
type Reader = { read(picture: HTMLImageElement): AlphaMask | null };
type TouchSupport = { canForwardTouch(): boolean };

describe('SeeThroughService', () => {
  let service: SeeThroughService;
  let picture: HTMLImageElement;
  let read: ReturnType<typeof vi.fn<(picture: HTMLImageElement) => AlphaMask | null>>;

  function pictureOf(src: string): HTMLImageElement {
    const image = document.createElement('img');
    image.src = src;
    Object.defineProperty(image, 'complete', { value: true, configurable: true });
    Object.defineProperty(image, 'naturalWidth', { value: 100, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 100, configurable: true });
    Object.defineProperty(image, 'clientWidth', { value: 100, configurable: true });
    Object.defineProperty(image, 'clientHeight', { value: 100, configurable: true });
    document.body.appendChild(image);
    return image;
  }

  /** Has the screen point (x, y) fall at the same point of every element's box. */
  function probeAtScreen(): void {
    vi.spyOn(service as unknown as Probe, 'offsetOf').mockImplementation((_element, x, y) => ({ x, y }));
  }

  function moveMouse(x: number, y: number): void {
    document.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', clientX: x, clientY: y }));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(SeeThroughService);
    read = vi.fn<(picture: HTMLImageElement) => AlphaMask | null>(() => HALF_CLEAR);
    vi.spyOn(service as unknown as Reader, 'read').mockImplementation(read);
    picture = pictureOf('https://example.test/piece.png');
    service.watch(picture);
  });

  afterEach(() => {
    service.unwatch(picture);
    picture.remove();
    vi.restoreAllMocks();
  });

  it('opens a picture hovered over where it is clear, and leaves it whole where it is solid', () => {
    service.hover(picture, 80, 50);
    expect(service.isOpen(picture)).toBe(false);
    expect(picture.style.pointerEvents).toBe('');

    service.hover(picture, 20, 50);
    expect(service.isOpen(picture)).toBe(true);
    expect(picture.style.pointerEvents).toBe('none');
  });

  it('closes it again once the pointer moves onto the figure', () => {
    probeAtScreen();
    service.hover(picture, 20, 50);

    moveMouse(30, 50);
    expect(service.isOpen(picture)).toBe(true);

    moveMouse(80, 50);
    expect(service.isOpen(picture)).toBe(false);
    expect(picture.style.pointerEvents).toBe('');
  });

  it('closes it once the pointer leaves the picture altogether', () => {
    probeAtScreen();
    service.hover(picture, 20, 50);

    moveMouse(20, 140);

    expect(service.isOpen(picture)).toBe(false);
  });

  it('reads a picture once for every element that draws it', () => {
    const twin = pictureOf('https://example.test/piece.png');
    service.watch(twin);

    service.hover(picture, 20, 50);
    service.hover(twin, 20, 50);
    service.hover(picture, 30, 50);

    expect(read).toHaveBeenCalledTimes(1);
    service.unwatch(twin);
    twin.remove();
  });

  it('holds every press on a picture it may not read, as before', () => {
    read.mockReturnValue(null);

    service.hover(picture, 20, 50);

    expect(service.isOpen(picture)).toBe(false);
  });

  it('waits for a picture still loading rather than taking it as solid for good', () => {
    Object.defineProperty(picture, 'complete', { value: false, configurable: true });
    service.hover(picture, 20, 50);
    expect(service.isOpen(picture)).toBe(false);
    expect(read).not.toHaveBeenCalled();

    Object.defineProperty(picture, 'complete', { value: true, configurable: true });
    service.hover(picture, 20, 50);
    expect(service.isOpen(picture)).toBe(true);
  });

  it('leaves alone a picture it was not asked to watch', () => {
    const other = pictureOf('https://example.test/other.png');

    service.hover(other, 20, 50);

    expect(service.isOpen(other)).toBe(false);
    other.remove();
  });

  it('lets presses land on the whole picture again once it is no longer watched', () => {
    service.hover(picture, 20, 50);

    service.unwatch(picture);

    expect(picture.style.pointerEvents).toBe('');
    expect(service.isOpen(picture)).toBe(false);
  });

  describe('a touch on a clear part', () => {
    let beneath: HTMLElement;

    beforeEach(() => {
      vi.spyOn(service as unknown as TouchSupport, 'canForwardTouch').mockReturnValue(true);
      beneath = document.createElement('div');
      document.body.appendChild(beneath);
      vi.spyOn(service as unknown as Hit, 'elementAt').mockReturnValue(beneath);
    });

    afterEach(() => beneath.remove());

    function touchDown(target: Element, offsetX: number): PointerEvent {
      const press = new PointerEvent('pointerdown', {
        pointerType: 'touch',
        pointerId: 3,
        clientX: offsetX,
        clientY: 50,
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(press, 'offsetX', { value: offsetX });
      Object.defineProperty(press, 'offsetY', { value: 50 });
      target.dispatchEvent(press);
      return press;
    }

    it('hands the press to what is beneath, and keeps it from the picture', () => {
      const handedOn = vi.fn();
      const onPicture = vi.fn();
      beneath.addEventListener('pointerdown', handedOn);
      picture.addEventListener('pointerdown', onPicture);

      touchDown(picture, 20);

      expect(handedOn).toHaveBeenCalledTimes(1);
      expect((handedOn.mock.calls[0][0] as PointerEvent).pointerId).toBe(3);
      expect(onPicture).not.toHaveBeenCalled();
      expect(service.isOpen(picture)).toBe(true);
    });

    it('lets a touch on the figure land on the picture', () => {
      const handedOn = vi.fn();
      beneath.addEventListener('pointerdown', handedOn);

      touchDown(picture, 80);

      expect(handedOn).not.toHaveBeenCalled();
      expect(service.isOpen(picture)).toBe(false);
    });

    it('closes the picture a moment after the finger lifts', () => {
      vi.useFakeTimers();
      try {
        touchDown(picture, 20);

        document.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', pointerId: 3 }));
        expect(service.isOpen(picture)).toBe(true);

        vi.advanceTimersByTime(1000);
        expect(service.isOpen(picture)).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('leaves the touch on the picture in a browser that cannot make one to hand on', () => {
      vi.spyOn(service as unknown as TouchSupport, 'canForwardTouch').mockReturnValue(false);
      const onPicture = vi.fn();
      picture.addEventListener('pointerdown', onPicture);

      touchDown(picture, 20);

      expect(onPicture).toHaveBeenCalledTimes(1);
      expect(service.isOpen(picture)).toBe(false);
    });
  });
});
