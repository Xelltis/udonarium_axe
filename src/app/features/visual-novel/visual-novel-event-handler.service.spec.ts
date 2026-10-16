import { TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { getMyPeerId } from '@axe/core/network/peer-context-source';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { VnStage } from '@axe/domain/visual-novel/vn-stage';
import { VisualNovelEventHandlerService } from '@axe/features/visual-novel/visual-novel-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('VisualNovelEventHandlerService', () => {
  let stage: VnStage;
  let objectChange: ObjectChangeService;

  beforeEach(() => {
    PeerCursor.createMyCursor();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    stage = ObjectStore.instance.get<VnStage>('VnStage') ?? new VnStage('VnStage');
    stage.initialize();
    stage.stopDirecting();
    objectChange = TestBed.inject(ObjectChangeService);
    TestBed.inject(VisualNovelEventHandlerService);
  });

  afterEach(() => stage.stopDirecting());

  function demote(cursor: PeerCursor, role: PeerRole): void {
    cursor.role = role;
    objectChange.notifyChanged(cursor.identifier);
    TestBed.tick();
  }

  it('ends a demoted director’s screening for a game master whose screen never opened novel mode', () => {
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    const other = new PeerCursor();
    other.peerId = 'other-peer';
    other.role = PeerRole.GameMaster;
    other.initialize();
    stage.startDirecting('other-peer');
    objectChange.notifyChanged(stage.identifier);
    TestBed.tick();
    expect(stage.isDirected).toBe(true);

    demote(other, PeerRole.Player);

    expect(stage.isDirected).toBe(false);
    other.destroy();
  });

  it('lets the director itself end it among peers, where a guest still writes', () => {
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    stage.startDirecting(getMyPeerId());
    objectChange.notifyChanged(stage.identifier);
    TestBed.tick();

    demote(PeerCursor.myCursor, PeerRole.Guest);

    expect(stage.isDirected).toBe(false);
  });
});
