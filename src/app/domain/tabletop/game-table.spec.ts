import { TestBed } from '@angular/core/testing';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { tableBgmModeOf } from '@axe/domain/media/table-bgm';
import { FilterType, GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { squareSpanOf } from '@axe/domain/tabletop/move/move-grid';
import { DEFAULT_TABLETOP_DISPLAY_SETTINGS, resolveTabletopDisplay } from '@axe/domain/tabletop/tabletop-display';

describe('GameTable', () => {
  let store: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = ObjectStore.instance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('the view the master shares, in a save', () => {
    it('leaves the shared view out of a save, keeping the rest of the table', () => {
      const table = new GameTable();
      table.initialize();
      table.name = '地下一階';
      table.sharedViewPiece = 'some-piece';

      const saved = table.toXml();
      table.destroy();

      expect(saved).toContain('地下一階');
      expect(saved).not.toContain('sharedViewPiece');
      expect(saved).not.toContain('some-piece');
    });

    it('opens a table with no view shared, whatever the file says', () => {
      const table = ObjectSerializer.instance.parseXml(
        '<game-table name="地下一階" sharedViewPiece="some-piece" width="12"></game-table>'
      ) as GameTable;

      expect(table.name).toBe('地下一階');
      expect(table.width).toBe(12);
      expect(table.sharedViewPiece).toBe('');
      table.destroy();
    });
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

    it('lets a compass find north, a table saved before the field was asked about included', () => {
      const table = new GameTable();
      table.initialize();
      expect(table.magneticAnomaly).toBe(false);
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

    it('names no piece for everyone to look through', () => {
      const table = new GameTable();
      table.initialize();
      expect(table.sharedViewPiece).toBe('');
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
      expect(table.cellMm).toBe(25.4);
    });

    /** A room saved before any of this existed carries none of these attributes. */
    it('shows a table nobody has asked about as drawn the way it always was', () => {
      const table = new GameTable();
      table.initialize();

      expect(resolveTabletopDisplay(table, {})).toEqual(DEFAULT_TABLETOP_DISPLAY_SETTINGS);
    });

    it('reads every flat-table setting an older room wrote down as text', () => {
      const table = new GameTable();
      table.initialize();
      Object.assign(table, {
        orthographicProjection: 'true',
        multiAngleEnabled: 'true',
        multiAngleRevolutionSeconds: '20',
        multiAngleTickerPixelsPerSecond: '',
        radialMenuRotationSpeed: 'quickly',
      });

      const settings = resolveTabletopDisplay(table, {});

      expect(settings.orthographicProjection).toBe(true);
      expect(settings.multiAngleEnabled).toBe(true);
      expect(settings.multiAngleRevolutionSeconds).toBe(20);
      expect(settings.multiAngleTickerPixelsPerSecond).toBe(
        DEFAULT_TABLETOP_DISPLAY_SETTINGS.multiAngleTickerPixelsPerSecond
      );
      expect(settings.radialMenuRotationSpeed).toBe(DEFAULT_TABLETOP_DISPLAY_SETTINGS.radialMenuRotationSpeed);
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

    it('counts each cell as a square, also when a saved table says nothing of squares', () => {
      const table = new GameTable();
      table.initialize();
      const saved = ObjectSerializer.instance.parseXml(
        '<game-table name="古い卓" gridType="0"></game-table>'
      ) as GameTable;
      const empty = ObjectSerializer.instance.parseXml(
        '<game-table name="空の卓" gridType="0" squareSpan=""></game-table>'
      ) as GameTable;

      expect(squareSpanOf(table)).toBe(1);
      expect(squareSpanOf(saved)).toBe(1);
      expect(squareSpanOf(empty)).toBe(1);
    });

    it('leaves the music on being chosen, also when a saved table says nothing of it', () => {
      const saved = ObjectSerializer.instance.parseXml('<game-table name="古い卓"></game-table>') as GameTable;

      expect(tableBgmModeOf(saved)).toBe('');
      expect(saved.tableBgmIdentifier).toBe('');
    });

    it('keeps the music it puts on through a save', () => {
      const table = new GameTable();
      table.tableBgm = 'play';
      table.tableBgmIdentifier = 'track-a';
      table.initialize();

      const restored = ObjectSerializer.instance.parseXml(table.toXml()) as GameTable;

      expect([tableBgmModeOf(restored), restored.tableBgmIdentifier]).toEqual(['play', 'track-a']);
    });

    it('keeps the squares it counts through a save', () => {
      const table = new GameTable();
      table.squareSpan = 3;
      table.initialize();

      const restored = ObjectSerializer.instance.parseXml(table.toXml()) as GameTable;

      expect(squareSpanOf(restored)).toBe(3);
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

  describe('terrains / masks', () => {
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
  });
});
