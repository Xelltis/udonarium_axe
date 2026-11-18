const WAITING_TIMERS_KEY = '__axeWaitingTimers__';
const TIMER_FUNCTIONS = [
  ['setTimeout', 'clearTimeout'],
  ['setInterval', 'clearInterval'],
  ['requestAnimationFrame', 'cancelAnimationFrame'],
] as const;

type CallOff = () => void;

function kept(): CallOff[] | undefined {
  return (globalThis as unknown as Record<string, CallOff[] | undefined>)[WAITING_TIMERS_KEY];
}

/**
 * Starts keeping the timers and animation frames the page is asked for, so that the ones still
 * waiting can be called off together.
 *
 * A worker runs file after file in one page, whose setTimeout and setInterval are Node's and beyond
 * the page's own means of stopping what it started. The functions are stood in for once for the
 * worker, however many files ask, and each stand-in hands on to the real one and notes what came
 * back. A timer faked for a test is the fake clock's to keep and is not noted.
 */
export function keepWaitingTimers(): void {
  if (kept()) return;
  const page = globalThis as unknown as Record<string, unknown>;
  const callOffs: CallOff[] = [];
  for (const [set, clear] of TIMER_FUNCTIONS) {
    const realSet = page[set] as ((...args: unknown[]) => unknown) | undefined;
    const realClear = page[clear] as ((handle: unknown) => void) | undefined;
    if (!realSet || !realClear) continue;
    const waiting = new Set<unknown>();
    page[set] = (...args: unknown[]) => {
      // One that goes off once is let go of as it does, with what its callback holds on to.
      const [callback] = args;
      if (set !== 'setInterval' && typeof callback === 'function') {
        args[0] = (...given: unknown[]) => {
          waiting.delete(handle);
          return (callback as (...given: unknown[]) => unknown)(...given);
        };
      }
      const handle = realSet.apply(globalThis, args);
      waiting.add(handle);
      return handle;
    };
    page[clear] = (handle: unknown) => {
      waiting.delete(handle);
      realClear.call(globalThis, handle);
    };
    callOffs.push(() => {
      for (const handle of waiting) realClear.call(globalThis, handle);
      waiting.clear();
    });
  }
  page[WAITING_TIMERS_KEY] = callOffs;
}

/**
 * Calls off every timer and animation frame asked for since the last call and not yet cleared.
 *
 * One that has gone off already is called off to no effect; one set to repeat stops repeating.
 */
export function callOffWaitingTimers(): void {
  for (const callOff of kept() ?? []) callOff();
}
