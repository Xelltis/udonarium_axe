/**
 * The ways a text layer's letters can come on one at a time, and where each letter stands at a
 * moment.
 *
 * Like the running touches in `cut-in-effect.ts`, a letter's pose is a function of the clock and
 * nothing else, so the keyframes handed to the browser and the frames of a replay video come out
 * the same.
 */
import { toGraphemes } from '@axe/core/util/graphemes';

/**
 * `type` puts each letter down at once, as a typewriter does; `fade`, `pop` and `slide` bring each
 * in over a short while; `wave` and `shake` keep the letters moving once they are on.
 */
export const LETTER_MOTIONS = ['type', 'fade', 'pop', 'slide', 'wave', 'shake'] as const;
export type LetterMotion = (typeof LETTER_MOTIONS)[number];

/** The motion a stored value names, or null for none, which is how empty and unknown values read. */
export function letterMotionOf(value: unknown): LetterMotion | null {
  return typeof value === 'string' && (LETTER_MOTIONS as readonly string[]).includes(value)
    ? (value as LetterMotion)
    : null;
}

/** Where a letter stands, in the layer's own pixels, and how much of it shows. */
export interface LetterPose {
  readonly dx: number;
  readonly dy: number;
  readonly rotateDeg: number;
  readonly scale: number;
  readonly opacity: number;
}

/** A letter at rest: where the words put it, wholly shown. */
export const LETTER_AT_REST: LetterPose = { dx: 0, dy: 0, rotateDeg: 0, scale: 1, opacity: 1 };

/**
 * How far apart the letters start, and how long one takes. For `wave` they are how far behind the
 * one before each letter rises and how long a rise and fall takes; `shake` uses neither.
 */
export interface LetterTiming {
  readonly staggerMs: number;
  readonly durationMs: number;
}

const DEFAULT_TIMING: Readonly<Record<LetterMotion, LetterTiming>> = {
  type: { staggerMs: 70, durationMs: 0 },
  fade: { staggerMs: 60, durationMs: 400 },
  pop: { staggerMs: 60, durationMs: 300 },
  slide: { staggerMs: 60, durationMs: 350 },
  wave: { staggerMs: 90, durationMs: 1000 },
  shake: { staggerMs: 0, durationMs: 0 },
};

/** The bounds a stagger and a duration set by hand are held to. */
export const LETTER_STAGGER_MAX_MS = 1000;
export const LETTER_DURATION_MIN_MS = 50;
export const LETTER_DURATION_MAX_MS = 3000;

/**
 * The timing a motion runs at: what was set for the layer, held to its bounds, or the motion's own
 * where 0 or nothing usable was set.
 */
export function letterTimingOf(motion: LetterMotion, staggerMs: unknown, durationMs: unknown): LetterTiming {
  const base = DEFAULT_TIMING[motion];
  const stagger = Number(staggerMs);
  const duration = Number(durationMs);
  return {
    staggerMs: Number.isFinite(stagger) && stagger > 0 ? Math.min(LETTER_STAGGER_MAX_MS, stagger) : base.staggerMs,
    durationMs:
      Number.isFinite(duration) && duration > 0 && base.durationMs > 0
        ? Math.min(LETTER_DURATION_MAX_MS, Math.max(LETTER_DURATION_MIN_MS, duration))
        : base.durationMs,
  };
}

/** One letter of a text, with where it comes in the order the letters come on. */
export interface PlacedLetter {
  readonly text: string;
  readonly rank: number;
}

/**
 * The letters of a text, a line to a list, each with its place in the order they come on. Line
 * breaks are not letters; spaces are, so the gap they leave comes on in its turn.
 */
export function lettersOf(text: string): PlacedLetter[][] {
  let rank = 0;
  return text.split('\n').map((line) => toGraphemes(line).map((letter) => ({ text: letter, rank: rank++ })));
}

/** Whether a motion keeps the letters moving once they are on, rather than settling. */
export function letterMotionKeepsMoving(motion: LetterMotion): boolean {
  return motion === 'wave' || motion === 'shake';
}

/** How far along its coming on the letter with this rank is, from 0 to 1. */
function progress(rank: number, sinceMs: number, timing: LetterTiming): number {
  const into = sinceMs - rank * timing.staggerMs;
  if (timing.durationMs <= 0) return into >= 0 ? 1 : 0;
  return Math.min(1, Math.max(0, into / timing.durationMs));
}

/** Overshoots a little before settling, as a thing popped into place does. */
function backOut(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

/** A number from 0 to 1 that looks random but is the same for the same two numbers anywhere. */
function jitter(a: number, b: number): number {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Where the letter with this rank stands `sinceMs` after its layer came on, for letters `sizePx`
 * high. Before the layer comes on the letters stand as they do at its first moment.
 */
export function letterPoseAt(
  motion: LetterMotion,
  rank: number,
  sinceMs: number,
  sizePx: number,
  timing: LetterTiming
): LetterPose {
  const since = Math.max(0, sinceMs);
  switch (motion) {
    case 'type':
      return { ...LETTER_AT_REST, opacity: progress(rank, since, timing) >= 1 ? 1 : 0 };
    case 'fade':
      return { ...LETTER_AT_REST, opacity: progress(rank, since, timing) };
    case 'pop': {
      const t = progress(rank, since, timing);
      return {
        ...LETTER_AT_REST,
        dy: (1 - t) * 0.25 * sizePx,
        scale: t >= 1 ? 1 : Math.max(0, backOut(t)),
        opacity: Math.min(1, t * 3),
      };
    }
    case 'slide': {
      const t = progress(rank, since, timing);
      return { ...LETTER_AT_REST, dy: (1 - t) ** 3 * 0.5 * sizePx, opacity: t };
    }
    case 'wave': {
      const phase = ((since - rank * timing.staggerMs) / timing.durationMs) * Math.PI * 2;
      return { ...LETTER_AT_REST, dy: -Math.sin(phase) * 0.12 * sizePx };
    }
    case 'shake': {
      const tick = Math.floor(since / 50);
      return {
        ...LETTER_AT_REST,
        dx: (jitter(rank, tick) - 0.5) * 0.12 * sizePx,
        dy: (jitter(rank + 0.5, tick) - 0.5) * 0.12 * sizePx,
        rotateDeg: (jitter(rank, tick + 0.5) - 0.5) * 8,
      };
    }
  }
}

/** The pose written as a CSS transform, about the letter's own middle. */
export function letterTransform(pose: LetterPose): string {
  const round = (value: number) => Math.round(value * 100) / 100;
  return `translate(${round(pose.dx)}px, ${round(pose.dy)}px) rotate(${round(pose.rotateDeg)}deg) scale(${round(pose.scale)})`;
}

/** One keyframe of a letter: where on the scene's clock, as a share of it, and how it stands. */
export interface LetterFrame {
  readonly offset: number;
  readonly transform: string;
  readonly opacity: number;
}

/** How many steps a letter's coming on is cut into. */
const ENTRANCE_STEPS = 8;
/** How often a letter that keeps moving is sampled, at the most. */
const MOVING_STEP_MS = 40;

/**
 * The keyframes of the letter with this rank across a whole scene of `sceneMs`, for a layer on
 * screen from `startMs` to `endMs`. Its coming on is cut finely, with its first and last moments
 * always among the frames; a letter that keeps moving is sampled through the layer's time on
 * screen, never more than `budget` times.
 */
export function letterFrames(
  motion: LetterMotion,
  rank: number,
  window: { readonly startMs: number; readonly endMs: number },
  sceneMs: number,
  sizePx: number,
  timing: LetterTiming,
  budget = 240
): LetterFrame[] {
  if (sceneMs <= 0) return [];
  const { startMs, endMs } = window;
  const times = new Set<number>([0, startMs, endMs, sceneMs]);
  if (letterMotionKeepsMoving(motion)) {
    const step = Math.max(MOVING_STEP_MS, (endMs - startMs) / Math.max(1, budget));
    for (let at = startMs; at <= endMs; at += step) times.add(at);
  } else {
    const comesOn = startMs + rank * timing.staggerMs;
    if (timing.durationMs <= 0) {
      times.add(comesOn - 0.5);
      times.add(comesOn);
    } else {
      for (let step = 0; step <= ENTRANCE_STEPS; step++)
        times.add(comesOn + (step * timing.durationMs) / ENTRANCE_STEPS);
    }
  }
  return [...times]
    .filter((at) => at >= 0 && at <= sceneMs)
    .sort((a, b) => a - b)
    .map((at) => {
      const pose = letterPoseAt(motion, rank, at - startMs, sizePx, timing);
      return { offset: at / sceneMs, transform: letterTransform(pose), opacity: pose.opacity };
    });
}
