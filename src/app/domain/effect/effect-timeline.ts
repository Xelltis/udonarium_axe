import { type EffectCast, type EffectCastTarget } from '@axe/domain/effect/effect-cast';
import { type EffectKind } from '@axe/domain/effect/effect-kind';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import { stageLayoutOf } from '@axe/domain/effect/effect-stage';
import { stagedEffectSprites } from '@axe/domain/effect/effect-stage-timeline';
import { type ViewRotation } from '@axe/domain/effect/effect-view';
import {
  appendArc,
  appendAura,
  appendBarrier,
  appendBolt,
  appendBurst,
  appendCurse,
  appendFlame,
  appendFrost,
  appendHeal,
  appendMiasma,
  appendNova,
  appendVortex,
  appendWarp,
} from '@axe/domain/effect/timeline/arcane';
import { appendBeam, appendRaybeam } from '@axe/domain/effect/timeline/beam';
import { appendBisect, appendSkyblade, appendSlash } from '@axe/domain/effect/timeline/blade';
import { appendDissolve, appendGore } from '@axe/domain/effect/timeline/body';
import { appendBreath, appendDrain } from '@axe/domain/effect/timeline/breath';
import {
  appendArrowRain,
  appendBallistic,
  appendProjectile,
  arrowRainShots,
  projectileTiming,
} from '@axe/domain/effect/timeline/flight';
import {
  appendBash,
  appendGravity,
  appendImpact,
  appendMushroom,
  appendRubble,
  appendUpheaval,
} from '@axe/domain/effect/timeline/ground';
import {
  type EffectSprite,
  type EffectSpriteOptions,
  effectTargetCenter,
  imageOf,
  type ImpactPainter,
  type Point3,
  projectileOrigin,
  seededRandom,
} from '@axe/domain/effect/timeline/shared';

/**
 * Builds the parts of an effect that are drawn as lines on the board.
 *
 * The glowing particles, the flame and the smoke are laid additively onto a canvas
 * elsewhere. What belongs here is what is better with a clear outline: the circles, the
 * rings, the cracks, the lightning, the blades and the spikes. What lies flat on the ground holds up better drawn than painted.
 *
 * Each family of effects lives beside it; this holds only **which one is called**.
 */

export { EXCALIBUR_SWING_END, type SlashHit, slashHits, swingTiltOf } from '@axe/domain/effect/timeline/blade';
export {
  ARROW_RAIN_FALL,
  type ArrowRainShot,
  arrowRainShots,
  BALLISTIC_DIVE_END,
  type ProjectileShot,
  projectileTiming,
} from '@axe/domain/effect/timeline/flight';
export {
  type EffectSprite,
  type EffectSpriteOptions,
  type Point3,
  seededRandom,
} from '@axe/domain/effect/timeline/shared';

/** The shortest interval between landings, so their sounds do not cancel each other. */
const IMPACT_SOUND_MIN_GAP_MS = 70;
/** The interval for something that falls in numbers. Sounded one for one they run together and the count is lost. */
const RAIN_SOUND_MIN_GAP_MS = 110;

/** The shortest interval between shots, close enough that the rhythm of a burst can still be heard. */
const LAUNCH_SOUND_MIN_GAP_MS = 55;

/** Whether the playback has ended for every target of the cast, counting each target's stagger. */
export function isEffectFinished(preset: EffectPreset, cast: EffectCast, elapsedMs: number): boolean {
  return elapsedMs >= preset.totalDuration(cast.targets.length);
}

/**
 * When each landing sounds.
 * A burst sounds each shot; sounded once, a hail of them lands as one.
 * Too close together the same sound cancels itself, so a shortest interval is kept.
 */
export function impactSoundTimes(preset: EffectPreset): number[] {
  if (preset.impactSoundIdentifier.length < 1) return [];
  // A run lands once per stage that lands, which is where the ear expects it.
  if (preset.isStaged) {
    const times = stageSoundTimes(preset, ['impact', 'spawn'], IMPACT_SOUND_MIN_GAP_MS);
    return times.length > 0 ? times : [arrivalOf(preset)];
  }
  if (preset.effectKind === 'arrowrain')
    return soundTimesOf(
      arrowRainShots().map((shot) => shot.land),
      preset
    );
  if (preset.effectKind !== 'projectile') return [Math.round(preset.duration * preset.impactSoundAt)];

  const times: number[] = [];
  for (const shot of projectileTiming(preset).shots) {
    const at = Math.round(shot.land * preset.duration);
    if (times.length > 0 && at - times[times.length - 1] < IMPACT_SOUND_MIN_GAP_MS) continue;
    times.push(at);
  }
  return times;
}

/**
 * When each shot sounds. Without one per shot the ear cannot count them.
 * The first is at the start, so it begins at nothing.
 */
export function launchSoundTimes(preset: EffectPreset): number[] {
  if (preset.soundIdentifier.length < 1) return [];
  if (preset.isStaged) {
    const times = stageSoundTimes(preset, ['travel'], LAUNCH_SOUND_MIN_GAP_MS);
    return times.length > 0 ? times : [0];
  }
  if (preset.effectKind === 'arrowrain')
    return soundTimesOf(
      arrowRainShots().map((shot) => shot.loose),
      preset
    );
  if (preset.effectKind !== 'projectile') return [0];

  const times: number[] = [];
  for (const shot of projectileTiming(preset).shots) {
    const at = Math.round(shot.launch * preset.duration);
    if (times.length > 0 && at - times[times.length - 1] < LAUNCH_SOUND_MIN_GAP_MS) continue;
    times.push(at);
  }
  return times.length > 0 ? times : [0];
}

/**
 * When the stages of the given roles begin.
 *
 * Every branch of a spawn starts together, and sounding each of them would be one noise
 * rather than several, so they are thinned to what the ear can tell apart.
 */
function stageSoundTimes(preset: EffectPreset, roles: readonly string[], minGapMs: number): number[] {
  const times: number[] = [];
  for (const window of stageLayoutOf(preset.stageList).windows) {
    if (!roles.includes(window.stage.role)) continue;
    const at = Math.round(window.startMs);
    if (times.length > 0 && at - times[times.length - 1] < minGapMs) continue;
    times.push(at);
  }
  return times;
}

/**
 * When a run that lands nowhere arrives.
 *
 * A run of nothing but travel arrives where the travelling stops. One of nothing but a
 * field never arrives at all, so it sounds as it opens rather than falling silent.
 */
function arrivalOf(preset: EffectPreset): number {
  let arrival = 0;
  for (const window of stageLayoutOf(preset.stageList).windows) {
    if (window.stage.role === 'travel') arrival = Math.max(arrival, window.endMs);
  }
  return Math.round(arrival);
}

/** When something that falls in numbers, such as a rain of arrows, sounds, thinned until it can be heard. */
function soundTimesOf(positions: readonly number[], preset: EffectPreset): number[] {
  const times: number[] = [];
  for (const position of positions) {
    const at = Math.round(position * preset.duration);
    if (times.length > 0 && at - times[times.length - 1] < RAIN_SOUND_MIN_GAP_MS) continue;
    times.push(at);
  }
  return times;
}

/** How far through the playback each target is, shared with the canvas. */
export function effectTargetProgress(preset: EffectPreset, elapsedMs: number, index: number): number {
  return (elapsedMs - preset.stagger * index) / preset.duration;
}

export { effectTargetCenter } from '@axe/domain/effect/timeline/shared';

/** The effects that happen about the target. A projectile or a blade hands the landing to one of these. */
const CENTERED: Partial<Record<EffectKind, (ctx: CenteredContext) => void>> = {
  slash: (c) => appendSlash(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset),
  flame: (c) => appendFlame(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset),
  heal: (c) => appendHeal(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset),
  impact: (c) => appendImpact(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset, c.random),
  rubble: (c) => appendRubble(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset, c.random),
  upheaval: (c) => appendUpheaval(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset, c.random),
  mushroom: (c) => appendMushroom(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset),
  bolt: (c) => appendBolt(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset, c.random),
  frost: (c) => appendFrost(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset, c.random),
  nova: (c) => appendNova(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset),
  vortex: (c) => appendVortex(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset),
  miasma: (c) => appendMiasma(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset),
  aura: (c) => appendAura(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset),
  barrier: (c) => appendBarrier(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset),
  bash: (c) => appendBash(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset),
  curse: (c) => appendCurse(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset),
  warp: (c) => appendWarp(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset),
  gravity: (c) => appendGravity(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset),
};

/** The effects that run from the caster to the target, which need an origin and a direction rather than a centre alone. */
const AIMED: Partial<Record<EffectKind, (ctx: AimedContext) => void>> = {
  arc: (c) => appendArc(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset, originOf(c), c.random, c.view),
  dissolve: (c) =>
    appendDissolve(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset, c.random, imageOfTarget(c)),
  gore: (c) => appendGore(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset, c.random),
  bisect: (c) => appendBisect(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset, c.random, imageOfTarget(c)),
  ballistic: (c) =>
    appendBallistic(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset, originOf(c), c.view, painterOf(c)),
  arrowrain: (c) =>
    appendArrowRain(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset, originOf(c), c.random, c.view),
  skyblade: (c) =>
    appendSkyblade(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset, originOf(c), c.view, painterOf(c)),
  raybeam: (c) => appendRaybeam(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset, originOf(c), c.view),
  beam: (c) => appendBeam(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset, originOf(c), c.view),
  breath: (c) => appendBreath(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset, originOf(c), c.view),
  drain: (c) => appendDrain(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset, originOf(c), c.view),
  projectile: (c) =>
    appendProjectile(c.sprites, c.prefix, c.center, c.base, c.progress, c.preset, originOf(c), c.view, painterOf(c)),
};

interface CenteredContext {
  sprites: EffectSprite[];
  prefix: string;
  center: Point3;
  base: number;
  progress: number;
  preset: EffectPreset;
  random: () => number;
}

/**
 * What an aimed effect is given.
 *
 * The origin and the portrait are worked out **only when they are wanted**. Fetching a
 * portrait walks the belongings, and paying for it every frame for every target is dear. Four kinds use it.
 */
interface AimedContext extends CenteredContext {
  cast: EffectCast;
  target: EffectCastTarget;
  options: EffectSpriteOptions;
  view: ViewRotation | null | undefined;
  /** Where it is fired from, when that is not the caster — a stage thrown off another one. */
  origin?: Point3;
  /** What it paints where it lands. A stage hands in nothing, because the next stage lands. */
  impactPainter?: ImpactPainter;
}

function originOf(context: AimedContext): Point3 {
  return context.origin ?? projectileOrigin(context.cast, context.center, context.base);
}

function painterOf(context: AimedContext): ImpactPainter {
  return context.impactPainter ?? paintCentered;
}

function imageOfTarget(context: AimedContext): string {
  return imageOf(context.options, context.target.identifier);
}

/** The kinds that need an origin and a direction. Anything not in the table happens about the target. */
export const AIMED_EFFECT_KINDS: readonly EffectKind[] = Object.keys(AIMED) as EffectKind[];

/** The kinds that happen about the target. Anything in neither table simply bursts. */
export const CENTERED_EFFECT_KINDS: readonly EffectKind[] = Object.keys(CENTERED) as EffectKind[];

/**
 * Paints one look, wherever it is asked for.
 *
 * Playing a whole effect from its start is not the only way into the dispatch. A run built of
 * stages paints one look at a time, each with its own clock and its own place, so the tables
 * are reached through here as well.
 */
export function paintEffectKind(kind: EffectKind, context: EffectPaintContext): void {
  const aimed = AIMED[kind];
  if (aimed) {
    aimed(context);
    return;
  }
  paintCentered(
    kind,
    context.sprites,
    context.prefix,
    context.center,
    context.base,
    context.progress,
    context.preset,
    context.random
  );
}

export type EffectPaintContext = AimedContext;

/**
 * The outlined sprites of a cast at a moment in its playback, for every target.
 *
 * A staged effect is handed on to its stages. Otherwise each target whose own playback is
 * under way gets the one look, aimed from the caster or drawn about the target; hidden
 * targets are skipped.
 */
export function effectSprites(
  preset: EffectPreset,
  cast: EffectCast,
  elapsedMs: number,
  options: EffectSpriteOptions
): EffectSprite[] {
  // An effect built of stages runs through them; one built of a single look draws it.
  if (preset.isStaged) {
    return stagedEffectSprites(preset, preset.stageList, cast, elapsedMs, options, paintEffectKind);
  }

  const sprites: EffectSprite[] = [];
  const base = Math.max(options.baseSize, 1) * preset.sizeScale;

  cast.targets.forEach((target, index) => {
    if (options.hiddenIdentifiers?.has(target.identifier)) return;

    const progress = effectTargetProgress(preset, elapsedMs, index);
    if (progress < 0 || progress > 1) return;

    const center = effectTargetCenter(target, preset, options);
    const context: AimedContext = {
      sprites,
      prefix: `${index}`,
      center,
      base,
      progress,
      preset,
      random: seededRandom(cast.seed + index * 7919),
      cast,
      target,
      options,
      view: options.viewRotation,
    };

    const aimed = AIMED[preset.effectKind];
    if (aimed) {
      aimed(context);
      return;
    }
    paintCentered(preset.effectKind, sprites, context.prefix, center, base, progress, preset, context.random);
  });

  return sprites;
}

/** An unknown kind bursts, so a new one at least shows something. */
const paintCentered: ImpactPainter = (kind, sprites, prefix, center, base, progress, preset, random) => {
  const centered = CENTERED[kind];
  const context: CenteredContext = { sprites, prefix, center, base, progress, preset, random };
  if (centered) {
    centered(context);
    return;
  }
  appendBurst(sprites, prefix, center, base, progress, preset);
};
