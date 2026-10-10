import { ResourceChangeKind, ResourceChangeSeverity } from '@axe/domain/character/resource-change';

/**
 * The effects played by themselves when a resource changes.
 *
 * Damage strikes and healing lights, each graded by size.
 * Nothing here knows the element, so the effects chosen carry no family colour.
 */
const AUTO_EFFECT_IDENTIFIERS: Record<ResourceChangeKind, Record<ResourceChangeSeverity, string>> = {
  damage: {
    small: 'EffectPreset_bash_1',
    medium: 'EffectPreset_bash_2',
    large: 'EffectPreset_bash_3',
  },
  heal: {
    small: 'EffectPreset_heal_1',
    medium: 'EffectPreset_heal_2',
    large: 'EffectPreset_heal_3',
  },
};

/** The identifier of the built-in effect that plays by itself for a change of this kind and size. */
export function autoEffectIdentifier(kind: ResourceChangeKind, severity: ResourceChangeSeverity): string {
  return AUTO_EFFECT_IDENTIFIERS[kind][severity];
}
