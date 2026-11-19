import type { GmEventEntry } from '@axe/core/agent/agent-protocol';

import type { TurnReason } from './game-master';

/** What a turn is taken with: why it came, what happened since the last, and the person's word for it. */
export interface GatheredTurn {
  readonly reasons: TurnReason[];
  readonly events: Readonly<Record<string, unknown>>[];
  readonly direction: string;
}

export interface TurnGatheringOptions {
  /** How long the room must stay quiet after a reason to take a turn before the turn is due. */
  readonly quietMs?: number;
  /** The longest a turn waits for the room to go quiet. */
  readonly longestWaitMs?: number;
  /**
   * Whether a turn may be taken now: the game master waits for one, and a tab is there to act through.
   * Nothing can be done at the table without the tab, so a turn due meanwhile is kept until it is back.
   */
  readonly mayTake: () => boolean;
  /** Told once a turn is due and may be taken; whoever is told takes it with {@link TurnGathering.take}. */
  readonly due: () => void;
}

/** How long the room must stay quiet, unless told otherwise: long enough for a roll to come back. */
const QUIET_MS = 4000;
/** The longest a turn waits, unless told otherwise, however busy the room is. */
const LONGEST_WAIT_MS = 15_000;
/** The most events kept for the next turn; the oldest are let go beyond it. */
const EVENTS_KEPT = 200;

/**
 * Gathers what happens in the room into the game master's next turn, and tells when the turn is due:
 * once something calls for one and the room has gone quiet for a few seconds, or has kept on for the
 * longest a turn waits, and at once when the person at the seat asks. The room speaking again has a
 * turn that was due wait for quiet once more. The waiting is timed here rather than in the tab, as a
 * tab out of sight is given few timers.
 *
 * It is the one keeper of these rules for a bridge that runs the model itself and for one that hands
 * the turns to an AI connected over MCP, which differ only in who takes the turn once it is due.
 */
export class TurnGathering {
  private events: Readonly<Record<string, unknown>>[] = [];
  private reasons = new Set<TurnReason>();
  private direction = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private firstReasonAt = 0;
  private fallenDue = false;

  constructor(private readonly options: TurnGatheringOptions) {}

  /** Whether anything calls for a turn. */
  get pending(): boolean {
    return this.reasons.size > 0;
  }

  /** Whether a turn is due: something calls for one and the room has been quiet long enough since. */
  get isDue(): boolean {
    return this.fallenDue && this.pending;
  }

  /** Takes in what the tab tells happened, each event marked where it calls for a turn. */
  heard(entries: readonly GmEventEntry[]): void {
    for (const entry of entries) {
      this.events.push(entry.event);
      if (entry.wake) this.addReason(entry.wake);
    }
    if (this.events.length > EVENTS_KEPT) this.events.splice(0, this.events.length - EVENTS_KEPT);
    if (this.pending) this.wait(false);
  }

  /** Takes the person at the seat asking for a turn now, with a word for it if they gave one. */
  nudged(direction = ''): void {
    this.addReason('nudge');
    if (direction.trim()) this.direction = [this.direction, direction.trim()].filter(Boolean).join('\n');
    this.wait(true);
  }

  /**
   * Looks again at whether a turn can be taken, as what {@link TurnGatheringOptions.mayTake} answers
   * by has changed: the tab is back, or the game master waits for a turn again. A turn that fell due
   * meanwhile is told of now, and one asked for by the person at the seat is not kept waiting.
   */
  lookAgain(): void {
    if (!this.pending) return;
    if (this.reasons.has('nudge')) {
      this.wait(true);
      return;
    }
    if (this.fallenDue) this.tellIfTakeable();
    else if (!this.timer) this.wait(false);
  }

  /**
   * Takes the turn that is due, what was gathered for it handed over and let go of; null where none is
   * due or none may be taken now.
   */
  take(): GatheredTurn | null {
    if (!this.isDue || !this.options.mayTake()) return null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const turn = { reasons: [...this.reasons], events: this.events, direction: this.direction };
    this.reasons = new Set();
    this.events = [];
    this.direction = '';
    this.fallenDue = false;
    return turn;
  }

  /**
   * Puts a turn back that was given up before it was done, to be taken again. Where what it carried
   * had already been told, only the reasons are put back: the turn is still to be taken, and what
   * happened is not told twice.
   */
  putBack(turn: GatheredTurn, told: boolean): void {
    for (const reason of turn.reasons) this.addReason(reason);
    if (told) return;
    this.events = [...turn.events, ...this.events];
    this.direction = [turn.direction, this.direction].filter(Boolean).join('\n');
  }

  /** Lets go of everything gathered and of the wait, as the game master is stopped or started. */
  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.events = [];
    this.reasons.clear();
    this.direction = '';
    this.fallenDue = false;
  }

  private addReason(reason: TurnReason): void {
    if (!this.pending) this.firstReasonAt = Date.now();
    this.reasons.add(reason);
  }

  /** Has the turn fall due once the room has been quiet long enough, or at once. */
  private wait(now: boolean): void {
    if (this.timer) clearTimeout(this.timer);
    // The room spoke again: a turn that had fallen due waits for it to go quiet once more.
    this.fallenDue = false;
    const quiet = this.options.quietMs ?? QUIET_MS;
    const longest = this.options.longestWaitMs ?? LONGEST_WAIT_MS;
    const delay = now ? 0 : Math.max(0, Math.min(quiet, this.firstReasonAt + longest - Date.now()));
    this.timer = setTimeout(() => {
      this.timer = null;
      this.fallenDue = true;
      this.tellIfTakeable();
    }, delay);
  }

  private tellIfTakeable(): void {
    if (this.isDue && this.options.mayTake()) this.options.due();
  }
}
