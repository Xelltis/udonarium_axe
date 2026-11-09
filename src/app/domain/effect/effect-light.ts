import { type EffectBlow, effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { type EffectKind } from '@axe/domain/effect/effect-kind';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';

/**
 * A light an effect throws over the table for a while: where it hangs, in table pixels (x to the
 * east, y to the south and z up), its colour, how strong it is, where 1 lights the board as a lamp
 * does, and how far it reaches, in table pixels. Hot things look hot because they light what is
 * round them: a burst lights the ground and the pieces near it for an instant, a fire for as long
 * as it burns.
 */
export interface EffectLight {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly color: string;
  readonly strength: number;
  readonly reachPx: number;
}

/** How many lights effects may throw over the table at once; the strongest are thrown. */
export const MAX_EFFECT_LIGHTS = 2;

/** The flash a blow lights the table with, by grade: how strong, how long it takes to fade, and how far it reaches, in cells. */
const FLASH_BY_GRADE: Record<1 | 2 | 3, { strength: number; fadeMs: number; reachCells: number }> = {
  1: { strength: 0.9, fadeMs: 180, reachCells: 2.5 },
  2: { strength: 1.3, fadeMs: 260, reachCells: 3.5 },
  3: { strength: 2, fadeMs: 380, reachCells: 5 },
};

/**
 * How strong the light of a look that burns, glows or pours out is while it lasts, as a share of the
 * flash of its grade: a fire, a heal, a shield or a beam lights the table for as long as it runs.
 */
const GLOWS: Partial<Record<EffectKind, number>> = {
  flame: 0.6,
  mushroom: 0.5,
  heal: 0.45,
  aura: 0.5,
  barrier: 0.35,
  warp: 0.5,
  beam: 0.8,
  raybeam: 0.7,
  breath: 0.55,
  arc: 0.5,
};
/** The looks whose glow wavers as a fire does. */
const FLICKERING: ReadonlySet<EffectKind> = new Set<EffectKind>(['flame', 'mushroom', 'breath']);
/** How much of a glow's run it takes to come up, and to die away. */
const GLOW_RISE = 0.12;
const GLOW_FALL = 0.25;
/** How high over the ground at the target a light hangs, in cells: high enough to light the ground round the piece. */
const LIGHT_HEIGHT_CELLS = 0.8;
/** The faintest light worth throwing. */
const FAINTEST = 0.02;

/**
 * The light an effect throws over the table at a moment on its own clock, or none: a flash as each
 * blow lands, fading as the blow's grade lets it, and a glow over what burns, heals or pours out for
 * as long as it runs. A cast on several targets throws one light over those it lights, as far as
 * reaches them all. A run of stages lights by its blows alone.
 */
export function effectLightsOf(
  preset: EffectPreset,
  cast: EffectCast,
  elapsedMs: number,
  cellPx: number
): EffectLight[] {
  const blows = effectBlowsOf(preset);
  const flash = FLASH_BY_GRADE[preset.gradeLevel];
  const glow = preset.isStaged ? 0 : (GLOWS[preset.effectKind] ?? 0);
  const lit = cast.targets
    .map((target, index) => {
      const local = elapsedMs - preset.stagger * index;
      const strength = Math.max(
        flashAt(blows, local, flash.fadeMs) * flash.strength,
        glow > 0 ? glowAt(preset, cast.seed, local) * glow * flash.strength : 0
      );
      return { target, strength };
    })
    .filter(({ strength }) => strength > FAINTEST);
  if (lit.length < 1) return [];

  const total = lit.reduce((sum, { strength }) => sum + strength, 0);
  const x = lit.reduce((sum, { target, strength }) => sum + target.x * strength, 0) / total;
  const y = lit.reduce((sum, { target, strength }) => sum + target.y * strength, 0) / total;
  const z = lit.reduce((sum, { target, strength }) => sum + target.z * strength, 0) / total;
  const spread = Math.max(...lit.map(({ target }) => Math.hypot(target.x - x, target.y - y)));
  return [
    {
      x,
      y,
      z: z + cellPx * LIGHT_HEIGHT_CELLS * preset.sizeScale,
      color: preset.colorPrimary,
      strength: Math.max(...lit.map(({ strength }) => strength)),
      reachPx: spread + cellPx * flash.reachCells * preset.sizeScale,
    },
  ];
}

/** The strongest lights of all those thrown at once, as many as may be thrown. */
export function strongestEffectLights(lights: readonly EffectLight[]): EffectLight[] {
  return [...lights].sort((a, b) => b.strength - a.strength).slice(0, MAX_EFFECT_LIGHTS);
}

/** How bright the flash of the latest blow landed by a moment is, as a share of its peak: whole as it lands, fading after. */
function flashAt(blows: readonly EffectBlow[], elapsedMs: number, fadeMs: number): number {
  let brightest = 0;
  for (const blow of blows) {
    const since = elapsedMs - blow.atMs;
    if (since < 0) continue;
    brightest = Math.max(brightest, Math.exp(-since / fadeMs));
  }
  return brightest;
}

/** How bright a glow is at a moment of its run, as a share of its peak, wavering as a fire does for a look that burns. */
function glowAt(preset: EffectPreset, seed: number, elapsedMs: number): number {
  const progress = elapsedMs / preset.duration;
  if (progress <= 0 || progress >= 1) return 0;
  const envelope = Math.min(1, progress / GLOW_RISE, (1 - progress) / GLOW_FALL);
  if (!FLICKERING.has(preset.effectKind)) return envelope;
  const waver = 1 + 0.14 * Math.sin(elapsedMs * 0.031 + seed) + 0.08 * Math.sin(elapsedMs * 0.077 + seed * 1.7);
  return envelope * waver;
}
