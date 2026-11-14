import type { ImageFile } from '@axe/core/storage/image-file';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

/** How a seat is shown in a list of the room's seats. */
export interface PeerFace {
  /** The player's name; empty for a seat with no cursor. */
  readonly name: string;
  /** The name of the character the seat last spoke as; empty where there is none. */
  readonly controlName: string;
  /** The player's own picture; null where there is none. */
  readonly image: ImageFile | null;
  /** The picture of the character the seat last spoke as; null where there is none. */
  readonly controlImage: ImageFile | null;
  /** Whether the seat has dropped out of the room; a seat with no cursor counts as dropped. */
  readonly isDisconnected: boolean;
}

/** How the seat with this peer id is shown, read from its cursor; a seat with no cursor is nameless and dropped. */
export function peerFaceOf(peerId: string): PeerFace {
  const cursor = PeerCursor.findByPeerId(peerId);
  return {
    name: cursor?.name ?? '',
    controlName: cursor?.lastControlCharacterName ?? '',
    image: cursor?.image ?? null,
    controlImage: cursor?.lastControlImage ?? null,
    isDisconnected: cursor ? cursor.isDisConnect : true,
  };
}

/** Those of the peer ids whose seats are still in the room, which is who a list of seats starts with picked. */
export function connectedPeerIdsOf(peerIds: readonly string[]): string[] {
  return peerIds.filter((peerId) => !peerFaceOf(peerId).isDisconnected);
}
