import type { MarqueeRect } from '@axe/application/ui/selection-signal.service';
import {
  MARQUEE_MOUSE_LONG_PRESS_MS,
  MARQUEE_MOVE_CANCEL_THRESHOLD_PX,
  MARQUEE_TOUCH_LONG_PRESS_MS,
  MarqueeModifiers,
  MarqueePoint,
  TableMarqueeGesture,
} from '@axe/features/tabletop/game-table/table-marquee-gesture';

const identityScreenToTable = (x: number, y: number): MarqueePoint => ({ x, y });

function makeEvent(
  opts: {
    button?: number;
    clientX?: number;
    clientY?: number;
    pointerType?: string;
    ctrl?: boolean;
    shift?: boolean;
    meta?: boolean;
    alt?: boolean;
    timeStamp?: number;
  } = {}
): PointerEvent {
  return {
    timeStamp: opts.timeStamp ?? 0,
    button: opts.button ?? 0,
    clientX: opts.clientX ?? 0,
    clientY: opts.clientY ?? 0,
    pageX: opts.clientX ?? 0,
    pageY: opts.clientY ?? 0,
    pointerType: opts.pointerType ?? 'mouse',
    ctrlKey: opts.ctrl ?? false,
    shiftKey: opts.shift ?? false,
    metaKey: opts.meta ?? false,
    altKey: opts.alt ?? false,
  } as unknown as PointerEvent;
}

describe('TableMarqueeGesture', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts a marquee once the mouse has been held down long enough', () => {
    const gesture = new TableMarqueeGesture(identityScreenToTable);
    const start = vi.fn<(p: MarqueePoint, m: MarqueeModifiers) => void>();
    gesture.onMarqueeStart = start;

    const armed = gesture.arm(makeEvent({ clientX: 10, clientY: 20 }));
    expect(armed).toBe(true);
    expect(gesture.isArmed).toBe(true);
    expect(gesture.isActive).toBe(false);

    vi.advanceTimersByTime(MARQUEE_MOUSE_LONG_PRESS_MS);

    expect(gesture.isActive).toBe(true);
    expect(start).toHaveBeenCalledWith({ x: 10, y: 20 }, { shift: false, ctrl: false, touch: false });
  });

  it('marks a marquee started by touch as such', () => {
    const gesture = new TableMarqueeGesture(identityScreenToTable);
    const start = vi.fn();
    const end = vi.fn();
    gesture.onMarqueeStart = start;
    gesture.onMarqueeEnd = end;

    gesture.arm(makeEvent({ clientX: 10, clientY: 20, pointerType: 'touch' }));
    vi.advanceTimersByTime(MARQUEE_TOUCH_LONG_PRESS_MS);
    gesture.updatePointer(50, 80);
    gesture.release(makeEvent({ pointerType: 'touch' }));

    expect(start).toHaveBeenCalledWith({ x: 10, y: 20 }, { shift: false, ctrl: false, touch: true });
    expect(end).toHaveBeenCalledWith({ x1: 10, y1: 20, x2: 50, y2: 80 }, { shift: false, ctrl: false, touch: true });
  });

  it('starts sooner from a touch than from the mouse', () => {
    const gesture = new TableMarqueeGesture(identityScreenToTable);
    const start = vi.fn();
    gesture.onMarqueeStart = start;

    expect(MARQUEE_TOUCH_LONG_PRESS_MS).toBeLessThan(MARQUEE_MOUSE_LONG_PRESS_MS);

    gesture.arm(makeEvent({ pointerType: 'touch' }));
    vi.advanceTimersByTime(MARQUEE_TOUCH_LONG_PRESS_MS - 1);
    expect(start).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(start).toHaveBeenCalled();
  });

  it('counts as under way only once the pointer moves', () => {
    const gesture = new TableMarqueeGesture(identityScreenToTable);
    gesture.arm(makeEvent({ clientX: 10, clientY: 20, pointerType: 'touch' }));
    vi.advanceTimersByTime(MARQUEE_TOUCH_LONG_PRESS_MS);

    expect(gesture.isDragging).toBe(false);

    gesture.updatePointer(60, 20);
    expect(gesture.isDragging).toBe(true);
  });

  it('arms nothing from any button but the first', () => {
    const gesture = new TableMarqueeGesture(identityScreenToTable);
    expect(gesture.arm(makeEvent({ button: 2 }))).toBe(false);
    expect(gesture.isArmed).toBe(false);
  });

  it('arms nothing while a modifier is held', () => {
    const gesture = new TableMarqueeGesture(identityScreenToTable);
    expect(gesture.arm(makeEvent({ ctrl: true }))).toBe(false);
    expect(gesture.arm(makeEvent({ meta: true }))).toBe(false);
    expect(gesture.arm(makeEvent({ alt: true }))).toBe(false);
  });

  it('disarms on a move past the threshold', () => {
    const gesture = new TableMarqueeGesture(identityScreenToTable);
    const start = vi.fn();
    gesture.onMarqueeStart = start;
    gesture.arm(makeEvent({ clientX: 0, clientY: 0 }));

    gesture.updatePointer(MARQUEE_MOVE_CANCEL_THRESHOLD_PX + 1, 0);
    expect(gesture.isArmed).toBe(false);

    vi.advanceTimersByTime(MARQUEE_MOUSE_LONG_PRESS_MS);
    expect(start).not.toHaveBeenCalled();
  });

  /** A gesture on a page whose own clock reads what is set on it. */
  function onClock(): { gesture: TableMarqueeGesture; clock: { now: number } } {
    const clock = { now: 1000 };
    return { gesture: new TableMarqueeGesture(identityScreenToTable, () => clock.now), clock };
  }

  const WHOLE = { pointerType: 'mouse', whole: true };
  const LAST_ONLY = { pointerType: 'mouse', whole: false };

  it('opens at a place the pointer was at once the press had been held long enough, seen only after the wait was up', () => {
    const { gesture, clock } = onClock();
    const start = vi.fn<(p: MarqueePoint, m: MarqueeModifiers) => void>();
    const update = vi.fn<(p: MarqueePoint) => void>();
    gesture.onMarqueeStart = start;
    gesture.onMarqueeUpdate = update;
    gesture.arm(makeEvent({ clientX: 10, clientY: 20, timeStamp: 1000 }));
    clock.now = 1000 + MARQUEE_MOUSE_LONG_PRESS_MS + 100;

    gesture.follow(
      [
        { x: 12, y: 21, at: 1100 },
        { x: 13, y: 22, at: 1000 + MARQUEE_MOUSE_LONG_PRESS_MS + 10 },
        { x: 110, y: 80, at: 1000 + MARQUEE_MOUSE_LONG_PRESS_MS + 50 },
      ],
      WHOLE
    );
    gesture.updatePointer(110, 80);

    expect(gesture.isActive).toBe(true);
    expect(start).toHaveBeenCalledWith({ x: 10, y: 20 }, { shift: false, ctrl: false, touch: false });
    expect(update).toHaveBeenLastCalledWith({ x: 110, y: 80 });
    vi.advanceTimersByTime(MARQUEE_MOUSE_LONG_PRESS_MS);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('is called off by the pointer straying before the wait was up, seen only after it was', () => {
    const { gesture, clock } = onClock();
    const start = vi.fn();
    gesture.onMarqueeStart = start;
    gesture.arm(makeEvent({ clientX: 10, clientY: 20, timeStamp: 1000 }));
    clock.now = 1000 + MARQUEE_MOUSE_LONG_PRESS_MS + 100;

    gesture.follow(
      [
        { x: 10 + MARQUEE_MOVE_CANCEL_THRESHOLD_PX + 4, y: 20, at: 1080 },
        { x: 110, y: 80, at: 1000 + MARQUEE_MOUSE_LONG_PRESS_MS + 50 },
      ],
      WHOLE
    );
    gesture.updatePointer(110, 80);
    vi.advanceTimersByTime(MARQUEE_MOUSE_LONG_PRESS_MS);

    expect(gesture.isArmed).toBe(false);
    expect(gesture.isActive).toBe(false);
    expect(start).not.toHaveBeenCalled();
  });

  it('takes a far place for a stray where it is the only one known, though it came after the wait was up', () => {
    const { gesture, clock } = onClock();
    gesture.arm(makeEvent({ clientX: 10, clientY: 20, timeStamp: 1000 }));
    clock.now = 1000 + MARQUEE_MOUSE_LONG_PRESS_MS + 100;

    gesture.follow([{ x: 110, y: 80, at: 1000 + MARQUEE_MOUSE_LONG_PRESS_MS + 50 }], LAST_ONLY);

    expect(gesture.isArmed).toBe(false);
    expect(gesture.isActive).toBe(false);
  });

  it('opens on the only place known where it is still close, once the wait was up', () => {
    const { gesture, clock } = onClock();
    gesture.arm(makeEvent({ clientX: 10, clientY: 20, timeStamp: 1000 }));
    clock.now = 1000 + MARQUEE_MOUSE_LONG_PRESS_MS + 100;

    gesture.follow([{ x: 12, y: 21, at: 1000 + MARQUEE_MOUSE_LONG_PRESS_MS + 50 }], LAST_ONLY);

    expect(gesture.isActive).toBe(true);
  });

  it('heeds only the kind of pointer the press was made with', () => {
    const { gesture, clock } = onClock();
    gesture.arm(makeEvent({ clientX: 10, clientY: 20, timeStamp: 1000 }));
    clock.now = 1000 + MARQUEE_MOUSE_LONG_PRESS_MS + 100;

    gesture.follow([{ x: 400, y: 300, at: 1100 }], { pointerType: 'touch', whole: true });

    expect(gesture.isArmed).toBe(true);
  });

  it("waits on the page's own clock too, which a clock held still does not move on", () => {
    const { gesture } = onClock();
    gesture.arm(makeEvent({ clientX: 10, clientY: 20, timeStamp: 1000 }));

    gesture.follow([{ x: 12, y: 21, at: 1000 + MARQUEE_MOUSE_LONG_PRESS_MS + 50 }], WHOLE);
    const released = gesture.release(
      makeEvent({ clientX: 12, clientY: 21, timeStamp: 1000 + MARQUEE_MOUSE_LONG_PRESS_MS + 80 })
    );

    expect(gesture.isActive).toBe(false);
    expect(released).toBe(false);
  });

  it('opens and closes on a press let go where it was made once it had been held long enough, seen only after the wait was up', () => {
    const { gesture, clock } = onClock();
    const end = vi.fn<(r: MarqueeRect, m: MarqueeModifiers) => void>();
    gesture.onMarqueeEnd = end;
    gesture.arm(makeEvent({ clientX: 10, clientY: 20, timeStamp: 1000 }));
    clock.now = 1000 + MARQUEE_MOUSE_LONG_PRESS_MS + 100;

    const released = gesture.release(
      makeEvent({ clientX: 10, clientY: 20, timeStamp: 1000 + MARQUEE_MOUSE_LONG_PRESS_MS + 50 })
    );

    expect(released).toBe(true);
    expect(end).toHaveBeenCalledWith({ x1: 10, y1: 20, x2: 10, y2: 20 }, { shift: false, ctrl: false, touch: false });
  });

  it('takes a press let go before it had been held long enough for no marquee', () => {
    const { gesture, clock } = onClock();
    const end = vi.fn();
    gesture.onMarqueeEnd = end;
    gesture.arm(makeEvent({ clientX: 10, clientY: 20, timeStamp: 1000 }));
    clock.now = 1000 + MARQUEE_MOUSE_LONG_PRESS_MS + 100;

    expect(gesture.release(makeEvent({ timeStamp: 1000 + MARQUEE_MOUSE_LONG_PRESS_MS - 50 }))).toBe(false);
    expect(end).not.toHaveBeenCalled();
  });

  it('reports each move once it has started', () => {
    const gesture = new TableMarqueeGesture(identityScreenToTable);
    const update = vi.fn();
    gesture.onMarqueeUpdate = update;
    gesture.arm(makeEvent({ clientX: 10, clientY: 20 }));
    vi.advanceTimersByTime(MARQUEE_MOUSE_LONG_PRESS_MS);

    gesture.updatePointer(50, 80);
    expect(update).toHaveBeenCalledWith({ x: 50, y: 80 });
  });

  it('reports the rectangle and the modifiers held at the release', () => {
    const gesture = new TableMarqueeGesture(identityScreenToTable);
    const end = vi.fn<(r: MarqueeRect, m: MarqueeModifiers) => void>();
    gesture.onMarqueeEnd = end;
    gesture.arm(makeEvent({ clientX: 10, clientY: 20 }));
    vi.advanceTimersByTime(MARQUEE_MOUSE_LONG_PRESS_MS);
    gesture.updatePointer(50, 80);

    const released = gesture.release(makeEvent({ shift: true }));
    expect(released).toBe(true);
    expect(end).toHaveBeenCalledWith({ x1: 10, y1: 20, x2: 50, y2: 80 }, { shift: true, ctrl: false, touch: false });
    expect(gesture.isActive).toBe(false);
  });

  it('reports nothing from a release before it started', () => {
    const gesture = new TableMarqueeGesture(identityScreenToTable);
    const end = vi.fn();
    gesture.onMarqueeEnd = end;
    gesture.arm(makeEvent());

    expect(gesture.release(makeEvent())).toBe(false);
    expect(end).not.toHaveBeenCalled();
    expect(gesture.isArmed).toBe(false);
  });

  it('stops the timer on cancel and never starts', () => {
    const gesture = new TableMarqueeGesture(identityScreenToTable);
    const start = vi.fn();
    gesture.onMarqueeStart = start;
    gesture.arm(makeEvent());
    gesture.cancel();
    vi.advanceTimersByTime(MARQUEE_MOUSE_LONG_PRESS_MS);
    expect(start).not.toHaveBeenCalled();
  });
});
