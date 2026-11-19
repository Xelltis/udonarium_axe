import { gmWakeReasons } from '@axe/core/agent/agent-gm';
import {
  GM_NOTES_MAX,
  type GmHalt,
  type GmRun,
  type GmStatus,
  type GmTabMessage,
} from '@axe/core/agent/agent-protocol';

import type { TabLink } from '../tab-link';
import { type GatheredTurn, TurnGathering } from './turn-gathering';

export interface TurnDeskOptions {
  readonly link: TabLink;
  readonly log: (line: string) => void;
  /** How long the room must stay quiet after a reason to take a turn before the turn is handed over. */
  readonly quietMs?: number;
  /** The longest a turn waits for the room to go quiet. */
  readonly longestWaitMs?: number;
  /** How long after the AI taking a turn last called a tool it still counts as taking it. */
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

/** How long the AI taking a turn counts as taking it after its last call, unless told otherwise. */
const ATTENDED_MS = 120_000;

const NOT_STARTED =
  'The game master is not started. The person at the seat starts it from the AI GM panel of Axe. ' +
  'Call wait_for_turn again to go on waiting.';
const NOTHING_YET = 'Nothing has called for a turn of yours yet. Call wait_for_turn again to go on waiting.';
const STOPPED =
  'The person at the seat stopped the game master. Call wait_for_turn again to wait for it to be started anew.';
const TAKEN_OVER = 'Another call to wait_for_turn took the place of this one.';
const SOMEONE_WAITS =
  "Another AI connected to this bridge is waiting for the game master's turn, and one takes the turns at a time. " +
  'If you are meant to be the game master, call wait_for_turn again in a minute, once its wait is over.';

/**
 * Hands the turns of the game master to an AI connected over MCP, for the tab connected to the bridge.
 * The tab starts and stops the game master and tells what happens in the room, each event marked where
 * it calls for a turn, as it does to a bridge that runs the model itself; here the model is the AI's
 * own, which asks for its turn with a tool and is answered once a turn is due, as {@link TurnGathering}
 * tells it, the keeper of when one is for either kind of bridge. A turn due with no AI waiting is kept
 * for the one that asks next. The instructions and the
 * notebook travel with a turn whenever the AI has not had them as they stand. The tab is told how the
 * game master stands, and whether an AI is there to take the turns at all.
 *
 * A turn handed over is held until the conversation it went to is done with it, which it shows by
 * asking for the next. It is put back only where that conversation can be told never to ask: it hung
 * up, or another took its place after it had called nothing for a while. It is put back whole where
 * the conversation never showed it had the turn, and only as a turn still to be taken where it did,
 * so nothing that happened is lost or told twice. One that comes back after calling nothing for a
 * while is done with its turn as any other is.
 *
 * An AI is there while the conversation holding the place waits for the turn, or has shown itself of
 * late: taking a turn, calling a tool, or waiting until its wait ran out, as one does between waits.
 * What another conversation calls says nothing of that.
 */
export class TurnDesk {
  private run: GmRun = 'off';
  private halted: GmHalt | undefined;
  private problem: string | undefined;
  private starts = 0;
  private readonly gathering: TurnGathering;
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
  /**
   * The turn handed over and not done with yet: what it carried, whether the conversation taking it
   * has shown it got it by calling a tool since, and what that conversation had been told before, to
   * be put back should the turn never have reached it.
   */
  private held: {
    readonly turn: GatheredTurn;
    got: boolean;
    readonly toldBefore: { instructions: string; notes: string; fresh: number } | undefined;
  } | null = null;
  /**
   * When the conversation holding the place last showed it was there: handed the turn, calling a tool,
   * or waiting until its wait ran out.
   */
  private holderSeenAt = 0;
  private attendedTimer: ReturnType<typeof setTimeout> | null = null;
  private attendedTold = false;

  constructor(private readonly options: TurnDeskOptions) {
    this.gathering = new TurnGathering({
      quietMs: options.quietMs,
      longestWaitMs: options.longestWaitMs,
      mayTake: () => this.run === 'waiting' && this.waiter !== null && options.link.current !== null,
      due: () => this.handOver(),
    });
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
      // A turn that fell due while the tab was away is handed over now that it is back.
      this.gathering.lookAgain();
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

  /**
   * Notes that a conversation called a tool. Only the calls of the one holding the place tell anything:
   * that it is there, and where it is taking a turn, that the turn reached it.
   */
  noteCall(conversation: object = this): void {
    if (conversation !== this.waiting) return;
    if (this.held && this.run === 'thinking') this.held.got = true;
    this.holderSeen();
    this.tellIfAttendanceChanged();
  }

  /**
   * Counts the conversation holding the place as there from now, for a while, and looks again once
   * that while is over. Its turn stays with it: only another taking its place puts the turn back.
   */
  private holderSeen(): void {
    this.holderSeenAt = Date.now();
    if (this.attendedTimer) clearTimeout(this.attendedTimer);
    this.attendedTimer = setTimeout(
      () => {
        this.attendedTimer = null;
        this.tellIfAttendanceChanged();
      },
      (this.options.attendedMs ?? ATTENDED_MS) + 50
    );
  }

  /** Whether the conversation holding the place has shown itself too long ago to be taken as there. */
  private holderGone(): boolean {
    return Date.now() - this.holderSeenAt >= (this.options.attendedMs ?? ATTENDED_MS);
  }

  /**
   * Puts back the turn that was being taken, as its taker is gone or done with it unfinished: what it
   * carried where the taker never showed it had it, with what it was told beside it forgotten again,
   * and only that a turn is to be taken where it did. The game master waits for a taker once more.
   */
  private putTurnBack(): void {
    const held = this.held;
    this.held = null;
    if (held) {
      this.gathering.putBack(held.turn, held.got);
      if (!held.got) {
        if (held.toldBefore) this.told.set(this.waiting, held.toldBefore);
        else this.told.delete(this.waiting);
      }
    }
    if (this.run !== 'thinking') return;
    this.run = 'waiting';
    this.tell();
    this.gathering.lookAgain();
  }

  /**
   * Waits for the AI's next turn, for as long as given: answered with the turn once one is due, or
   * told to ask again. Asking ends the turn the AI was taking. One call waits at a time; a later one
   * of the same
   * conversation takes the place of an earlier, and one of another conversation is told that somebody
   * waits already. The instructions and the notebook go with the turn where the
   * conversation asking has not had them as they stand.
   */
  waitForTurn(timeoutMs: number, signal?: AbortSignal, conversation: object = this): Promise<TurnWait> {
    // The conversation holding the place keeps it while it waits, and for as long as it shows itself,
    // taking a turn or between its waits: were each to take the other's, neither would wait. One that
    // went away leaves the next turn to whoever asks.
    const busy = this.waiter !== null || !this.holderGone();
    if (busy && this.waiting !== conversation) {
      return Promise.resolve({ turn: false, running: this.run !== 'off', note: SOMEONE_WAITS });
    }
    this.waiter?.({ turn: false, running: this.run !== 'off', note: TAKEN_OVER });
    this.waiter = null;
    if (this.waiting === conversation) {
      // Asking for the next is being done with the last: nothing of it is put back.
      this.held = null;
      if (this.run === 'thinking') {
        this.run = 'waiting';
        this.tell();
      }
    } else {
      // The turn of a conversation that went away is put back before another takes its place.
      this.putTurnBack();
      this.waiting = conversation;
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
      const timeUp = () => {
        // Waiting until the wait ran out shows it is there, as it is expected to wait again.
        if (this.waiter === answer) this.holderSeen();
        answer({ turn: false, running: this.run !== 'off', note: this.run === 'off' ? NOT_STARTED : NOTHING_YET });
      };
      const onAbort = () => timeUp();
      const timer = setTimeout(timeUp, timeoutMs);
      signal?.addEventListener('abort', onAbort, { once: true });
      this.waiter = answer;
      this.tellIfAttendanceChanged();
      // What was gathered while nobody waited, or while the last turn was taken, is looked at now.
      this.gathering.lookAgain();
    });
  }

  /**
   * Lets go of a conversation that is over, as a client that hung up: its wait is over, the turn it
   * was taking is put back, and whoever asks next is handed it.
   */
  leave(conversation: object): void {
    if (conversation !== this.waiting) return;
    this.hungUp(conversation);
    this.putTurnBack();
    this.holderSeenAt = 0;
    this.tellIfAttendanceChanged();
  }

  /**
   * Ends the wait of a conversation whose call was cut off before it could be answered: nobody is
   * there to read the answer, so no turn is handed to it. The conversation may ask again.
   */
  hungUp(conversation: object): void {
    if (conversation !== this.waiting || !this.waiter) return;
    this.holderSeenAt = 0;
    this.waiter({ turn: false, running: this.run !== 'off', note: NOTHING_YET });
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

  /** Whether an AI is there to take the turns: the one holding the place waits for the turn, or was seen of late. */
  private attended(): boolean {
    return this.waiter !== null || !this.holderGone();
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
        if (this.run !== 'off') this.gathering.heard(message.events);
        return;
      case 'gm.nudge':
        if (this.run !== 'off') this.gathering.nudged(message.direction);
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
    this.gathering.clear();
    this.options.log('The game master started, its turns handed to the AI connected over MCP.');
    this.tell();
    // A new session opens at once, the AI greeting the table; one carried on waits for the room.
    if (opens) this.gathering.nudged();
  }

  /** Hands the turn that is due to the AI waiting for it, with what it has not been told. */
  private handOver(): void {
    const waiter = this.waiter;
    const gathered = waiter ? this.gathering.take() : null;
    if (!waiter || !gathered) return;
    const had = this.told.get(this.waiting);
    const told = had && had.fresh === this.freshFrom ? had : null;
    this.told.set(this.waiting, { instructions: this.instructions, notes: this.notes, fresh: this.freshFrom });
    this.held = { turn: gathered, got: false, toldBefore: had };
    this.handed = true;
    this.run = 'thinking';
    this.holderSeen();
    waiter({
      turn: true,
      reasons: gmWakeReasons(gathered.reasons),
      ...(gathered.direction ? { direction: gathered.direction } : {}),
      events: gathered.events,
      ...(told?.instructions === this.instructions ? {} : { instructions: this.instructions }),
      ...(told?.notes === this.notes ? {} : { notes: this.notes }),
    });
    this.tell();
  }

  private halt(why: GmHalt): void {
    const wasRunning = this.run !== 'off';
    this.run = 'off';
    this.halted = wasRunning ? why : this.halted;
    this.held = null;
    this.gathering.clear();
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
