import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { CutInService } from '@axe/application/media/cut-in.service';
import { TableBgmService } from '@axe/application/media/table-bgm.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { Logger } from '@axe/core/logging/logger';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { CutIn } from '@axe/domain/media/cut-in';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { FilterType, GameTable, GridSnapStyle, GridType } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { GameTableSettingComponent } from '@axe/features/tabletop/game-table-setting/game-table-setting.component';
import { expectPanelDragRecovery, PanelDragTestHostComponent } from '@axe/testing/panel-drag-recovery';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('GameTableSettingComponent', () => {
  let component: GameTableSettingComponent;
  let fixture: ComponentFixture<GameTableSettingComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [GameTableSettingComponent, PanelDragTestHostComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    // The component reads the config out of the store to find the default dice bot, so a
    // singleton has to be registered or a test run on its own dereferences nothing.
    if (!ObjectStore.instance.get('Config')) {
      const config = new Config('Config');
      config.initialize();
    }
    fixture = TestBed.createComponent(GameTableSettingComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('with no table selected', () => {
    beforeEach(() => {
      component.selectedTable = null;
    });

    it('detects changes without throwing', () => {
      expect(() => fixture.detectChanges()).not.toThrow();
    });

    it('returns the default', () => {
      expect(component.tableName).toBe('');
      expect(component.tableWidth).toBe(10);
      expect(component.tableHeight).toBe(10);
      expect(component.tableGridColor).toBe('#000000');
      expect(component.tableGridFontColor).toBe('#000000');
      expect(component.tableGridType).toBe(0 as GridType);
      expect(component.tableGridSnapStyle).toBe(GridSnapStyle.CENTER);
      expect(component.tableSnapMode).toBe('center');
      expect(component.tableDistanceviewFilter).toBe(FilterType.NONE);
    });

    it('sets without throwing', () => {
      expect(() => {
        component.tableName = 'test';
        component.tableWidth = 20;
        component.tableHeight = 20;
        component.tableGridColor = '#ffffff';
        component.tableGridFontColor = '#ff0000';
        component.tableGridType = 1 as GridType;
        component.tableGridSnapStyle = GridSnapStyle.VERTEX;
        component.tableDistanceviewFilter = FilterType.WHITE;
      }).not.toThrow();
    });
  });

  describe('signal-driven CD', () => {
    it('reads the deleted flag through a collection signal', () => {
      const objectChangeService = TestBed.inject(ObjectChangeService);
      const spy = vi.spyOn(objectChangeService, 'collectionOf');
      void component.isDeleted;
      expect(spy).toHaveBeenCalledWith('game-table');
    });

    it('reads the background image through a version signal', () => {
      const objectChangeService = TestBed.inject(ObjectChangeService);
      const spy = vi.spyOn(objectChangeService, 'versionOf');
      const table = new GameTable();
      table.initialize();
      component.selectedTable = table;
      void component.tableBackgroundImage;
      expect(spy).toHaveBeenCalledWith(table.identifier);
    });

    it('reads the distance view image through a version signal', () => {
      const objectChangeService = TestBed.inject(ObjectChangeService);
      const spy = vi.spyOn(objectChangeService, 'versionOf');
      const table = new GameTable();
      table.initialize();
      component.selectedTable = table;
      void component.tableDistanceviewImage;
      expect(spy).toHaveBeenCalledWith(table.identifier);
    });
  });

  it('offers the recommended view, and none of what the room now answers for', async () => {
    const table = new GameTable();
    table.initialize();
    component.selectedTable = table;

    try {
      expect(component.tableRecommendedView).toBe('perspective');
      component.tableRecommendedView = 'flat';
      expect(table.mode2d).toBe(true);

      fixture.detectChanges();
      await fixture.whenStable();
      const root = fixture.nativeElement as HTMLElement;

      expect(root.querySelector('[data-testid="recommended-view"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="orthographic-projection"]')).toBeNull();
      expect(root.querySelector('[data-testid="multi-angle-enabled"]')).toBeNull();
      expect(root.querySelector('[data-testid="view-locked"]')).toBeNull();
    } finally {
      table.destroy();
    }
  });

  describe('the size of a cell', () => {
    let table: GameTable;

    beforeEach(async () => {
      table = new GameTable();
      table.gridSize = 50;
      table.initialize();
      component.selectGameTable(table.identifier);
      fixture.detectChanges();
      await fixture.whenStable();
    });

    afterEach(() => {
      table.destroy();
    });

    function leaveAt(testId: string, value: string): HTMLInputElement {
      const field: HTMLInputElement = fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
      field.value = value;
      field.dispatchEvent(new Event('change'));
      return field;
    }

    it('hands the size the slider is let go at to the tabletop, which moves what is on the table', () => {
      const changeCellSize = vi.spyOn(TestBed.inject(TabletopService), 'changeCellSize');

      leaveAt('table-cell-size-range', '80');

      expect(changeCellSize).toHaveBeenCalledWith(table, 80);
      expect(table.gridSize).toBe(80);
    });

    it('shows the size the table took when the number entered is out of bounds', () => {
      const field = leaveAt('table-cell-size-num', '9999');

      expect(table.gridSize).toBe(256);
      expect(field.value).toBe('256');
    });
  });

  describe('writing the picked table from its fields', () => {
    let table: GameTable;

    beforeEach(async () => {
      table = new GameTable();
      table.name = '最初の卓';
      table.initialize();
      component.selectGameTable(table.identifier);
      fixture.detectChanges();
      await fixture.whenStable();
    });

    afterEach(() => {
      table.destroy();
    });

    /** Types a value into the field of that name, as the reader's keys or slider would. */
    function enter(name: string, value: string): void {
      const field: HTMLInputElement = fixture.nativeElement.querySelector(`input[name="${name}"]`);
      field.value = value;
      field.dispatchEvent(new Event('input'));
    }

    it('renames the table from the name typed in', () => {
      enter('table-name', 'テスト卓');

      expect(table.name).toBe('テスト卓');
    });

    it('sizes the table from its width and height sliders', () => {
      enter('tableWidth', '30');
      enter('table-height-range', '25');

      expect(table.width).toBe(30);
      expect(table.height).toBe(25);
    });

    it('shows the grid at all times once its box is ticked', () => {
      table.gridShow = false;
      const box: HTMLInputElement = fixture.nativeElement.querySelector('input[name="tableGridShow"]');

      box.click();

      expect(table.gridShow).toBe(true);
    });

    it('offers the colour of the grid in a field for colours', () => {
      const field: HTMLInputElement = fixture.nativeElement.querySelector('input[name="tableGridColor"]');

      expect(field.type).toBe('color');
    });

    it('lays the filter chosen over the picture behind the table', () => {
      const filter: HTMLSelectElement = fixture.nativeElement.querySelector('select[name="tableDistanceviewFilter"]');

      filter.value = FilterType.BLACK;
      filter.dispatchEvent(new Event('change'));
      expect(table.backgroundFilterType).toBe(FilterType.BLACK);

      filter.value = FilterType.WHITE;
      filter.dispatchEvent(new Event('change'));
      expect(table.backgroundFilterType).toBe(FilterType.WHITE);
    });

    it('saves the picked table under its name from the save button', () => {
      const save = vi.spyOn(TestBed.inject(SaveDataService), 'saveGameObjectAsync').mockResolvedValue(undefined);
      const label = TestBed.inject(TRANSLATE_FN)('feature.tabletop.tableSetting.save');
      const buttons: HTMLButtonElement[] = [...fixture.nativeElement.querySelectorAll('button')];

      buttons.find((button) => button.textContent?.includes(label))!.click();

      expect(save).toHaveBeenCalledWith(table, 'map_最初の卓', expect.any(Function));
    });

    it('lists a new table once one is made from the button over the list', async () => {
      const listed = () => fixture.nativeElement.querySelectorAll('ul[role="listbox"] > li[role="option"]').length;
      const before = listed();
      const tablesBefore = new Set(ObjectStore.instance.getObjects(GameTable));
      const add = TestBed.inject(TRANSLATE_FN)('feature.tabletop.tableSetting.addTable');

      (fixture.nativeElement.querySelector(`button[title="${add}"]`) as HTMLButtonElement).click();
      fixture.detectChanges();
      await fixture.whenStable();

      try {
        expect(listed()).toBe(before + 1);
      } finally {
        for (const made of ObjectStore.instance.getObjects(GameTable)) if (!tablesBefore.has(made)) made.destroy();
      }
    });
  });

  describe('a table deleted while it is still picked', () => {
    it('takes no grid, snap or view written from its fields', () => {
      const table = new GameTable();
      table.gridShow = false;
      table.gridSnap = true;
      table.gridSnapStyle = GridSnapStyle.CENTER;
      table.mode2d = false;
      table.initialize();
      component.selectGameTable(table.identifier);
      // A table taken out of the store counts as deleted, and a deleted one is not editable.
      ObjectStore.instance.remove(table);
      expect(component.isEditable).toBe(false);

      component.tableGridShow = true;
      component.tableGridSnap = false;
      component.tableRecommendedView = 'flat';
      component.tableSnapMode = 'vertex';

      expect(table.gridShow).toBe(false);
      expect(table.gridSnap).toBe(true);
      expect(table.gridSnapStyle).toBe(GridSnapStyle.CENTER);
      expect(table.mode2d).toBe(false);
    });
  });

  describe('how many cells make a square', () => {
    let table: GameTable;

    beforeEach(async () => {
      table = new GameTable();
      table.initialize();
      component.selectGameTable(table.identifier);
      fixture.detectChanges();
      await fixture.whenStable();
    });

    afterEach(() => {
      table.destroy();
    });

    const choice = (): HTMLSelectElement | null =>
      fixture.nativeElement.querySelector('[data-testid="table-square-span"]');

    it('is offered on a square grid, and writes the choice to the table', async () => {
      const select = choice()!;
      select.value = select.options[1].value;
      select.dispatchEvent(new Event('change'));
      await fixture.whenStable();

      expect(table.squareSpan).toBe(2);
      expect(component.tableSquareSpan).toBe(2);
    });

    it('shows what the table holds', async () => {
      table.squareSpan = 3;
      fixture.detectChanges();
      await fixture.whenStable();

      expect(choice()!.selectedIndex).toBe(2);
    });

    it('is not offered on a hex grid', async () => {
      table.gridType = GridType.HEX_VERTICAL;
      fixture.detectChanges();
      await fixture.whenStable();

      expect(choice()).toBeNull();
    });
  });

  describe('snapping to the grid', () => {
    let table: GameTable;

    beforeEach(async () => {
      table = new GameTable();
      table.initialize();
      component.selectGameTable(table.identifier);
      fixture.detectChanges();
      await fixture.whenStable();
    });

    afterEach(() => {
      table.destroy();
    });

    const hint = (): HTMLElement | null => fixture.nativeElement.querySelector('[data-testid="table-snap-grid-hint"]');

    it('writes the choice to the table as a snap that is on', async () => {
      table.gridSnap = false;
      const select: HTMLSelectElement = fixture.nativeElement.querySelector('select[name="tableSnapMode"]');
      select.value = 'grid';
      select.dispatchEvent(new Event('change'));
      await fixture.whenStable();

      expect(table.gridSnap).toBe(true);
      expect(table.gridSnapStyle).toBe(GridSnapStyle.GRID);
      expect(component.tableSnapMode).toBe('grid');
    });

    it('shows what the table holds, and says what it does', async () => {
      expect(hint()).toBeNull();

      table.gridSnapStyle = GridSnapStyle.GRID;
      fixture.detectChanges();
      await fixture.whenStable();

      const select: HTMLSelectElement = fixture.nativeElement.querySelector('select[name="tableSnapMode"]');
      expect(select.value).toBe('grid');
      expect(hint()).not.toBeNull();
    });
  });

  describe('the picture in front of everything', () => {
    let table: GameTable;

    beforeEach(() => {
      PeerCursor.createMyCursor();
      table = new GameTable();
      table.initialize();
      component.selectGameTable(table.identifier);
    });

    it('writes how opaque and how fitted the picture is, and takes it off', () => {
      table.foregroundImageIdentifier = 'mist';

      component.tableForegroundOpacity = 40;
      component.tableForegroundFit = 'contain';
      expect([table.foregroundOpacity, table.foregroundFit]).toEqual([0.4, 'contain']);
      expect([component.tableForegroundOpacity, component.tableForegroundFit]).toEqual([40, 'contain']);

      component.clearForeground();
      expect(table.foregroundImageIdentifier).toBe('');
    });

    it('shows a table that never set the picture as fully opaque and filling the screen', () => {
      expect(component.tableForegroundOpacity).toBe(100);
      expect(component.tableForegroundFit).toBe('cover');
      expect(component.tableForegroundImage.url).toBe('');
    });
  });

  describe('copying a table', () => {
    let table: GameTable;

    beforeEach(() => {
      PeerCursor.createMyCursor();
      table = new GameTable();
      table.name = '村';
      table.initialize();
      component.selectGameTable(table.identifier);
    });

    it('copies the picked table under a name saying so, and shows the copy without its cut-ins or music', () => {
      const launch = vi.spyOn(TestBed.inject(CutInService), 'launchForTable').mockReturnValue(true);
      const music = vi.spyOn(TestBed.inject(TableBgmService), 'playFor').mockImplementation(() => undefined);

      component.duplicate();

      const shown = TableSelecter.instance.viewTable!;
      expect(shown.identifier).not.toBe(table.identifier);
      expect(shown.name).toBe('村のコピー');
      expect(component.selectedTable).toBe(shown);
      expect(ObjectStore.instance.getObjects(GameTable)).toHaveLength(2);
      expect(launch).not.toHaveBeenCalled();
      expect(music).not.toHaveBeenCalled();
    });

    it('copies nothing for a guest, who may not change the table', () => {
      PeerCursor.myCursor.role = PeerRole.Guest;

      component.duplicate();

      expect(ObjectStore.instance.getObjects(GameTable)).toEqual([table]);
    });
  });

  describe('choosing a table from the list', () => {
    let table: GameTable;

    function watchLaunch() {
      return vi.spyOn(TestBed.inject(CutInService), 'launchForTable').mockReturnValue(true);
    }

    beforeEach(() => {
      table = new GameTable();
      table.initialize();
    });

    it('plays what the table asks for', () => {
      const shown = new GameTable();
      shown.initialize();
      TableSelecter.instance.viewTableIdentifier = shown.identifier;
      const launchForTable = watchLaunch();
      const music = vi.spyOn(TestBed.inject(TableBgmService), 'playFor').mockImplementation(() => undefined);

      component.chooseGameTable(table.identifier);

      expect(launchForTable).toHaveBeenCalledWith(table);
      expect(music).toHaveBeenCalledWith(table);
    });

    it('leaves the music alone when a table is only created', () => {
      const music = vi.spyOn(TestBed.inject(TableBgmService), 'playFor').mockImplementation(() => undefined);

      component.selectGameTable(table.identifier);

      expect(music).not.toHaveBeenCalled();
    });

    it('offers the room’s music, and none of the sounds that come with the tool', () => {
      vi.spyOn(TestBed.inject(AudioStorage), 'audios', 'get').mockReturnValue([
        { identifier: 'theme', name: 'theme.mp3', isHidden: false },
        { identifier: 'preset-alarm', name: 'alarm', isHidden: true },
      ] as AudioFile[]);

      expect(component.tableBgmTracks().map((track) => track.value)).toEqual(['theme']);
    });

    it('writes the music the table puts on, stops or leaves', () => {
      component.selectGameTable(table.identifier);

      component.tableBgmChoice = 'track-a';
      expect([table.tableBgm, table.tableBgmIdentifier]).toEqual(['play', 'track-a']);
      expect(component.missingTableBgm()).toBe('track-a');

      component.tableBgmChoice = 'stop';
      expect([table.tableBgm, table.tableBgmIdentifier]).toEqual(['stop', '']);
      expect(component.tableBgmChoice).toBe('stop');

      component.tableBgmChoice = '';
      expect(component.tableBgmChoice).toBe('');
      expect(component.missingTableBgm()).toBeNull();
    });

    it('stays quiet on the table already showing', () => {
      const launchForTable = watchLaunch();
      component.chooseGameTable(table.identifier);
      launchForTable.mockClear();

      component.chooseGameTable(table.identifier);

      expect(launchForTable).not.toHaveBeenCalled();
    });

    it('stays quiet when a table is only created', () => {
      const launchForTable = watchLaunch();

      component.selectGameTable(table.identifier);

      expect(launchForTable).not.toHaveBeenCalled();
    });

    function cutInsNamed(...identifiers: string[]): CutIn[] {
      return identifiers.map((identifier) => {
        const cutIn = new CutIn(identifier);
        cutIn.initialize();
        return cutIn;
      });
    }

    it('reads and writes the cut-ins the table names', () => {
      cutInsNamed('cut-1', 'cut-2');
      component.selectedTable = table;
      component.tableCutIns = ['cut-1', 'cut-2'];

      expect(table.cutInIdentifiers).toBe('cut-1,cut-2');
      expect(component.tableCutIns).toEqual(['cut-1', 'cut-2']);
    });

    it('names the cut-ins it shows as chips', async () => {
      const cutIn = new CutIn();
      cutIn.initialize();
      cutIn.name = 'オープニング';
      table.cutInIdentifiers = cutIn.identifier;
      component.selectedTable = table;

      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const labels = [...fixture.nativeElement.querySelectorAll('.ng-value-label')].map(
        (node: Element) => node.textContent
      );
      expect(labels).toContain('オープニング');
    });

    it('leaves out a cut-in that is no longer in the room, rather than showing its identifier', async () => {
      const [kept] = cutInsNamed('cut-1');
      kept.name = 'オープニング';
      table.cutInIdentifiers = 'cut-gone,cut-1';
      component.selectedTable = table;

      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const labels = [...fixture.nativeElement.querySelectorAll('.ng-value-label')].map(
        (node: Element) => node.textContent
      );
      expect(component.tableCutIns).toEqual(['cut-1']);
      expect(labels).toEqual(['オープニング']);
    });

    it('hands back the same list until the table names other cut-ins', () => {
      cutInsNamed('cut-1', 'cut-2');
      component.selectedTable = table;
      component.tableCutIns = ['cut-1', 'cut-2'];
      const list = component.tableCutIns;

      expect(component.tableCutIns).toBe(list);

      component.tableCutIns = ['cut-1'];

      expect(component.tableCutIns).not.toBe(list);
      expect(component.tableCutIns).toEqual(['cut-1']);
    });
  });

  it('lets the panel take the pointer again once the drag ends', async () => {
    await expectPanelDragRecovery(GameTableSettingComponent);
  });
  it('lists what drifts under the board of the picked table, for as long as the table can be edited', async () => {
    const table = new GameTable();
    table.initialize();
    component.selectGameTable(table.identifier);
    fixture.detectChanges();
    await fixture.whenStable();
    const add = (): HTMLButtonElement | null =>
      fixture.nativeElement.querySelector('table-background-layers [data-testid="background-layer-add"]');

    expect(add()?.disabled).toBe(false);
    add()!.click();
    expect(table.backgroundLayers).toHaveLength(1);

    ObjectStore.instance.remove(table);
    TestBed.inject(ObjectChangeService).notifyCollectionChanged(GameTable.aliasName);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(add()?.disabled ?? true).toBe(true);
    for (const layer of table.backgroundLayers) layer.destroy();
  });

  it('draws the fields of a table already deleted as closed from the first drawing', async () => {
    const table = new GameTable();
    table.initialize();
    component.selectGameTable(table.identifier);
    ObjectStore.instance.remove(table);
    fixture.detectChanges();
    await fixture.whenStable();

    const named = (name: string) =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    expect(named('table-name').hasAttribute('disabled')).toBe(true);
  });

  describe('deleting a table', () => {
    let first: GameTable;
    const deleteButton = (): HTMLButtonElement =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="table-delete"]')!;

    beforeEach(() => {
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      for (const table of ObjectStore.instance.getObjects(GameTable)) ObjectStore.instance.remove(table);
      first = new GameTable();
      first.initialize();
      component.selectGameTable(first.identifier);
    });

    it('keeps the last table, even where delete is reached past its button', async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      expect(deleteButton().disabled).toBe(true);

      component.delete();

      expect(ObjectStore.instance.get(first.identifier)).toBe(first);
      expect(component.selectedTableXml).toBe('');
    });

    it('takes a table that is not the last away, keeping it to be restored', async () => {
      const second = new GameTable();
      second.initialize();
      component.selectGameTable(second.identifier);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(deleteButton().disabled).toBe(false);

      component.delete();

      expect(ObjectStore.instance.get(second.identifier)).toBeNull();
      expect(component.selectedTableXml).toContain('<game-table');
    });
  });

  describe('restoring a deleted table', () => {
    let table: GameTable;

    beforeEach(() => {
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      table = new GameTable();
      table.initialize();
      component.selectGameTable(table.identifier);
    });

    it('forgets what it kept and stays on the picked table when the kept XML cannot be read', () => {
      vi.spyOn(Logger, 'error').mockImplementation(() => undefined);
      component.selectedTableXml = '<game-table';

      expect(() => component.restore()).not.toThrow();

      expect(component.selectedTableXml).toBe('');
      expect(component.selectedTable).toBe(table);
    });
  });
});
