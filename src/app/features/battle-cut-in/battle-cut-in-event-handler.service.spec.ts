import { TestBed } from '@angular/core/testing';
import { callBattleCutIn } from '@axe/core/event/domain-events';
import { setNetworkIsolated } from '@axe/core/network/network-isolation';
import { BattleCutInEventHandlerService } from '@axe/features/battle-cut-in/battle-cut-in-event-handler.service';
import { BattleCutInReceiverService } from '@axe/features/battle-cut-in/battle-cut-in-receiver.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('BattleCutInEventHandlerService', () => {
  let receive: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setNetworkIsolated(true);
    receive = vi.fn();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.overrideProvider(BattleCutInReceiverService, { useValue: { receive } });
    TestBed.inject(BattleCutInEventHandlerService);
  });

  afterEach(() => {
    setNetworkIsolated(false);
  });

  it('hands each scene the room sends on to be played, in the order they came', async () => {
    callBattleCutIn({ key: 'first' }, 'everywhere');
    callBattleCutIn({ key: 'second' }, 'here');

    await vi.waitFor(() => expect(receive).toHaveBeenCalledTimes(2));
    expect(receive.mock.calls.map(([scene]) => scene.key)).toEqual(['first', 'second']);
  });
});
