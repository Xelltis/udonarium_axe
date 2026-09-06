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

  describe('how a piece shows which way it faces', () => {
    it('shows nothing for a table that has never been asked', () => {
      component.selectedTable = null;
      expect(component.tableFacingMark).toBe('none');
    });

    it('writes the choice onto the table', () => {
      const table = new GameTable();
      table.initialize();
      component.selectedTable = table;

      component.tableFacingMark = 'arrow';

      expect(table.facingMark).toBe('arrow');
      expect(component.tableFacingMark).toBe('arrow');
      table.destroy();
    });

    it('reads a table carrying something it does not know as showing nothing', () => {
      const table = new GameTable();
      table.initialize();
      table.facingMark = 'compass' as never;
      component.selectedTable = table;

      expect(component.tableFacingMark).toBe('none');
      table.destroy();
    });
  });

  describe('how far a piece may walk', () => {
    it('hands back the defaults with no table selected', () => {
      component.selectedTable = null;
      expect(component.tableMoveRangeEnabled).toBe(true);
      expect(component.tableMoveRangeElementNames).toBe('移動,移動力,Speed,速度');
      expect(component.tableCellDistance).toBe(1);
      expect(component.tableCellDistanceUnit).toBe('cell');
    });

    it('puts the question of corners only to a square board', () => {
      const table = new GameTable();
      table.initialize();
      component.selectedTable = table;

      table.gridType = GridType.SQUARE;
      expect(component.showsDiagonalOption).toBe(true);

      table.gridType = GridType.HEX_VERTICAL;
      expect(component.showsDiagonalOption).toBe(false);

      table.destroy();
    });

    it('writes all four onto the table', () => {
      const table = new GameTable();
      table.initialize();
      component.selectedTable = table;

      component.tableMoveRangeEnabled = false;
      component.tableMoveRangeElementNames = 'Speed';
      component.tableCellDistance = 5;
      component.tableCellDistanceUnit = 'foot';

      expect(table.moveRangeEnabled).toBe(false);
      expect(table.moveRangeElementNames).toBe('Speed');
      expect(table.cellDistance).toBe(5);
      expect(table.cellDistanceUnit).toBe('foot');
      table.destroy();
    });

    it('takes a distance that is not a number as no conversion at all', () => {
      const table = new GameTable();
      table.initialize();
      component.selectedTable = table;

      component.tableCellDistance = Number.NaN;

      expect(table.cellDistance).toBe(0);
      table.destroy();
    });
  });

  describe('the ground an enemy holds', () => {
    let table: GameTable;

    beforeEach(() => {
      table = new GameTable();
      table.initialize();
      component.selectedTable = table;
    });

    afterEach(() => {
      table.destroy();
    });

    it('hands back the defaults with no table selected', () => {
      component.selectedTable = null;

      expect(component.tableZocMode).toBe('none');
      expect(component.tableZocRange).toBe(1);
      expect(component.tableZocExtraCost).toBe(1);
    });

    it('asks nothing more of a table where an enemy holds no ground', () => {
      component.tableZocMode = 'none';

      expect(component.showsZocOptions).toBe(false);
      expect(component.showsZocExtraCost).toBe(false);
    });

    it('asks how far the ground reaches, and what it costs only where it is charged for', () => {
      component.tableZocMode = 'stop';
      expect(component.showsZocOptions).toBe(true);
      expect(component.showsZocExtraCost).toBe(false);

      component.tableZocMode = 'block';
      expect(component.showsZocExtraCost).toBe(false);

      component.tableZocMode = 'cost';
      expect(component.showsZocOptions).toBe(true);
      expect(component.showsZocExtraCost).toBe(true);
    });

    it('writes all three onto the table', () => {
      component.tableZocMode = 'cost';
      component.tableZocRange = 2;
      component.tableZocExtraCost = 3;

      expect(table.zocMode).toBe('cost');
      expect(table.zocRange).toBe(2);
      expect(table.zocExtraCost).toBe(3);
    });

    it('reads a table carrying something it does not know as holding no ground', () => {
      table.zocMode = 'engagement';

      expect(component.tableZocMode).toBe('none');
    });

    it('takes a reach that is not a whole count as none at all', () => {
      component.tableZocRange = Number.NaN;
      component.tableZocExtraCost = -2;

      expect(table.zocRange).toBe(0);
      expect(table.zocExtraCost).toBe(0);
    });

    it('shows the boxes only once an enemy holds ground', async () => {
      function boxes(): string[] {
        return [...fixture.nativeElement.querySelectorAll('input[type="number"]')].map(
          (node: Element) => node.getAttribute('name') ?? ''
        );
      }

      component.tableZocMode = 'none';
      fixture.detectChanges();
      await fixture.whenStable();
      expect(boxes()).not.toContain('tableZocRange');

      component.tableZocMode = 'stop';
      fixture.detectChanges();
      await fixture.whenStable();
      expect(boxes()).toContain('tableZocRange');
      expect(boxes()).not.toContain('tableZocExtraCost');

      component.tableZocMode = 'cost';
      fixture.detectChanges();
      await fixture.whenStable();
      expect(boxes()).toContain('tableZocExtraCost');
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

  describe('what drifts under the board', () => {
    const withTable = (): GameTable => {
      const table = new GameTable();
      table.initialize();
      component.selectedTable = table;
      return table;
    };

    it('lays a layer, and puts each new one in front of the last', () => {
      const table = withTable();
      try {
        component.addBackgroundLayer();
        component.addBackgroundLayer();

        expect(table.backgroundLayers.map((layer) => layer.order)).toEqual([0, 1]);
      } finally {
        table.destroy();
      }
    });

    it('stops at six between the two sides of the board', () => {
      const table = withTable();
      try {
        for (let laid = 0; laid < 6; laid++) component.addBackgroundLayer();
        expect(component.canAddBackgroundLayer).toBe(false);

        component.addBackgroundLayer();
        expect(table.backgroundLayers).toHaveLength(6);
      } finally {
        table.destroy();
      }
    });

    it('takes one away again', () => {
      const table = withTable();
      try {
        component.addBackgroundLayer();
        component.removeBackgroundLayer(table.backgroundLayers[0]);

        expect(table.backgroundLayers).toEqual([]);
      } finally {
        table.destroy();
      }
    });

    it('writes what it is asked onto the table, which the room shares', () => {
      const table = withTable();
      try {
        component.addBackgroundLayer();
        const layer = table.backgroundLayers[0];

        component.setBackgroundLayerSpeedX(layer, -120);
        component.setBackgroundLayerSpeedY(layer, 40);
        component.setBackgroundLayerOpacityPercent(layer, 60);
        component.setBackgroundLayerScale(layer, 2);
        component.setBackgroundLayerEnabled(layer, false);
        component.setBackgroundLayerPlacement(layer, 'over');

        expect(layer.placedOver).toBe(true);
        expect(layer.speedX).toBe(-120);
        expect(layer.speedY).toBe(40);
        expect(layer.opacity).toBeCloseTo(0.6, 5);
        expect(layer.scale).toBe(2);
        expect(layer.enabled).toBe(false);
      } finally {
        table.destroy();
      }
    });

    it('holds a runaway speed and an unreadable scale to what the board can show', () => {
      const table = withTable();
      try {
        component.addBackgroundLayer();
        const layer = table.backgroundLayers[0];

        component.setBackgroundLayerSpeedX(layer, 999999);
        component.setBackgroundLayerScale(layer, 999);
        component.setBackgroundLayerOpacityPercent(layer, 500);

        expect(layer.speedX).toBe(component.maxBackgroundScrollSpeed);
        expect(layer.scale).toBe(component.maxBackgroundLayerScale);
        expect(layer.opacity).toBe(1);
      } finally {
        table.destroy();
      }
    });

    it('writes nothing to a table that is no longer there to be edited', () => {
      const table = withTable();
      component.addBackgroundLayer();
      const layer = table.backgroundLayers[0];
      // A table taken out of the store counts as deleted, and a deleted one is not editable.
      ObjectStore.instance.remove(table);

      expect(component.isEditable).toBe(false);

      component.setBackgroundLayerSpeedX(layer, 100);
      component.setBackgroundLayerPlacement(layer, 'over');
      component.moveBackgroundLayer(layer, -1);
      component.removeBackgroundLayer(layer);

      expect(layer.speedX).toBe(0);
      expect(layer.placedOver).toBe(false);
      expect(table.backgroundLayers).toHaveLength(1);

      layer.destroy();
    });

    it('shows the two sides apart, everything under the board before everything over it', () => {
      const table = withTable();
      try {
        component.addBackgroundLayer();
        component.addBackgroundLayer();
        component.setBackgroundLayerPlacement(table.backgroundLayers[0], 'over');
        const shown = component.backgroundLayers;

        expect(shown.map((layer) => layer.placedOver)).toEqual([false, true]);
        expect(component.backgroundLayerNumber(shown[0])).toBe(1);
        expect(component.backgroundLayerNumber(shown[1])).toBe(1);
      } finally {
        table.destroy();
      }
    });

    it('moves one a step through its run and numbers the run again', () => {
      const table = withTable();
      try {
        component.addBackgroundLayer();
        component.addBackgroundLayer();
        component.addBackgroundLayer();
        const [first, second, third] = component.backgroundLayers;

        component.moveBackgroundLayer(third, -1);

        expect(component.backgroundLayers).toEqual([first, third, second]);
        expect(component.backgroundLayers.map((layer) => layer.order)).toEqual([0, 1, 2]);
      } finally {
        table.destroy();
      }
    });

    it('will not move one past either end of its run', () => {
      const table = withTable();
      try {
        component.addBackgroundLayer();
        component.addBackgroundLayer();
        const [first, second] = component.backgroundLayers;

        expect(component.canMoveBackgroundLayer(first, -1)).toBe(false);
        expect(component.canMoveBackgroundLayer(second, 1)).toBe(false);
        expect(component.canMoveBackgroundLayer(first, 1)).toBe(true);

        component.moveBackgroundLayer(first, -1);
        expect(component.backgroundLayers).toEqual([first, second]);
      } finally {
        table.destroy();
      }
    });

    it('counts only its own side of the board when moving, since the runs are drawn apart', () => {
      const table = withTable();
      try {
        component.addBackgroundLayer();
        component.addBackgroundLayer();
        const over = component.backgroundLayers[1];
        component.setBackgroundLayerPlacement(over, 'over');

        // Alone on its side, so there is nowhere for it to go.
        expect(component.canMoveBackgroundLayer(over, -1)).toBe(false);
        expect(component.canMoveBackgroundLayer(over, 1)).toBe(false);
      } finally {
        table.destroy();
      }
    });
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
