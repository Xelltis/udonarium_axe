describe('vi.waitFor in these specs', () => {
  /** How long after the wait began, by a fake clock, each look of a wait that passes on its third look came. */
  async function looksOfWait(options?: number | { interval?: number }): Promise<number[]> {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const start = Date.now();
      const looks: number[] = [];
      await vi.waitFor(() => {
        looks.push(Date.now() - start);
        expect(looks).toHaveLength(3);
      }, options);
      return looks;
    } finally {
      vi.useRealTimers();
    }
  }

  it('waits longer than a second for a wait that names no time', async () => {
    const start = Date.now();

    await vi.waitFor(() => expect(Date.now() - start).toBeGreaterThan(1500));
  });

  it('keeps the time a wait names', async () => {
    await expect(vi.waitFor(() => expect(false).toBe(true), { timeout: 50 })).rejects.toThrow();
  });

  it('looks again every millisecond for a wait that names no interval, moving a fake clock on by as much', async () => {
    expect(await looksOfWait()).toEqual([1, 2, 3]);
    expect(await looksOfWait(5_000)).toEqual([1, 2, 3]);
  });

  it('keeps the interval a wait names', async () => {
    expect(await looksOfWait({ interval: 20 })).toEqual([20, 40, 60]);
  });
});
