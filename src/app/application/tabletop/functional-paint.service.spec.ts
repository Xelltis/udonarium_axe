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
    const square = Terrain.create('揃った壁', 1, 1, 1, '', '');
    square.location = { name: 'table', x: 3 * 50, y: 4 * 50 };
    table.appendChild(square);
    const byHand = Terrain.create('置いた壁', 3, 2, 4, '', '');
    byHand.location = { name: 'table', x: 1 * 50, y: 1 * 50 };
    table.appendChild(byHand);

    expect(service.snapshot()!.terrainBlocks.map(rectKey).sort()).toEqual(['1,1,3,2', '3,4,1,1']);
  });

  it('reads a wall that was turned, and remembers how it stands', () => {
    const turned = Terrain.create('回した壁', 2, 1, 2, '', '');
    turned.location = { name: 'table', x: 0, y: 0 };
    turned.rotate = 45;
    table.appendChild(turned);

    const block = service.snapshot()!.terrainBlocks[0];

    expect(rectKey(block)).toBe('0,0,2,1');
    expect(block.spec.placement).toEqual({ x: 0, y: 0, width: 2, depth: 1, rotate: 45 });
  });

  it('reads a wall standing between cells, and remembers where', () => {
    const askew = Terrain.create('ずれた壁', 1, 1, 1, '', '');
    askew.location = { name: 'table', x: 25, y: 0 };
    table.appendChild(askew);

    const block = service.snapshot()!.terrainBlocks[0];

    expect(rectKey(block)).toBe('0,0,1,1');
    expect(block.spec.placement?.x).toBe(25);
  });

  it('reads a door as a door', () => {
    const door = Terrain.create('扉', 1, 1, 2, '', '');
    door.location = { name: 'table', x: 0, y: 0 };
    door.doorStyle = 'swing';
    door.isDoorOpen = true;
    table.appendChild(door);

    const block = service.snapshot()!.terrainBlocks[0];

    expect(block.spec.doorStyle).toBe('swing');
    expect(block.spec.doorOpen).toBe(true);
  });

  it('says nothing of a placement for a wall that sits square on its cells', () => {
    const square = Terrain.create('揃った壁', 2, 1, 2, '', '');
    square.location = { name: 'table', x: 2 * 50, y: 3 * 50 };
    table.appendChild(square);

    expect(service.snapshot()!.terrainBlocks[0].spec.placement).toBeNull();
  });

  it('reads every cover that sits square on the grid', () => {
    const square = GameTableMask.create('揃った覆い', 1, 1, 100);
    square.location = { name: 'table', x: 5 * 50, y: 6 * 50 };
    table.appendChild(square);
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

    it('lays a turned wall back exactly as it stood', () => {
      const turned = Terrain.create('回した壁', 2, 1, 2, '', '');
      turned.location = { name: 'table', x: 25, y: 75 };
      turned.rotate = 45;
      table.appendChild(turned);
      const read = service.snapshot()!.terrainBlocks[0];
      turned.destroy();

      service.apply(plan({ terrain: { add: [read], remove: [] } }));

      const laid = terrainOn()[0];
      expect(laid.rotate).toBe(45);
      expect(laid.location.x).toBe(25);
      expect(laid.location.y).toBe(75);
      expect(laid.width).toBe(2);
      expect(laid.depth).toBe(1);
    });

    it('lays a door back as a door', () => {
      const door = Terrain.create('扉', 1, 1, 2, '', '');
      door.location = { name: 'table', x: 0, y: 0 };
      door.doorStyle = 'swing';
      door.doorMirrored = true;
      table.appendChild(door);
      const read = service.snapshot()!.terrainBlocks[0];
      door.destroy();

      service.apply(plan({ terrain: { add: [read], remove: [] } }));

      expect(terrainOn()[0].doorStyle).toBe('swing');
      expect(terrainOn()[0].doorMirrored).toBe(true);
    });

    it('lays a ramp back as a ramp, with its light still on it', () => {
      const ramp = Terrain.create('坂', 1, 1, 1, '', '');
      ramp.location = { name: 'table', x: 0, y: 0 };
      ramp.isSlope = true;
      ramp.slopeDirection = 2;
      ramp.lightEnabled = true;
      ramp.lightBrightRadius = 3;
      table.appendChild(ramp);
      const read = service.snapshot()!.terrainBlocks[0];
      ramp.destroy();

      service.apply(plan({ terrain: { add: [read], remove: [] } }));

      const laid = terrainOn()[0];
      expect(laid.isSlope).toBe(true);
      expect(laid.slopeDirection).toBe(2);
      expect(laid.lightEnabled).toBe(true);
      expect(laid.lightBrightRadius).toBe(3);
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

  describe('reading a block in and laying it back down', () => {
    function planWith(over: Partial<FunctionPaintPlan> = {}): FunctionPaintPlan {
      return { blocked: [], terrain: { add: [], remove: [] }, mask: { add: [], remove: [] }, ...over };
    }

    it('returns a wall with everything it had', () => {
      const before = Terrain.create('石の壁', 2, 3, 4, 'granite', 'moss');
      before.location = { name: 'table', x: 25, y: 75 };
      before.rotate = 30;
      before.posZ = 12;
      before.isAltitudeIndicate = true;
      before.mode = 2;
      before.isLocked = true;
      before.isTiledTexture = true;
      before.isGrid = true;
      before.isDropShadow = false;
      before.isSurfaceShading = false;
      before.blocksSight = false;
      before.blocksLight = false;
      before.doorStyle = 'slide';
      before.isDoorOpen = true;
      before.doorMirrored = true;
      before.isSlope = true;
      before.slopeDirection = 3;
      before.lightEnabled = true;
      before.lightPreset = 'torch';
      before.lightBrightRadius = 5;
      before.lightDimRadius = 9;
      before.lightColor = '#ff8800';
      before.lightAngle = 120;
      before.lightDirection = 45;
      before.lightPitch = 10;
      before.lightAnimation = 'flicker';
      before.setFaceImage('imageIdentifier', 'thumb');
      for (const face of ['top', 'bottom', 'north', 'south', 'east', 'west'] as const) {
        before.setFaceImage(face, `face-${face}`);
      }
      table.appendChild(before);

      const read = service.snapshot()!.terrainBlocks[0];
      before.destroy();
      service.apply(planWith({ terrain: { add: [read], remove: [] } }));

      const after = table.children.filter((child): child is Terrain => child instanceof Terrain)[0];
      expect(after.name).toBe('石の壁');
      expect(after.location).toMatchObject({ x: 25, y: 75 });
      expect([after.width, after.depth, after.height]).toEqual([2, 3, 4]);
      expect([after.rotate, after.posZ, after.isAltitudeIndicate]).toEqual([30, 12, true]);
      expect([after.mode, after.isLocked, after.isTiledTexture, after.isGrid]).toEqual([2, true, true, true]);
      expect([after.isDropShadow, after.isSurfaceShading]).toEqual([false, false]);
      expect([after.blocksSight, after.blocksLight]).toEqual([false, false]);
      expect([after.doorStyle, after.isDoorOpen, after.doorMirrored]).toEqual(['slide', true, true]);
      expect([after.isSlope, after.slopeDirection]).toEqual([true, 3]);
      expect(after.lightSpec).toMatchObject({
        enabled: true,
        preset: 'torch',
        brightRadius: 5,
        dimRadius: 9,
        color: '#ff8800',
        angle: 120,
        pitch: 10,
        animation: 'flicker',
      });
      expect(after.faceImageIdentifier('imageIdentifier')).toBe('thumb');
      expect(after.faceImageIdentifier('wall')).toBe('granite');
      expect(after.faceImageIdentifier('floor')).toBe('moss');
      for (const face of ['top', 'bottom', 'north', 'south', 'east', 'west'] as const) {
        expect(after.faceImageIdentifier(face)).toBe(`face-${face}`);
      }
    });

    it('returns a cover with its scratches still on it', () => {
      const before = GameTableMask.create('覆い', 3, 2, 100);
      before.location = { name: 'table', x: 2 * 50, y: 1 * 50 };
      before.posZ = 4;
      before.isLock = true;
      before.dispLockMark = false;
      before.owner = 'someone';
      before.scratchedGrids = '1:2,3:4';
      before.scratchingGrids = '5:6';
      before.isPreview = true;
      table.appendChild(before);

      const read = service.snapshot()!.maskBlocks[0];
      before.destroy();
      service.apply(planWith({ mask: { add: [read], remove: [] } }));

      const after = table.children.filter((child): child is GameTableMask => child instanceof GameTableMask)[0];
      expect(after.name).toBe('覆い');
      expect([after.width, after.height]).toEqual([3, 2]);
      expect(after.posZ).toBe(4);
      expect([after.isLock, after.dispLockMark, after.isPreview]).toEqual([true, false, true]);
      expect(after.owner).toBe('someone');
      expect(after.scratchedGrids).toBe('1:2,3:4');
      expect(after.scratchingGrids).toBe('5:6');
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
