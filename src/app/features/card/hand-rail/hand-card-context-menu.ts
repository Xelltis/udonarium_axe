import type { CardSeat } from '@axe/application/card/card-game.service';
import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';

/**
 * The participants cards can go to, as a card given from your hand or a hand handed over, one entry
 * each under the name they sit under, or the start of their user id where they have none.
 */
export function buildCardReceiverMenu(seats: readonly CardSeat[], pick: (userId: string) => void): ContextMenuAction[] {
  return seats.map((seat) => ({
    name: seat.name.length > 0 ? seat.name : seat.userId.slice(0, 6),
    action: () => pick(seat.userId),
  }));
}

/**
 * The two ways a card dragged out of your hand can be laid where it was dropped, face up first, as
 * the hand's own buttons offer them.
 */
export function buildPlayDroppedCardMenu(play: (faceUp: boolean) => void, t: TranslateFn): ContextMenuAction[] {
  return [
    { name: t('feature.card.hand.playFaceUp'), action: () => play(true) },
    { name: t('feature.card.hand.playFaceDown'), action: () => play(false) },
  ];
}
