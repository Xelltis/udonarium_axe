import type { EffectPreset } from '@axe/domain/effect/effect-preset';
import type { Choreography } from '@axe/domain/effect/scene/choreography';
import { smite } from '@axe/domain/effect/scene/holy/smite';

/**
 * The light a shot lands with, where it lands with one that smites: the least of them, a seal kindled
 * over the target and one thin pillar dropped through it, however great the shot is, as the landing of
 * a shot is small and soon over. A great blade lands with the light of its own grade instead.
 */
export const shotSmite: Choreography = {
  lingerS: smite.lingerS,
  draw: (stage) => smite.draw({ ...stage, preset: leastOf(stage.preset) }),
};

/** A preset as it is but of the lowest grade, for what is drawn by its grade. */
function leastOf(preset: EffectPreset): EffectPreset {
  if (preset.gradeLevel === 1) return preset;
  const least = Object.create(preset) as EffectPreset;
  Object.defineProperty(least, 'gradeLevel', { value: 1 });
  return least;
}
