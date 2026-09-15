import { ObjectStore } from '@axe/core/sync/object-store';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { GameTableScratchMask } from '@axe/domain/tabletop/game-table-scratch-mask';
import {
  convertedMaskIdentifierOf,
  convertLegacyScratchMask,
  legacyMaskColourOf,
} from '@axe/domain/tabletop/legacy-scratch-mask';

describe('converting a legacy scratch mask', () => {
  let store: ObjectStore;

  beforeEach(() => {
    store = ObjectStore.instance;
  });

  function tableOf(gridType: GridType, identifier = 'table-in-play'): GameTable {
    const table = new GameTable(identifier);
    table.gridType = gridType;
    table.initialize();
    return table;
  }

  function legacyOn(table: GameTable, identifier = 'legacy-mask'): GameTableScratchMask {
    const legacy = GameTableScratchMask.create('古いマスク', 4, 3, 100, identifier);
    legacy.location = { name: 'table', x: 150, y: 200 };
    legacy.posZ = 12;
    table.appendChild(legacy);
    return legacy;
  }

  function mapWithOpenCells(...cells: [col: number, row: number, written: unknown][]): unknown[] {
    const map: unknown[] = new Array(50 * 50).fill(1);
    for (const [col, row, written] of cells) map[50 * row + col] = written;
    return map;
  }

  describe('on a square table', () => {
    it('lays a regular mask where the legacy one lay and deletes the legacy one', () => {
      const table = tableOf(GridType.SQUARE);
      const legacy = legacyOn(table);
      legacy.isLock = true;
      legacy.dispLockMark = false;
      legacy.owner = 'user-a';

      const mask = convertLegacyScratchMask(legacy, null)!;

      expect(table.masks).toEqual([mask]);
      expect(mask.parent).toBe(table);
      expect(mask.name).toBe('古いマスク');
      expect(mask.width).toBe(4);
      expect(mask.height).toBe(3);
      expect(mask.location).toEqual({ name: 'table', x: 150, y: 200 });
      expect(mask.posZ).toBe(12);
      expect(mask.isLock).toBe(true);
      expect(mask.dispLockMark).toBe(false);
      expect(mask.owner).toBe('user-a');
      expect(store.getObjects(GameTableScratchMask)).toEqual([]);
      expect(store.isDeleted('legacy-mask')).toBe(true);
    });

    it('draws it as see-through as the legacy box was drawn', () => {
      const mask = convertLegacyScratchMask(legacyOn(tableOf(GridType.SQUARE)), null)!;

      expect(mask.opacity).toBeCloseTo(0.6);
    });

    it('keeps the face it stood on and its height above the table', () => {
      const table = tableOf(GridType.SQUARE);
      const legacy = legacyOn(table);
      legacy.location = { name: 'table', x: 50, y: 100, surface: 'north-wall' };
      legacy.altitude = 2;
      legacy.isAltitudeIndicate = true;

      const mask = convertLegacyScratchMask(legacy, null)!;

      expect(mask.location).toEqual({ name: 'table', x: 50, y: 100, surface: 'north-wall' });
      expect(mask.altitude).toBe(2);
      expect(mask.isAltitudeIndicate).toBe(true);
    });

    it('opens the cells the legacy map holds false in, in whichever form the false came', () => {
      const legacy = legacyOn(tableOf(GridType.SQUARE));
      legacy.M = mapWithOpenCells([2, 0, false], [0, 1, 'false'], [3, 2, 0]) as boolean[];

      const mask = convertLegacyScratchMask(legacy, null)!;

      expect(mask.scratchedGrids).toBe('0:1,2:0,3:2');
    });

    it('opens nothing for map entries beyond the size of the mask', () => {
      const legacy = legacyOn(tableOf(GridType.SQUARE));
      legacy.M = mapWithOpenCells([10, 0, false], [0, 7, false]) as boolean[];

      expect(convertLegacyScratchMask(legacy, null)!.scratchedGrids).toBe('');
    });

    it('opens nothing when the map is empty or missing', () => {
      const table = tableOf(GridType.SQUARE);
      const empty = legacyOn(table, 'empty-map');
      empty.M = [];
      const missing = legacyOn(table, 'missing-map');
      missing.removeAttribute('M');

      expect(convertLegacyScratchMask(empty, null)!.scratchedGrids).toBe('');
      expect(convertLegacyScratchMask(missing, null)!.scratchedGrids).toBe('');
    });

    it('keeps the cells the legacy mask listed as open itself', () => {
      const legacy = legacyOn(tableOf(GridType.SQUARE));
      legacy.M = mapWithOpenCells([0, 0, false]) as boolean[];
      legacy.scratchedGrids = '1:1,not-a-cell';

      expect(convertLegacyScratchMask(legacy, null)!.scratchedGrids).toBe('0:0,1:1');
    });
  });

  describe('on a hex table', () => {
    it('lays a regular mask of the same cells in the same place on the hex table', () => {
      const table = tableOf(GridType.HEX_VERTICAL);
      const legacy = legacyOn(table);
      legacy.M = mapWithOpenCells([1, 0, false], [0, 2, false]) as boolean[];

      const mask = convertLegacyScratchMask(legacy, null)!;

      expect(table.masks).toEqual([mask]);
      expect(mask.width).toBe(4);
      expect(mask.height).toBe(3);
      expect(mask.location).toEqual({ name: 'table', x: 150, y: 200 });
      expect(mask.scratchedGrids).toBe('0:2,1:0');
      expect(store.getObjects(GameTableScratchMask)).toEqual([]);
    });
  });

  describe('the colour', () => {
    function convertedColour(changeColor: string | null, color: string | null): string {
      const key = `${changeColor}|${color}`;
      const legacy = legacyOn(tableOf(GridType.SQUARE, `table ${key}`), `legacy ${key}`);
      if (changeColor === null) legacy.removeAttribute('changeColor');
      else legacy.changeColor = changeColor;
      if (color === null) legacy.removeAttribute('color');
      else legacy.color = color;
      return convertLegacyScratchMask(legacy, null)!.bgcolor;
    }

    it('is the colour the legacy mask showed before anything was scratched', () => {
      expect(convertedColour('#123456', '#abcdef')).toBe('#123456');
    });

    it('falls back to the fill colour when that one is empty', () => {
      expect(convertedColour('', '#abcdef')).toBe('#abcdef');
    });

    it('falls back to the fill colour when that one is missing', () => {
      expect(convertedColour(null, '#abcdef')).toBe('#abcdef');
    });

    it('falls back to the fill colour when that one is not a colour', () => {
      expect(convertedColour('reddish', '#abcdef')).toBe('#abcdef');
    });

    it("is the regular mask's own default when neither is a colour", () => {
      expect(convertedColour('', '')).toBe('#0a0a0a');
      expect(convertedColour(null, null)).toBe('#0a0a0a');
    });

    it('reads no colour out of an empty string', () => {
      expect(legacyMaskColourOf({ changeColor: '', color: '' })).toBeNull();
    });
  });

  describe('one legacy mask, several seats', () => {
    it('gives every seat the same identifier for the same legacy mask', () => {
      expect(convertedMaskIdentifierOf('legacy-a')).toBe(convertedMaskIdentifierOf('legacy-a'));
      expect(convertedMaskIdentifierOf('legacy-a')).not.toBe(convertedMaskIdentifierOf('legacy-b'));
    });

    it('keeps the regular mask another seat already made from it rather than laying a second', () => {
      const table = tableOf(GridType.SQUARE);
      const legacy = legacyOn(table);
      const theirs = GameTableMask.create('古いマスク', 4, 3, 100, convertedMaskIdentifierOf(legacy.identifier));
      table.appendChild(theirs);

      const mask = convertLegacyScratchMask(legacy, null);

      expect(mask).toBe(theirs);
      expect(table.masks).toEqual([theirs]);
      expect(store.getObjects(GameTableMask)).toEqual([theirs]);
      expect(theirs.commonDataElement!.getElementsByName('name')).toHaveLength(1);
      expect(store.getObjects(GameTableScratchMask)).toEqual([]);
    });

    it('does not bring back a converted mask that has since been deleted', () => {
      const table = tableOf(GridType.SQUARE);
      convertLegacyScratchMask(legacyOn(table), null)!.destroy();
      store.forgetDeleted(['legacy-mask']);
      const again = legacyOn(table);

      expect(convertLegacyScratchMask(again, null)).toBeNull();
      expect(store.getObjects(GameTableMask)).toEqual([]);
      expect(store.getObjects(GameTableScratchMask)).toEqual([]);
    });
  });

  describe('a legacy mask that is not all there yet', () => {
    it('waits for the name and size it was made with', () => {
      const table = tableOf(GridType.SQUARE);
      const partial = new GameTableScratchMask('partial');
      partial.initialize();
      table.appendChild(partial);

      expect(convertLegacyScratchMask(partial, table)).toBeNull();
      expect(store.get('partial')).toBe(partial);
      expect(table.masks).toEqual([]);
    });

    it('waits for the table it names', () => {
      const table = tableOf(GridType.SQUARE);
      const legacy = legacyOn(table);
      store.remove(table);

      expect(convertLegacyScratchMask(legacy, null)).toBeNull();
      expect(store.get('legacy-mask')).toBe(legacy);
      expect(store.getObjects(GameTableMask)).toEqual([]);
    });

    it('lays a legacy mask that names no table on the table it is given', () => {
      const table = tableOf(GridType.SQUARE);
      const unplaced = GameTableScratchMask.create('置かれていない', 2, 2, 100, 'unplaced');

      expect(convertLegacyScratchMask(unplaced, null)).toBeNull();
      expect(convertLegacyScratchMask(unplaced, table)!.parent).toBe(table);
    });
  });
});
