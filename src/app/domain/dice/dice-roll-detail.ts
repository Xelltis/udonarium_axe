/**
 * What the dice held.
 *
 * The library returns each roll and its outcome. The formatted text alone leaves no way to
 * count afterwards what a roll showed, so this puts the rest into a form that can travel with
 * the line.
 *
 * Reading it back out of the text is not an option: the wording differs between systems,
 * and what you would be reading has already been through substitutions and inserted breaks.
 */

export type DiceRollOutcome = 'critical' | 'fumble' | 'success' | 'failure' | '';

export interface DiceRollFace {
  /** How many faces the die has. */
  sides: number;
  /** What it showed. */
  value: number;
  /** Which kind of roll the library called it, which includes the digits of a percentile. */
  kind: string;
}

export interface DiceRollDetail {
  /** Which system it was rolled under. */
  system: string;
  faces: readonly DiceRollFace[];
  outcome: DiceRollOutcome;
}

/** Copies only the parts of the library's result this tool uses. */
export interface DiceRollSource {
  detailedRands?: readonly { kind?: unknown; sides?: unknown; value?: unknown }[];
  rands?: readonly (readonly number[])[];
  success?: unknown;
  failure?: unknown;
  critical?: unknown;
  fumble?: unknown;
}

/**
 * Picks the faces and the outcome out of the library's roll result, to travel with the line. Null
 * when there is no result, or it holds neither.
 */
export function diceRollDetailOf(system: string, source: DiceRollSource | null | undefined): DiceRollDetail | null {
  if (!source) return null;

  const faces = facesOf(source);
  const outcome = outcomeOf(source);
  if (faces.length < 1 && outcome === '') return null;

  return { system, faces, outcome };
}

/** The text carried with the line. Unreadable, it comes back as nothing. */
export function encodeDiceRollDetail(detail: DiceRollDetail | null): string {
  if (!detail) return '';
  try {
    return JSON.stringify(detail);
  } catch {
    return '';
  }
}

/**
 * Reads back the detail carried with a line, keeping only well-formed faces and a known outcome.
 * Null for empty or unreadable text, or text that holds neither.
 */
export function parseDiceRollDetail(raw: string | null | undefined): DiceRollDetail | null {
  if (!raw || raw.length < 1) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<DiceRollDetail>;
    if (!parsed || typeof parsed !== 'object') return null;

    const faces = Array.isArray(parsed.faces) ? parsed.faces.filter(isFace) : [];
    const outcome = isOutcome(parsed.outcome) ? parsed.outcome : '';
    if (faces.length < 1 && outcome === '') return null;

    return { system: typeof parsed.system === 'string' ? parsed.system : '', faces, outcome };
  } catch {
    // Older room data may hold something else in it, and what cannot be read passes through as nothing.
    return null;
  }
}

/** Lists the rolls alone, for counting a distribution. */
export function diceRollValues(detail: DiceRollDetail | null, sides?: number): number[] {
  if (!detail) return [];
  return detail.faces.filter((face) => sides == null || face.sides === sides).map((face) => face.value);
}

function facesOf(source: DiceRollSource): DiceRollFace[] {
  const detailed = source.detailedRands;
  if (Array.isArray(detailed)) {
    return detailed
      .map((entry) => ({
        sides: numberOf(entry?.sides),
        value: numberOf(entry?.value),
        kind: typeof entry?.kind === 'string' ? entry.kind : 'normal',
      }))
      .filter((face) => face.sides > 0);
  }

  // The older form, which holds the roll and then the number of faces.
  const rands = source.rands;
  if (!Array.isArray(rands)) return [];
  return rands
    .map((pair) => ({ sides: numberOf(pair?.[1]), value: numberOf(pair?.[0]), kind: 'normal' }))
    .filter((face) => face.sides > 0);
}

function outcomeOf(source: DiceRollSource): DiceRollOutcome {
  // A critical or a fumble can carry a success or a failure with it, so the strongest is read first.
  if (source.critical === true) return 'critical';
  if (source.fumble === true) return 'fumble';
  if (source.success === true) return 'success';
  if (source.failure === true) return 'failure';
  return '';
}

function isFace(value: unknown): value is DiceRollFace {
  if (!value || typeof value !== 'object') return false;
  const face = value as Partial<DiceRollFace>;
  return typeof face.sides === 'number' && face.sides > 0 && typeof face.value === 'number';
}

function isOutcome(value: unknown): value is DiceRollOutcome {
  return value === 'critical' || value === 'fumble' || value === 'success' || value === 'failure' || value === '';
}

function numberOf(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
