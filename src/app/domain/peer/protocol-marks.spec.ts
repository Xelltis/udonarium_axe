import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { markProtocols } from '@axe/domain/peer/protocol-marks';

describe('markProtocols', () => {
  it('says every protocol this version runs on the cursor as 1', () => {
    const cursor = new PeerCursor('peer-cursor-a');
    cursor.initialize();

    markProtocols(cursor);

    expect([cursor.zoneProtocol, cursor.groundProtocol, cursor.turnProtocol]).toEqual(['1', '1', '1']);
  });

  it('writes nothing to a mark already said', () => {
    const cursor = new PeerCursor('peer-cursor-a');
    cursor.initialize();
    markProtocols(cursor);
    const before = cursor.toContext().majorVersion;

    markProtocols(cursor);

    expect(cursor.toContext().majorVersion).toBe(before);
  });
});
