import { EffectKind } from '@axe/domain/effect/effect-kind';
import { BISECT_PICTURE_HEIGHT } from '@axe/domain/effect/timeline/blade';
import { DISSOLVE_PICTURE_HEIGHT } from '@axe/domain/effect/timeline/body';

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

/**
 * How tall an effect that knocks a piece down draws the piece's own picture, against the size the
 * effect is drawn at, so that whatever stands a piece taller than a cell can size the effect to it.
 * 1 for one that does not draw the picture at all.
 */
export function defeatPictureHeight(kind: EffectKind): number {
  if (kind === 'dissolve') return DISSOLVE_PICTURE_HEIGHT;
  if (kind === 'bisect') return BISECT_PICTURE_HEIGHT;
  return 1;
}
