import { delay } from '@axe/core/util/delay';

describe('delay()', () => {
  afterEach(() => vi.useRealTimers());

  it('resolves once the time has passed', async () => {
    vi.useFakeTimers();
    let done = false;
    void delay(100).then(() => (done = true));

    await vi.advanceTimersByTimeAsync(99);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });
});
