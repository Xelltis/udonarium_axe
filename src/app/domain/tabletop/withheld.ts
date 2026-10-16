import { getAuthorityPeerId } from '@axe/core/network/peer-context-source';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { canViewDisclosable } from '@axe/domain/disclosure/disclosure';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { TextNote } from '@axe/domain/tabletop/text-note';

/**
 * Whether what this end holds of an object is the shape a room server withholds from the local
 * user rather than the whole of it: a card face down to them, a deck holding one, a note not
 * disclosed to them, or a die somebody else owns while they are not the game master.
 *
 * A copy of such an object would carry the withheld shape to the whole room as an object of its
 * own. Never so with SkyWay, which hands everything over whole.
 */
export function isWithheldHere(object: unknown): boolean {
  if (!getAuthorityPeerId()) return false;
  if (object instanceof Card) return object.isFaceWithheld;
  if (object instanceof CardStack) return object.cards.some((card) => card.isFaceWithheld);
  if (PeerCursor.isMyselfGameMaster) return false;
  if (object instanceof DiceSymbol) return !object.isVisible;
  if (object instanceof TextNote) {
    const viewer = { userId: PeerCursor.myCursor?.userId ?? '', isGameMaster: false, ownerUserId: object.owner };
    return !canViewDisclosable(object, viewer);
  }
  return false;
}
