import { EffectKind } from '@axe/domain/effect/effect-kind';

/**
 * How a piece answers being knocked down.
 *
 * Collapsing and cleaving do not read as falling from the effect around them alone:
 * the piece itself has to come down or slide away, so this is the signal it is given.
 */
export type DefeatReaction = '' | 'dissolve' | 'bisect' | 'flinch';

const REACTION_BY_KIND: Partial<Record<EffectKind, DefeatReaction>> = {
  dissolve: 'dissolve',
  bisect: 'bisect',
  gore: 'flinch',
};

/** How a piece knocked down by this kind of effect reacts. Empty for a kind the piece does not react to. */
export function defeatReactionOf(kind: EffectKind): DefeatReaction {
  return REACTION_BY_KIND[kind] ?? '';
}
