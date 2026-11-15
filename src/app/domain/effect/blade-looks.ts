import { type EffectPreset } from '@axe/domain/effect/effect-preset';

/*
 * What the looks of a blade are told apart by where the way they strike matters to what they strike:
 * most cuts come from the side their caster stands, but a cleave and a great sword out of the sky
 * come from straight overhead.
 */

type Lone = Pick<EffectPreset, 'isStaged' | 'effectKind' | 'slashLook'>;

/**
 * Whether an effect brings a blade down from straight overhead, on its own rather than as a stage of
 * a run: a cleave, or a great sword dropped out of the sky, which presses what it strikes down
 * rather than throwing it back from its caster.
 */
export function strikesFromOverhead(preset: Lone): boolean {
  if (preset.isStaged) return false;
  return preset.effectKind === 'skyblade' || (preset.effectKind === 'slash' && preset.slashLook === 'heavy');
}
