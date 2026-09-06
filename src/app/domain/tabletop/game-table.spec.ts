import { TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { FilterType, GameTable, GridType } from '@axe/domain/tabletop/game-table';

describe('GameTable', () => {
  let store: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = ObjectStore.instance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GridType enum', () => {
    it('NONE = -1', () => {
      expect(GridType.NONE).toBe(-1);
    });

    it('SQUARE = 0', () => {
      expect(GridType.SQUARE).toBe(0);
    });

    it('HEX_VERTICAL = 1', () => {
      expect(GridType.HEX_VERTICAL).toBe(1);
    });

    it('HEX_HORIZONTAL = 2', () => {
      expect(GridType.HEX_HORIZONTAL).toBe(2);
    });
  });

  describe('FilterType enum', () => {
    it('NONE = ""', () => {
      expect(FilterType.NONE).toBe('');
    });

    it('WHITE = "white"', () => {
      expect(FilterType.WHITE).toBe('white');
    });

    it('BLACK = "black"', () => {
      expect(FilterType.BLACK).toBe('black');
    });
  });

  describe('creating one', () => {
    it('creates a table and adds it to the store', () => {
      const table = new GameTable();
      table.initialize();
      expect(store.get(table.identifier)).toBe(table);
    });

    it('names itself a table', () => {
      const table = new GameTable();
      table.initialize();
      expect(table.aliasName).toBe('game-table');
    });
  });

  describe('the defaults of the synchronised fields', () => {
    it('starts with the default name', () => {
      const table = new GameTable();
      table.initialize();
      expect(table.name).toBe('テーブル');
    });

    it('starts twenty cells wide', () => {
      const table = new GameTable();
      table.initialize();
      expect(table.width).toBe(20);
    });

    it('starts twenty cells deep', () => {
      const table = new GameTable();
      table.initialize();
      expect(table.height).toBe(20);
    });

    it('starts at the default cell size', () => {
      const table = new GameTable();
      table.initialize();
      expect(table.gridSize).toBe(50);
    });

    it('starts unselected', () => {
      const table = new GameTable();
      table.initialize();
      expect(table.selected).toBe(false);
    });

    it('starts on squares', () => {
      const table = new GameTable();
      table.initialize();
      expect(table.gridType).toBe(GridType.SQUARE);
    });

    it('starts with nothing over the background', () => {
      const table = new GameTable();
      table.initialize();
      expect(table.backgroundFilterType).toBe(FilterType.NONE);
    });

    it('starts at the default grid colour', () => {
      const table = new GameTable();
      table.initialize();
      expect(table.gridColor).toBe('#000000e6');
    });

    it('starts at the default label colour', () => {
      const table = new GameTable();
      table.initialize();
      expect(table.gridFontColor).toBe('#000000e6');
    });

    it('starts with the grid hidden', () => {
      const table = new GameTable();
      table.initialize();
      expect(table.gridShow).toBe(false);
    });

    it('starts with shared tabletop-display options disabled', () => {
      const table = new GameTable();
      table.initialize();
      expect(table.terrainRotationIn2dEnabled).toBe(false);
      expect(table.cellMm).toBe(25.4);
    });

    it('starts snapping to it', () => {
      const table = new GameTable();
      table.initialize();
      expect(table.gridSnap).toBe(true);
    });

    it('starts at the default wall height', () => {
      const table = new GameTable();
      table.initialize();
      expect(table.wallHeight).toBe(10);
    });

    it('starts with every wall hidden', () => {
      const table = new GameTable();
      table.initialize();
      expect(table.showNorthWall).toBe(false);
      expect(table.showEastWall).toBe(false);
      expect(table.showSouthWall).toBe(false);
      expect(table.showWestWall).toBe(false);
    });

    it('starts without the darkness', () => {
      const table = new GameTable();
      table.initialize();
      expect(table.darknessEnabled).toBe(false);
      expect(table.darknessLevel).toBeGreaterThan(0);
      expect(table.globalIllumination).toBe(0);
      expect(table.ambientColor).toBeTruthy();
    });

    it('asks for no cut-in on being chosen', () => {
      const table = new GameTable();
      table.initialize();
      expect(table.cutInIdentifiers).toBe('');
    });
  });

  describe('changing it', () => {
    it('takes a new name', () => {
      const table = new GameTable();
      table.initialize();
      table.name = 'バトルマップ';
      expect(table.name).toBe('バトルマップ');
    });

    it('takes a new width', () => {
      const table = new GameTable();
      table.initialize();
      table.width = 30;
      expect(table.width).toBe(30);
    });

    it('takes a new grid type', () => {
      const table = new GameTable();
      table.initialize();
      table.gridType = GridType.HEX_VERTICAL;
      expect(table.gridType).toBe(GridType.HEX_VERTICAL);
    });
  });

  describe('terrains / masks / scratchMasks', () => {
    it('starts with no terrain', () => {
      const table = new GameTable();
      table.initialize();
      expect(table.terrains).toEqual([]);
    });

    it('starts with no masks', () => {
      const table = new GameTable();
      table.initialize();
      expect(table.masks).toEqual([]);
    });

    it('starts with no scratch masks', () => {
      const table = new GameTable();
      table.initialize();
      expect(table.scratchMasks).toEqual([]);
    });
  });
});
