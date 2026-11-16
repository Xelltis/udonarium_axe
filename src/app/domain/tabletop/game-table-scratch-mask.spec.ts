import { TestBed } from '@angular/core/testing';
import { ObjectFactory } from '@axe/core/sync/object-factory';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameTableScratchMask, isScratchCellCovered } from '@axe/domain/tabletop/game-table-scratch-mask';
import { legacyScratchedGridsOf } from '@axe/domain/tabletop/legacy-scratch-mask';

describe('GameTableScratchMask', () => {
  let store: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = ObjectStore.instance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create()', () => {
    it('is created with a name and a size', () => {
      const mask = GameTableScratchMask.create('スクラッチ', 3, 4, 100);
      expect(mask).toBeTruthy();
      expect(mask.name).toBe('スクラッチ');
      expect(mask.width).toBe(3);
      expect(mask.height).toBe(4);
    });

    it('is created against an identifier of its own', () => {
      const mask = GameTableScratchMask.create('mask', 1, 1, 100, 'scratch-id');
      expect(mask.identifier).toBe('scratch-id');
    });

    it('is added to the store', () => {
      const mask = GameTableScratchMask.create('mask', 1, 1, 100);
      expect(store.get(mask.identifier)).toBe(mask);
    });

    it('starts with a cell for every square', () => {
      const mask = GameTableScratchMask.create('mask', 1, 1, 100);
      expect(mask.M).toHaveLength(2500);
    });
  });

  describe('aliasName', () => {
    it('names itself a scratch mask', () => {
      const mask = GameTableScratchMask.create('test', 1, 1, 100);
      expect(mask.aliasName).toBe('table-scratch-mask');
    });
  });

  describe('the defaults of the synchronised fields', () => {
    it('starts unlocked', () => {
      const mask = GameTableScratchMask.create('test', 1, 1, 100);
      expect(mask.isLock).toBe(false);
    });

    it('starts unscratched', () => {
      const mask = GameTableScratchMask.create('test', 1, 1, 100);
      expect(mask.isScratch).toBe(false);
    });

    it('starts at its default colour', () => {
      const mask = GameTableScratchMask.create('test', 1, 1, 100);
      expect(mask.color).toBe('#404040');
    });

    it('starts at its default scratched colour', () => {
      const mask = GameTableScratchMask.create('test', 1, 1, 100);
      expect(mask.changeColor).toBe('#FF5050');
    });

    it('starts unowned', () => {
      const mask = GameTableScratchMask.create('test', 1, 1, 100);
      expect(mask.owner).toBe('');
    });
  });

  describe('getMaxSize()', () => {
    it('returns fifty', () => {
      const mask = GameTableScratchMask.create('test', 1, 1, 100);
      expect(mask.getMaxSize()).toBe(50);
    });
  });

  describe('isScratchCellCovered', () => {
    it.each([false, 0, 'false', '0'])('reads %j as a cell scratched open', (entry) => {
      expect(isScratchCellCovered(entry)).toBe(false);
    });

    it.each([true, 1, 'true', '1', '', undefined, null])('reads %j as a cell still covered', (entry) => {
      expect(isScratchCellCovered(entry)).toBe(true);
    });
  });

  describe('a map read back from a saved room', () => {
    /**
     * A mask read from what another wrote, as loading a room reads it. The attributes are handed
     * over as a list: happy-dom refuses the dotted names the map is saved under, one for each cell.
     */
    function savedAndReadBack(saved: GameTableScratchMask): GameTableScratchMask {
      const attributes = Object.entries(saved.toAttributes()).map(([name, value]) => ({ name, value: `${value}` }));
      const read = ObjectFactory.instance.create<GameTableScratchMask>(GameTableScratchMask.aliasName)!;
      read.parseAttributes(attributes as unknown as NamedNodeMap);
      read.initialize();
      return read;
    }

    function scratchedAt(...cells: [x: number, y: number][]): GameTableScratchMask {
      const mask = GameTableScratchMask.create('削りかけ', 4, 4, 100);
      const map = [...mask.M];
      for (const [x, y] of cells) map[mask.getMaxSize() * y + x] = false;
      mask.M = map;
      return mask;
    }

    it('holds its cells as text, the ones scratched open still open and the others covered', () => {
      const read = savedAndReadBack(scratchedAt([0, 0], [2, 3]));

      expect(read.M[0]).toBeTypeOf('string');
      expect(isScratchCellCovered(read.M[0])).toBe(false);
      expect(isScratchCellCovered(read.M[read.getMaxSize() * 3 + 2])).toBe(false);
      expect(isScratchCellCovered(read.M[1])).toBe(true);
    });

    it('opens the cells scratched open, and no other, when it is turned into a regular mask', () => {
      expect(legacyScratchedGridsOf(savedAndReadBack(scratchedAt([0, 0])))).toBe('0:0');
      expect(legacyScratchedGridsOf(savedAndReadBack(scratchedAt([1, 0])))).toBe('');
    });

    it('opens the same cells when it is saved and read back once more', () => {
      const again = savedAndReadBack(savedAndReadBack(scratchedAt([0, 0])));

      expect(legacyScratchedGridsOf(again)).toBe('0:0');
    });
  });

  describe('hasOwner', () => {
    it('is false while it is unowned', () => {
      const mask = GameTableScratchMask.create('test', 1, 1, 100);
      expect(mask.hasOwner).toBe(false);
    });

    it('is true once it has an owner', () => {
      const mask = GameTableScratchMask.create('test', 1, 1, 100);
      mask.owner = 'user-1';
      expect(mask.hasOwner).toBe(true);
    });
  });

  describe('what it inherits', () => {
    it('starts on the table', () => {
      const mask = GameTableScratchMask.create('test', 1, 1, 100);
      expect(mask.location.name).toBe('table');
    });
  });
});
