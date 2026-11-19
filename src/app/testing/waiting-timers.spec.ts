import { callOffWaitingTimers } from '@axe/testing/waiting-timers';

const moment = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('the timers a file leaves waiting', () => {
  it('calls off a timer, a repeating timer and an animation frame nobody cleared', async () => {
    const went = vi.fn();
    setTimeout(went, 5);
    setInterval(went, 5);
    requestAnimationFrame(went);

    callOffWaitingTimers();
    await moment(40);

    expect(went).not.toHaveBeenCalled();
  });

  it('leaves a timer set after the call to go off', async () => {
    callOffWaitingTimers();
    const went = vi.fn();
    setTimeout(went, 5);

    await moment(40);

    expect(went).toHaveBeenCalledTimes(1);
  });

  it('hands a timer its arguments and the caller its handle, as the real functions do', async () => {
    const went = vi.fn();
    const handle = setTimeout(went, 5, 'first', 2);
    const cleared = setTimeout(went, 5, 'cleared');
    clearTimeout(cleared);

    await moment(40);

    expect(handle).toBeDefined();
    expect(went.mock.calls).toEqual([['first', 2]]);
  });

  it('leaves a timer of a fake clock to the clock', () => {
    vi.useFakeTimers();
    try {
      const went = vi.fn();
      setTimeout(went, 5);

      callOffWaitingTimers();
      vi.advanceTimersByTime(5);

      expect(went).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
