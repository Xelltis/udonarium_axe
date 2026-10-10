import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import {
  encodeSwitchDefinition,
  parseSwitchDefinition,
  SwitchDefinition,
} from '@axe/domain/tabletop/board-switch/switch-definition';
import { readSpentBy, writeSpentBy } from '@axe/domain/tabletop/trigger-event';

/**
 * What happens when somebody presses the thing it is attached to.
 *
 * It hangs under what it belongs to as a child of its own rather than being written onto it.
 * An older peer that moves or locks a block hands the block's settings over whole, and anything
 * it had never heard of would go with them; a child is left alone. An older version reading a
 * saved table does not know the name and passes over it, so the block comes back as a block.
 *
 * What it does is kept as one piece of text, so the fields it has are the fields it will always
 * have: an older build writing down that it was pressed carries the text across untouched, and
 * whatever a newer build added to it survives the trip.
 */
@SyncObject('board-switch')
export class BoardSwitch extends ObjectNode {
  /** What it is called and what it does, as `encodeSwitchDefinition` writes it. */
  @SyncVar() definition: string = '';
  /** Whether it has been used up, where it could only be pressed once. */
  @SyncVar() spent: boolean = false;
  /** Who has pressed it already, where each may press it once. Space separated. */
  @SyncVar() spentBy: string = '';
  /** The round it was last pressed in, where it may be pressed once a round. Below nought is none. */
  @SyncVar() spentRound: number = -1;
  /** Whether it has been taken off the table for good, kept rather than destroyed. */
  @SyncVar() retired: boolean = false;

  /** What it is called and what it does, read afresh each time. */
  get def(): SwitchDefinition {
    return parseSwitchDefinition(this.definition);
  }

  /** Writes down what it is called and what it does. */
  write(definition: SwitchDefinition): void {
    const encoded = encodeSwitchDefinition(definition);
    if (encoded !== this.definition) this.definition = encoded;
  }

  /**
   * The round it was last pressed in.
   *
   * A table saved without it, or an older peer handing over nothing, reads as never pressed:
   * read as nought, the empty answer would say the switch had been pressed in the first round.
   */
  get lastRound(): number {
    const held: unknown = this.spentRound;
    if (typeof held === 'string' && held.trim().length < 1) return -1;
    const round = Number(held);
    return Number.isFinite(round) ? round : -1;
  }
}

/**
 * Whether it has a press left for this presser, in this round.
 *
 * Asked of the presser rather than of the switch alone, since a chest one piece has opened is not
 * a chest spent for the next. A round below nought is a table counting no rounds, where a switch
 * pressed once a round is pressed once and no more.
 */
export function switchHasGoFor(target: BoardSwitch, presser: string, round: number): boolean {
  const repeats = target.def.repeat;
  if (repeats === 'once') return !target.spent;
  if (repeats === 'oncePerPiece') return !readSpentBy(target.spentBy).includes(presser);
  if (repeats === 'oncePerRound') return target.lastRound !== round;
  return true;
}

/** Writes down that it has been pressed, by this presser, in this round. */
export function spendSwitch(target: BoardSwitch, presser: string, round: number): void {
  const repeats = target.def.repeat;
  if (repeats === 'once' && !target.spent) target.spent = true;
  if (repeats === 'oncePerPiece') {
    const had = readSpentBy(target.spentBy);
    if (!had.includes(presser)) target.spentBy = writeSpentBy([...had, presser]);
  }
  if (repeats === 'oncePerRound' && target.lastRound !== round) target.spentRound = round;
}

/** Whether anything has been written down about it being pressed, or it was put away by a press. */
export function switchWasPressed(target: BoardSwitch): boolean {
  return Boolean(target.spent) || Boolean(target.retired) || target.spentBy.trim().length > 0 || target.lastRound >= 0;
}

/**
 * Forgets that it was ever pressed, so the master can set it again.
 *
 * Painted ground a press put away is set back out as well: it is kept rather than destroyed so
 * that this is possible, and a master trying out a switch for real would otherwise have no way
 * back but to paint it again.
 */
export function resetSwitch(target: BoardSwitch): void {
  if (target.spent) target.spent = false;
  if (target.spentBy.length > 0) target.spentBy = '';
  if (target.lastRound !== -1) target.spentRound = -1;
  if (target.retired) target.retired = false;
}

/** The switch hung under something, or null where it has none. */
export function switchOf(host: ObjectNode | null | undefined): BoardSwitch | null {
  if (!host) return null;
  for (const child of host.children) if (child instanceof BoardSwitch) return child;
  return null;
}
