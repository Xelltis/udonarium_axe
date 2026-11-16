import { PieceRightDrag, PieceRightDragHost } from '@axe/features/character/game-character/piece-right-drag';

describe('PieceRightDrag', () => {
  let target: HTMLElement;
  let drag: PieceRightDrag;

  beforeEach(() => {
    target = document.createElement('div');
    document.body.appendChild(target);
  });

  afterEach(() => {
    drag?.dispose();
    target.remove();
    vi.useRealTimers();
  });

  function setup(flat = true) {
    const host = {
      flat: vi.fn(() => flat),
      cancelTableGesture: vi.fn(),
      closeMenu: vi.fn(),
      openMenu: vi.fn(),
    } satisfies PieceRightDragHost;
    drag = new PieceRightDrag(host);
    return host;
  }

  /** A pointer event as the piece's element would be handed it. */
  function pointer(type: string, x: number, y: number, button = 2, pointerId = 1): PointerEvent {
    const event = new PointerEvent(type, {
      clientX: x,
      clientY: y,
      button,
      pointerId,
      cancelable: true,
      bubbles: true,
    });
    Object.defineProperty(event, 'currentTarget', { value: target });
    return event;
  }

  const marker = () => document.querySelector<HTMLElement>('[data-piece-right-drag-center]');

  it('opens the menu where a right-drag is let go, with a mark under the pointer on the way', () => {
    const host = setup();

    drag.down(pointer('pointerdown', 100, 100));
    expect(host.cancelTableGesture).toHaveBeenCalledTimes(1);

    drag.move(pointer('pointermove', 140, 120));
    expect(host.closeMenu).toHaveBeenCalledTimes(1);
    expect(marker()?.style.left).toBe('140px');
    expect(marker()?.style.top).toBe('120px');

    const release = pointer('pointerup', 160, 130);
    drag.up(release);

    expect(host.openMenu).toHaveBeenCalledWith({ x: 160, y: 130, z: 0 });
    expect(release.defaultPrevented).toBe(true);
    expect(marker()).toBeNull();
  });

  it('leaves a press let go where it was made to the browser', () => {
    const host = setup();

    drag.down(pointer('pointerdown', 100, 100));
    drag.move(pointer('pointermove', 102, 102));
    const release = pointer('pointerup', 102, 102);
    drag.up(release);

    expect(host.closeMenu).not.toHaveBeenCalled();
    expect(host.openMenu).not.toHaveBeenCalled();
    expect(release.defaultPrevented).toBe(false);
    expect(marker()).toBeNull();
  });

  it('follows nothing for another button, or where the table is not seen flat', () => {
    const left = setup();
    drag.down(pointer('pointerdown', 100, 100, 0));
    drag.move(pointer('pointermove', 200, 200, 0));
    drag.up(pointer('pointerup', 200, 200, 0));
    expect(left.cancelTableGesture).not.toHaveBeenCalled();
    expect(left.openMenu).not.toHaveBeenCalled();

    const tilted = setup(false);
    drag.down(pointer('pointerdown', 100, 100));
    drag.move(pointer('pointermove', 200, 200));
    drag.up(pointer('pointerup', 200, 200));
    expect(tilted.openMenu).not.toHaveBeenCalled();
  });

  it('pays no heed to another pointer while one is followed', () => {
    const host = setup();

    drag.down(pointer('pointerdown', 100, 100));
    drag.move(pointer('pointermove', 200, 200, 2, 7));
    drag.up(pointer('pointerup', 200, 200, 2, 7));

    expect(marker()).toBeNull();
    expect(host.openMenu).not.toHaveBeenCalled();
  });

  it('forgets a press the browser took away', () => {
    const host = setup();

    drag.down(pointer('pointerdown', 100, 100));
    drag.move(pointer('pointermove', 200, 200));
    drag.cancel(pointer('pointercancel', 200, 200));
    drag.up(pointer('pointerup', 200, 200));

    expect(marker()).toBeNull();
    expect(host.openMenu).not.toHaveBeenCalled();
  });

  it('keeps the browser from opening its own menu over the one it opened, for that release alone', () => {
    vi.useFakeTimers();
    setup();
    drag.down(pointer('pointerdown', 100, 100));
    drag.move(pointer('pointermove', 200, 200));
    drag.up(pointer('pointerup', 200, 200));

    const sameTask = new MouseEvent('contextmenu', { cancelable: true, bubbles: true });
    target.dispatchEvent(sameTask);
    expect(sameTask.defaultPrevented).toBe(true);

    const again = new MouseEvent('contextmenu', { cancelable: true, bubbles: true });
    target.dispatchEvent(again);
    expect(again.defaultPrevented).toBe(false);

    drag.down(pointer('pointerdown', 100, 100));
    drag.move(pointer('pointermove', 200, 200));
    drag.up(pointer('pointerup', 200, 200));
    vi.advanceTimersByTime(0);
    const later = new MouseEvent('contextmenu', { cancelable: true, bubbles: true });
    target.dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
  });

  it('takes the mark and the guard away as the piece leaves the table', () => {
    setup();
    drag.down(pointer('pointerdown', 100, 100));
    drag.move(pointer('pointermove', 200, 200));
    expect(marker()).not.toBeNull();

    drag.dispose();

    expect(marker()).toBeNull();
  });
});
