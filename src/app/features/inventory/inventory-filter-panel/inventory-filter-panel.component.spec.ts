import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { SortOrder } from '@axe/domain/data/data-summary-setting';
import { InventoryFilterService } from '@axe/features/inventory/inventory-filter.service';
import { InventoryFilterPanelComponent } from '@axe/features/inventory/inventory-filter-panel/inventory-filter-panel.component';
import { InventoryViewPreferenceService } from '@axe/features/inventory/inventory-view-preference.service';
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
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(true);
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

  it('adds steps of the order after the second, rewrites them and takes them out again', async () => {
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(true);
    const inventory = TestBed.inject(GameObjectInventoryService);
    inventory.extraSortKeys = [];
    fixture.detectChanges();
    const rows = () =>
      [...fixture.nativeElement.querySelectorAll('[data-testid="inventory-extra-sort"]')] as HTMLElement[];
    expect(rows()).toHaveLength(0);

    const add = fixture.nativeElement.querySelector('[data-testid="inventory-add-sort"]') as HTMLButtonElement;
    add.click();
    add.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(rows().map((row) => row.querySelector('label')?.textContent?.trim())).toEqual(['並び順 第3', '並び順 第4']);
    const input = rows()[1].querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('list')).toBe('inventory-sort-candidates');
    input.value = 'MP';
    input.dispatchEvent(new Event('input'));
    const select = rows()[1].querySelector('select') as HTMLSelectElement;
    select.value = 'DESC';
    select.dispatchEvent(new Event('change'));

    expect(inventory.extraSortKeys).toEqual([
      { tag: '', order: SortOrder.ASC },
      { tag: 'MP', order: SortOrder.DESC },
    ]);

    (rows()[0].querySelector('[data-testid="inventory-remove-sort"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(inventory.extraSortKeys).toEqual([{ tag: 'MP', order: SortOrder.DESC }]);
    expect(rows()).toHaveLength(1);
    expect(rows()[0].querySelector('label')?.textContent?.trim()).toBe('並び順 第3');
    expect((rows()[0].querySelector('input') as HTMLInputElement).value).toBe('MP');
    inventory.extraSortKeys = [];
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

  describe('the names offered for the display items', () => {
    const toggles = (): HTMLButtonElement[] => [
      ...fixture.nativeElement.querySelectorAll('[data-testid="inventory-display-candidates-toggle"]'),
    ];
    const chips = (): HTMLButtonElement[] => [
      ...fixture.nativeElement.querySelectorAll('[data-testid="inventory-display-candidate"]'),
    ];
    const chip = (name: string) => chips().find((button) => button.textContent?.trim().endsWith(name))!;

    function putOnTable(name: string): GameCharacter {
      const character = GameCharacter.create(name, 1, '');
      character.setLocation('table');
      return character;
    }

    beforeEach(() => {
      vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(true);
    });

    it('stay put away until asked for', () => {
      putOnTable('戦士');
      fixture.detectChanges();

      expect(toggles()).toHaveLength(2);
      expect(chips()).toHaveLength(0);
    });

    it("are the fields on the table's sheets, the ones already shown marked", () => {
      putOnTable('戦士');
      component.dataTag = 'HP';
      fixture.detectChanges();

      toggles()[0].click();
      fixture.detectChanges();

      const names = chips().map((button) => button.textContent?.trim());
      expect(names).toContain('敏捷度');
      expect(names).not.toContain('リソース');
      expect(names).not.toContain('基本');
      expect(chip('HP').getAttribute('aria-pressed')).toBe('true');
      expect(chip('敏捷度').getAttribute('aria-pressed')).toBe('false');
    });

    it('add a name to the end of the box, after what is written there', () => {
      putOnTable('戦士');
      component.dataTag = 'HP / MP';
      fixture.detectChanges();
      toggles()[0].click();
      fixture.detectChanges();

      chip('敏捷度').click();

      expect(component.dataTag).toBe('HP / MP 敏捷度');
    });

    it('take a name already shown out of the box, leaving the rest as written', () => {
      putOnTable('戦士');
      component.dataTag = 'HP / "リソース/MP" 敏捷度';
      fixture.detectChanges();
      toggles()[0].click();
      fixture.detectChanges();

      chip('MP').click();

      expect(component.dataTag).toBe('HP / 敏捷度');
    });

    it("work on the table's box apart from the full view's", () => {
      putOnTable('戦士');
      component.dataTag = 'HP';
      component.tableDataTag = '';
      fixture.detectChanges();
      toggles()[1].click();
      fixture.detectChanges();

      chip('MP').click();

      expect(component.tableDataTag).toBe('MP');
      expect(component.dataTag).toBe('HP');
    });

    it('follow a piece onto the table while the list is open', async () => {
      const shared = GameCharacter.create('戦士', 1, '');
      shared.setLocation('common');
      fixture.detectChanges();
      toggles()[0].click();
      expect(component.displayCandidates()).toEqual([]);

      shared.setLocation('table');

      await vi.waitFor(() => expect(component.displayCandidates()).toContain('敏捷度'));
    });

    it('say so when there is nobody on the table', () => {
      fixture.detectChanges();
      toggles()[0].click();
      fixture.detectChanges();

      expect(chips()).toHaveLength(0);
      expect(fixture.nativeElement.querySelector('[data-testid="inventory-display-candidates"]').textContent).toContain(
        '卓にキャラクターがいません'
      );
    });
  });

  it('offers the hidden filter only to somebody who may see hidden pieces', () => {
    vi.spyOn(TestBed.inject(RolePermissionService), 'canSeeHidden').mockReturnValue(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('select[name="inventory-hidden-filter"]')).toBeNull();
  });

  it('offers the order and the display items only to somebody who may edit the table', () => {
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('input[name="data-tag"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('input[name="table-data-tag"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('input[name="inventory-search"]')).toBeTruthy();
  });
});
