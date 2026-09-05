import { TestBed } from '@angular/core/testing';
import { blockedCellKeysOn, FunctionalPaintService } from '@axe/application/tabletop/functional-paint.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { DEFAULT_FUNCTION_SPEC, FunctionPaintPlan } from '@axe/domain/tabletop/function-paint';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { ensureMoveBlockMapOn } from '@axe/domain/tabletop/move/move-block-map';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('FunctionalPaintService', () => {
  let service: FunctionalPaintService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 10;
    table.height = 8;
    table.gridSize = 50;
    table.initialize();
    service = TestBed.inject(FunctionalPaintService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function grid() {
    return cellGridOf(table.width, table.height, table.gridSize, table.gridType);
  }

  it('reads the size and the grid of the table that is out', () => {
    const snapshot = service.snapshot()!;

    expect(snapshot.cols).toBe(10);
    expect(snapshot.rows).toBe(8);
    expect(snapshot.cellPx).toBe(50);
  });

  it('reads the cells the table is closed on', () => {
    const bits = new CellBits(80);
    bits.set(0);
    bits.set(12);
    ensureMoveBlockMapOn(table).write(grid(), bits);

    expect([...service.snapshot()!.blockedCells].sort()).toEqual(['0,0', '2,1']);
  });

  it('reads only the terrain the editor painted', () => {
    const painted = Terrain.create('塗った壁', 1, 1, 1, '', '');
    painted.paintCell = '3,4';
    table.appendChild(painted);
    const byHand = Terrain.create('置いた壁', 3, 2, 4, '', '');
    table.appendChild(byHand);

    expect(service.snapshot()!.terrainCells).toEqual(['3,4']);
  });

  it('reads only the masks the editor painted', () => {
    const painted = GameTableMask.create('塗った覆い', 1, 1, 0.6);
    painted.paintCell = '5,6';
    table.appendChild(painted);
    const byHand = GameTableMask.create('置いた覆い', 4, 4, 0.6);
    table.appendChild(byHand);

    expect(service.snapshot()!.maskCells).toEqual(['5,6']);
  });

  describe('laying what was painted on the table', () => {
    function plan(over: Partial<FunctionPaintPlan> = {}): FunctionPaintPlan {
      return {
        blocked: [],
        terrain: { add: [], remove: [] },
        mask: { add: [], remove: [] },
        terrainSpec: { ...DEFAULT_FUNCTION_SPEC.terrain },
        maskSpec: { ...DEFAULT_FUNCTION_SPEC.mask },
        ...over,
      };
    }

    function terrainOn(): Terrain[] {
      return table.children.filter((child): child is Terrain => child instanceof Terrain);
    }

    function masksOn(): GameTableMask[] {
      return table.children.filter((child): child is GameTableMask => child instanceof GameTableMask);
    }

    it('leaves terrain a person placed by hand exactly where it stands', () => {
      const byHand = Terrain.create('置いた壁', 3, 2, 4, '', '');
      byHand.location = { name: 'table', x: 100, y: 150 };
      table.appendChild(byHand);

      service.apply(plan({ terrain: { add: ['0,0'], remove: ['0,0', '5,5'] } }));

      const survivor = terrainOn().find((held) => held.identifier === byHand.identifier);
      expect(survivor).toBeTruthy();
      expect(survivor!.location.x).toBe(100);
      expect(survivor!.paintCell).toBe('');
    });

    it('leaves a mask a person placed by hand alone', () => {
      const byHand = GameTableMask.create('置いた覆い', 4, 4, 0.6);
      table.appendChild(byHand);

      service.apply(plan({ mask: { add: [], remove: ['0,0', '1,1'] } }));

      expect(masksOn().some((held) => held.identifier === byHand.identifier)).toBe(true);
    });

    it('lays a wall on each cell it was told to, marked with the cell it belongs to', () => {
      service.apply(plan({ terrain: { add: ['2,3'], remove: [] } }));

      const laid = terrainOn();
      expect(laid).toHaveLength(1);
      expect(laid[0].paintCell).toBe('2,3');
      expect(laid[0].location.x).toBe(2 * 50);
      expect(laid[0].location.y).toBe(3 * 50);
    });

    it('takes away only the wall it painted onto the cell it is done with', () => {
      service.apply(plan({ terrain: { add: ['1,1', '2,2'], remove: [] } }));

      service.apply(plan({ terrain: { add: [], remove: ['1,1'] } }));

      expect(terrainOn().map((held) => held.paintCell)).toEqual(['2,2']);
    });

    it('gives a laid wall the settings the layer carried', () => {
      service.apply(
        plan({
          terrain: { add: ['0,0'], remove: [] },
          terrainSpec: { ...DEFAULT_FUNCTION_SPEC.terrain, blocksSight: false, blocksLight: false },
        })
      );

      expect(terrainOn()[0].blocksSight).toBe(false);
      expect(terrainOn()[0].blocksLight).toBe(false);
    });

    it('gives a laid mask the fraction of opacity the layer carried', () => {
      service.apply(
        plan({ mask: { add: ['0,0'], remove: [] }, maskSpec: { ...DEFAULT_FUNCTION_SPEC.mask, opacity: 0.25 } })
      );

      expect(masksOn()[0].opacity).toBeCloseTo(0.25, 5);
    });

    it('dresses a laid wall in every picture the brush carried', () => {
      service.apply(
        plan({
          terrain: { add: ['0,0'], remove: [] },
          terrainSpec: {
            ...DEFAULT_FUNCTION_SPEC.terrain,
            height: 3,
            mode: 2,
            tiledTexture: true,
            showsGrid: true,
            images: { ...DEFAULT_FUNCTION_SPEC.terrain.images, wall: 'stone', floor: 'grass', north: 'mural' },
          },
        })
      );

      const laid = terrainOn()[0];
      expect(laid.height).toBe(3);
      expect(laid.mode).toBe(2);
      expect(laid.isTiledTexture).toBe(true);
      expect(laid.isGrid).toBe(true);
      expect(laid.faceImageIdentifier('wall')).toBe('stone');
      expect(laid.faceImageIdentifier('floor')).toBe('grass');
      expect(laid.faceImageIdentifier('north')).toBe('mural');
      expect(laid.faceImageIdentifier('south')).toBe('');
    });

    it('leaves a wall the brush dressed in nothing as glass', () => {
      service.apply(plan({ terrain: { add: ['0,0'], remove: [] } }));

      expect(terrainOn()[0].hasFaceImage).toBe(false);
    });

    it('gives a laid mask the colour the layer carried', () => {
      service.apply(
        plan({ mask: { add: ['0,0'], remove: [] }, maskSpec: { ...DEFAULT_FUNCTION_SPEC.mask, color: '#abcdef' } })
      );

      expect(masksOn()[0].color).toBe('#abcdef');
      expect(masksOn()[0].paintCell).toBe('0,0');
    });

    it('closes the table on the cells it was given, letting the rest open again', () => {
      service.apply(plan({ blocked: ['0,0', '2,1'] }));
      expect([...service.snapshot()!.blockedCells].sort()).toEqual(['0,0', '2,1']);

      service.apply(plan({ blocked: ['2,1'] }));

      expect(service.snapshot()!.blockedCells).toEqual(['2,1']);
    });

    it('will not lay anything with no table out', () => {
      table.gridSize = 0;

      expect(service.apply(plan({ terrain: { add: ['0,0'], remove: [] } }))).toBe(false);
    });
  });

  it('reads nothing at all from a table with no size', () => {
    table.gridSize = 0;

    expect(service.snapshot()).toBeNull();
  });
});

describe('blockedCellKeysOn()', () => {
  it('answers with nothing for a table that was never closed anywhere', () => {
    const table = new GameTable();
    table.width = 4;
    table.height = 4;
    table.gridSize = 50;
    table.initialize();

    expect(blockedCellKeysOn(table, cellGridOf(4, 4, 50, table.gridType))).toEqual([]);

    table.destroy();
  });
});
