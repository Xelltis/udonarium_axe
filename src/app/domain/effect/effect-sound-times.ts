import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import { stageLayoutOf } from '@axe/domain/effect/effect-stage';
import { arrowRainShots, projectileTiming } from '@axe/domain/effect/timeline/flight-timing';

/*
 * When the sounds of an effect play, worked out from its preset alone, apart from what draws it, so
 * that what plays the sounds need not load the drawing.
 */

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
  return effectLandingTimes(preset);
}

/**
 * When each blow of an effect lands, in milliseconds from its start, whether or not anything
 * sounds there: once per shot of a burst and once per stage of a run that lands, thinned as the
 * landing sounds are.
 */
export function effectLandingTimes(preset: EffectPreset): number[] {
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
