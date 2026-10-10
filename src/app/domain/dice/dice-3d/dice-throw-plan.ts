import { DieShape, polyhedronOf } from '@axe/domain/dice/dice-3d/polyhedra';
import { DiceRollDetail, DiceRollFace } from '@axe/domain/dice/dice-roll-detail';

/** How a die's faces are written: its usual numbers, the tens of a percentile, or a d3 on a d6. */
export type DieLabels = 'standard' | 'tens' | 'd3';

/** One die to throw, and the face it has to come to rest showing. */
export interface DieToThrow {
  readonly shape: DieShape;
  readonly labels: DieLabels;
  /** The face that has to end up on top, or the corner for a d4. */
  readonly target: number;
  /** What that face says. */
  readonly shows: string;
}

/** The dice of one roll, and how many more were rolled than are thrown. */
export interface ThrowPlan {
  readonly dice: readonly DieToThrow[];
  readonly overflow: number;
}

/** The most dice thrown on one tray; a larger roll is shared out over several. */
export const MAX_DICE_PER_TRAY = 50;
/** The most trays one roll is thrown on. */
export const MAX_TRAYS = 4;
/** The most dice one roll throws on screen; the rest are only counted. */
export const MAX_THROWN_DICE = MAX_DICE_PER_TRAY * MAX_TRAYS;

const SHAPE_BY_SIDES: Readonly<Record<number, DieShape>> = {
  4: 'd4',
  6: 'd6',
  8: 'd8',
  10: 'd10',
  12: 'd12',
  20: 'd20',
};

const EMPTY_PLAN: ThrowPlan = { dice: [], overflow: 0 };

/**
 * The dice to throw for a roll, each with the face it has to land on to show what the roll came
 * to.
 *
 * - A d4, d6, d8, d10, d12 or d20 is thrown as itself; a d10's 10 reads 0.
 * - A d100 is a pair of d10, one for the tens from 00 to 90 and one for the units, 100 reading
 *   00 and 0.
 * - The tens and units a system rolls as a percentile pair are thrown as those two d10.
 * - A d3 is a d6 numbered 1 to 3 twice.
 * - Anything else, such as a d2 or a choice among seven, is not thrown at all.
 *
 * No more than two hundred dice are thrown; the rest are counted as overflow.
 */
export function throwPlanOf(detail: DiceRollDetail | null): ThrowPlan {
  if (!detail || detail.faces.length < 1) return EMPTY_PLAN;
  const all = detail.faces.flatMap(diceFor);
  if (all.length < 1) return EMPTY_PLAN;
  return { dice: all.slice(0, MAX_THROWN_DICE), overflow: Math.max(0, all.length - MAX_THROWN_DICE) };
}

/**
 * A roll's dice shared out over as few trays as hold them, as evenly as they go and in the order
 * they were rolled: a hundred and twenty go forty to a tray rather than fifty, fifty and twenty,
 * since a tray is sized by its dice and a small one would show its dice larger than the rest.
 */
export function traysOf(dice: readonly DieToThrow[]): DieToThrow[][] {
  const count = Math.ceil(dice.length / MAX_DICE_PER_TRAY);
  const trays: DieToThrow[][] = [];
  let from = 0;
  for (let tray = 0; tray < count; tray++) {
    const size = Math.floor(dice.length / count) + (tray < dice.length % count ? 1 : 0);
    trays.push(dice.slice(from, from + size));
    from += size;
  }
  return trays;
}

/** What one face of a die says, for the shape and the way it is numbered. */
export function labelOf(shape: DieShape, labels: DieLabels, index: number): string {
  const value = polyhedronOf(shape).values[index];
  if (labels === 'tens') return `${value}0`.padStart(2, '0');
  if (labels === 'd3') return String(((value - 1) % 3) + 1);
  return String(value);
}

/** Whether a number reads the same upside down as another, and so wants a mark beneath it. */
export function wantsUnderline(label: string): boolean {
  return label === '6' || label === '9';
}

function diceFor(face: DiceRollFace): DieToThrow[] {
  if (face.kind === 'tens_d10') return pick('d10', 'tens', `${Math.floor(face.value / 10)}0`.padStart(2, '0'));
  if (face.kind === 'd9') return pick('d10', 'standard', String(face.value));
  if (face.sides === 100) {
    const tens = Math.floor((face.value % 100) / 10);
    return [...pick('d10', 'tens', `${tens}0`.padStart(2, '0')), ...pick('d10', 'standard', String(face.value % 10))];
  }
  if (face.sides === 3) return pick('d6', 'd3', String(face.value));
  const shape = SHAPE_BY_SIDES[face.sides];
  if (!shape) return [];
  return pick(shape, 'standard', String(shape === 'd10' ? face.value % 10 : face.value));
}

function pick(shape: DieShape, labels: DieLabels, shows: string): DieToThrow[] {
  const poly = polyhedronOf(shape);
  const count = poly.readsCorners ? poly.vertices.length : poly.faces.length;
  for (let index = 0; index < count; index++) {
    if (labelOf(shape, labels, index) === shows) return [{ shape, labels, target: index, shows }];
  }
  return [];
}
