import { TestBed } from '@angular/core/testing';
import { HotbarFillService } from '@axe/application/hotbar/hotbar-fill.service';
import { HotbarStoreService } from '@axe/application/hotbar/hotbar-store.service';
import { HotbarPreferenceService } from '@axe/application/ui/hotbar-preference.service';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { emptyHotbarSlotDraft } from '@axe/domain/hotbar/hotbar-draft';
import { HOTBAR_PAGES, HOTBAR_SLOTS_PER_PAGE } from '@axe/domain/hotbar/hotbar-size';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('putting something on the bar from elsewhere', () => {
  let service: HotbarFillService;
  let preference: HotbarPreferenceService;

  function draftOf(value: string) {
    return { ...emptyHotbarSlotDraft('effect'), value };
  }

  beforeEach(() => {
    localStorage.removeItem('ui-hotbar');
    localStorage.removeItem('ui-hotbar-owner');
    localStorage.removeItem('ui-widgets');
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(HotbarFillService);
    preference = TestBed.inject(HotbarPreferenceService);
  });

  afterEach(() => {
    localStorage.removeItem('ui-hotbar');
    localStorage.removeItem('ui-hotbar-owner');
    localStorage.removeItem('ui-widgets');
  });

  it('takes the first free slot on the page in front of the reader', () => {
    preference.gotoPage(2);

    expect(service.fill(draftOf('爆炎'))).toEqual({ page: 2, slotIndex: 0 });
    expect(service.fill(draftOf('氷雪'))).toEqual({ page: 2, slotIndex: 1 });
  });

  it('brings the bar out where it was put away', () => {
    const widgets = TestBed.inject(WidgetVisibilityService);
    widgets.hotbar.set(false);

    service.fill(draftOf('爆炎'));

    expect(widgets.hotbar()).toBe(true);
  });

  it('moves on to another page once one is full', () => {
    const hotbar = TestBed.inject(HotbarStoreService).ensureOwn()!;
    for (let slotIndex = 0; slotIndex < HOTBAR_SLOTS_PER_PAGE; slotIndex++) {
      hotbar.put(0, slotIndex, draftOf('埋まっている'));
    }

    expect(service.fill(draftOf('爆炎'))).toEqual({ page: 1, slotIndex: 0 });
  });

  it('says so rather than dropping it when every slot is spoken for', () => {
    const hotbar = TestBed.inject(HotbarStoreService).ensureOwn()!;
    for (let page = 0; page < HOTBAR_PAGES; page++) {
      for (let slotIndex = 0; slotIndex < HOTBAR_SLOTS_PER_PAGE; slotIndex++) {
        hotbar.put(page, slotIndex, draftOf('埋まっている'));
      }
    }

    expect(service.fill(draftOf('爆炎'))).toBeNull();
  });
});
