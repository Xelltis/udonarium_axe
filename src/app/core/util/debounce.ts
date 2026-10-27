/** A call put off for a while, which can be asked for, dropped or made at once. */
export interface DeferredCall {
  /** Asks for the call. */
  (): void;
  /** Drops a call that is waiting. */
  cancel(): void;
  /** Makes a call that is waiting at once; does nothing where none is. */
  flush(): void;
  /** Whether a call is waiting. */
  pending(): boolean;
}

function deferredCall(fn: () => void, ms: number, startsOver: boolean): DeferredCall {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = () => {
    timer = null;
    fn();
  };
  const call = (() => {
    if (timer !== null) {
      if (!startsOver) return;
      clearTimeout(timer);
    }
    timer = setTimeout(run, ms);
  }) as DeferredCall;
  call.cancel = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };
  call.flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    run();
  };
  call.pending = () => timer !== null;
  return call;
}

/**
 * Puts a call off until `ms` have passed without another ask, so a run of asks makes one call,
 * after the last of them.
 */
export function debounce(fn: () => void, ms: number): DeferredCall {
  return deferredCall(fn, ms, true);
}

/**
 * Makes a call `ms` after the first ask, folding every ask made while it waits into that one call,
 * so a steady stream of asks still makes a call every `ms`.
 */
export function coalesce(fn: () => void, ms: number): DeferredCall {
  return deferredCall(fn, ms, false);
}
