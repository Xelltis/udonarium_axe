import { LogThrottle } from '@axe/core/logging/log-throttle';

describe('LogThrottle', () => {
  it('lets the first line of a key through, and holds the rest back until the interval has passed', () => {
    const throttle = new LogThrottle(1000);

    expect(throttle.pass('peer-a', 0)).toBe(0);
    expect(throttle.pass('peer-a', 10)).toBeNull();
    expect(throttle.pass('peer-a', 999)).toBeNull();
    expect(throttle.pass('peer-a', 1000)).toBe(2);
    expect(throttle.pass('peer-a', 1001)).toBeNull();
  });

  it('counts each key apart', () => {
    const throttle = new LogThrottle(1000);

    expect(throttle.pass('peer-a', 0)).toBe(0);
    expect(throttle.pass('peer-b', 1)).toBe(0);
  });

  it('writes at once again after a reset', () => {
    const throttle = new LogThrottle(1000);
    throttle.pass('peer-a', 0);
    throttle.pass('peer-b', 0);

    throttle.reset('peer-a');
    expect(throttle.pass('peer-a', 1)).toBe(0);
    expect(throttle.pass('peer-b', 1)).toBeNull();

    throttle.reset();
    expect(throttle.pass('peer-b', 2)).toBe(0);
  });
});
