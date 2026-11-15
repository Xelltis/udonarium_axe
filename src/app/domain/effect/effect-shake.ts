import { isRockShot } from '@axe/domain/effect/earth-looks';
import { EffectKind, type ProjectileStyle } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { stageLayoutOf } from '@axe/domain/effect/effect-stage';
import { isSpiritShot } from '@axe/domain/effect/magic-looks';
import { blowsAsStorm } from '@axe/domain/effect/wind-looks';

/**
 * Shaking the screen.
 *
 * Only what lands a blow, such as an explosion or a strike, shakes it.
 * Shaking for healing and shields too would give everything the same weight and leave none of it heavy.
 * A shot of light or an arrow shakes nothing; a meteor, a shot of rock and a cut thrown off a blade do, see
 * {@link fallsAsMeteor}, {@link isRockShot} and {@link fliesAsCut}, and so does what is fired to hit hard, see
 * {@link hitsHardAsShot}. A great sword shakes as its torrent is let go; see {@link loosesAsGreatSword}.
 * An aura shakes nothing either, but the greatest of them as it breaks out; see {@link breaksOutAsAura}.
 */
const SHAKING_KINDS: ReadonlySet<EffectKind> = new Set<EffectKind>([
  'burst',
  'nova',
  'mushroom',
  'impact',
  'rubble',
  'upheaval',
  'bash',
  'beam',
  'raybeam',
  'gravity',
  'bolt',
  'ballistic',
  'smite',
  'halo',
  'sanctuary',
  'slash',
  'frost',
  'bisect',
  'drain',
  'shadow',
  'darkorb',
  'quake',
]);

/**
 * How hard it shakes, held as a step rather than a distance.
 * Passed as a css variable, rewriting an inherited variable would void every style under the board.
 */
export type EffectShake = '' | 'soft' | 'hard';

const SHAKE_BY_GRADE: Record<1 | 2 | 3, EffectShake> = { 1: '', 2: 'soft', 3: 'hard' };

/**
 * The looks an effect actually draws.
 *
 * A run draws its stages and not the look written on the effect, which is left holding
 * nothing but the mark in the list. The blow is therefore looked for among the stages.
 */
function drawnKinds(preset: EffectPreset): EffectKind[] {
  if (!preset.isStaged) return [preset.effectKind];
  return stageLayoutOf(preset.stageList).windows.map((window) => window.stage.kind);
}

/**
 * Whether an effect is a meteor falling on its target: a shot on its own with the look of one, which
 * strikes the ground as no other shot does. A shot of any other look is the lighter for not shaking,
 * and one that is a stage of a run leaves its landing, and the shaking, to the stage after it.
 */
function fallsAsMeteor(preset: EffectPreset): boolean {
  return !preset.isStaged && preset.effectKind === 'projectile' && preset.projectileLook === 'meteor';
}

/** The looks of a shot that jolt the screen where they strike, by their grade: the rounds of guns and missiles. */
const HARD_SHOTS: ReadonlySet<ProjectileStyle> = new Set<ProjectileStyle>(['bullet', 'tracer', 'missile', 'cruise']);

/**
 * How hard a shot on its own jolts the screen for being fired to hit hard, or null for one that is
 * not: a round of a gun or a missile, by its grade; and, lightly and no harder, an arrow of the
 * highest grade, which goes through its target, and a shot of spirit above the lowest, which bursts
 * with a clap.
 */
function hitsHardAsShot(preset: EffectPreset): EffectShake | null {
  if (preset.isStaged || preset.effectKind !== 'projectile') return null;
  if (HARD_SHOTS.has(preset.projectileLook)) return SHAKE_BY_GRADE[preset.gradeLevel];
  if (preset.projectileLook === 'arrow') return preset.gradeLevel === 3 ? 'soft' : null;
  if (isSpiritShot(preset)) return preset.gradeLevel === 1 ? '' : 'soft';
  return null;
}

/** Whether an effect is a rock thrown at its target, a shot on its own that breaks where it lands. */
function breaksAsRock(preset: EffectPreset): boolean {
  return !preset.isStaged && isRockShot(preset);
}

/**
 * Whether an effect is a great sword on its own, which looses a torrent along the floor as it is
 * brought down. One that is a stage of a run leaves the shaking to the stage it lands with.
 */
function loosesAsGreatSword(preset: EffectPreset): boolean {
  return !preset.isStaged && preset.effectKind === 'skyblade';
}

/**
 * Whether an effect is a cut thrown off a blade, a shot on its own with the look of a crescent, which
 * goes on through what it reaches as a blade does.
 */
function fliesAsCut(preset: EffectPreset): boolean {
  return !preset.isStaged && preset.effectKind === 'projectile' && preset.projectileLook === 'crescent';
}

/**
 * Whether an effect is an aura of the highest grade on its own, which breaks out of the piece hard
 * enough to be felt: the one look that strikes nothing and yet shakes the screen, and lightly.
 */
export function breaksOutAsAura(preset: Pick<EffectPreset, 'isStaged' | 'effectKind' | 'gradeLevel'>): boolean {
  return !preset.isStaged && preset.effectKind === 'aura' && preset.gradeLevel === 3;
}

/**
 * How hard the screen shakes. Empty for not at all. A look of the lowest grade shakes nothing, but
 * one that stamps the ground in, an impact, or stabs up out of it, spikes of shadow, which shakes it
 * lightly however light it is. The greatest
 * aura shakes it lightly, and no harder, and so does a cut thrown off a blade as it lands, of the
 * middle grade and over. A great sword shakes it by its grade as its torrent is let go, and a storm as
 * its lightning strikes.
 */
export function effectShakeOf(preset: EffectPreset): EffectShake {
  if (breaksOutAsAura(preset)) return 'soft';
  if (fliesAsCut(preset)) return preset.gradeLevel >= 2 ? 'soft' : '';
  const asShot = hitsHardAsShot(preset);
  if (asShot !== null) return asShot;
  const kinds = drawnKinds(preset);
  const strikes = fallsAsMeteor(preset) || breaksAsRock(preset) || loosesAsGreatSword(preset) || blowsAsStorm(preset);
  if (!strikes && !kinds.some((kind) => SHAKING_KINDS.has(kind))) return '';
  const shake = SHAKE_BY_GRADE[preset.gradeLevel];
  return shake === '' && (kinds.includes('impact') || kinds.includes('shadow')) ? 'soft' : shake;
}
