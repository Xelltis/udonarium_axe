import { Network } from '@axe/core/index';
import { isAccountUserId } from '@axe/core/storage/identity-storage';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

/**
 * Whether a seat may be chosen by its user id to see a thing or to own it: any seat with SkyWay,
 * and on a room server only one logged in. A seat that is not names itself, and any other may
 * name itself the same to be handed what that seat was chosen for, the server having no way to
 * tell the two apart.
 */
export function mayBeChosen(cursor: PeerCursor): boolean {
  return Network.authorityPeerId === null || isAccountUserId(cursor.userId);
}
