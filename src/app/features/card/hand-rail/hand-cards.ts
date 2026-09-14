import { Card } from '@axe/domain/card/card';
import { isHandCardOf, selectHandCardsOf } from '@axe/domain/card/hand-cards';

export { isHandCardOf };

/** The cards in the given user's hand, in the order the hand rail lays them out. */
export function selectHandCards(cards: readonly Card[], userId: string): Card[] {
  return selectHandCardsOf(cards, userId);
}

/**
 * A copy of the hand with the card at `from` moved into the gap at `insertAt`.
 *
 * The gap is counted along the hand as it stands before the move, so dropping a card just past
 * itself keeps it in place. An out-of-range `from` returns the hand unchanged, and a gap past
 * either end is clamped to that end.
 */
export function reorderHandCards(cards: readonly Card[], from: number, insertAt: number): Card[] {
  if (from < 0 || from >= cards.length) return [...cards];

  const next = [...cards];
  const [moved] = next.splice(from, 1);
  const target = insertAt > from ? insertAt - 1 : insertAt;
  next.splice(Math.max(0, Math.min(next.length, target)), 0, moved);

  return next;
}
