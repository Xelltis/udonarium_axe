import { Network } from '@axe/core/network/network';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

/**
 * Whether a room server holds this seat to what only the game master may do: who may read a tab,
 * deleting the dice the server rolled, and who owns what the server rules the owner of. A seat in a
 * room of peers is held to nothing, and neither is the game master's. Whatever offers or refuses
 * such a thing asks here, so the seat is told the same wherever it asks.
 */
export function heldToGameMasterByServer(): boolean {
  return Network.authorityPeerId !== null && !PeerCursor.isMyselfGameMaster;
}
