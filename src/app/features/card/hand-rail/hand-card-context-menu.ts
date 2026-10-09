import type { CardSeat } from '@axe/application/card/card-game.service';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';

/**
 * The participants a card in your hand can be given to, one entry each under the name they sit
 * under, or the start of their user id where they have none.
 */
export function buildGiveHandCardMenu(seats: readonly CardSeat[], give: (userId: string) => void): ContextMenuAction[] {
  return seats.map((seat) => ({
    name: seat.name.length > 0 ? seat.name : seat.userId.slice(0, 6),
    action: () => give(seat.userId),
  }));
}
