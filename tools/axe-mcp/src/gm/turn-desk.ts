import { gmWakeReasons } from '@axe/core/agent/agent-gm';
import {
  GM_NOTES_MAX,
  type GmHalt,
  type GmRun,
  type GmStatus,
  type GmTabMessage,
  type GmWake,
} from '@axe/core/agent/agent-protocol';

import type { TabLink } from '../tab-link';

export interface TurnDeskOptions {
  readonly link: TabLink;
  readonly log: (line: string) => void;
  /** How long the room must stay quiet after a reason to take a turn before the turn is handed over. */
  readonly quietMs?: number;
  /** The longest a turn waits for the room to go quiet. */
  readonly longestWaitMs?: number;
  /** How long after the AI last called a tool it still counts as being there. */
  readonly attendedMs?: number;
}

/** What the AI is answered when it waits for its turn. */
export type TurnWait =
  | {
      readonly turn: true;
      /** Why the turn came, each in words. */
      readonly reasons: readonly string[];
      /** A word from the person at the seat for this turn; left out where none was given. */
      readonly direction?: string;
      /** What happened since the last turn, oldest first. */
      readonly events: readonly Readonly<Record<string, unknown>>[];
      /** The game master's instructions, where they are new to the AI or changed since it last had them. */
      readonly instructions?: string;
      /** The notebook, where it is new to the AI or the person at the seat rewrote it. */
      readonly notes?: string;
    }
  | {
      readonly turn: false;
      /** Whether the game master is started. */
      readonly running: boolean;
      readonly note: string;
    };

type TurnReason = GmWake | 'nudge';

/** How long the room must stay quiet, unless told otherwise: long enough for a roll to come back. */
const QUIET_MS = 4000;
/** The longest a turn waits, unless told otherwise, however busy the room is. */
const LONGEST_WAIT_MS = 15_000;
/** The most events kept for the next turn; the oldest are let go beyond it. */
const EVENTS_KEPT = 200;
/** How long the AI counts as there after its last call, unless told otherwise. */
const ATTENDED_MS = 120_000;

const NOT_STARTED =
  'The game master is not started. The person at the seat starts it from the AI GM panel of Axe. ' +
  'Call wait_for_turn again to go on waiting.';
const NOTHING_YET = 'Nothing has called for a turn of yours yet. Call wait_for_turn again to go on waiting.';
const STOPPED =
  'The person at the seat stopped the game master. Call wait_for_turn again to wait for it to be started anew.';
const TAKEN_OVER = 'Another call to wait_for_turn took the place of this one.';

/**
 * Hands the turns of the game master to an AI connected over MCP, for the tab connected to the bridge.
 * The tab starts and stops the game master and tells what happens in the room, each event marked where
 * it calls for a turn, as it does to a bridge that runs the model itself; here the model is the AI's
 * own, which asks for its turn with a tool and is answered once something calls for one and the room
 * has gone quiet for a few seconds (at once when the person at the seat asks). The waiting is timed
 * here rather than in the tab, as a tab out of sight is given few timers. The instructions and the
 * notebook travel with a turn whenever the AI has not had them as they stand. The tab is told how the
 * game master stands, and whether an AI is there to take the turns at all.
 */
export class TurnDesk {
  private run: GmRun = 'off';
  private halted: GmHalt | undefined;
  private problem: string | undefined;
  private starts = 0;
  private events: Readonly<Record<string, unknown>>[] = [];
  private reasons = new Set<TurnReason>();
  private direction = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private firstReasonAt = 0;
  /** Whether a turn is due: the room went quiet after a reason, and no AI was waiting to be handed it. */
  private due = false;
  private instructions = '';
  private notes = '';
  /**
   * The instructions and the notebook as each conversation of the AI last had them. A conversation is
   * whatever asks in its name: each client of the bridge is one, and a client that begins anew says so.
   */
  private readonly told = new WeakMap<object, { instructions: string; notes: string; fresh: number }>();
  /** How many times the game master was started afresh, after each of which every conversation is told anew. */
  private freshFrom = 0;
  /** The conversation waiting for the turn now, whose turn it will be. */
  private waiting: object = this;
  /** Whether a turn was ever handed over, so that there is a session to carry on. */
  private handed = false;
  private waiter: ((answer: TurnWait) => void) | null = null;
  private lastCallAt = 0;
  private attendedTimer: ReturnType<typeof setTimeout> | null = null;
  private attendedTold = false;

  constructor(private readonly options: TurnDeskOptions) {
    options.link.onGm((message) => this.hear(message));
    options.link.onChange((tab) => {
      if (!tab) return;
      if (this.run !== 'off' && !this.seatMayRun()) {
        this.problem = "The seat is no longer the game master's, let to change the room.";
        this.halt('seat');
        return;
      }
      this.tell();
      if (this.handed || this.notes) options.link.tellGm({ type: 'gm.notes', notes: this.notes });
    });
  }

  /** How the game master stands, as the tab is told it. */
  status(): GmStatus {
    return {
      run: this.run,
      ...(this.halted ? { halted: this.halted } : {}),
      model: '',
      spentUsd: 0,
      budgetUsd: 0,
      contextTokens: 0,
      kept: this.handed,
      ...(this.problem ? { problem: this.problem } : {}),
      starts: this.starts,
      attended: this.attended(),
    };
  }

  /** Notes that the AI called a tool, which shows it is there. */
  noteCall(): void {
    this.seen();
    this.tellIfAttendanceChanged();
  }

  /** Counts the AI as there from now, for a while, and looks again once that while is over. */
  private seen(): void {
    this.lastCallAt = Date.now();
    if (this.attendedTimer) clearTimeout(this.attendedTimer);
    this.attendedTimer = setTimeout(
      () => {
        this.attendedTimer = null;
        this.tellIfAttendanceChanged();
      },
      (this.options.attendedMs ?? ATTENDED_MS) + 50
    );
  }

  /**
   * Waits for the AI's next turn, for as long as given: answered with the turn once one is due, or
   * told to ask again. Asking ends the turn the AI was taking. One call waits at a time; a later one
   * takes the place of an earlier. The instructions and the notebook go with the turn where the
   * conversation asking has not had them as they stand.
   */
  waitForTurn(timeoutMs: number, signal?: AbortSignal, conversation: object = this): Promise<TurnWait> {
    this.waiter?.({ turn: false, running: this.run !== 'off', note: TAKEN_OVER });
    this.waiter = null;
    this.waiting = conversation;
    if (this.run === 'thinking') {
      this.run = 'waiting';
      this.tell();
      if (this.reasons.size > 0) this.schedule(this.reasons.has('nudge'));
    }
    return new Promise<TurnWait>((resolve) => {
      const answer = (given: TurnWait) => {
        if (this.waiter !== answer) return;
        this.waiter = null;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        resolve(given);
        this.tellIfAttendanceChanged();
      };
      const timeUp = () =>
        answer({ turn: false, running: this.run !== 'off', note: this.run === 'off' ? NOT_STARTED : NOTHING_YET });
      const onAbort = () => timeUp();
      const timer = setTimeout(timeUp, timeoutMs);
      signal?.addEventListener('abort', onAbort, { once: true });
      this.waiter = answer;
      this.tellIfAttendanceChanged();
      this.handOver();
    });
  }

  /**
   * Has a conversation told the instructions and the notebook again with its next turn, as one that
   * begins anew in a client the bridge already knows has had neither.
   */
  beginAnew(conversation: object = this): void {
    this.told.delete(conversation);
  }

  /**
   * Writes the notebook anew as the AI gives it, telling the tab, and says how it went; null while the
   * game master is not started, when the notebook is the person's own and no AI's to write.
   */
  writeNotes(notes: string, conversation: object = this): { readonly kept: number } | null {
    if (this.run === 'off') return null;
    this.notes = notes.slice(0, GM_NOTES_MAX);
    const told = this.told.get(conversation);
    if (told) this.told.set(conversation, { ...told, notes: this.notes });
    this.options.link.tellGm({ type: 'gm.notes', notes: this.notes });
    return { kept: this.notes.length };
  }

  /** Stops the game master and lets every timer go, as the bridge closes. */
  close(): void {
    this.halt('asked');
    if (this.attendedTimer) clearTimeout(this.attendedTimer);
    this.attendedTimer = null;
  }

  private attended(): boolean {
    return this.waiter !== null || Date.now() - this.lastCallAt < (this.options.attendedMs ?? ATTENDED_MS);
  }

  private tellIfAttendanceChanged(): void {
    if (this.attended() !== this.attendedTold) this.tell();
  }

  private hear(message: GmTabMessage): void {
    switch (message.type) {
      case 'gm.start':
        this.start(message);
        return;
      case 'gm.update':
        this.instructions = message.instructions;
        this.notes = message.notes;
        this.tell();
        return;
      case 'gm.events':
        if (this.run === 'off') return;
        for (const entry of message.events) {
          this.events.push(entry.event);
          if (entry.wake) this.addReason(entry.wake);
        }
        if (this.events.length > EVENTS_KEPT) this.events.splice(0, this.events.length - EVENTS_KEPT);
        if (this.reasons.size > 0) this.schedule(false);
        return;
      case 'gm.nudge':
        if (this.run === 'off') return;
        this.addReason('nudge');
        if (message.direction.trim())
          this.direction = [this.direction, message.direction.trim()].filter(Boolean).join('\n');
        this.schedule(true);
        return;
      case 'gm.stop':
        this.halt('asked');
        return;
    }
  }

  /** Whether the seat connected is the game master's, let to change the room. */
  private seatMayRun(): boolean {
    const seat = this.options.link.current?.seat;
    return seat?.role === 'gm' && seat.scope === 'write';
  }

  private start(message: Extract<GmTabMessage, { type: 'gm.start' }>): void {
    this.starts++;
    this.instructions = message.instructions;
    this.notes = message.notes;
    if (!this.seatMayRun()) {
      this.problem = "The game master runs only on the game master's seat, let to change the room.";
      this.tell();
      return;
    }
    if (this.run !== 'off') {
      this.tell();
      return;
    }
    const opens = message.fresh || !this.handed;
    if (message.fresh) {
      this.freshFrom++;
      this.handed = false;
    }
    this.run = 'waiting';
    this.halted = undefined;
    this.problem = undefined;
    this.events = [];
    this.reasons.clear();
    this.direction = '';
    this.due = false;
    this.options.log('The game master started, its turns handed to the AI connected over MCP.');
    this.tell();
    // A new session opens at once, the AI greeting the table; one carried on waits for the room.
    if (opens) {
      this.addReason('nudge');
      this.schedule(true);
    }
  }

  private addReason(reason: TurnReason): void {
    if (this.reasons.size === 0) this.firstReasonAt = Date.now();
    this.reasons.add(reason);
  }

  /** Has the next turn fall due once the room has been quiet long enough, or at once. */
  private schedule(now: boolean): void {
    if (this.run !== 'waiting' || this.reasons.size === 0) return;
    if (this.timer) clearTimeout(this.timer);
    // The room spoke again: a turn that had fallen due waits for it to go quiet once more.
    this.due = false;
    const quiet = this.options.quietMs ?? QUIET_MS;
    const longest = this.options.longestWaitMs ?? LONGEST_WAIT_MS;
    const delay = now ? 0 : Math.max(0, Math.min(quiet, this.firstReasonAt + longest - Date.now()));
    this.timer = setTimeout(() => {
      this.timer = null;
      this.due = true;
      this.handOver();
    }, delay);
  }

  /** Hands the turn due to the AI waiting for it, with what it has not been told. */
  private handOver(): void {
    const waiter = this.waiter;
    if (!waiter || !this.due || this.run !== 'waiting' || this.reasons.size === 0) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const reasons = gmWakeReasons([...this.reasons]);
    const events = this.events;
    const direction = this.direction;
    const had = this.told.get(this.waiting);
    const told = had && had.fresh === this.freshFrom ? had : null;
    this.reasons = new Set();
    this.events = [];
    this.direction = '';
    this.due = false;
    this.told.set(this.waiting, { instructions: this.instructions, notes: this.notes, fresh: this.freshFrom });
    this.handed = true;
    this.run = 'thinking';
    this.seen();
    waiter({
      turn: true,
      reasons,
      ...(direction ? { direction } : {}),
      events,
      ...(told?.instructions === this.instructions ? {} : { instructions: this.instructions }),
      ...(told?.notes === this.notes ? {} : { notes: this.notes }),
    });
    this.tell();
  }

  private halt(why: GmHalt): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const wasRunning = this.run !== 'off';
    this.run = 'off';
    this.halted = wasRunning ? why : this.halted;
    this.events = [];
    this.reasons.clear();
    this.direction = '';
    this.due = false;
    if (wasRunning) {
      this.options.log(`The game master stopped (${why}).`);
      this.waiter?.({ turn: false, running: false, note: STOPPED });
    }
    this.tell();
  }

  private tell(): void {
    this.attendedTold = this.attended();
    this.options.link.tellGm({ type: 'gm.status', status: this.status() });
  }
}
