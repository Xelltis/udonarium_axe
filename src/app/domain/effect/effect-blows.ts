import { type EffectKind } from '@axe/domain/effect/effect-kind';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import { type EffectShake, effectShakeOf } from '@axe/domain/effect/effect-shake';
import { effectLandingTimes } from '@axe/domain/effect/effect-sound-times';
import { stageLayoutOf } from '@axe/domain/effect/effect-stage';
import { slashHits } from '@axe/domain/effect/timeline/blade';

/**
 * A blow an effect lands on its first target: when, on the effect's own clock, how long everything
 * holds still as it lands, how hard the screen shakes, and how far the target is thrown back, as a
 * share of the piece's width. What sells a blow is the body round it: everything stops for an
 * instant on contact, the screen jolts, and the one struck rocks back before it comes to rest.
 */
export interface EffectBlow {
  readonly atMs: number;
  readonly holdMs: number;
  readonly shake: EffectShake;
  readonly push: number;
}

/** The looks that land a blow: what strikes, cuts or bursts on the target, not what heals, shields or lingers. */
const STRIKING_KINDS: ReadonlySet<EffectKind> = new Set<EffectKind>([
  'slash',
  'projectile',
  'burst',
  'nova',
  'mushroom',
  'impact',
  'rubble',
  'upheaval',
  'bolt',
  'frost',
  'bash',
  'beam',
  'raybeam',
  'arc',
  'gravity',
  'skyblade',
  'arrowrain',
  'ballistic',
  'bisect',
  'gore',
]);

/** How long everything holds still on contact, by grade: a light blow barely catches, the heaviest stops the breath. */
const HOLD_MS_BY_GRADE: Record<1 | 2 | 3, number> = { 1: 60, 2: 90, 3: 140 };
/** How far the target rocks back, as a share of the piece's width, by grade. */
const PUSH_BY_GRADE: Record<1 | 2 | 3, number> = { 1: 0.06, 2: 0.1, 3: 0.16 };
/**
 * Blows closer than this to the one held before are not held: a volley that stopped at every shot
 * would stutter rather than land.
 */
const HOLD_MIN_GAP_MS = 180;
/** The most an effect holds still for over all its blows, so a long run of them does not drag. */
const MAX_TOTAL_HOLD_MS = 300;
/** Where through a stroke of a cut the blade crosses the target, as a share of the stroke. */
const STROKE_CROSSES_AT = 0.3;
/**
 * Where through the effect a look that goes off about its target strikes, as a share of its length:
 * the instant it goes off, which comes long before its landing sound, sounded a little later.
 */
const GOES_OFF_AT: Partial<Record<EffectKind, number>> = {
  burst: 0.06,
  nova: 0.06,
  mushroom: 0.08,
  impact: 0.06,
  rubble: 0.08,
  upheaval: 0.12,
  bash: 0.1,
  bolt: 0.05,
  frost: 0.1,
  gravity: 0.5,
  bisect: 0.05,
  gore: 0.05,
};

/**
 * The blows an effect lands on its first target, in the order they land. An effect that strikes
 * nothing, as a heal or a shield, lands none; a run of stages lands one for each of its stages that
 * strikes. Each later target is struck as the first is, its stagger later, and holds nothing more.
 */
export function effectBlowsOf(preset: EffectPreset): EffectBlow[] {
  const grade = preset.gradeLevel;
  const shake = effectShakeOf(preset);
  const blows: EffectBlow[] = [];
  let held = 0;
  let lastHeldAt = -Infinity;
  for (const atMs of strikeTimes(preset)) {
    const holds = atMs - lastHeldAt >= HOLD_MIN_GAP_MS && held < MAX_TOTAL_HOLD_MS;
    const holdMs = holds ? Math.min(HOLD_MS_BY_GRADE[grade], MAX_TOTAL_HOLD_MS - held) : 0;
    if (holdMs > 0) {
      held += holdMs;
      lastHeldAt = atMs;
    }
    blows.push({ atMs, holdMs, shake, push: PUSH_BY_GRADE[grade] });
  }
  return blows;
}

/** When the effect strikes, in milliseconds on its own clock, earliest first. */
function strikeTimes(preset: EffectPreset): number[] {
  if (preset.isStaged) {
    // The windows come in the order the stages are laid out, which a branch longer than its stage
    // puts out of the order they strike in.
    return stageLayoutOf(preset.stageList)
      .windows.filter((window) => window.stage.role === 'impact' && STRIKING_KINDS.has(window.stage.kind))
      .map((window) =>
        Math.round(window.startMs + (window.endMs - window.startMs) * (GOES_OFF_AT[window.stage.kind] ?? 0))
      )
      .sort((a, b) => a - b);
  }
  if (!STRIKING_KINDS.has(preset.effectKind)) return [];
  if (preset.effectKind === 'slash') {
    return slashHits(preset.slashLook).map((hit) =>
      Math.round((hit.at + hit.span * STROKE_CROSSES_AT) * preset.duration)
    );
  }
  const goesOff = GOES_OFF_AT[preset.effectKind];
  if (goesOff !== undefined) return [Math.round(goesOff * preset.duration)];
  return effectLandingTimes(preset);
}

/**
 * Where the effect's own clock stands at a moment of the wall clock, both from the effect's start:
 * still through the hold of each blow, and that much behind the wall clock after it.
 */
export function heldEffectClock(blows: readonly EffectBlow[], wallMs: number): number {
  let behind = 0;
  for (const blow of blows) {
    const lands = blow.atMs + behind;
    if (wallMs <= lands) break;
    if (wallMs < lands + blow.holdMs) return blow.atMs;
    behind += blow.holdMs;
  }
  return wallMs - behind;
}

/** When on the wall clock a moment of the effect's own clock comes, both from the effect's start. */
export function wallClockOf(blows: readonly EffectBlow[], effectMs: number): number {
  let behind = 0;
  for (const blow of blows) {
    if (blow.atMs >= effectMs) break;
    behind += blow.holdMs;
  }
  return effectMs + behind;
}

/** How long all the holds of an effect add to it. */
export function heldMsOf(blows: readonly EffectBlow[]): number {
  return blows.reduce((sum, blow) => sum + blow.holdMs, 0);
}
