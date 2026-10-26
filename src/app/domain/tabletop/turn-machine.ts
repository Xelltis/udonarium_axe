import { BuffTiming } from '@axe/domain/character/buff-timing';
import { FactionPhaseMode, TurnOrderMode } from '@axe/domain/tabletop/turn-order-mode';
import { mayHoldTurn, mayInterruptTurn } from '@axe/domain/tabletop/turn-roster';
import { nextSide, resolveCurrentSide, SideGroup } from '@axe/domain/tabletop/turn-side';
import { NO_HOLDING, TurnHolding, TurnPhase, turnStartMark } from '@axe/domain/tabletop/turn-state';

/** What the chat is told as a piece is handed the turn, begins to wait, steps in or is gone back to. */
export type TurnAnnouncement = 'announce' | 'holdAnnounce' | 'interruptAnnounce' | 'resumeAnnounce';

/** Where the round stands. */
export interface TurnSnapshot {
  readonly round: number;
  readonly phase: TurnPhase;
  readonly currentIdentifier: string;
  /** The side whose phase it is, as held, which may name a side that has since gone. */
  readonly currentSide: string;
  /** Who has had their turn this round, in the order they took it. */
  readonly acted: readonly string[];
  readonly holding: TurnHolding;
  /** Whose turn last began and when, as `turnStartMark` writes it. */
  readonly turnStart: string;
}

/** Who the round goes round and how, as it stands for one press of it. */
export interface TurnTable {
  readonly mode: TurnOrderMode;
  readonly factionPhaseMode: FactionPhaseMode;
  /** The pieces the round goes round, in order; taken side by side, gathered under their sides. */
  readonly order: readonly string[];
  /** The sides the round goes round, each with its pieces. Empty unless it is taken side by side. */
  readonly sides: readonly SideGroup<string>[];
  /** The pieces that take their turn in a piece's, as a mount and a second rider do in their front rider's. */
  companionsOf(identifier: string): readonly string[];
  /** The side a piece stands on, or null for a piece the room does not hold. */
  sideOf(identifier: string): string | null;
  /** The time now, in milliseconds since the epoch, which a turn handed over is marked with. */
  readonly now: number;
}

/** One thing a press of the round does, in the order it is to be done. */
export type TurnEffect =
  /** Writes these fields of the round. */
  | { readonly kind: 'write'; readonly fields: Partial<TurnSnapshot> }
  /** Tells the chat that a piece is up, waits, steps in or is gone back to. */
  | { readonly kind: 'announce'; readonly identifier: string; readonly announcement: TurnAnnouncement }
  /** Tells the chat that a round began or ended. */
  | { readonly kind: 'roundStart' | 'roundEnd'; readonly round: number }
  /** Tells the chat that a side's phase began. */
  | { readonly kind: 'sidePhaseStart'; readonly side: string }
  /** Tells the chat that the round was taken back to before the first. */
  | { readonly kind: 'reset' }
  /** Counts down the buffs whose moment it is: a piece's turn starting or ending, or, for none, the round's end. */
  | { readonly kind: 'buffs'; readonly timing: BuffTiming; readonly identifier: string }
  /** Sets off whatever a piece stands on as its turn starts or ends. */
  | { readonly kind: 'ground'; readonly identifier: string; readonly moment: 'turnStart' | 'turnEnd' }
  /** Says to whatever waits on it that a piece's turn has begun. */
  | { readonly kind: 'turnStarted'; readonly identifier: string }
  /** Says to whatever waits on it that a turn has ended. */
  | { readonly kind: 'turnEnded' };

/** Where a press of the round leaves it, and what it does on the way, in order. */
export interface TurnOutcome {
  readonly state: TurnSnapshot;
  readonly effects: readonly TurnEffect[];
}

/**
 * The side the round stands on, worked out afresh rather than taken as written: the one it is held
 * on while that side is still there. Empty unless it is taken side by side.
 *
 * A party taken away in the middle of a fight would otherwise leave the round standing on a side no
 * piece is on, with nobody to hand the turn to and no way out of it.
 */
export function roundSide(
  state: Pick<TurnSnapshot, 'currentSide' | 'acted'>,
  table: Pick<TurnTable, 'mode' | 'sides'>
): string {
  if (table.mode !== 'faction') return '';
  // A peer that predates the side being written down sends a turn with no such field, and applying
  // it replaces the whole record rather than merging into it, so what comes here is nothing at all
  // rather than an empty string.
  const held = state.currentSide ?? '';
  if (held.length < 1) return '';
  const acted = new Set(state.acted);
  return resolveCurrentSide(held, table.sides, (group) => group.members.some((member) => !acted.has(member)));
}

/**
 * One press of the round: begins the next round, or closes whoever is up and hands the turn on.
 *
 * Once nobody is waiting the round ends. Taken side by side, the press hands the turn on within the
 * side and only leaves it once nobody on it is waiting, whichever way the side moves through its
 * phase.
 */
export function roundNext(state: TurnSnapshot, table: TurnTable): TurnOutcome {
  return new TurnRun(state, table).next();
}

/**
 * Has a piece wait to step in later in the round; null where it may not.
 *
 * A waiting piece is passed over by the round, and has its turn once nobody else is waiting, unless
 * it steps in before. A piece whose turn it is passes the turn on without it counting as had, and
 * the turn's opening does not run again when it comes back.
 */
export function roundHold(state: TurnSnapshot, table: TurnTable, identifier: string): TurnOutcome | null {
  if (!mayHoldTurn(state, table.order, identifier)) return null;
  return new TurnRun(state, table).hold(identifier);
}

/**
 * Has a waiting piece step in at once; null where it may not. The turn it steps into is not counted
 * as had, and is taken up again when the next press of the round closes the one that stepped in.
 * Taken side by side, the phase stays the side's it was: the piece steps into it rather than opening
 * its own.
 */
export function roundInterrupt(state: TurnSnapshot, table: TurnTable, identifier: string): TurnOutcome | null {
  if (!mayInterruptTurn(state, table.order, identifier)) return null;
  return new TurnRun(state, table).interrupt(identifier);
}

/**
 * Gives the turn to one piece; null where it has it already, taken side by side.
 *
 * Taken side by side, this is how a piece takes its turn rather than a way of pointing at one:
 * whoever was up is closed off first and the piece named is opened, so every piece gets its start
 * and its end exactly once however freely the side moves.
 */
export function roundGiveTurn(state: TurnSnapshot, table: TurnTable, identifier: string): TurnOutcome | null {
  if (table.mode === 'faction' && state.currentIdentifier === identifier) return null;
  return new TurnRun(state, table).giveTurn(identifier);
}

/** Closes the round, where one is under way, and begins the next, whoever is still to move. */
export function roundAdvance(state: TurnSnapshot, table: TurnTable): TurnOutcome {
  return new TurnRun(state, table).advance();
}

/** Takes the round back to before the first. */
export function roundReset(state: TurnSnapshot, table: TurnTable): TurnOutcome {
  return new TurnRun(state, table).reset();
}

/**
 * Ends the turns of pieces taking theirs in the one being taken, ahead of it, as a mount's does when
 * the one riding it in front gets off: they have had their turn this round. Does nothing while no
 * turn is being taken, or for a piece that has had its turn already.
 */
export function roundCloseInPassing(
  state: TurnSnapshot,
  table: TurnTable,
  identifiers: readonly string[]
): TurnOutcome {
  return new TurnRun(state, table).closeInPassing(identifiers);
}

/** One press of the round being worked out, with where it stands so far and what it has done. */
class TurnRun {
  private readonly effects: TurnEffect[] = [];

  constructor(
    private state: TurnSnapshot,
    private readonly table: TurnTable
  ) {}

  next(): TurnOutcome {
    if (this.table.mode === 'faction') {
      this.nextSideStep();
      return this.outcome();
    }
    const { phase, round, currentIdentifier } = this.state;
    if (phase === 'idle' || phase === 'roundEnd') {
      this.beginRound(round + 1);
    } else if (phase === 'roundStart') {
      this.handOver(this.nextInOrder(this.table.order));
    } else {
      // Whoever was up has now had their turn, wherever in the order they were given it.
      this.endTurnOf(currentIdentifier);
      this.do({ kind: 'turnEnded' });
      this.handOnward(this.table.order);
    }
    return this.outcome();
  }

  hold(identifier: string): TurnOutcome {
    const isUp = this.state.phase === 'acting' && this.state.currentIdentifier === identifier;
    const holding = this.state.holding;
    this.write({
      holding: {
        ...holding,
        held: [...holding.held, identifier],
        begun: isUp ? [...holding.begun, identifier] : holding.begun,
      },
    });
    this.announce(identifier, 'holdAnnounce');
    if (isUp) {
      this.do({ kind: 'turnEnded' });
      if (this.table.mode === 'faction') this.passOnInSide();
      else this.handOnward(this.table.order);
    }
    return this.outcome();
  }

  interrupt(identifier: string): TurnOutcome {
    const current = this.state.phase === 'acting' ? this.state.currentIdentifier : '';
    if (current.length > 0) {
      this.do({ kind: 'turnEnded' });
      const holding = this.state.holding;
      this.write({ holding: { ...holding, interrupted: [...holding.interrupted, current] } });
    }
    this.takeTurn(identifier, 'interruptAnnounce');
    return this.outcome();
  }

  giveTurn(identifier: string): TurnOutcome {
    if (this.state.round < 1) this.write({ round: 1 });
    if (this.table.mode === 'faction') {
      this.closeCurrentPiece();
      this.standOnSideOf(identifier);
      this.takeTurn(identifier);
      return this.outcome();
    }
    this.release(identifier);
    this.write({
      phase: 'acting',
      currentIdentifier: identifier,
      turnStart: turnStartMark(identifier, this.table.now),
    });
    this.announce(identifier, 'announce');
    return this.outcome();
  }

  advance(): TurnOutcome {
    if (this.state.phase === 'acting' || this.state.phase === 'roundStart') this.finishRound();
    this.beginRound(this.state.round + 1);
    return this.outcome();
  }

  reset(): TurnOutcome {
    this.write({ round: 0, phase: 'idle', currentIdentifier: '', currentSide: '', acted: [], holding: NO_HOLDING });
    this.do({ kind: 'reset' });
    return this.outcome();
  }

  closeInPassing(identifiers: readonly string[]): TurnOutcome {
    if (this.state.phase === 'acting') {
      for (const identifier of identifiers) if (!this.isActed(identifier)) this.closeTurnOf(identifier);
    }
    return this.outcome();
  }

  private outcome(): TurnOutcome {
    return { state: this.state, effects: this.effects };
  }

  /** Writes fields of the round, folded into the write just before where nothing came between. */
  private write(fields: Partial<TurnSnapshot>): void {
    this.state = { ...this.state, ...fields };
    const last = this.effects[this.effects.length - 1];
    if (last?.kind === 'write')
      this.effects[this.effects.length - 1] = { kind: 'write', fields: { ...last.fields, ...fields } };
    else this.effects.push({ kind: 'write', fields });
  }

  private do(effect: TurnEffect): void {
    this.effects.push(effect);
  }

  private announce(identifier: string, announcement: TurnAnnouncement): void {
    this.do({ kind: 'announce', identifier, announcement });
  }

  private isActed(identifier: string): boolean {
    return this.state.acted.includes(identifier);
  }

  /** Hands the turn on once whoever was up is done with it: back to a turn stepped into, else to the next. */
  private handOnward(order: readonly string[]): void {
    if (this.resumeInterrupted()) return;
    this.handOver(this.nextInOrder(order));
  }

  /**
   * Takes up again the latest turn stepped into that is still to be had, and says whether there was
   * one. Its opening ran when it was first handed over, so it does not run again.
   */
  private resumeInterrupted(): boolean {
    const holding = this.state.holding;
    const order = new Set(this.table.order);
    const stack = [...holding.interrupted];
    while (stack.length > 0) {
      const identifier = stack.pop()!;
      if (!order.has(identifier) || this.isActed(identifier)) continue;
      this.write({ holding: { ...holding, interrupted: stack } });
      this.release(identifier);
      this.enterActing(identifier, 'resumeAnnounce');
      return true;
    }
    if (holding.interrupted.length > 0) this.write({ holding: { ...holding, interrupted: [] } });
    return false;
  }

  /** Where the round is taken side by side, stands it on the side of the piece being handed the turn. */
  private standOnSideOf(identifier: string): void {
    if (this.table.mode !== 'faction') return;
    const side = this.table.sideOf(identifier);
    if (side !== null) this.write({ currentSide: side });
  }

  /**
   * One press of the round, taken side by side. A press that closed the whole phase would take the
   * turn away from everyone who had not moved yet, which is the one thing a press of the round
   * should never do quietly.
   */
  private nextSideStep(): void {
    const { phase, round } = this.state;
    if (phase === 'idle' || phase === 'roundEnd') {
      this.beginRound(round + 1);
      return;
    }
    if (phase === 'roundStart') {
      this.openSide(nextSide('', this.table.sides, (group) => this.hasWaiting(group)));
      return;
    }
    this.closeCurrentPiece();
    this.passOnInSide();
  }

  /**
   * Hands the turn on within the side once whoever was up is done with it, and only leaves the side
   * once nobody on it is waiting to be reached. A turn stepped into is taken up first.
   */
  private passOnInSide(): void {
    if (this.resumeInterrupted()) return;
    const side = roundSide(this.state, this.table);
    const waiting = this.firstWaiting(this.membersOfSide(side));
    if (waiting) {
      this.takeTurn(waiting);
      return;
    }
    this.openSide(nextSide(side, this.table.sides, (group) => this.hasWaiting(group)));
  }

  /** Whether anybody on the side is still to be reached by the round, leaving out those waiting to step in. */
  private hasWaiting(group: SideGroup<string>): boolean {
    return this.firstWaiting(group.members) !== null;
  }

  private membersOfSide(side: string): readonly string[] {
    return this.table.sides.find((group) => group.side === side)?.members ?? [];
  }

  /** Closes off whoever was up, so no piece is left holding a turn it has finished. */
  private closeCurrentPiece(): void {
    const held = this.state.currentIdentifier;
    if (held.length < 1) return;
    this.endTurnOf(held);
    this.do({ kind: 'turnEnded' });
  }

  /** Ends a piece's turn, and the turns of those that took theirs in it. */
  private endTurnOf(identifier: string): void {
    for (const id of [identifier, ...this.table.companionsOf(identifier)]) this.closeTurnOf(id);
  }

  private closeTurnOf(identifier: string): void {
    this.do({ kind: 'ground', identifier, moment: 'turnEnd' });
    this.release(identifier);
    this.markActed(identifier);
    this.do({ kind: 'buffs', timing: 'turnEnd', identifier });
  }

  /** Opens a side's phase, or closes the round where there is no side left to open. */
  private openSide(side: string): void {
    if (side.length < 1) {
      // Every side has been through its phase; whoever is still waiting has their turn now.
      const held = this.firstHeld(this.table.order);
      if (held) {
        this.standOnSideOf(held);
        this.takeTurn(held);
      } else {
        this.finishRound();
      }
      return;
    }
    this.write({ currentSide: side, phase: 'acting', currentIdentifier: '' });
    this.do({ kind: 'sidePhaseStart', side });
    if (this.table.factionPhaseMode !== 'initiative') return;
    const first = this.firstWaiting(this.membersOfSide(side));
    if (first) this.takeTurn(first);
  }

  /** The first in the order who has neither acted nor begun to wait, or nobody. */
  private firstWaiting(order: readonly string[]): string | null {
    const acted = new Set(this.state.acted);
    const held = new Set(this.state.holding.held);
    return order.find((identifier) => !acted.has(identifier) && !held.has(identifier)) ?? null;
  }

  /** The first in the order who is waiting to step in, or nobody. */
  private firstHeld(order: readonly string[]): string | null {
    const acted = new Set(this.state.acted);
    const held = new Set(this.state.holding.held);
    return order.find((identifier) => !acted.has(identifier) && held.has(identifier)) ?? null;
  }

  /** Who the round reaches next: the first not waiting to step in, else the first who is. */
  private nextInOrder(order: readonly string[]): string | null {
    return this.firstWaiting(order) ?? this.firstHeld(order);
  }

  /** Takes a piece out of waiting, and says whether its turn had begun before it began to wait. */
  private release(identifier: string): boolean {
    const holding = this.state.holding;
    if (!holding.held.includes(identifier)) return false;
    this.write({
      holding: {
        ...holding,
        held: holding.held.filter((id) => id !== identifier),
        begun: holding.begun.filter((id) => id !== identifier),
      },
    });
    return holding.begun.includes(identifier);
  }

  private handOver(identifier: string | null): void {
    if (identifier) this.takeTurn(identifier);
    else this.finishRound();
  }

  private markActed(identifier: string): void {
    if (identifier.length < 1 || this.isActed(identifier)) return;
    this.write({ acted: [...this.state.acted, identifier] });
  }

  private beginRound(round: number): void {
    const next = Math.max(1, round);
    this.write({
      round: next,
      phase: 'roundStart',
      currentIdentifier: '',
      currentSide: '',
      acted: [],
      holding: NO_HOLDING,
    });
    this.do({ kind: 'roundStart', round: next });
  }

  /**
   * Hands the turn over, and lets whatever waits on its opening run out, unless it opened already
   * before the piece began to wait.
   */
  private takeTurn(identifier: string, announcement: TurnAnnouncement = 'announce'): void {
    const begun = this.release(identifier);
    this.enterActing(identifier, announcement);
    if (begun) return;
    for (const id of [identifier, ...this.table.companionsOf(identifier)]) {
      this.do({ kind: 'buffs', timing: 'turnStart', identifier: id });
      this.do({ kind: 'turnStarted', identifier: id });
      this.do({ kind: 'ground', identifier: id, moment: 'turnStart' });
    }
  }

  private enterActing(identifier: string, announcement: TurnAnnouncement): void {
    this.write({
      phase: 'acting',
      currentIdentifier: identifier,
      turnStart: turnStartMark(identifier, this.table.now),
    });
    this.announce(identifier, announcement);
  }

  /** Closes the round, counting down what waits on its end. */
  private finishRound(): void {
    const round = Math.max(1, this.state.round);
    this.write({ round, phase: 'roundEnd', currentIdentifier: '', currentSide: '', holding: NO_HOLDING });
    this.do({ kind: 'roundEnd', round });
    this.do({ kind: 'buffs', timing: 'roundEnd', identifier: '' });
    this.do({ kind: 'turnEnded' });
  }
}
