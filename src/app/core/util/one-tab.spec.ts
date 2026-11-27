import { Logger } from '@axe/core/logging/logger';
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
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

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

  it('keeps the lock its while though the task throws, and runs the task where the browser refuses a lock', async () => {
    vi.useFakeTimers();
    const locks = sharedLocks();
    const ran: string[] = [];
    const logged = vi.spyOn(Logger, 'error').mockImplementation(() => undefined);

    inOneTab(
      'reveal',
      1000,
      () => {
        ran.push('a');
        throw new Error('part-way');
      },
      locks
    );
    await vi.advanceTimersByTimeAsync(10);
    inOneTab('reveal', 1000, () => ran.push('b'), locks);
    await vi.advanceTimersByTimeAsync(0);
    const refusing = {
      ...locks,
      request: () => Promise.reject(new DOMException('No', 'SecurityError')),
    } as LockManager;
    inOneTab('reveal', 1000, () => ran.push('c'), refusing);
    await vi.advanceTimersByTimeAsync(2000);

    expect(ran).toEqual(['a', 'c']);
    expect(logged).toHaveBeenCalledWith('[inOneTab] reveal', expect.objectContaining({ message: 'part-way' }));
  });

  it('runs in every tab where the browser has no locks', () => {
    const ran: string[] = [];

    inOneTab('reveal', 1000, () => ran.push('a'), null);
    inOneTab('reveal', 1000, () => ran.push('b'), null);

    expect(ran).toEqual(['a', 'b']);
  });
});
