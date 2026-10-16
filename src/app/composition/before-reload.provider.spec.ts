import { TestBed } from '@angular/core/testing';
import { BEFORE_RELOAD } from '@axe/application/ui/reload-notice.service';
import { BEFORE_RELOAD_PROVIDER } from '@axe/composition/before-reload.provider';
import { RoomArchiveEventHandlerService } from '@axe/features/room-archive/room-archive-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('BEFORE_RELOAD_PROVIDER', () => {
  it('keeps the room in the automatic save before the page reloads', async () => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS, BEFORE_RELOAD_PROVIDER] });
    const flush = vi.spyOn(TestBed.inject(RoomArchiveEventHandlerService), 'flush').mockResolvedValue();

    await TestBed.inject(BEFORE_RELOAD)();

    expect(flush).toHaveBeenCalledOnce();
  });
});
