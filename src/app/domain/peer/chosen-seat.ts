import { getAuthorityPeerId } from '@axe/core/network/peer-context-source';
import { isAccountUserId } from '@axe/core/storage/identity-storage';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canRoleEdit } from '@axe/domain/peer/peer-role';

/**
 * Whether a seat may be chosen by its user id to see a thing, to own it or to be whispered to: any
 * seat with SkyWay, and on a room server only one logged in, as an account's id shows or as a game
 * master's or a player's role does, which the server gives to logged-in seats alone. A seat that is
 * not names itself, and any other may name itself the same to be handed what that seat was chosen
 * for, the server having no way to tell the two apart.
 */
export function mayBeChosen(cursor: PeerCursor): boolean {
  return getAuthorityPeerId() === null || isAccountUserId(cursor.userId) || canRoleEdit(cursor.role);
}

/**
 * Whether a seat is offered for a choice: one that may be chosen, or one among `chosen`, the user ids
 * already chosen, so that it can be taken off again, as when its role was lowered after it was chosen.
 */
export function mayBeOffered(cursor: PeerCursor, chosen: readonly string[]): boolean {
  return mayBeChosen(cursor) || chosen.includes(cursor.userId);
}
