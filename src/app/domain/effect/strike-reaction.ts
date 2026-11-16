import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import { knockTurnOf, type StrikeLook, strikeLookOf, UNTHROWN_WAY } from '@axe/domain/effect/strike-looks';

/*
 * How a strike moves the pieces. The one who strikes draws back as the blow is drawn back and is
 * carried in after it as it lands. What it lands on is knocked back: a jab snaps it back and lets it
 * stand again at once, buckling a little; a swing sends it skidding away, carried on round the way it
 * sweeps, ringing where it stops before it walks back; and a crushing blow throws it up off its feet and back, to come down, bounce once and
 * stand back long after.
 */

/** How a strike moves what it lands on and the one who throws it, in cells and milliseconds. */
interface StrikeMotion {
  /** How far what it lands on is thrown back, how long that takes, and how long it is held there before it stands back over `backMs`. */
  readonly thrown: number;
  readonly outMs: number;
  readonly heldMs: number;
  readonly backMs: number;
  /** How far it is thrown up off the floor, below nothing for a blow that buckles it instead, and how far it bounces as it comes down. */
  readonly lifted: number;
  readonly bounce: number;
  /** How far it shudders each way where it stops, as a ringing blow leaves it. */
  readonly rings: number;
  /** How far the one who strikes draws back, how far it is carried in after its blow, and how long it stays there. */
  readonly drawsBack: number;
  readonly carried: number;
  readonly carriedForMs: number;
}

const MOTIONS: Record<StrikeLook, StrikeMotion> = {
  jab: {
    thrown: 0.18,
    outMs: 45,
    heldMs: 40,
    backMs: 320,
    lifted: -0.05,
    bounce: 0,
    rings: 0,
    drawsBack: 0.07,
    carried: 0.17,
    carriedForMs: 300,
  },
  swing: {
    thrown: 0.36,
    outMs: 130,
    heldMs: 230,
    backMs: 420,
    lifted: 0,
    bounce: 0,
    rings: 0.018,
    drawsBack: 0.11,
    carried: 0.15,
    carriedForMs: 420,
  },
  crush: {
    thrown: 0.42,
    outMs: 100,
    heldMs: 760,
    backMs: 520,
    lifted: 0.17,
    bounce: 0.05,
    rings: 0.012,
    drawsBack: 0.12,
    carried: 0.24,
    carriedForMs: 700,
  },
};

/** How far a strike drawn as a blow throws what it lands on back over the floor, in cells, and how long that takes, in seconds. */
export function strikeThrowOf(look: StrikeLook): { readonly cells: number; readonly outS: number } {
  return { cells: MOTIONS[look].thrown, outS: MOTIONS[look].outMs / 1000 };
}

/** How long a piece thrown up off the floor takes to come down, and to bounce once, in milliseconds. */
const COMES_DOWN_MS = 240;
const BOUNCES_MS = 150;
/** How long the one who strikes takes to be carried in, and to stand back, in milliseconds. */
const CARRIED_IN_MS = 40;
const STANDS_BACK_MS = 300;

type Add = (identifier: string, jolt: { x: number; y: number; z: number }) => void;

/**
 * Adds how a strike moves the pieces at a moment on its own clock, through `add`: see the head of
 * this file. Each later target is struck as the first is, its stagger later.
 */
export function addStrikeJolts(
  preset: EffectPreset,
  cast: EffectCast,
  elapsedMs: number,
  cellPx: number,
  landsAtMs: number,
  add: Add
): void {
  const look = strikeLookOf(preset);
  const motion = MOTIONS[look];
  const turn = knockTurnOf(look);
  const first = cast.targets[0];
  if (first && cast.casterIdentifier.length > 0 && cast.origin) {
    const lean = strikerLeanAt(motion, elapsedMs, landsAtMs) * cellPx;
    const way = wayOf(cast, first);
    if (lean !== 0) add(cast.casterIdentifier, { x: way.x * lean, y: way.y * lean, z: 0 });
  }
  cast.targets.forEach((target, index) => {
    const since = elapsedMs - preset.stagger * index - landsAtMs;
    if (since <= 0 || since >= struckForMs(motion)) return;
    const away = turned(wayOf(cast, target), turn);
    const far = thrownAt(motion, since);
    const shudder = motion.rings * ringingAt(motion, since);
    const along = (far * motion.thrown + shudder * Math.sin(since * 0.21 + index * 2.1)) * cellPx;
    const across = shudder * Math.sin(since * 0.17 + index * 4.3) * cellPx;
    add(target.identifier, {
      x: away.x * along - away.y * across,
      y: away.y * along + away.x * across,
      z: liftedAt(motion, since) * cellPx,
    });
  });
}

/** When, on a strike's own clock, the last piece it moves stands still again, in milliseconds. */
export function strikeJoltsEndOf(preset: EffectPreset, cast: EffectCast, landsAtMs: number): number {
  const motion = MOTIONS[strikeLookOf(preset)];
  const lastTarget = preset.stagger * Math.max(0, cast.targets.length - 1);
  return landsAtMs + Math.max(lastTarget + struckForMs(motion), motion.carriedForMs + STANDS_BACK_MS);
}

function struckForMs(motion: StrikeMotion): number {
  return motion.outMs + motion.heldMs + motion.backMs;
}

/** How far a struck piece is thrown back some time after the blow, as a share of its throw: out fast, held, and back. */
function thrownAt(motion: StrikeMotion, since: number): number {
  if (since < motion.outMs) return easeOut(since / motion.outMs);
  const back = (since - motion.outMs - motion.heldMs) / motion.backMs;
  return back <= 0 ? 1 : 1 - easeInOut(Math.min(1, back));
}

/** How far a struck piece is off the floor some time after the blow, in cells: up and down again, or buckled. */
function liftedAt(motion: StrikeMotion, since: number): number {
  if (motion.lifted < 0) return motion.lifted * thrownAt(motion, since);
  if (since < COMES_DOWN_MS) return motion.lifted * Math.sin((since / COMES_DOWN_MS) * Math.PI);
  const bouncing = (since - COMES_DOWN_MS) / BOUNCES_MS;
  return bouncing < 1 ? motion.bounce * Math.sin(bouncing * Math.PI) : 0;
}

/** How hard a struck piece shudders where it stops, as a share: from where it stops, dying away as it stands back. */
function ringingAt(motion: StrikeMotion, since: number): number {
  if (since < motion.outMs) return 0;
  return Math.max(0, 1 - (since - motion.outMs) / (motion.heldMs + motion.backMs * 0.5));
}

/**
 * How far the one who strikes is drawn towards its target at a moment, in cells: back, below nothing,
 * while its blow is drawn back; carried in as it lands and held there; standing again after.
 */
function strikerLeanAt(motion: StrikeMotion, elapsedMs: number, landsAtMs: number): number {
  if (elapsedMs <= 0) return 0;
  const swingsIn = Math.max(1, landsAtMs - CARRIED_IN_MS);
  if (elapsedMs < swingsIn) return -motion.drawsBack * Math.sin(((elapsedMs / swingsIn) * Math.PI) / 2);
  if (elapsedMs < landsAtMs) {
    const share = (elapsedMs - swingsIn) / Math.max(1, landsAtMs - swingsIn);
    return -motion.drawsBack + (motion.drawsBack + motion.carried) * share;
  }
  const standing = (elapsedMs - landsAtMs - motion.carriedForMs) / STANDS_BACK_MS;
  return standing <= 0 ? motion.carried : motion.carried * (1 - easeInOut(Math.min(1, standing)));
}

/** The way from where a cast's strike comes in to a piece, over the floor and of length one. */
function wayOf(cast: EffectCast, piece: { x: number; y: number }): { readonly x: number; readonly y: number } {
  if (!cast.origin) return UNTHROWN_WAY;
  const dx = piece.x - cast.origin.x;
  const dy = piece.y - cast.origin.y;
  const far = Math.hypot(dx, dy);
  return far < 1 ? UNTHROWN_WAY : { x: dx / far, y: dy / far };
}

/** A level way turned to its right by an angle, in radians. */
function turned(
  way: { readonly x: number; readonly y: number },
  turn: number
): { readonly x: number; readonly y: number } {
  if (turn === 0) return way;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  return { x: way.x * cos - way.y * sin, y: way.y * cos + way.x * sin };
}

function easeOut(share: number): number {
  const left = 1 - Math.min(1, Math.max(0, share));
  return 1 - left * left * left;
}

function easeInOut(share: number): number {
  return share < 0.5 ? 4 * share * share * share : 1 - Math.pow(-2 * share + 2, 3) / 2;
}
