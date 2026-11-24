/**
 * Runs what every tab of the page in this browser is asked to do at once in one of them alone: the
 * first to come takes the browser's lock of that name and keeps it a while after, as the others are
 * told of the same asking a moment apart, and any that comes while it is kept does nothing. Where
 * the browser has no locks, every tab runs it.
 */
export function inOneTab(
  name: string,
  keptMs: number,
  task: () => void,
  locks: LockManager | null = browserLocks()
): void {
  if (!locks) {
    task();
    return;
  }
  void locks.request(name, { ifAvailable: true }, async (lock) => {
    if (!lock) return;
    task();
    await new Promise<void>((resolve) => setTimeout(resolve, keptMs));
  });
}

function browserLocks(): LockManager | null {
  return (typeof navigator !== 'undefined' ? navigator.locks : undefined) ?? null;
}
