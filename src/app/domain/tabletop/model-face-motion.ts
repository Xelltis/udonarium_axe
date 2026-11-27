import { clamp } from '@axe/core/util/clamp';
import { type ModelFace, NO_SHAPE, type ShapeSway, type ShapeUse } from '@axe/domain/tabletop/model-face';

/** What the name of a shape made for each use is likely to hold. */
const USED_FOR: Readonly<Record<ShapeUse, RegExp>> = {
  blink: /blink|eye[\s_.-]?close|eyes?[\s_.-]?closed|まばたき|瞬き/i,
  mouth: /(^|[\s_.])(aa|a|あ)$|mouth[\s_.-]?open|jaw[\s_.-]?open/i,
  breath: /breath|呼吸/i,
};

/** What ends the name of a shape made for one side alone, as one eye of two. */
const ONE_SIDE = /([\s_.-](l|r)|left|right|左|右)$/i;

/**
 * The shapes a model uses for blinking, speaking or breathing, of those it has: the one asked for by
 * name, none where `-` is asked for, or the model's own, told by their names. A model that shuts each
 * eye with a shape of its own and has none for both blinks with the two together.
 */
export function shapesFor(use: ShapeUse, names: readonly string[], asked: string): string[] {
  if (asked === NO_SHAPE) return [];
  if (asked) {
    const exact = names.find((name) => name === asked) ?? names.find((name) => sameName(name, asked));
    if (exact !== undefined) return [exact];
  }
  const made = names.filter((name) => USED_FOR[use].test(name));
  const whole = made.find((name) => !ONE_SIDE.test(name));
  if (whole !== undefined) return [whole];
  return use === 'blink' ? made.slice(0, 2) : made.slice(0, 1);
}

function sameName(one: string, other: string): boolean {
  return one.trim().toLowerCase() === other.trim().toLowerCase();
}

/** How long a blink takes, in milliseconds, and how long it is from one blink to the next at the least and at the most. */
const BLINK_MS = 170;
const BLINK_GAP_MS = 2600;
const BLINK_GAP_SPREAD_MS = 2800;

/**
 * How far shut the eyes are at a moment, in milliseconds, from 0 to 1: shut and open again in a blink
 * every few seconds, no two gaps alike, worked out from the moment alone so that it is the same
 * whenever that moment is drawn. Models of different seeds blink at different moments.
 */
export function blinkAt(timeMs: number, seed: number): number {
  const slot = BLINK_GAP_MS + BLINK_GAP_SPREAD_MS;
  const shifted = timeMs + unit(seed) * slot;
  const turn = Math.floor(shifted / slot);
  const begins = unit(seed * 31 + turn * 17) * (slot - BLINK_MS);
  const into = shifted - turn * slot - begins;
  if (into < 0 || into > BLINK_MS) return 0;
  return Math.sin((into / BLINK_MS) * Math.PI);
}

/**
 * How far a shape swayed is at a moment, in milliseconds: from nothing to its amount and back, once
 * each period, begun so far into a period as `phase` says, from 0 to 1.
 */
export function swayAt(timeMs: number, sway: Pick<ShapeSway, 'periodMs' | 'amount'>, phase = 0): number {
  const turn = (timeMs / Math.max(1, sway.periodMs) + phase) * 2 * Math.PI;
  return sway.amount * (0.5 - 0.5 * Math.cos(turn));
}

/** How long one breath takes, in milliseconds. */
const BREATH_MS = 3800;

/**
 * How far open a mouth is at a moment of speaking, in milliseconds, from 0 to 1: opening and shutting
 * a few times a second, unevenly, as speech does.
 */
export function mouthAt(timeMs: number, seed = 0): number {
  const phase = timeMs / 1000 + unit(seed) * 10;
  const open = 0.5 + 0.5 * Math.sin(phase * 2 * Math.PI * 4.3);
  const word = 0.6 + 0.4 * Math.sin(phase * 2 * Math.PI * 1.1 + 1.3);
  return clamp(open * word, 0, 1);
}

/** What moves a face at a moment. */
export interface FaceMoment {
  readonly timeMs: number;
  /** Tells one model's blinks and sways from another's. */
  readonly seed: number;
  /** Whether the piece is speaking, which moves its mouth. */
  readonly speaking?: boolean;
  /** Whether nothing moves, as for a reader who asks for less motion: the face is held in its expression alone. */
  readonly still?: boolean;
}

/**
 * How far a model is blended towards each of its shapes at a moment, by name: held in its
 * expression, blinking, breathing, swaying between the shapes it was given to sway between, and
 * speaking while its piece speaks. A shape moved by more than one of these takes the most of them,
 * and a shape the model lacks is left out.
 */
export function shapeWeightsAt(face: ModelFace, names: readonly string[], moment: FaceMoment): Map<string, number> {
  const weights = new Map<string, number>();
  const has = new Set(names);
  const lay = (name: string, weight: number) => {
    if (has.has(name) && weight > 0) weights.set(name, Math.max(weights.get(name) ?? 0, Math.min(1, weight)));
  };
  for (const name of Object.keys(face.weights)) lay(name, face.weights[name]);
  if (moment.still) return weights;
  const blink = blinkAt(moment.timeMs, moment.seed);
  const phase = unit(moment.seed);
  for (const name of shapesFor('blink', names, face.blink)) lay(name, blink);
  for (const name of shapesFor('breath', names, face.breath)) {
    lay(name, swayAt(moment.timeMs, { periodMs: BREATH_MS, amount: 1 }, phase));
  }
  for (const sway of face.sways) lay(sway.name, swayAt(moment.timeMs, sway, phase));
  if (moment.speaking) {
    const open = mouthAt(moment.timeMs, moment.seed);
    for (const name of shapesFor('mouth', names, face.mouth)) lay(name, open);
  }
  return weights;
}

/**
 * Whether a model's shapes move as it stands: it blinks or breathes with a shape of its own, or was
 * given shapes to sway between. One that only holds an expression stands still.
 */
export function faceMoves(face: ModelFace, names: readonly string[]): boolean {
  if (names.length === 0) return false;
  const has = new Set(names);
  return (
    face.sways.some((sway) => has.has(sway.name) && sway.amount > 0) ||
    shapesFor('blink', names, face.blink).length > 0 ||
    shapesFor('breath', names, face.breath).length > 0
  );
}

/** A number from 0 up to 1 told by a seed, the same for the same seed. */
function unit(seed: number): number {
  const mixed = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return mixed - Math.floor(mixed);
}

/** A seed told by a text, as the identifier of a piece: the same for the same text. */
export function seedOf(text: string): number {
  let seed = 0;
  for (let index = 0; index < text.length; index++) seed = (seed * 31 + text.charCodeAt(index)) % 100_003;
  return seed;
}
