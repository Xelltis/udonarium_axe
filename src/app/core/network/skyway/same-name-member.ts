import { EventChannel } from '@axe/core/event/event-channel';

/**
 * How long to wait for a member left under this peer's own name to go before joining.
 *
 * A peer keeps its id from one load of the page to the next, and a page that goes away cannot be
 * sure of leaving its channels on the way out, so a reload finds itself already there. The SDK drops
 * a member that stops sending its keepalive after the keepalive interval and the gap past it, 30
 * seconds each by default; a little longer is allowed for word of it to arrive.
 */
export const SAME_NAME_MEMBER_WAIT_MS = (30 + 30 + 5) * 1000;

/** The error type a join gives up with when a member under this peer's name stays past the wait. */
export const SAME_NAME_MEMBER_ERROR = 'same-name-member';

/** A member under this peer's own name was still in the channel when the wait ran out. */
export class SameNameMemberError extends Error {
  override readonly name = SAME_NAME_MEMBER_ERROR;

  constructor() {
    super('A member under this name is still in the channel.');
  }
}

/** The wait for a member under this peer's name was called off, as a new open or a close does. */
export class SameNameWaitCancelledError extends Error {
  override readonly name = 'same-name-wait-cancelled';

  constructor() {
    super('The wait for the channel to free this name was called off.');
  }
}

/** Raised as this peer starts and stops waiting for a member under its own name to go. */
export const sameNameMemberWait$ = new EventChannel<{ readonly waiting: boolean }>();

/** What waiting on a channel needs of it: who is in it, and word of anyone leaving. */
export interface NamedMemberChannel {
  readonly members: readonly { readonly name?: string | null }[];
  readonly onMemberLeft: {
    add(callback: (event: { member: { readonly name?: string | null } }) => void): { removeListener: () => void };
  };
}

/** Whether the SDK refused a join because a member under the same name is in the channel. */
export function isSameNameRefusal(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'alreadySameNameMemberExist'
  );
}

/** Whether a member under the name is in the channel. */
export function holdsName(channel: NamedMemberChannel, name: string): boolean {
  return channel.members.some((member) => member.name === name);
}

/**
 * Resolves once no member under the name is in the channel, as soon as word of it leaving
 * arrives; rejects with {@link SameNameMemberError} at the deadline, a time in milliseconds since
 * the epoch, and with {@link SameNameWaitCancelledError} when the signal is aborted.
 */
export function waitForNameToLeave(
  channel: NamedMemberChannel,
  name: string,
  deadline: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new SameNameWaitCancelledError());
      return;
    }
    if (!holdsName(channel, name)) {
      resolve();
      return;
    }
    let listener: { removeListener: () => void } | null = null;
    const finish = (error?: Error) => {
      clearTimeout(timer);
      listener?.removeListener();
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => finish(new SameNameWaitCancelledError());
    const timer = setTimeout(() => finish(new SameNameMemberError()), Math.max(0, deadline - Date.now()));
    listener = channel.onMemberLeft.add(({ member }) => {
      if (member.name === name) finish();
    });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Joins a channel under this peer's name, first waiting until no member under that name is left in
 * it, and again whenever the SDK refuses the join for one. Gives up with
 * {@link SameNameMemberError} at the deadline. The member is never pushed out: it may be this
 * page's twin in another tab rather than what a reload left behind.
 *
 * `sameNameMemberWait$` says when the waiting starts and stops, so whoever is joining can be told
 * why it takes so long.
 */
export async function joinUnderOwnName<T>(
  channel: NamedMemberChannel,
  name: string,
  join: () => Promise<T>,
  deadline: number,
  signal?: AbortSignal
): Promise<T> {
  let waiting = false;
  try {
    for (;;) {
      if (holdsName(channel, name)) {
        if (!waiting) {
          waiting = true;
          sameNameMemberWait$.emit({ waiting: true });
        }
        await waitForNameToLeave(channel, name, deadline, signal);
      }
      if (signal?.aborted) throw new SameNameWaitCancelledError();
      try {
        return await join();
      } catch (error) {
        if (!isSameNameRefusal(error)) throw error;
        if (Date.now() >= deadline || !holdsName(channel, name)) throw new SameNameMemberError();
      }
    }
  } finally {
    if (waiting) sameNameMemberWait$.emit({ waiting: false });
  }
}
