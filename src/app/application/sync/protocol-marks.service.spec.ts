import { TestBed } from '@angular/core/testing';
import { ProtocolMarksService } from '@axe/application/sync/protocol-marks.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ProtocolMarksService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.inject(ProtocolMarksService);
  });

  it('marks the zone, ground and turn protocols on this seat’s cursor the moment it is here', () => {
    TestBed.tick();
    PeerCursor.createMyCursor();

    TestBed.tick();

    const mine = PeerCursor.myCursor!;
    expect([mine.zoneProtocol, mine.groundProtocol, mine.turnProtocol]).toEqual(['1', '1', '1']);
  });

  it('leaves the cursors of the other seats as their versions said', () => {
    const other = new PeerCursor('other-cursor');
    other.initialize();
    other.peerId = 'peer-b';
    PeerCursor.createMyCursor();

    TestBed.tick();

    expect([other.zoneProtocol, other.groundProtocol, other.turnProtocol]).toEqual(['', '', '']);
  });
});
