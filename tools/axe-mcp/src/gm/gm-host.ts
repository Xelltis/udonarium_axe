import type { GmHalt, GmRun, GmStatus, GmTabMessage } from '@axe/core/agent/agent-protocol';

import type { TabLink } from '../tab-link';
import { GameMaster, type GmApi, type GmLedger, type TurnEnd, type TurnReason } from './game-master';
import { isGmModel, isPriced, noneIsPriced } from './gm-models';

export interface GmHostOptions {
  readonly link: TabLink;
  readonly api: GmApi;
  readonly log: (line: string) => void;
  /** How long the room must stay quiet after a reason to take a turn before the turn is taken. */
  readonly quietMs?: number;
  /** The longest a turn waits for the room to go quiet. */
  readonly longestWaitMs?: number;
  /** The most the bridge spends while it runs, over every start, whatever the tab asks; none if left out. */
  readonly maxUsd?: number;
  /** The most tokens models with no price use while the bridge runs, over every start; none if left out. */
  readonly maxTokens?: number;
}

/** How long the room must stay quiet, unless told otherwise: long enough for a roll to come back. */
const QUIET_MS = 4000;
/** The longest a turn waits, unless told otherwise, however busy the room is. */
const LONGEST_WAIT_MS = 15_000;
/** The most events kept for the next turn; the oldest are let go beyond it. */
const EVENTS_KEPT = 200;
/** How much of a model's name a tab asked for is told back in a refusal. */
const MODEL_NAME_SHOWN = 100;
/** How many turns in a row may fail before the game master is stopped. */
const FAILURES_TO_STOP = 3;

/**
 * Runs the game master for the tab connected to the bridge. It starts, changes and stops it as the tab
 * asks, keeps what happens in the room until the next turn, and takes a turn once something calls for
 * one and the room has gone quiet for a few seconds (at once when the person at the seat asks). The
 * waiting is timed here rather than in the tab, as a tab out of sight is given few timers. It tells the
 * tab how the game master stands whenever that changes, and the notebook whenever it is written.
 */
export class GmHost {
  private master: GameMaster | null = null;
  private run: GmRun = 'off';
  private halted: GmHalt | undefined;
  private problem: string | undefined;
  /** How many askings to start have been answered. */
  private starts = 0;
  private events: Readonly<Record<string, unknown>>[] = [];
  private reasons = new Set<TurnReason>();
  private direction = '';
  private turn: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private firstReasonAt = 0;
  private failures = 0;
  private readonly ledger: GmLedger;

  constructor(private readonly options: GmHostOptions) {
    this.ledger = {
      spentUsd: 0,
      limitUsd: options.maxUsd ?? Infinity,
      spentTokens: 0,
      limitTokens: options.maxTokens ?? Infinity,
    };
    options.link.onGm((message) => this.hear(message));
    options.link.onChange((tab) => {
      if (tab && this.run !== 'off' && !this.seatMayRun()) {
        this.problem = "The seat is no longer the game master's, let to change the room.";
        this.halt('seat');
        return;
      }
      if (tab) {
        this.tell();
        if (this.master) options.link.tellGm({ type: 'gm.notes', notes: this.master.notes });
        if (this.run === 'waiting' && this.reasons.size > 0) this.schedule(false);
      } else {
        // Nothing can be done at the table without the tab: the turn is given up, to be taken again.
        this.turn?.abort();
      }
    });
  }

  /** How the game master stands, as the tab is told it. */
  status(): GmStatus {
    const tokens = this.tokensTold();
    return {
      run: this.run,
      ...(this.halted ? { halted: this.halted } : {}),
      model: this.master?.model ?? '',
      spentUsd: this.master?.spentUsd ?? 0,
      budgetUsd: this.master?.budgetUsd ?? 0,
      contextTokens: this.master?.contextTokens ?? 0,
      kept: this.master?.kept ?? false,
      ...(this.problem ? { problem: this.problem } : {}),
      ...(tokens ? { tokens } : {}),
      starts: this.starts,
    };
  }

  /** Stops the game master and lets every timer go, as the bridge closes. */
  close(): void {
    this.halt('asked');
  }

  private hear(message: GmTabMessage): void {
    switch (message.type) {
      case 'gm.start':
        this.start(message);
        return;
      case 'gm.update':
        this.update(message);
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

  /**
   * Takes a change of settings, instructions and notes to the game master. A model the bridge has no
   * price for is not changed to, since what it spent would count as nothing: the rest of the change
   * is taken with the model kept. The tab knows the models the bridge runs from its greeting, and
   * says itself that the one chosen there is not among them.
   */
  private update(message: Extract<GmTabMessage, { type: 'gm.update' }>): void {
    if (this.master) {
      const settings = isGmModel(message.settings.model)
        ? message.settings
        : { ...message.settings, model: this.master.model };
      this.master.update(settings, message.instructions, message.notes);
    }
    this.tell();
  }

  /** Whether the seat connected is the game master's, let to change the room. */
  private seatMayRun(): boolean {
    const seat = this.options.link.current?.seat;
    return seat?.role === 'gm' && seat.scope === 'write';
  }

  private start(message: Extract<GmTabMessage, { type: 'gm.start' }>): void {
    this.starts++;
    if (!isGmModel(message.settings.model)) {
      this.problem = `This bridge does not run ${message.settings.model.slice(0, MODEL_NAME_SHOWN)}.`;
      this.tell();
      return;
    }
    if (!this.seatMayRun()) {
      this.problem = "The game master runs only on the game master's seat, let to change the room.";
      this.tell();
      return;
    }
    const priced = isPriced(message.settings.model);
    if (this.ledger.spentUsd >= this.ledger.limitUsd || (!priced && this.tokensSpent())) {
      this.problem = this.bridgeSpent(priced);
      this.tell();
      return;
    }
    if (this.run !== 'off') {
      this.master?.update(message.settings, message.instructions, message.notes);
      this.tell();
      return;
    }
    if (this.master) {
      // Begun again first, so that what changed while it was stopped is still told to the conversation kept.
      this.master.restart(message.fresh);
      this.master.update(message.settings, message.instructions, message.notes);
    } else {
      this.master = new GameMaster(
        this.options.api,
        (tool, args, timeoutMs, signal) => this.options.link.call(tool, args, timeoutMs, signal),
        {
          notes: (notes) => this.options.link.tellGm({ type: 'gm.notes', notes }),
          said: (text) => this.options.link.tellGm({ type: 'gm.said', text, at: Date.now() }),
          changed: () => this.tell(),
        },
        message,
        this.ledger
      );
    }
    this.run = 'waiting';
    this.halted = undefined;
    this.problem = undefined;
    this.failures = 0;
    this.events = [];
    this.reasons.clear();
    this.direction = '';
    this.options.log(`The game master started on ${message.settings.model}, up to $${message.settings.budgetUsd}.`);
    this.tell();
    // A new conversation opens at once, the model greeting the table; one kept waits for the room.
    if (!this.master.kept) {
      this.addReason('nudge');
      this.schedule(true);
    }
  }

  private addReason(reason: TurnReason): void {
    if (this.reasons.size === 0) this.firstReasonAt = Date.now();
    this.reasons.add(reason);
  }

  /** Takes the next turn once the room has been quiet long enough, or at once; never two turns at a time. */
  private schedule(now: boolean): void {
    if (this.run !== 'waiting' || this.reasons.size === 0) return;
    if (this.timer) clearTimeout(this.timer);
    const quiet = this.options.quietMs ?? QUIET_MS;
    const longest = this.options.longestWaitMs ?? LONGEST_WAIT_MS;
    const delay = now ? 0 : Math.max(0, Math.min(quiet, this.firstReasonAt + longest - Date.now()));
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.takeTurn();
    }, delay);
  }

  private async takeTurn(): Promise<void> {
    const master = this.master;
    if (this.run !== 'waiting' || !master || this.reasons.size === 0) return;
    if (!this.options.link.current) return;
    const reasons = [...this.reasons];
    const events = this.events;
    const direction = this.direction;
    this.reasons = new Set();
    this.events = [];
    this.direction = '';
    this.run = 'thinking';
    this.tell();
    const turn = new AbortController();
    this.turn = turn;
    let end: TurnEnd;
    try {
      end = await master.takeTurn(reasons, events, direction, turn.signal);
    } catch (error) {
      end = { kind: 'failed', message: error instanceof Error ? error.message : String(error) };
    }
    // Stopped meanwhile, and perhaps started again: this turn is no longer the one that counts.
    if (this.turn !== turn) return;
    this.turn = null;
    this.settle(end, reasons, events, direction);
  }

  private settle(end: TurnEnd, reasons: TurnReason[], events: Readonly<Record<string, unknown>>[], direction: string) {
    switch (end.kind) {
      case 'done':
        this.failures = 0;
        this.problem = undefined;
        break;
      case 'stopped':
        // Given up as the tab went away: taken again once it is back. What already reached the
        // conversation is not told again, only that the turn is still to be taken.
        for (const reason of reasons) this.addReason(reason);
        if (!end.told) {
          this.events = [...events, ...this.events];
          this.direction = [direction, this.direction].filter(Boolean).join('\n');
        }
        break;
      case 'budget':
        if (end.of === 'bridge') this.problem = this.bridgeSpent(this.master?.priced ?? true);
        this.halt('budget');
        return;
      case 'key':
        this.problem = end.message;
        this.halt('key');
        return;
      case 'failed':
        this.problem = end.message;
        this.options.log(`A turn of the game master failed: ${end.message}`);
        if (++this.failures >= FAILURES_TO_STOP) {
          this.halt('failed');
          return;
        }
        break;
    }
    this.run = 'waiting';
    this.tell();
    if (this.options.link.current) this.schedule(this.reasons.has('nudge'));
  }

  private halt(why: GmHalt): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const wasRunning = this.run !== 'off';
    const turn = this.turn;
    this.turn = null;
    turn?.abort();
    this.run = 'off';
    this.halted = wasRunning ? why : this.halted;
    this.events = [];
    this.reasons.clear();
    this.direction = '';
    if (wasRunning) this.options.log(`The game master stopped (${why}).`);
    this.tell();
  }

  /** Whether the models with no price have used the tokens the bridge lets them. */
  private tokensSpent(): boolean {
    return this.ledger.spentTokens >= this.ledger.limitTokens;
  }

  /** Why the bridge runs no further: its dollars spent, or for a model with no price its tokens used. */
  private bridgeSpent(priced: boolean): string {
    if (!priced && this.tokensSpent()) {
      return (
        `The bridge has used the ${this.ledger.limitTokens} tokens it may use while it runs. ` +
        'Start the bridge again, with a larger --max-tokens if need be, to go on.'
      );
    }
    return (
      `The bridge has spent the $${this.ledger.limitUsd} it may spend while it runs. ` +
      'Start the bridge again, with a larger --max-usd if need be, to go on.'
    );
  }

  /** The tokens told to the tab in place of dollars, while the model run, or every model offered, has no price. */
  private tokensTold(): GmStatus['tokens'] {
    const unpriced = this.master ? !this.master.priced : noneIsPriced();
    if (!unpriced || !Number.isFinite(this.ledger.limitTokens)) return undefined;
    return { spent: this.ledger.spentTokens, limit: this.ledger.limitTokens };
  }

  private tell(): void {
    this.options.link.tellGm({ type: 'gm.status', status: this.status() });
  }
}
