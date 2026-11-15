import { clamp } from '@axe/core/util/clamp';
import { isCurseAlone } from '@axe/domain/effect/ailment-looks';
import { addAilmentJolts, ailmentJoltsEndOf } from '@axe/domain/effect/ailment-reaction';
import { cutCarriesOf, type CutCarry, strikesFromOverhead } from '@axe/domain/effect/blade-looks';
import { breathSurgeAt, breathTimingOf, isGentleBreath } from '@axe/domain/effect/breath-timing';
import { heavesGround } from '@axe/domain/effect/earth-looks';
import { type EffectBlow, effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { type EffectKind } from '@axe/domain/effect/effect-kind';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import { burstsFromBelow, fallsFromAbove } from '@axe/domain/effect/holy-looks';
import { isGust, isTornado, tornadoTimingOf } from '@axe/domain/effect/wind-looks';

/** How far a piece is drawn off where it stands for a moment, in table pixels: x to the east, y to the south and z up. */
export interface EffectJolt {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** How long after its hold a struck piece is furthest back, in milliseconds; it is back where it stands some five times later. */
const THROWN_FURTHEST_MS = 60;
/** How long a struck piece is thrown for, after which it stands still again. */
const THROWN_FOR_MS = 420;
/** The most a piece is thrown back by blows landing one after another, as a share of a cell. */
const MOST_THROWN_CELLS = 0.25;
/** A blow from no direction, as one falling from above, presses the piece down by this share of its throw instead. */
const PRESSED_DOWN = 0.5;
/** How far what heaves the ground throws a piece up off the floor, against how far a blow would throw it back. */
const HEAVED_UP = 1.5;
/** How far the one who strikes leans in towards the target as the effect sets off, as a share of a cell, and for how long. */
const LEAN_CELLS = 0.12;
const LEAN_IN_MS = 140;
const LEAN_FOR_MS = 360;

/** How far a piece is pushed downwind while a breath blows on it, as a share of a cell, by grade. */
const BLOWN_CELLS_BY_GRADE: Record<1 | 2 | 3, number> = { 1: 0.05, 2: 0.08, 3: 0.12 };
/** How far a piece blown on trembles each way about where it is pushed to, as a share of a cell. */
const TREMBLE_CELLS = 0.018;
/** How long a piece takes to be pushed as far as it goes once the breath reaches it, and to stand back once it fails, in milliseconds. */
const BLOWN_BACK_IN_MS = 120;
const BLOWN_STANDS_BACK_MS = 400;
/** How far the one who breathes leans back as it draws the breath in, as a share of a cell. */
const INHALE_LEAN_CELLS = 0.12;
/** How far it is thrown forward as the breath bursts out, as a share of its lean back, and how long it takes to stand again, in milliseconds. */
const BURST_THRUST = 0.7;
const BURST_THRUST_MS = 320;

/** How far a tornado lifts the piece it stands over off the floor, as a share of a cell. */
const TAKEN_UP_CELLS = 0.14;
/** How far a piece caught round a tornado is dragged towards it, as a share of a cell, by grade. */
const DRAGGED_CELLS_BY_GRADE: Record<1 | 2 | 3, number> = { 1: 0.07, 2: 0.11, 3: 0.17 };

/** The looks the one who casts them sets off at the target with, leaning in as they do; one who throws a gust leans in too. */
const LEANING_KINDS: ReadonlySet<EffectKind> = new Set<EffectKind>([
  'slash',
  'projectile',
  'bash',
  'beam',
  'raybeam',
  'arc',
  'breath',
  'drain',
  'skyblade',
  'ballistic',
  'arrowrain',
]);

/**
 * How far each piece an effect strikes is thrown at a moment on the effect's own clock, and how far
 * the one who cast it leans in: a struck piece stands still through the hold as the blow lands, is
 * thrown back away from the one who struck, as far as the blow's push, and springs back to where it
 * stands; cut, it is carried the way each stroke's blade went; struck from no direction, or by a light
 * that smites or a blade brought down from straight above, it is pressed down instead, and where the
 * ground heaves under it, by rubble or an upheaval, or light bursts up out of it, in a sanctuary, it
 * is thrown up off the floor. One that is drained is pulled towards the one who drains it instead,
 * where there is one. A breath lands no blow: the one who
 * breathes leans back as it draws the breath in, and each piece it blows on is pushed downwind and
 * trembles for as long as it is blown on. A tornado lands none either: it takes up the piece it
 * stands over and drags the rest it catches towards it. A curse on its own lands none: the piece it
 * is put on bears the state it is in for as long as its look plays. The pieces themselves stay where
 * they are: each seat draws them off it for a moment.
 */
export function effectJoltsOf(
  preset: EffectPreset,
  cast: EffectCast,
  elapsedMs: number,
  cellPx: number,
  blows: readonly EffectBlow[] = effectBlowsOf(preset)
): Map<string, EffectJolt> {
  const jolts = new Map<string, EffectJolt>();
  if (elapsedMs >= joltsEndOf(preset, cast, blows)) return jolts;
  const add = (identifier: string, jolt: EffectJolt) => {
    if (identifier.length < 1) return;
    const was = jolts.get(identifier);
    jolts.set(identifier, was ? { x: was.x + jolt.x, y: was.y + jolt.y, z: was.z + jolt.z } : jolt);
  };
  if (isBreath(preset)) {
    addBreathJolts(preset, cast, elapsedMs, cellPx, add);
    return jolts;
  }
  if (isTornado(preset)) {
    addTornadoJolts(preset, cast, elapsedMs, cellPx, add);
    return jolts;
  }
  if (isCurseAlone(preset)) {
    addAilmentJolts(preset, cast, elapsedMs, cellPx, add);
    return jolts;
  }
  cast.targets.forEach((target, index) => {
    const local = elapsedMs - preset.stagger * index;
    let thrown = 0;
    for (const blow of blows) thrown += blow.push * cellPx * throwAt(local - blow.atMs);
    thrown = clamp(thrown, -MOST_THROWN_CELLS * cellPx, MOST_THROWN_CELLS * cellPx);
    if (thrown === 0) return;
    if (heavesGround(preset) || burstsFromBelow(preset)) {
      add(target.identifier, { x: 0, y: 0, z: thrown * HEAVED_UP });
      return;
    }
    const away = fallsFromAbove(preset) || strikesFromOverhead(preset) ? null : directionOf(cast.origin, target);
    if (thrown < 0 && !away) return;
    const carries = away && cutCarriesOf(preset);
    if (away && carries) {
      add(target.identifier, carriedBy(blows, carries, away, local, cellPx, thrown));
      return;
    }
    add(
      target.identifier,
      away ? { x: away.x * thrown, y: away.y * thrown, z: 0 } : { x: 0, y: 0, z: -thrown * PRESSED_DOWN }
    );
  });
  const first = cast.targets[0];
  const towards = first ? directionOf(cast.origin, first) : null;
  const lean = leanAt(elapsedMs) * LEAN_CELLS * cellPx;
  if (towards && lean > 0 && (LEANING_KINDS.has(preset.effectKind) || isGust(preset))) {
    add(cast.casterIdentifier, { x: towards.x * lean, y: towards.y * lean, z: 0 });
  }
  return jolts;
}

/**
 * When, on an effect's own clock, the last piece it strikes stands still again and the one who cast
 * it is back where it stands: after that, the effect moves no piece.
 */
export function joltsEndOf(preset: EffectPreset, cast: EffectCast, blows: readonly EffectBlow[]): number {
  const lastBlow = blows.reduce((last, blow) => Math.max(last, blow.atMs), Number.NEGATIVE_INFINITY);
  const lastTarget = preset.stagger * Math.max(0, cast.targets.length - 1);
  if (isBreath(preset)) {
    return breathTimingOf(preset.duration / 1000).spentAt * 1000 + lastTarget + BLOWN_STANDS_BACK_MS;
  }
  if (isTornado(preset)) return tornadoTimingOf(preset.duration / 1000).goneAt * 1000 + lastTarget;
  if (isCurseAlone(preset)) return ailmentJoltsEndOf(preset, cast);
  return Math.max(LEAN_FOR_MS, lastBlow + lastTarget + THROWN_FOR_MS);
}

/** Whether an effect is a breath on its own, rather than a run with one among its stages. */
function isBreath(preset: EffectPreset): boolean {
  return !preset.isStaged && preset.effectKind === 'breath';
}

/**
 * How a breath moves the pieces at a moment: the one who breathes leans back from the targets as it
 * draws the breath in and is thrown forward as it bursts out; each piece blown on is pushed downwind
 * for as long as the breath blows on it, further with each surge, and trembles there, then stands
 * back as the breath fails. The gentle breath of light pushes no one.
 */
function addBreathJolts(
  preset: EffectPreset,
  cast: EffectCast,
  elapsedMs: number,
  cellPx: number,
  add: (identifier: string, jolt: EffectJolt) => void
): void {
  const timing = breathTimingOf(preset.duration / 1000);
  const burstsAt = timing.burstsAt * 1000;
  const first = cast.targets[0];
  const towards = first ? directionOf(cast.origin, first) : null;
  if (towards) {
    const lean = breathLeanAt(elapsedMs, burstsAt) * INHALE_LEAN_CELLS * cellPx;
    if (lean !== 0) add(cast.casterIdentifier, { x: towards.x * lean, y: towards.y * lean, z: 0 });
  }
  if (isGentleBreath(preset)) return;
  const reachesAt = timing.reachesAt * 1000;
  const spentAt = timing.spentAt * 1000;
  cast.targets.forEach((target, index) => {
    const local = elapsedMs - preset.stagger * index;
    if (local <= reachesAt || local >= spentAt + BLOWN_STANDS_BACK_MS) return;
    const away = directionOf(cast.origin, target);
    if (!away) return;
    const blown =
      Math.min(1, (local - reachesAt) / BLOWN_BACK_IN_MS) * (1 - Math.max(0, (local - spentAt) / BLOWN_STANDS_BACK_MS));
    const seconds = local / 1000;
    const pushed = BLOWN_CELLS_BY_GRADE[preset.gradeLevel] * breathSurgeAt(seconds, cast.seed);
    const along = (pushed + TREMBLE_CELLS * Math.sin(seconds * 119 + index * 2.1)) * blown * cellPx;
    const across = TREMBLE_CELLS * Math.sin(seconds * 143 + index * 4.3) * blown * cellPx;
    add(target.identifier, { x: away.x * along - away.y * across, y: away.y * along + away.x * across, z: 0 });
  });
}

/**
 * How a tornado moves the pieces at a moment: the one it stands over is taken up off the floor a
 * little, bobbing, and each of the rest it catches is dragged towards it, further with each surge;
 * all of them tremble for as long as it stands, and are let down and stand back as it thins away.
 */
function addTornadoJolts(
  preset: EffectPreset,
  cast: EffectCast,
  elapsedMs: number,
  cellPx: number,
  add: (identifier: string, jolt: EffectJolt) => void
): void {
  const timing = tornadoTimingOf(preset.duration / 1000);
  const centre = cast.targets[0];
  cast.targets.forEach((target, index) => {
    const seconds = (elapsedMs - preset.stagger * index) / 1000;
    if (seconds <= 0 || seconds >= timing.goneAt) return;
    const held =
      Math.min(1, seconds / timing.risenAt) *
      (1 - Math.max(0, (seconds - timing.thinsAt) / (timing.goneAt - timing.thinsAt)));
    const tremble = TREMBLE_CELLS * held * cellPx;
    const shaken = {
      x: tremble * Math.sin(seconds * 119 + index * 2.1),
      y: tremble * Math.sin(seconds * 143 + index * 4.3),
    };
    if (index === 0) {
      const taken = TAKEN_UP_CELLS * held * (0.75 + 0.25 * Math.sin(seconds * 5.3)) * cellPx;
      add(target.identifier, { ...shaken, z: taken });
      return;
    }
    const towards = directionOf(target, centre);
    const dragged = towards
      ? DRAGGED_CELLS_BY_GRADE[preset.gradeLevel] * held * (0.8 + 0.2 * Math.sin(seconds * 4.1 + index)) * cellPx
      : 0;
    add(target.identifier, {
      x: shaken.x + (towards?.x ?? 0) * dragged,
      y: shaken.y + (towards?.y ?? 0) * dragged,
      z: 0,
    });
  });
}

/**
 * How far the one who breathes leans towards the targets some time into the breath, as a share of
 * its lean: back, below nothing, as it draws the breath in, furthest as it bursts, then thrown
 * forward and standing again.
 */
function breathLeanAt(elapsedMs: number, burstsAtMs: number): number {
  if (elapsedMs <= 0 || elapsedMs >= burstsAtMs + BURST_THRUST_MS) return 0;
  if (elapsedMs < burstsAtMs) return -Math.sin(((elapsedMs / burstsAtMs) * Math.PI) / 2);
  const since = elapsedMs - burstsAtMs;
  const back = -Math.max(0, 1 - since / 50);
  const share = since / THROWN_FURTHEST_MS;
  const fades = 1 - since / BURST_THRUST_MS;
  return back + BURST_THRUST * share * Math.exp(1 - share) * fades;
}

/**
 * How far the strokes of a cut have thrown a piece a while into its own playback: each blow the way
 * its blade went, and all of them together no further than `most`.
 */
function carriedBy(
  blows: readonly EffectBlow[],
  carries: readonly CutCarry[],
  away: { x: number; y: number },
  local: number,
  cellPx: number,
  most: number
): EffectJolt {
  let x = 0;
  let y = 0;
  blows.forEach((blow, index) => {
    const carry = carries[Math.min(index, carries.length - 1)];
    const far = blow.push * cellPx * throwAt(local - blow.atMs);
    x += far * (away.x * carry.away - away.y * carry.across);
    y += far * (away.y * carry.away + away.x * carry.across);
  });
  const size = Math.hypot(x, y);
  const held = size > most ? most / size : 1;
  return { x: x * held, y: y * held, z: 0 };
}

/** How far a struck piece is thrown some time after its hold, as a share of the blow's push: out fast and back slower. */
function throwAt(sinceMs: number): number {
  if (sinceMs <= 0 || sinceMs >= THROWN_FOR_MS) return 0;
  const share = sinceMs / THROWN_FURTHEST_MS;
  return share * Math.exp(1 - share);
}

/** How far the one who strikes leans in some time into the effect, as a share of the lean: in, and back. */
function leanAt(elapsedMs: number): number {
  if (elapsedMs <= 0 || elapsedMs >= LEAN_FOR_MS) return 0;
  if (elapsedMs < LEAN_IN_MS) return Math.sin(((elapsedMs / LEAN_IN_MS) * Math.PI) / 2);
  return Math.cos((((elapsedMs - LEAN_IN_MS) / (LEAN_FOR_MS - LEAN_IN_MS)) * Math.PI) / 2);
}

/** The way across the table from where an effect was cast from to a target, of length one, or null where there is none. */
function directionOf(
  origin: { x: number; y: number } | null,
  target: { x: number; y: number }
): { x: number; y: number } | null {
  if (!origin) return null;
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const length = Math.hypot(dx, dy);
  return length < 1 ? null : { x: dx / length, y: dy / length };
}
