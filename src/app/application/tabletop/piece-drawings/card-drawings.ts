import {
  type DrawnPlace,
  type GridLook,
  pagePictureSized,
  type PiecePictures,
} from '@axe/application/tabletop/piece-drawings/piece-drawing';
import type { Card } from '@axe/domain/card/card';
import type { CardStack } from '@axe/domain/card/card-stack';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { cardSprites, cardStackSprites } from '@axe/domain/tabletop/world/card-sprites';
import type { TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';

/** What every card and stack of cards is drawn with alike. */
export interface CardLook extends GridLook {
  readonly thick: boolean;
  readonly plate: string;
}

/** How many cells across a stack of cards is drawn, as its top card is, or two while it has none. */
export function stackSizeOf(stack: CardStack): number {
  return stack.topCard?.size ?? 2;
}

/**
 * A card drawn at a place: the picture the page takes of its face where it carries words, or else
 * the picture of the face it shows, with the front over it where this seat peeks at it.
 */
export function drawCard(
  card: Card,
  place: DrawnPlace,
  { gridSize }: CardLook,
  pictures: PiecePictures
): TableWorldSprite[] {
  return cardSprites({
    id: card.identifier,
    ...place,
    zindex: card.zindex,
    rotateDeg: card.rotate,
    widthPx: Math.max(0, card.size) * gridSize,
    picture:
      pagePictureSized(pictures, card.identifier) ??
      pictures.sized(pictures.urlOrSkeletonOf(card.isFront ? card.frontImage : card.backImage)),
    peek: card.isPeeking ? pictures.sized(pictures.urlOrSkeletonOf(card.frontImage)) : null,
  });
}

/** A stack of cards drawn at a place, as thick as its cards on the floor, its top card on a plate. */
export function drawCardStack(
  stack: CardStack,
  place: DrawnPlace,
  { gridSize, thick, plate }: CardLook,
  pictures: PiecePictures
): TableWorldSprite[] {
  const top = stack.topCard;
  return cardStackSprites({
    id: stack.identifier,
    ...place,
    zindex: stack.zindex,
    rotateDeg: stack.rotate,
    widthPx: stackSizeOf(stack) * gridSize,
    cardCount: stack.cards.length,
    thick: thick && surfaceOf(stack) === 'floor',
    top: top
      ? {
          picture:
            pagePictureSized(pictures, stack.identifier) ?? pictures.sized(pictures.urlOrSkeletonOf(stack.imageFile)),
          rotateDeg: top.rotate,
        }
      : null,
    plateColour: plate,
  });
}
