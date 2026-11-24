import { Logger } from '@axe/core/logging/logger';

/**
 * Runs what every tab of the page in this browser is asked to do at once in one of them alone: the
 * first to come takes the browser's lock of that name and keeps it a while after, as the others are
 * told of the same asking a moment apart, and any that comes while it is kept does nothing. It is
 * kept so long whether the task ran through or not, and what it threw is logged. Where the browser
 * has no locks, or refuses to lend this page one, every tab runs it.
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
  let ran = false;
  locks
    .request(name, { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      ran = true;
      try {
        task();
      } finally {
        await new Promise<void>((resolve) => setTimeout(resolve, keptMs));
      }
    })
    .catch((reason: unknown) => {
      if (ran) Logger.error(`[inOneTab] ${name}`, reason);
      else task();
    });
}

function browserLocks(): LockManager | null {
  return (typeof navigator !== 'undefined' ? navigator.locks : undefined) ?? null;
}
