import { TestBed } from '@angular/core/testing';
import { ModelActsService } from '@axe/application/tabletop/model-acts.service';
import { localDispatch } from '@axe/core/network/network-messaging';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { ModelMotionEventHandlerService } from '@axe/features/tabletop/model-motion/model-motion-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ModelMotionEventHandlerService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.inject(ModelMotionEventHandlerService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('plays a motion this seat is told of by a seat that may change the table, by name where it was asked by name', () => {
    const played = vi.spyOn(TestBed.inject(ModelActsService), 'play').mockImplementation(() => undefined);
    const roles: Record<string, PeerRole> = { 'player-peer': PeerRole.Player, 'guest-peer': PeerRole.Guest };
    vi.spyOn(PeerCursor, 'findByPeerId').mockImplementation((peerId) =>
      roles[peerId] ? ({ role: roles[peerId] } as PeerCursor) : null
    );

    localDispatch('MODEL_MOTION', { identifier: 'orc', motion: 'Bow' }, 'guest-peer');
    localDispatch('MODEL_MOTION', { identifier: 'orc', motion: 'Bow' }, 'nobody-peer');
    localDispatch('MODEL_MOTION', { identifier: 'orc', motion: 'Wave' }, 'player-peer');
    localDispatch('MODEL_MOTION', { identifier: 'orc', motion: 'Attack', named: true }, 'player-peer');

    expect(played.mock.calls).toEqual([
      ['orc', 'Wave', { named: false }],
      ['orc', 'Attack', { named: true }],
    ]);
  });
});
