import { DoubleTap } from '@axe/ui/tabletop/double-tap';

function input(x = 0, y = 0) {
  return { pointer: { x, y }, onEnd: null as ((event: MouseEvent | TouchEvent) => void) | null };
}

const mouse = new MouseEvent('mousedown');
const touch = { touches: [{}] } as unknown as TouchEvent;

describe('DoubleTap', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does nothing on the first tap', () => {
    const tap = new DoubleTap(() => input());
    const run = vi.fn();

    tap.handle(mouse, run);

    expect(run).not.toHaveBeenCalled();
  });

  it('acts on the second click straight away', () => {
    const tap = new DoubleTap(() => input());
    const run = vi.fn();

    tap.handle(mouse, run);
    tap.handle(mouse, run);

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('counts no press of another button, which opens a menu or turns the table', () => {
    const tap = new DoubleTap(() => input());
    const run = vi.fn();
    const right = new MouseEvent('mousedown', { button: 2 });
    const middle = new MouseEvent('mousedown', { button: 1 });

    tap.handle(right, run);
    tap.handle(right, run);
    tap.handle(middle, run);
    tap.handle(middle, run);

    expect(run).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves a first click waiting through a press of another button', () => {
    const tap = new DoubleTap(() => input());
    const run = vi.fn();

    tap.handle(mouse, run);
    tap.handle(new MouseEvent('mousedown', { button: 2 }), run);
    expect(run).not.toHaveBeenCalled();

    tap.handle(mouse, run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('waits for the finger to lift on the second tap', () => {
    // Acting on the press would turn a finger meant to flip a card into a drag.
    const held = input();
    const tap = new DoubleTap(() => held);
    const run = vi.fn();

    tap.handle(touch, run);
    tap.handle(touch, run);
    expect(run).not.toHaveBeenCalled();

    held.onEnd?.(touch);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('starts over once the window has passed', () => {
    const tap = new DoubleTap(() => input());
    const run = vi.fn();

    tap.handle(mouse, run);
    vi.advanceTimersByTime(301);
    tap.handle(mouse, run);

    expect(run).not.toHaveBeenCalled();
  });

  it('waits longer for a finger than for a mouse', () => {
    // An interval too long for a mouse still counts as a second tap from a finger.
    const held = input();
    const tap = new DoubleTap(() => held);
    const run = vi.fn();

    tap.handle(touch, run);
    vi.advanceTimersByTime(301);
    tap.handle(touch, run);
    held.onEnd?.(touch);

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not call a distant second tap the same place', () => {
    const held = input(0, 0);
    const tap = new DoubleTap(() => held);

    tap.handle(mouse, () => undefined);
    held.pointer = { x: 40, y: 0 };

    expect(tap.isInPlace()).toBe(false);
  });

  it('forgives a small wobble as the same place', () => {
    const held = input(0, 0);
    const tap = new DoubleTap(() => held);

    tap.handle(mouse, () => undefined);
    held.pointer = { x: 3, y: 3 };

    expect(tap.isInPlace()).toBe(true);
  });

  it('drops the pending release when cancelled', () => {
    const held = input();
    const tap = new DoubleTap(() => held);
    const run = vi.fn();

    tap.handle(touch, run);
    tap.handle(touch, run);
    tap.cancel();

    expect(held.onEnd).toBeNull();
  });

  it('forgets the first tap when cancelled, so the next one counts as a first', () => {
    const tap = new DoubleTap(() => input());
    const run = vi.fn();

    tap.handle(mouse, run);
    tap.cancel();
    tap.handle(mouse, run);

    expect(run).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
  });

  it('leaves no timer waiting once cancelled', () => {
    const tap = new DoubleTap(() => input());

    tap.handle(mouse, () => undefined);
    tap.cancel();

    expect(vi.getTimerCount()).toBe(0);
  });
});
