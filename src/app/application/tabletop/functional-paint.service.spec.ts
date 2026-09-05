import { TestBed } from '@angular/core/testing';
import { blockedCellKeysOn, FunctionalPaintService } from '@axe/application/tabletop/functional-paint.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { CellRect, rectKey } from '@axe/domain/tabletop/cell-rectangles';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import {
  DEFAULT_FUNCTION_SPEC,
  FunctionPaintPlan,
  MaskBlock,
  MaskPaintSpec,
  TerrainBlock,
  TerrainPaintSpec,
} from '@axe/domain/tabletop/function-paint';
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

  it('reads every wall that sits square on the grid, however it got there', () => {
    const painted = Terrain.create('塗った壁', 1, 1, 1, '', '');
    painted.paintCell = '3,4';
    painted.location = { name: 'table', x: 3 * 50, y: 4 * 50 };
    table.appendChild(painted);
    const byHand = Terrain.create('置いた壁', 3, 2, 4, '', '');
    byHand.location = { name: 'table', x: 1 * 50, y: 1 * 50 };
    table.appendChild(byHand);

    expect(service.snapshot()!.terrainBlocks.map(rectKey).sort()).toEqual(['1,1,3,2', '3,4,1,1']);
  });

  it("leaves a wall that was turned out of the brush's reach", () => {
    const turned = Terrain.create('回した壁', 2, 1, 2, '', '');
    turned.location = { name: 'table', x: 0, y: 0 };
    turned.rotate = 45;
    table.appendChild(turned);

    expect(service.snapshot()!.terrainBlocks).toEqual([]);
  });

  it('leaves a wall standing between cells out of reach as well', () => {
    const askew = Terrain.create('ずれた壁', 1, 1, 1, '', '');
    askew.location = { name: 'table', x: 25, y: 0 };
    table.appendChild(askew);

    expect(service.snapshot()!.terrainBlocks).toEqual([]);
  });

  it('leaves a door where hands put it', () => {
    const door = Terrain.create('扉', 1, 1, 2, '', '');
    door.location = { name: 'table', x: 0, y: 0 };
    door.doorStyle = 'swing';
    table.appendChild(door);

    expect(service.snapshot()!.terrainBlocks).toEqual([]);
  });

  it('reads every cover that sits square on the grid', () => {
    const painted = GameTableMask.create('塗った覆い', 1, 1, 100);
    painted.paintCell = '5,6';
    painted.location = { name: 'table', x: 5 * 50, y: 6 * 50 };
    table.appendChild(painted);
    const byHand = GameTableMask.create('置いた覆い', 4, 4, 100);
    byHand.location = { name: 'table', x: 0, y: 0 };
    table.appendChild(byHand);

    expect(service.snapshot()!.maskBlocks.map(rectKey).sort()).toEqual(['0,0,4,4', '5,6,1,1']);
  });

  describe('laying what was painted on the table', () => {
    function plan(over: Partial<FunctionPaintPlan> = {}): FunctionPaintPlan {
      return { blocked: [], terrain: { add: [], remove: [] }, mask: { add: [], remove: [] }, ...over };
    }

    function wall(rect: CellRect, spec: Partial<TerrainPaintSpec> = {}): TerrainBlock {
      return { ...rect, spec: { ...DEFAULT_FUNCTION_SPEC.terrain, ...spec } };
    }

    function cover(rect: CellRect, spec: Partial<MaskPaintSpec> = {}): MaskBlock {
      return { ...rect, spec: { ...DEFAULT_FUNCTION_SPEC.mask, ...spec } };
    }

    const oneCell = { col: 0, row: 0, width: 1, height: 1 };

    function terrainOn(): Terrain[] {
      return table.children.filter((child): child is Terrain => child instanceof Terrain);
    }

    function masksOn(): GameTableMask[] {
      return table.children.filter((child): child is GameTableMask => child instanceof GameTableMask);
    }

    it('lays one wall across a whole block rather than one per cell', () => {
      service.apply(plan({ terrain: { add: [wall({ col: 1, row: 2, width: 4, height: 2 })], remove: [] } }));

      const laid = terrainOn();
      expect(laid).toHaveLength(1);
      expect(laid[0].width).toBe(4);
      expect(laid[0].depth).toBe(2);
      expect(laid[0].paintCell).toBe('1,2');
      expect(laid[0].location.x).toBe(1 * 50);
      expect(laid[0].location.y).toBe(2 * 50);
    });

    it('reads a laid block back as the block it is', () => {
      service.apply(plan({ terrain: { add: [wall({ col: 1, row: 2, width: 4, height: 2 })], remove: [] } }));

      expect(service.snapshot()!.terrainBlocks.map(rectKey)).toEqual(['1,2,4,2']);
    });

    it('pulls a block down only when the block itself is the one going', () => {
      service.apply(plan({ terrain: { add: [wall({ col: 1, row: 2, width: 4, height: 2 })], remove: [] } }));

      service.apply(plan({ terrain: { add: [], remove: [{ col: 1, row: 2, width: 1, height: 1 }] } }));
      expect(terrainOn()).toHaveLength(1);

      service.apply(plan({ terrain: { add: [], remove: [{ col: 1, row: 2, width: 4, height: 2 }] } }));
      expect(terrainOn()).toHaveLength(0);
    });

    it('leaves a wall that was turned exactly where it stands', () => {
      const turned = Terrain.create('回した壁', 2, 1, 2, '', '');
      turned.location = { name: 'table', x: 0, y: 0 };
      turned.rotate = 45;
      table.appendChild(turned);

      service.apply(plan({ terrain: { add: [], remove: [{ col: 0, row: 0, width: 2, height: 1 }] } }));

      expect(terrainOn().some((held) => held.identifier === turned.identifier)).toBe(true);
      expect(turned.rotate).toBe(45);
    });

    it('leaves a door where hands put it', () => {
      const door = Terrain.create('扉', 1, 1, 2, '', '');
      door.location = { name: 'table', x: 0, y: 0 };
      door.doorStyle = 'swing';
      table.appendChild(door);

      service.apply(plan({ terrain: { add: [], remove: [oneCell] } }));

      expect(terrainOn().some((held) => held.identifier === door.identifier)).toBe(true);
    });

    it('lays a mask across a whole block too', () => {
      service.apply(plan({ mask: { add: [cover({ col: 0, row: 0, width: 3, height: 2 })], remove: [] } }));

      expect(masksOn()[0].width).toBe(3);
      expect(masksOn()[0].height).toBe(2);
    });

    it('dresses a laid wall in every picture the brush carried', () => {
      service.apply(
        plan({
          terrain: {
            add: [
              wall(oneCell, {
                height: 3,
                mode: 2,
                tiledTexture: true,
                showsGrid: true,
                images: { ...DEFAULT_FUNCTION_SPEC.terrain.images, wall: 'stone', floor: 'grass', north: 'mural' },
              }),
            ],
            remove: [],
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
      service.apply(plan({ terrain: { add: [wall(oneCell)], remove: [] } }));

      expect(terrainOn()[0].hasFaceImage).toBe(false);
    });

    it('holds a laid wall to what the brush said about sight and light', () => {
      service.apply(
        plan({ terrain: { add: [wall(oneCell, { blocksSight: false, blocksLight: false })], remove: [] } })
      );

      expect(terrainOn()[0].blocksSight).toBe(false);
      expect(terrainOn()[0].blocksLight).toBe(false);
    });

    it('gives a laid mask the colour and the strength the brush carried', () => {
      service.apply(plan({ mask: { add: [cover(oneCell, { color: '#abcdef', opacity: 0.25 })], remove: [] } }));

      expect(masksOn()[0].color).toBe('#abcdef');
      expect(masksOn()[0].opacity).toBeCloseTo(0.25, 5);
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

      expect(service.apply(plan({ terrain: { add: [wall(oneCell)], remove: [] } }))).toBe(false);
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
