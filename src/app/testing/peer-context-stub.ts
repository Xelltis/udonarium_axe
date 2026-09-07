import { IPeerContext } from '@axe/core/network/peer-context';
import { setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { PeerSessionGrade } from '@axe/core/network/peer-session-state';

/**
 * Who the spec is, said outright.
 *
 * Whether a piece or a line belongs to the reader is settled against the peer context, and the
 * default one is the network's own. A spec that took its name from there was answered with
 * whatever the network happened to be doing: work left running by another file could move the
 * context between the line that claims the card and the line that draws it, and the claim came
 * out false. Standing in for it costs nothing and cannot be moved from under the test.
 *
 * It lasts one test. The shared setup puts the network's own context back before the next.
 */
export function beMyself(userId = 'spec-reader'): IPeerContext {
  const me: IPeerContext = {
    peerId: `${userId}-peer`,
    userId,
    roomId: '',
    roomName: '',
    password: '',
    digestUserId: '',
    digestRoomName: '',
    digestPassword: '',
    isOpen: true,
    isRoom: false,
    hasPassword: false,
    session: { grade: PeerSessionGrade.UNSPECIFIED, name: '', isVisitor: false } as never,
  };
  setPeerContextProvider({ peerContext: me, peerContexts: [me], peerIds: [me.peerId], peerId: me.peerId });
  return me;
}
