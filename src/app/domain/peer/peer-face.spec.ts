import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { connectedPeerIdsOf, peerFaceOf } from '@axe/domain/peer/peer-face';

describe('peerFaceOf()', () => {
  function cursorOf(peerId: string, dropped: boolean): PeerCursor {
    const cursor = new PeerCursor();
    cursor.initialize();
    cursor.peerId = peerId;
    cursor.isDisConnect = dropped;
    return cursor;
  }

  afterEach(() => {
    PeerCursor.forget();
  });

  it('reads the name and the character last spoken as from the cursor of the seat', () => {
    const cursor = cursorOf('face-peer', false);
    cursor.name = 'プレイヤー';
    cursor.lastControlCharacterName = '戦士';

    const face = peerFaceOf('face-peer');

    expect(face.name).toBe('プレイヤー');
    expect(face.controlName).toBe('戦士');
    expect(face.isDisconnected).toBe(false);
  });

  it('tells a seat that has dropped out', () => {
    cursorOf('dropped-peer', true);

    expect(peerFaceOf('dropped-peer').isDisconnected).toBe(true);
  });

  it('shows a seat with no cursor as nameless, pictureless and dropped', () => {
    expect(peerFaceOf('nobody')).toEqual({
      name: '',
      controlName: '',
      image: null,
      controlImage: null,
      isDisconnected: true,
    });
  });

  it('keeps of a list only the seats still in the room, in the order given', () => {
    cursorOf('first', false);
    cursorOf('gone', true);
    cursorOf('second', false);

    expect(connectedPeerIdsOf(['second', 'gone', 'nobody', 'first'])).toEqual(['second', 'first']);
  });
});
