import { type EffectKind } from '@axe/domain/effect/effect-kind';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import {
  emitAura,
  emitBarrier,
  emitBolt,
  emitFrost,
  emitHeal,
  emitMiasma,
  emitVortex,
  emitWarp,
} from '@axe/domain/effect/particles/arcane';
import { emitBeam } from '@axe/domain/effect/particles/beam';
import { emitBisect, emitSlash } from '@axe/domain/effect/particles/blade';
import { emitDissolve, emitGore } from '@axe/domain/effect/particles/body';
import { emitBreath, emitDrain } from '@axe/domain/effect/particles/breath';
import { emitExplosion, emitFlame, emitMushroom } from '@axe/domain/effect/particles/fire';
import { emitBash, emitGravity, emitImpact, emitRubble, emitUpheaval } from '@axe/domain/effect/particles/ground';
import {
  clamp01,
  type ColorRamp,
  type EffectParticle,
  type EffectParticleLayer,
  HOT,
  seededRandom,
} from '@axe/domain/effect/particles/shared';
import { EXCALIBUR_SWING_END, slashHits } from '@axe/domain/effect/timeline/blade';
import { ARROW_RAIN_FALL, BALLISTIC_DIVE_END, projectileTiming } from '@axe/domain/effect/timeline/flight';

/**
 * The particles that stay within the billboard, laid additively onto a canvas to glow.
 *
 * They are placed in pixels from the feet of the target, running down as the canvas does.
 * Each frame is worked out afresh from the elapsed time, so a dropped frame does not knock it out of step.
 *
 * How each family makes its particles lives beside it; this holds only **which one is called**.
 */

export {
  type ColorRamp,
  type EffectParticle,
  type EffectParticleLayer,
  type ParticleShape,
  seededRandom,
} from '@axe/domain/effect/particles/shared';

/**
 * The particles of one target's playback at a given point through it, on a square canvas
 * nine times the base size across.
 *
 * The same seed and progress always give the same particles. The highest grade lays a second
 * set on top and the lowest keeps every other particle.
 */
export function effectParticles(
  preset: EffectPreset,
  seed: number,
  progress: number,
  base: number
): EffectParticleLayer {
  const ramp: ColorRamp = { hot: HOT, mid: preset.colorPrimary, cool: preset.colorSecondary };
  const particles: EffectParticle[] = [];

  emitFor(preset, seededRandom(seed), progress, base, ramp, particles);
  // The higher grades lay on another set and the lower ones thin out.
  if (preset.gradeLevel === 3) emitFor(preset, seededRandom(seed + 104729), progress, base, ramp, particles);
  const graded = preset.gradeLevel === 1 ? particles.filter((_unused, index) => index % 2 === 0) : particles;

  const width = base * 9;
  const height = base * 9;
  return { width, height, originX: width / 2, originY: height * 0.72, particles: graded };
}

function emitFor(
  preset: EffectPreset,
  random: () => number,
  progress: number,
  base: number,
  ramp: ColorRamp,
  particles: EffectParticle[]
): void {
  if (preset.effectKind === 'slash') {
    // Sparks fly from each stroke; thrown once for them all, a combination reads as a single cut.
    for (const hit of slashHits(preset.slashLook)) {
      const local = clamp01((progress - hit.at) / hit.span);
      if (local <= 0 || local >= 1) continue;
      emitSlash(particles, random, local, base, ramp);
      // The highest grade throws dust and fragments too; sparks alone are light.
      // Only the heavier forms throw them; a drawing cut shows the cut alone.
      if (preset.slashLook === 'wide' || preset.slashLook === 'heavy') {
        emitSlash(particles, random, local, base * 1.4, ramp);
        emitImpact(particles, random, local, base, ramp);
      }
    }
    return;
  }
  if (preset.effectKind === 'skyblade') {
    // It bursts where the blade falls; timed to the whole, the target bursts before the blade rises.
    const burst = clamp01((progress - EXCALIBUR_SWING_END) / (1 - EXCALIBUR_SWING_END));
    if (burst > 0 && burst < 1) emitKind(preset.impactEffectKind, particles, random, burst, base, ramp);
    return;
  }
  if (preset.effectKind === 'ballistic') {
    // It bursts once the shot comes down; on the way up, the target bursts before it is fired.
    const burst = clamp01((progress - BALLISTIC_DIVE_END) / (1 - BALLISTIC_DIVE_END));
    if (burst > 0 && burst < 1) emitKind(preset.impactEffectKind, particles, random, burst, base * 1.2, ramp);
    return;
  }
  if (preset.effectKind === 'arrowrain') {
    // The dust rises once the first arrow strikes; before they fall, the ground bursts unstruck.
    const local = clamp01((progress - ARROW_RAIN_FALL) / (1 - ARROW_RAIN_FALL));
    if (local > 0 && local < 1) emitImpact(particles, random, local, base * 0.7, ramp);
    return;
  }
  if (preset.effectKind === 'projectile') {
    // Nothing is drawn on the canvas in flight; each shot bursts as it lands, in the element it was given.
    for (const shot of projectileTiming(preset).shots) {
      const local = clamp01((progress - shot.land) / (1 - shot.land));
      if (local > 0 && local < 1) emitKind(preset.impactEffectKind, particles, random, local, base * 0.85, ramp);
    }
    return;
  }
  emitKind(preset.effectKind, particles, random, progress, base, ramp);
}

/** How each kind makes its particles. Anything not in the table bursts. */
const EMITTERS: Partial<Record<EffectKind, ParticleEmitter>> = {
  flame: emitFlame,
  slash: emitSlash,
  heal: emitHeal,
  impact: emitImpact,
  bolt: emitBolt,
  frost: emitFrost,
  nova: (particles, random, progress, base, ramp) => emitExplosion(particles, random, progress, base, ramp, 2, true),
  mushroom: emitMushroom,
  rubble: emitRubble,
  upheaval: emitUpheaval,
  vortex: emitVortex,
  miasma: emitMiasma,
  aura: emitAura,
  breath: emitBreath,
  barrier: emitBarrier,
  drain: emitDrain,
  warp: emitWarp,
  gravity: emitGravity,
  // The lightning from a circle, which the same maker as lightning covers.
  arc: emitBolt,
  bash: emitBash,
  // A curse thins its miasma; at the same thickness it could not be told from an area attack.
  curse: (particles, random, progress, base, ramp) => emitMiasma(particles, random, progress, base * 0.8, ramp),
  beam: emitBeam,
  dissolve: emitDissolve,
  gore: emitGore,
  bisect: emitBisect,
};

/** The kinds that make particles. */
export const PARTICLE_EFFECT_KINDS: readonly EffectKind[] = Object.keys(EMITTERS) as EffectKind[];

type ParticleEmitter = (
  particles: EffectParticle[],
  random: () => number,
  progress: number,
  base: number,
  ramp: ColorRamp
) => void;

function emitKind(
  kind: EffectKind,
  particles: EffectParticle[],
  random: () => number,
  progress: number,
  base: number,
  ramp: ColorRamp
): void {
  const emit = EMITTERS[kind];
  if (emit) {
    emit(particles, random, progress, base, ramp);
    return;
  }
  emitExplosion(particles, random, progress, base, ramp, 1, false);
}
