import { isNetworkIsolated } from '@axe/core/network/network-isolation';
import { getAuthorityPeerId } from '@axe/core/network/peer-context-source';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { canViewDisclosable } from '@axe/domain/disclosure/disclosure';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { holdsWithheldFromElsewhere, isTableWithheld } from '@axe/domain/peer/withheld-table';
import { TextNote } from '@axe/domain/tabletop/text-note';

/**
 * Whether what this end holds of an object is the shape a room server withholds from the local
 * user rather than the whole of it: a card face down to them, a deck holding one, a note not
 * disclosed to them, or a die somebody else owns while they are not the game master.
 *
 * A copy of such an object would carry the withheld shape to the whole room as an object of its
 * own. Never so with SkyWay, which hands everything over whole, unless the table held here came
 * from a room server so, as after leaving it or loading a save marked so, or a recording's board is
 * shown in its place, as the one who recorded it saw it. Away from a room server, or where parts
 * came withheld from elsewhere, what the object actually lacks tells, the game master's table
 * included; on a room server, so does what the server keeps from this user, and nothing else, as a
 * note written in █ alone is just that there.
 */
export function isWithheldHere(object: unknown): boolean {
  const isolated = isNetworkIsolated();
  const onServer = getAuthorityPeerId() !== null && !isolated;
  if (!onServer && !isTableWithheld() && !isolated) return false;
  if (object instanceof Card) return object.isFaceWithheld;
  if (object instanceof CardStack) return object.cards.some((card) => card.isFaceWithheld);
  if ((!onServer || holdsWithheldFromElsewhere()) && lacksWithheldPart(object)) return true;
  if (!onServer || PeerCursor.isMyselfGameMaster) return false;
  if (object instanceof DiceSymbol) return !object.isVisible;
  if (object instanceof TextNote) {
    const viewer = { userId: PeerCursor.myCursor?.userId ?? '', isGameMaster: false, ownerUserId: object.owner };
    return !canViewDisclosable(object, viewer);
  }
  return false;
}

/**
 * Whether a die or a note lacks what a room server withholds: the face of a die that has faces to
 * show, or the title or text of a note, blacked out. Loading a save takes every owner away, so who
 * owns the die is not asked.
 */
function lacksWithheldPart(object: unknown): boolean {
  if (object instanceof DiceSymbol) return object.face === '' && object.faces.length > 0;
  if (object instanceof TextNote) return isBlackedOut(object.title) || isBlackedOut(object.text);
  return false;
}

/** Whether every character of the text is turned to █, as a room server masks a note. */
function isBlackedOut(text: string): boolean {
  return /^[█\s]*█[█\s]*$/.test(text);
}

/**
 * Whether a room server holds anyone but the game master to rules on who may own this object: a
 * note, a die or a card. Nobody owning one may take it for themselves alone, and a card goes only
 * to whoever takes it or to nobody; who owns anything else is left free.
 */
export function ownerRuledByServer(object: unknown): boolean {
  return object instanceof TextNote || object instanceof DiceSymbol || object instanceof Card;
}
