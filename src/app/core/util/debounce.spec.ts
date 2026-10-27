import { coalesce, debounce } from '@axe/core/util/debounce';

describe('putting a call off', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('makes one call after a run of asks, once they have stopped for the wait', () => {
    const fn = vi.fn();
    const call = debounce(fn, 100);

    call();
    vi.advanceTimersByTime(60);
    call();
    vi.advanceTimersByTime(60);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(40);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('folds asks into the call the first of them started, so a steady stream still calls every wait', () => {
    const fn = vi.fn();
    const call = coalesce(fn, 100);

    call();
    vi.advanceTimersByTime(60);
    call();
    vi.advanceTimersByTime(40);
    expect(fn).toHaveBeenCalledTimes(1);

    call();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('drops a waiting call, or makes it at once', () => {
    const fn = vi.fn();
    const call = debounce(fn, 100);

    call();
    expect(call.pending()).toBe(true);
    call.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
    expect(call.pending()).toBe(false);

    call();
    call.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    call.flush();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
