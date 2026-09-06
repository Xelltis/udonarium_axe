import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CutInService } from '@axe/application/media/cut-in.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { DisplayCalibrationService } from '@axe/application/ui/display-calibration.service';
import { ViewLockService } from '@axe/application/ui/view-lock.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { CutIn } from '@axe/domain/media/cut-in';
import { Config } from '@axe/domain/peer/config';
import { FilterType, GameTable, GridSnapStyle, GridType } from '@axe/domain/tabletop/game-table';
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

  it('asks for no change detector', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((component as any).changeDetector).toBeUndefined();
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

  describe('what this screen measures', () => {
    it('reads the game distance from the table, which the room shares', () => {
      const table = new GameTable();
      table.initialize();
      table.cellDistance = 5;
      table.cellDistanceUnit = 'foot';
      component.selectedTable = table;

      // The check beside the calibration reads the table's own value rather than a second count.
      expect(component.cellSummary().distance).toBe(5);
      expect(component.cellSummary().unit).toBe('foot');
      table.destroy();
    });

    it('keeps the width of a square on the table, where the map is shared from', () => {
      const table = new GameTable();
      table.initialize();
      component.selectedTable = table;

      component.cellMm = 30;

      expect(table.cellMm).toBe(30);
      expect(component.cellMm).toBe(30);
      table.destroy();
    });

    it('reads a square back in inches, which is what a base is sold in', () => {
      const table = new GameTable();
      table.initialize();
      component.selectedTable = table;
      TestBed.inject(DisplayCalibrationService).calibrateFromCardRun(274, 1);

      expect(component.cellSummary()).toEqual({ mm: 25.4, inches: 1, distance: 1, unit: 'cell' });
      table.destroy();
    });

    it('leaves the table alone when the device settings are reset', () => {
      const table = new GameTable();
      table.initialize();
      component.selectedTable = table;
      component.cellMm = 30;
      const calibration = TestBed.inject(DisplayCalibrationService);
      calibration.calibrateFromCardRun(274, 1);
      calibration.setRealSizeEnabled(true);

      // The reset lives on the tabletop display panel now, since the measurement is the device's.
      calibration.reset();

      expect(calibration.isCalibrated()).toBe(false);
      expect(TestBed.inject(ViewLockService).locked()).toBe(false);
      // The map still asks for a 30mm square, whatever this screen has forgotten.
      expect(table.cellMm).toBe(30);
      table.destroy();
    });
  });

  describe('the way a table lying flat is drawn', () => {
    let table: GameTable;

    beforeEach(() => {
      table = new GameTable();
      table.initialize();
      component.selectedTable = table;
    });

    afterEach(() => {
      table.destroy();
    });

    it('writes each feature onto the table it is editing, not onto the one being looked at', () => {
      component.orthographicProjection = true;
      component.multiAngleEnabled = true;
      component.multiAngleFontScale = 'large';
      component.radialMenuEnabled = true;
      component.radialMenuRotationSpeed = 9;
      component.hoverDetailPlacement = 'screen-edges';

      expect(table.orthographicProjection).toBe(true);
      expect(table.multiAngleEnabled).toBe(true);
      expect(table.multiAngleFontScale).toBe('large');
      expect(table.radialMenuEnabled).toBe(true);
      expect(table.radialMenuRotationSpeed).toBe(9);
      expect(table.hoverDetailPlacement).toBe('screen-edges');
    });

    it('shows what the table asks for, feature by feature', () => {
      table.multiAngleEnabled = true;
      table.multiAngleRevolutionSeconds = 20;
      table.radialMenuEnabled = true;

      expect(component.multiAngleEnabled).toBe(true);
      expect(component.multiAngleRevolutionSeconds).toBe(20);
      expect(component.radialMenuEnabled).toBe(true);
    });

    it('leaves the table alone for a feature this reader has taken over, and the rest with it', () => {
      table.multiAngleEnabled = true;
      table.radialMenuEnabled = true;

      component.setOnThisScreenOnly('pieceLabels', true);
      component.multiAngleEnabled = false;
      component.radialMenuEnabled = false;

      expect(component.onThisScreenOnly('pieceLabels')).toBe(true);
      expect(component.multiAngleEnabled).toBe(false);
      expect(table.multiAngleEnabled).toBe(true);
      expect(table.radialMenuEnabled).toBe(false);
    });

    it('goes back to what the table asks for once the feature is handed back', () => {
      table.multiAngleEnabled = true;
      component.setOnThisScreenOnly('pieceLabels', true);
      component.multiAngleEnabled = false;

      component.setOnThisScreenOnly('pieceLabels', false);

      expect(component.onThisScreenOnly('pieceLabels')).toBe(false);
      expect(component.multiAngleEnabled).toBe(true);
    });

    it('starts a piece turning by the second the moment it is asked to turn in quarters', () => {
      component.multiAngleMotionMode = 'quarter-turn';

      expect(table.multiAngleMotionMode).toBe('quarter-turn');
      expect(table.multiAnglePieceRevolutionSeconds).toBe(5);
    });

    it('shows the boxes for the flat table whatever the room rules say', async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      const root = fixture.nativeElement as HTMLElement;

      expect(root.querySelector('[data-testid="orthographic-projection"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="multi-angle-enabled"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="radial-menu-enabled"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="view-locked"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="reset-calibration"]')).not.toBeNull();
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

  it('stores the 2D terrain rotation setting on the table', () => {
    const table = new GameTable();
    table.initialize();
    component.selectedTable = table;

    try {
      expect(component.tableTerrainRotationIn2dEnabled).toBe(false);
      component.tableTerrainRotationIn2dEnabled = true;
      expect(table.terrainRotationIn2dEnabled).toBe(true);
    } finally {
      table.destroy();
    }
  });

  it('shows the terrain rotation permission even while table 2D mode is off', async () => {
    const table = new GameTable();
    table.initialize();
    table.mode2d = false;
    component.selectedTable = table;

    try {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const terrainRotation = fixture.nativeElement.querySelector(
        'input[name="tableTerrainRotationIn2dEnabled"]'
      ) as HTMLInputElement;
      expect(terrainRotation).toBeTruthy();
      // The projection follows the device's tabletop display mode, so the table no longer holds it.
      expect(fixture.nativeElement.querySelector('input[name="tableOrthographicProjection"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('input[name="tableRadialMenuEnabled"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('select[name="tableMultiAngleFontScale"]')).toBeNull();
    } finally {
      table.destroy();
    }
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
      const launchForTable = watchLaunch();

      component.chooseGameTable(table.identifier);

      expect(launchForTable).toHaveBeenCalledWith(table);
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

    it('reads and writes the cut-ins the table names', () => {
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

    it('hands back the same list until the table names other cut-ins', () => {
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
});
