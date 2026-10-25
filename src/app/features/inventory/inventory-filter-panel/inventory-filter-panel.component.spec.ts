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

  it("offers the display items' names and the piece's name to the order boxes, which still take anything typed", () => {
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop', 'get').mockReturnValue(true);
    component.dataTag = 'HP MP';
    component.tableDataTag = 'HP 毒';
    fixture.detectChanges();

    const list = fixture.nativeElement.querySelector('datalist#inventory-sort-candidates') as HTMLDataListElement;
    const options = [...list.querySelectorAll('option')];
    expect(options.map((option) => option.value)).toEqual(['name', 'HP', 'MP', '毒']);
    expect(options[0].textContent?.trim()).toBe('名前');
    for (const box of ['sort-tag', 'sort-tag-2nd']) {
      const input = fixture.nativeElement.querySelector(`input[name="${box}"]`) as HTMLInputElement;
      expect(input.getAttribute('list')).toBe('inventory-sort-candidates');
    }
  });

  it('puts a search box above the list when ticked, and takes it away again', () => {
    fixture.detectChanges();
    const box = fixture.nativeElement.querySelector('[data-testid="inventory-search-bar-toggle"]') as HTMLInputElement;
    expect(box.checked).toBe(false);

    box.click();
    expect(component.viewPreference.searchBar()).toBe(true);

    box.click();
    expect(component.viewPreference.searchBar()).toBe(false);
    localStorage.removeItem('ui-inventory-search-bar');
  });

  it('folds the rows of the rich view when ticked', () => {
    fixture.detectChanges();
    const box = fixture.nativeElement.querySelector('[data-testid="inventory-compact-toggle"]') as HTMLInputElement;
    expect(box.checked).toBe(false);

    box.click();

    expect(component.viewPreference.compact()).toBe(true);
    localStorage.removeItem('ui-inventory-compact');
  });

  it('has the round strip wait for a round to begin when ticked', () => {
    fixture.detectChanges();
    const box = fixture.nativeElement.querySelector(
      '[data-testid="inventory-round-in-play-toggle"]'
    ) as HTMLInputElement;
    expect(box.checked).toBe(false);

    box.click();

    expect(component.viewPreference.roundInPlay()).toBe(true);
    localStorage.removeItem('ui-inventory-round-in-play');
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
