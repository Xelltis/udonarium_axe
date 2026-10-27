import { EffectCast } from '@axe/domain/effect/effect-cast';
import { effectParticles } from '@axe/domain/effect/effect-particles';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { stagedEffectParticles, StagedParticlePlacement } from '@axe/domain/effect/effect-stage-timeline';
import { EffectSpriteOptions, effectTargetCenter, effectTargetProgress } from '@axe/domain/effect/effect-timeline';

/** One canvas of glowing particles in a cast, and where on the board it is centred. */
export type EffectParticlePlacement = StagedParticlePlacement;

/**
 * The glowing particles of a cast at a moment in its playback, at most `limit` canvases of them.
 *
 * A run glows once per stage that is up, each where that stage is happening. Any other effect
 * glows once at each target whose own playback is under way, keyed by the target's place in the
 * cast; hidden targets, and moments with no particle to draw, are skipped.
 */
export function effectParticlePlacements(
  preset: EffectPreset,
  cast: EffectCast,
  elapsedMs: number,
  options: EffectSpriteOptions,
  limit: number
): EffectParticlePlacement[] {
  const base = options.baseSize * preset.sizeScale;
  if (preset.isStaged) {
    return stagedEffectParticles(preset, preset.stageList, cast, elapsedMs, base, options, effectParticles, limit);
  }

  const placements: EffectParticlePlacement[] = [];
  cast.targets.forEach((target, index) => {
    if (options.hiddenIdentifiers?.has(target.identifier)) return;
    if (placements.length >= limit) return;
    const progress = effectTargetProgress(preset, elapsedMs, index);
    if (progress < 0 || progress > 1) return;

    const layer = effectParticles(preset, cast.seed + index * 7919, progress, base);
    if (layer.particles.length < 1) return;

    const center = effectTargetCenter(target, preset, {
      baseSize: options.baseSize,
      resolvePosition: options.resolvePosition,
    });
    placements.push({ key: `${index}`, layer, center });
  });
  return placements;
}
