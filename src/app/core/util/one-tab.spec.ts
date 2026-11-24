import { inOneTab } from '@axe/core/util/one-tab';

/** A browser's locks shared by its tabs, as far as a lock asked for if it is free goes. */
function sharedLocks(): LockManager {
  const held = new Set<string>();
  return {
    request: (async (name: string, _options: LockOptions, run: (lock: Lock | null) => Promise<void>) => {
      if (held.has(name)) return run(null);
      held.add(name);
      try {
        return await run({ name, mode: 'exclusive' } as Lock);
      } finally {
        held.delete(name);
      }
    }) as LockManager['request'],
    query: async () => ({}),
  };
}

describe('inOneTab', () => {
  afterEach(() => vi.useRealTimers());

  it('runs in the first tab to come alone, while it keeps the lock, and in a tab coming after it lets go', async () => {
    vi.useFakeTimers();
    const locks = sharedLocks();
    const ran: string[] = [];

    inOneTab('reveal', 1000, () => ran.push('a'), locks);
    inOneTab('reveal', 1000, () => ran.push('b'), locks);
    await vi.advanceTimersByTimeAsync(500);
    inOneTab('reveal', 1000, () => ran.push('c'), locks);
    await vi.advanceTimersByTimeAsync(600);
    inOneTab('reveal', 1000, () => ran.push('d'), locks);
    await vi.advanceTimersByTimeAsync(0);

    expect(ran).toEqual(['a', 'd']);
  });

  it('runs in every tab where the browser has no locks', () => {
    const ran: string[] = [];

    inOneTab('reveal', 1000, () => ran.push('a'), null);
    inOneTab('reveal', 1000, () => ran.push('b'), null);

    expect(ran).toEqual(['a', 'b']);
  });
});
