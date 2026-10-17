import { Network } from '@axe/core/network/network';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageStorage } from '@axe/core/storage/image-storage';

/** What leaving the room now would lose, which the reader is asked about first. */
export type LeavingLoss = 'peer-to-peer' | 'unsent' | 'sending' | 'uploads';

/**
 * What leaving the room now would lose, or null for nothing, as outside a room. Through SkyWay the
 * table stays only with whoever is left, and nobody may be. On a room server the table stays there,
 * except what was changed while the link to it is down, what is still going out to it, a big load
 * or deletion going out a little at a time, and the pictures and sounds this seat has yet to put up
 * there.
 */
export function leavingLoss(): LeavingLoss | null {
  if (!Network.peerContext.isRoom) return null;
  if (Network.transport !== 'server') return 'peer-to-peer';
  if (!Network.isAuthorityOpen) return 'unsent';
  if (Network.hasSendsPending) return 'sending';
  if (ImageStorage.instance.hasUploadsPending || AudioStorage.instance.hasUploadsPending) return 'uploads';
  return null;
}
