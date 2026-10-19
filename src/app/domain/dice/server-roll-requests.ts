import { MAX_ROLLS_PER_WINDOW, RATE_WINDOW_SECONDS } from '@axe/core/network/server/server-protocol';

/** How long a roll asked of a room server waits for the answer, from when it went out, before giving up on it. */
export const SERVER_ROLL_WAIT_MS = 60_000;

/**
 * The span in which no more than MAX_ROLLS_PER_WINDOW rolls go out: the server's window, and a
 * second more, so that rolls bunched up on the way still arrive no more than that many to a window.
 */
export const ROLL_PACE_WINDOW_MS = RATE_WINDOW_SECONDS * 1000 + 1000;

/**
 * How long after getting back in a roll the server found nowhere to put is asked for once more
 * (milliseconds). Its tab may have been made while the link was down, and reaches the server only
 * with the catalogs traded on getting back in, after the roll asked again.
 */
export const ROLL_RETRY_MS = 5_000;

/** Why a roll asked of the server came to nothing: a reason the server gave, or no answer in time. */
export type UnansweredRollReason = string;

/** What becomes of the rolls asked of a room server, as the dice bot carries it out. */
export interface ServerRollHooks {
  /** Sends a request to the room server. */
  send(request: Record<string, unknown>): void;
  /** The server's answer has arrived, to be treated as a roll made here. */
  answered(answerIdentifier: string, sourceIdentifier: string): void;
  /** The line asked about will have no answer, for the reason given. */
  unanswered(sourceIdentifier: string, reason: UnansweredRollReason): void;
  /**
   * Whether the seat is in the room with its link up and not cut off from it, where a roll given up
   * on can be told of and one waiting to be asked again is not.
   */
  inRoom(): boolean;
}

interface PendingRoll {
  sourceIdentifier: string;
  request: Record<string, unknown>;
  timer: ReturnType<typeof setTimeout> | null;
  /** Asked again on getting back in, and not yet asked once more for having been found invalid. */
  askedAgain: boolean;
}

/**
 * The rolls asked of a room server and not answered yet, by the identifier of the answer each
 * waits for.
 *
 * They go out no faster than the server takes them, so a line aimed at many targets is rolled for
 * each of them. A seat that gets back into the room asks again for every roll still unanswered,
 * as one asked while the line was down, or lost with it, would otherwise never come; the server
 * rolls a line only once, however often it is asked.
 */
export class ServerRollRequests {
  private readonly pending = new Map<string, PendingRoll>();
  /** Answers whose requests wait for room under the server's limit, oldest first. */
  private waiting: string[] = [];
  /** When each recent request went out, oldest first. */
  private sentAt: number[] = [];
  private paceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly hooks: ServerRollHooks,
    private readonly now: () => number = () => Date.now()
  ) {}

  /** How many rolls wait for an answer. */
  get size(): number {
    return this.pending.size;
  }

  /** Asks for a roll whose answer will come under `answerIdentifier`. */
  ask(answerIdentifier: string, sourceIdentifier: string, request: Record<string, unknown>): void {
    if (this.pending.has(answerIdentifier)) return;
    this.pending.set(answerIdentifier, { sourceIdentifier, request, timer: null, askedAgain: false });
    this.waiting.push(answerIdentifier);
    this.pump();
  }

  /** Takes an object that has just arrived as the answer to a roll, when it is one. */
  arrived(identifier: string): void {
    const roll = this.settle(identifier);
    if (roll) this.hooks.answered(identifier, roll.sourceIdentifier);
  }

  /**
   * Gives up on a roll the server would not make. A line that is no command goes without a word,
   * as one rolled here shows nothing either. One asked again on getting back in that the server
   * found invalid is asked for once more a little later instead, as its tab may not have reached
   * the server yet.
   */
  rejected(identifier: string, reason: string): void {
    const waiting = this.pending.get(identifier);
    if (waiting?.askedAgain && reason === 'invalid') {
      waiting.askedAgain = false;
      this.stopWaiting(waiting);
      waiting.timer = setTimeout(() => {
        waiting.timer = null;
        this.waiting.push(identifier);
        this.pump();
      }, ROLL_RETRY_MS);
      return;
    }
    const roll = this.settle(identifier);
    if (roll && reason !== 'not-a-command') this.hooks.unanswered(roll.sourceIdentifier, reason);
  }

  /** Asks again for every roll still unanswered, over a connection the server counts afresh. */
  askAgain(): void {
    this.stopPacing();
    this.waiting = [...this.pending.keys()];
    for (const roll of this.pending.values()) {
      this.stopWaiting(roll);
      roll.askedAgain = true;
    }
    this.pump();
  }

  /**
   * Stops waiting while the link is down, keeping every roll to ask again for once back: a roll that
   * timed out while away would never be asked for again. One whose wait ends while the seat is out
   * of the room, as between leaving and getting back in by hand, is kept the same way.
   */
  pause(): void {
    this.stopPacing();
    this.waiting = [];
    for (const roll of this.pending.values()) this.stopWaiting(roll);
  }

  /** Forgets every roll, without a word, as when leaving the room they were asked in. */
  clear(): void {
    this.stopPacing();
    for (const roll of this.pending.values()) this.stopWaiting(roll);
    this.pending.clear();
    this.waiting = [];
  }

  private stopPacing(): void {
    this.sentAt = [];
    if (this.paceTimer != null) clearTimeout(this.paceTimer);
    this.paceTimer = null;
  }

  private pump(): void {
    if (this.paceTimer != null) return;
    while (this.waiting.length > 0) {
      const now = this.now();
      this.sentAt = this.sentAt.filter((at) => now - at < ROLL_PACE_WINDOW_MS);
      if (this.sentAt.length >= MAX_ROLLS_PER_WINDOW) {
        this.paceTimer = setTimeout(
          () => {
            this.paceTimer = null;
            this.pump();
          },
          this.sentAt[0] + ROLL_PACE_WINDOW_MS - now
        );
        return;
      }
      const identifier = this.waiting.shift()!;
      const roll = this.pending.get(identifier);
      if (!roll) continue;
      this.sentAt.push(now);
      this.stopWaiting(roll);
      roll.timer = setTimeout(() => {
        roll.timer = null;
        if (this.hooks.inRoom() && this.settle(identifier)) this.hooks.unanswered(roll.sourceIdentifier, 'timeout');
      }, SERVER_ROLL_WAIT_MS);
      this.hooks.send(roll.request);
    }
  }

  private settle(identifier: string): PendingRoll | null {
    const roll = this.pending.get(identifier);
    if (!roll) return null;
    this.stopWaiting(roll);
    this.pending.delete(identifier);
    return roll;
  }

  private stopWaiting(roll: PendingRoll): void {
    if (roll.timer != null) clearTimeout(roll.timer);
    roll.timer = null;
  }
}
