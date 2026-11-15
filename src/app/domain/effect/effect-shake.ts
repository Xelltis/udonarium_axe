import { isRockShot } from '@axe/domain/effect/earth-looks';
import { EffectKind } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { stageLayoutOf } from '@axe/domain/effect/effect-stage';

/**
 * Shaking the screen.
 *
 * Only what lands a blow, such as an explosion or a strike, shakes it.
 * Shaking for healing and shields too would give everything the same weight and leave none of it heavy.
 * A shot shakes nothing, but for a meteor and a shot of rock; see {@link fallsAsMeteor} and {@link isRockShot}.
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

/** Whether an effect is a rock thrown at its target, a shot on its own that breaks where it lands. */
function breaksAsRock(preset: EffectPreset): boolean {
  return !preset.isStaged && isRockShot(preset);
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
 * one that stamps the ground in, an impact, which shakes it lightly however light it is. The greatest
 * aura shakes it lightly, and no harder.
 */
export function effectShakeOf(preset: EffectPreset): EffectShake {
  if (breaksOutAsAura(preset)) return 'soft';
  const kinds = drawnKinds(preset);
  if (!fallsAsMeteor(preset) && !breaksAsRock(preset) && !kinds.some((kind) => SHAKING_KINDS.has(kind))) return '';
  const shake = SHAKE_BY_GRADE[preset.gradeLevel];
  return shake === '' && kinds.includes('impact') ? 'soft' : shake;
}
