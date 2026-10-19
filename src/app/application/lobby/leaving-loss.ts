import { Network } from '@axe/core/network/network';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageStorage } from '@axe/core/storage/image-storage';

/** What leaving the room now would lose, which the reader is asked about first. */
export type LeavingLoss = 'peer-to-peer' | 'unsent' | 'sending' | 'uploads';

/**
 * Everything leaving the room now would lose, none outside a room. Through SkyWay the table stays
 * only with whoever is left, and nobody may be. On a room server the table stays there, except what
 * was changed while the link to it is down, what is still going out to it, a big load or deletion
 * going out a little at a time, and the pictures and sounds this seat has yet to put up there. A
 * seat the server has yet to let in for the first time has sent nothing, and loses nothing unsent.
 */
export function leavingLoss(): LeavingLoss[] {
  if (!Network.peerContext.isRoom) return [];
  if (Network.transport !== 'server') return ['peer-to-peer'];
  const losses: LeavingLoss[] = [];
  if (!Network.isAuthorityOpen && Network.authorityPeerId !== null) losses.push('unsent');
  else if (Network.hasSendsPending) losses.push('sending');
  if (ImageStorage.instance.hasUploadsPending || AudioStorage.instance.hasUploadsPending) losses.push('uploads');
  return losses;
}

/** What a room server's room would lose, said as the lines asking about it; empty when nothing would be. */
export function leavingLossText(losses: readonly LeavingLoss[], t: (key: string) => string): string {
  return losses
    .filter((loss) => loss !== 'peer-to-peer')
    .map((loss) => t(`feature.lobby.leaveRoom.${loss}`))
    .join('\n');
}
