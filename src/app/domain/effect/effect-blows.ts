import { curseLookOf, isCurseAlone, takesHoldAt } from '@axe/domain/effect/ailment-looks';
import { darkStrikesAt } from '@axe/domain/effect/dark-looks';
import { quakeStrikesOf, RUBBLE_FIRST_HEAVE, rubbleHeavesOf } from '@axe/domain/effect/earth-looks';
import { type EffectKind } from '@axe/domain/effect/effect-kind';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import { breaksOutAsAura, type EffectShake, effectShakeOf } from '@axe/domain/effect/effect-shake';
import { effectLandingTimes } from '@axe/domain/effect/effect-sound-times';
import { stageLayoutOf } from '@axe/domain/effect/effect-stage';
import { holyStrikesAt } from '@axe/domain/effect/holy-looks';
import { frostStrikesOf } from '@axe/domain/effect/ice-looks';
import { spaceStrikesAt } from '@axe/domain/effect/space-looks';
import { strikeLandsAt } from '@axe/domain/effect/strike-looks';
import { boltStrokesOf, CURRENT_REACHES_AT } from '@axe/domain/effect/thunder-looks';
import { slashHits } from '@axe/domain/effect/timeline/blade';
import { blowsAsStorm, gustTimingOf, isGust, stormStrikesOf } from '@axe/domain/effect/wind-looks';

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
  'drain',
  'gravity',
  'skyblade',
  'arrowrain',
  'ballistic',
  'bisect',
  'gore',
  'smite',
  'halo',
  'sanctuary',
  'shadow',
  'darkorb',
  'quake',
]);

/** How long everything holds still on contact, by grade: a light blow barely catches, the heaviest stops the breath. */
const HOLD_MS_BY_GRADE: Record<1 | 2 | 3, number> = { 1: 60, 2: 90, 3: 140 };
/** How far the target rocks back, as a share of the piece's width, by grade. */
const PUSH_BY_GRADE: Record<1 | 2 | 3, number> = { 1: 0.06, 2: 0.1, 3: 0.16 };
/** How long everything holds still at each heave of rubble after the first, at the most: a catch, so the three read as three. */
const LATER_HEAVE_HOLD_MS = 50;
/** How long everything holds still as a curse takes hold of its target, at the most: a catch of the breath, not a blow. */
const TAKES_HOLD_HOLD_MS = 90;
/** How long everything holds still as the greatest aura breaks out, at the most: a catch, as nothing is struck. */
const BREAKS_OUT_HOLD_MS = 90;
/** Where through its playback the greatest aura breaks out of the piece, as a share of it. */
const AURA_BREAKS_OUT_AT = 0.16;
/**
 * How far a draining pulls its target as it takes hold, as a share of the piece's width: towards the
 * one who drains it, where a blow would throw it back; and as far back again as it snaps and lets go.
 */
const DRAIN_PULL = -0.08;
/** How far a gust shoves its target back, as a share of the piece's width: as far as a piece is ever thrown. */
const GUST_PUSH = 0.25;
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
  rubble: RUBBLE_FIRST_HEAVE,
  upheaval: 0.12,
  quake: 0.12,
  frost: 0.1,
  bisect: 0.05,
  gore: 0.05,
};

/**
 * The blows an effect lands on its first target, in the order they land. An effect that strikes
 * nothing, as a heal or a shield, lands none; a run of stages lands one for each of its stages that
 * strikes. A whirlwind lands none, but a gust: its wall strikes the target once and shoves it back;
 * and a storm, one at each stroke of its lightning.
 * Rubble on its own lands three, one at each heave of the ground, the first held as a blow of its
 * grade is and the others only caught. A curse on its own, and each state drawn in its place, lands
 * one that holds and neither shakes the screen nor throws the piece: the instant it takes hold. A
 * look of holy light lands one, once it has been seen coming: its pillar landing, its ring bursting,
 * its walls rising. A draining lands one as it takes hold, which pulls the piece towards the one who
 * drains it rather than throwing it back, and one as it snaps, which lets the piece fall back. A look
 * of darkness lands one as it is seen to strike: spikes stabbing, a sphere bursting, the corona of an
 * eclipse flaring; and a mire two, as its hands seize and as it closes. Gravity lands one as a crush
 * comes down or a singularity falls in on itself. A quake lands one as its rift reaches the target,
 * and over an area one at each of its three heaves, held as rubble's are. The greatest aura on its
 * own lands one as it breaks out,
 * which holds and shakes and throws no piece back. Ice on its own lands as the ice it is drawn as does:
 * hail at each of its great shards, the cold that stills an area and a pillar of ice once as they
 * close and once as they shatter. A bolt of lightning lands one as it strikes, once its
 * leader has been seen coming, and the greatest of them a second, the last stroke its column ends in;
 * a current of lightning lands one as it reaches its target. A strike lands one once its blow has been
 * drawn back, the longer the heavier it is. Each later target is struck as the first is, its stagger
 * later, and holds nothing more.
 */
export function effectBlowsOf(preset: EffectPreset): EffectBlow[] {
  const grade = preset.gradeLevel;
  const shake = effectShakeOf(preset);
  const blows: EffectBlow[] = [];
  let held = 0;
  let lastHeldAt = -Infinity;
  const heaves = !preset.isStaged && (preset.effectKind === 'rubble' || preset.effectKind === 'quake');
  const takesHold = isCurseAlone(preset);
  const breaksOut = breaksOutAsAura(preset);
  const drains = !preset.isStaged && preset.effectKind === 'drain';
  for (const [index, atMs] of strikeTimes(preset).entries()) {
    const holds = atMs - lastHeldAt >= HOLD_MIN_GAP_MS && held < MAX_TOTAL_HOLD_MS;
    const lightly = takesHold
      ? TAKES_HOLD_HOLD_MS
      : breaksOut
        ? BREAKS_OUT_HOLD_MS
        : heaves && index > 0
          ? LATER_HEAVE_HOLD_MS
          : Infinity;
    const most = Math.min(lightly, HOLD_MS_BY_GRADE[grade]);
    const holdMs = holds ? Math.min(most, MAX_TOTAL_HOLD_MS - held) : 0;
    if (holdMs > 0) {
      held += holdMs;
      lastHeldAt = atMs;
    }
    const pull = index === 0 ? DRAIN_PULL : -DRAIN_PULL;
    const push = takesHold || breaksOut ? 0 : drains ? pull : isGust(preset) ? GUST_PUSH : PUSH_BY_GRADE[grade];
    blows.push({ atMs, holdMs, shake, push });
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
      .map((window) => {
        const lasts = window.endMs - window.startMs;
        const seen =
          window.stage.kind === 'bolt'
            ? boltStrokesOf(preset.gradeLevel, lasts / 1000)[0]
            : window.stage.kind === 'bash'
              ? strikeLandsAt(preset.gradeLevel, lasts / 1000)
              : (holyStrikesAt(window.stage.kind, preset.gradeLevel, lasts / 1000) ??
                darkStrikesAt(window.stage.kind, preset.gradeLevel, lasts / 1000)?.[0] ??
                spaceStrikesAt(window.stage.kind, preset.gradeLevel, lasts / 1000)?.[0]);
        return Math.round(
          window.startMs + (seen !== undefined ? seen * 1000 : lasts * (GOES_OFF_AT[window.stage.kind] ?? 0))
        );
      })
      .sort((a, b) => a - b);
  }
  if (isGust(preset)) return [Math.round(gustTimingOf(preset.duration / 1000).strikesAt * 1000)];
  if (blowsAsStorm(preset)) return stormStrikesOf(preset.duration / 1000).map((strike) => Math.round(strike * 1000));
  if (isCurseAlone(preset)) {
    return [Math.round(takesHoldAt(curseLookOf(preset), preset.duration / 1000) * 1000)];
  }
  if (breaksOutAsAura(preset)) return [Math.round(AURA_BREAKS_OUT_AT * preset.duration)];
  if (!STRIKING_KINDS.has(preset.effectKind)) return [];
  const holy = holyStrikesAt(preset.effectKind, preset.gradeLevel, preset.duration / 1000);
  if (holy !== undefined) return [Math.round(holy * 1000)];
  const dark = darkStrikesAt(preset.effectKind, preset.gradeLevel, preset.duration / 1000);
  if (dark) return dark.map((strike) => Math.round(strike * 1000));
  const space = spaceStrikesAt(preset.effectKind, preset.gradeLevel, preset.duration / 1000);
  if (space) return space.map((strike) => Math.round(strike * 1000));
  const quake = quakeStrikesOf(preset, preset.duration / 1000);
  if (quake) return quake.map((strike) => Math.round(strike * 1000));
  if (preset.effectKind === 'bolt') {
    return boltStrokesOf(preset.gradeLevel, preset.duration / 1000).map((stroke) => Math.round(stroke * 1000));
  }
  if (preset.effectKind === 'arc') return [Math.round(CURRENT_REACHES_AT * preset.duration)];
  if (preset.effectKind === 'rubble') {
    return rubbleHeavesOf(preset.duration / 1000).map((heave) => Math.round(heave * 1000));
  }
  if (preset.effectKind === 'slash') {
    return slashHits(preset.slashLook).map((hit) =>
      Math.round((hit.at + hit.span * STROKE_CROSSES_AT) * preset.duration)
    );
  }
  if (preset.effectKind === 'frost') {
    return frostStrikesOf(preset, preset.duration / 1000).map((strike) => Math.round(strike * 1000));
  }
  if (preset.effectKind === 'bash')
    return [Math.round(strikeLandsAt(preset.gradeLevel, preset.duration / 1000) * 1000)];
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
