import { EffectKind } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { stageLayoutOf } from '@axe/domain/effect/effect-stage';

/**
 * Shaking the screen.
 *
 * Only what lands a blow, such as an explosion or a strike, shakes it.
 * Shaking for healing and shields too would give everything the same weight and leave none of it heavy.
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
  'gravity',
  'bolt',
  'ballistic',
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

/** How hard the screen shakes. Empty for not at all. */
export function effectShakeOf(preset: EffectPreset): EffectShake {
  if (!drawnKinds(preset).some((kind) => SHAKING_KINDS.has(kind))) return '';
  return SHAKE_BY_GRADE[preset.gradeLevel];
}
