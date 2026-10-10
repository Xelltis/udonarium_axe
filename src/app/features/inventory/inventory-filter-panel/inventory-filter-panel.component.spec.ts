import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { InventoryViewPreferenceService } from '@axe/application/ui/inventory-view-preference.service';
import { SortOrder } from '@axe/domain/data/data-summary-setting';
import { InventoryFilterService } from '@axe/features/inventory/inventory-filter.service';
import { InventoryFilterPanelComponent } from '@axe/features/inventory/inventory-filter-panel/inventory-filter-panel.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('InventoryFilterPanelComponent', () => {
  let fixture: ComponentFixture<InventoryFilterPanelComponent>;
  let component: InventoryFilterPanelComponent;
  let filter: InventoryFilterService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [InventoryFilterPanelComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    localStorage.removeItem('ui-inventory-parts');
    filter = TestBed.inject(InventoryFilterService);
    filter.clearSearch();
    filter.hiddenFilter.set('all');
    filter.hiddenDisplay.set('dim');
    fixture = TestBed.createComponent(InventoryFilterPanelComponent);
    component = fixture.componentInstance;
    // The window is told whose inventory it works on, as the one that opens it does.
    component.filter = filter;
    component.viewPreference = TestBed.inject(InventoryViewPreferenceService);
  });

  afterEach(() => {
    localStorage.removeItem('ui-inventory-parts');
    fixture?.destroy();
    filter.clearSearch();
    filter.hiddenFilter.set('all');
    filter.hiddenDisplay.set('dim');
  });

  it('puts what is typed in the box where the list can read it', () => {
    fixture.detectChanges();
    const box = fixture.nativeElement.querySelector('input[name="inventory-search"]') as HTMLInputElement;

    box.value = 'ゴブリン';
    box.dispatchEvent(new Event('input'));

    expect(filter.searchQuery()).toBe('ゴブリン');
  });

  it('works on the inventory that opened it, not on one of its own', () => {
    // Each inventory window keeps its own narrowing, so this one is told whose it is.
    const opener = TestBed.runInInjectionContext(() => new InventoryFilterService());
    component.filter = opener;
    fixture.detectChanges();
    const box = fixture.nativeElement.querySelector('input[name="inventory-search"]') as HTMLInputElement;

    box.value = 'オーク';
    box.dispatchEvent(new Event('input'));

    expect(opener.searchQuery()).toBe('オーク');
    expect(filter.searchQuery()).toBe('');
  });

  it('tells the inventory that opened it when it goes', () => {
    let told = false;
    component.closed = () => (told = true);
    fixture.detectChanges();

    fixture.destroy();

    expect(told).toBe(true);
  });

  it('clears the search again', () => {
    filter.searchQuery.set('ゴブリン');

    component.clearSearch();

    expect(filter.searchQuery()).toBe('');
  });

  it('writes the order and the display items where the room reads them', () => {
    component.sortTag = '行動値';
    component.sortOrder = SortOrder.DESC;
    component.dataTag = 'HP MP';
    component.tableDataTag = 'HP MP 毒';

    const inventory = TestBed.inject(GameObjectInventoryService);
    expect(inventory.sortTag).toBe('行動値');
    expect(inventory.sortOrder).toBe(SortOrder.DESC);
    // The two views keep their own lists: a state is a column of boxes in one and a word and a
    // number in the other.
    expect(inventory.dataTags).toEqual(['HP', 'MP']);
    expect(inventory.tableDataTags).toEqual(['HP', 'MP', '毒']);
  });

  it('puts a strip above the list away and brings it back', () => {
    fixture.detectChanges();
    const boxes = [
      ...fixture.nativeElement.querySelectorAll('[data-testid="inventory-part-toggle"]'),
    ] as HTMLInputElement[];

    expect(boxes).toHaveLength(3);
    expect(boxes.every((box) => box.checked)).toBe(true);

    boxes[0].click();
    fixture.detectChanges();

    expect(component.shows('tabs')).toBe(false);

    boxes[0].click();

    expect(component.shows('tabs')).toBe(true);
  });

  it('offers the hidden filter only to somebody who may see hidden pieces', () => {
    vi.spyOn(TestBed.inject(RolePermissionService), 'canSeeHidden', 'get').mockReturnValue(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('select[name="inventory-hidden-filter"]')).toBeNull();
  });

  it('offers the order and the display items only to somebody who may edit the table', () => {
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop', 'get').mockReturnValue(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('input[name="data-tag"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('input[name="table-data-tag"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('input[name="inventory-search"]')).toBeTruthy();
  });
});
