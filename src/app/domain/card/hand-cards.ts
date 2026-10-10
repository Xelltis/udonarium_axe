import { Card } from '@axe/domain/card/card';
import { isHandOf } from '@axe/domain/card/hand-location';

/** Whether the card sits in the given user's hand rather than on the table or in someone else's hand. */
export function isHandCardOf(card: Card, userId: string): boolean {
  return isHandOf(card.location.name, userId);
}

/** The cards in the given user's hand, in the order they were taken into it. */
export function selectHandCardsOf(cards: readonly Card[], userId: string): Card[] {
  return cards.filter((card) => isHandCardOf(card, userId)).sort((a, b) => a.handOrder - b.handOrder);
}
