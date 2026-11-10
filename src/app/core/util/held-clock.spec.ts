import { HeldClock, LONG_FRAME_MS } from '@axe/core/util/held-clock';
import { describe, expect, it } from 'vitest';

describe('HeldClock', () => {
  function framesOf(clock: HeldClock, from: number, count: number, waitMs: number): number {
    let at = from;
    for (let frame = 0; frame < count; frame++) {
      at += waitMs;
      clock.read(at);
    }
    return at;
  }

  it('runs on with the frames as they come', () => {
    const clock = new HeldClock(1000);
    const at = framesOf(clock, 1000, 30, 16);

    expect(clock.read(at + LONG_FRAME_MS)).toEqual({ elapsed: at + LONG_FRAME_MS - 1000, held: false });
  });

  it('stands still over a long wait between smooth frames, counting it as about one frame', () => {
    const clock = new HeldClock(1000);
    const at = framesOf(clock, 1000, 30, 16);

    const after = clock.read(at + 2000);

    expect(after.held).toBe(true);
    expect(after.elapsed).toBeGreaterThan(at - 1000);
    expect(after.elapsed).toBeLessThan(at - 1000 + 20);
  });

  it('plays on in time on a page slow all along, holding only its first frames', () => {
    const clock = new HeldClock(1000);
    const at = framesOf(clock, 1000, 10, 1000);

    const next = clock.read(at + 1000);

    expect(next.held).toBe(false);
    expect(next.elapsed).toBeGreaterThan(at + 1000 - 1000 - 2000);
  });

  it('counts in full a wait while the page was out of view', () => {
    const clock = new HeldClock(1000);
    const at = framesOf(clock, 1000, 30, 16);
    clock.leftView();

    expect(clock.read(at + 4000)).toEqual({ elapsed: at + 4000 - 1000, held: false });
  });
});
