let i: number = 0;
const timeouts = new Map<number, () => void>();
const channel = new MessageChannel();

/**
 * Runs a function as soon as the current task ends, through a message channel, without the
 * minimum delay browsers add to nested timers.
 *
 * Returns an id that `clearZeroTimeout` takes.
 */
export function setZeroTimeout(fn: () => void): number {
  if (i === 0x100000000)
    // max queue size
    i = 0;
  if (++i in timeouts) throw new Error('setZeroTimeout queue overflow.');
  timeouts.set(i, fn);
  channel.port2.postMessage(i);
  return i;
}

/** Cancels a function scheduled with `setZeroTimeout` that has not run yet. */
export function clearZeroTimeout(id: number) {
  timeouts.delete(id);
}

/**
 * Resolves on the next zero timeout, letting a long loop yield to other tasks, such as incoming
 * messages, without a timer delay.
 */
export function waitZeroTimeout(): Promise<void> {
  return new Promise<void>((resolve) => setZeroTimeout(resolve));
}

channel.port1.onmessage = function (ev) {
  const fn = timeouts.get(ev.data);
  timeouts.delete(ev.data);
  if (fn) fn();
};

channel.port1.start();
channel.port2.start();
