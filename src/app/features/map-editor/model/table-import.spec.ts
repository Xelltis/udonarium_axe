import { DEFAULT_FUNCTION_SPEC } from '@axe/domain/tabletop/function-paint';
import { GridType } from '@axe/domain/tabletop/game-table';
import { FunctionLayer, ImageLayer, sceneHeightPx, sceneWidthPx } from '@axe/features/map-editor/model/scene';
import { FunctionPaintPlan, planFunctionPaint } from '@axe/features/map-editor/model/table-apply';
import { sceneFromTable, TableSnapshot } from '@axe/features/map-editor/model/table-import';

function changesNothing(plan: FunctionPaintPlan, table: TableSnapshot): boolean {
  const sameBlocked =
    plan.blocked.length === table.blockedCells.length && plan.blocked.every((key) => table.blockedCells.includes(key));
  return (
    sameBlocked &&
    plan.terrain.add.length === 0 &&
    plan.terrain.remove.length === 0 &&
    plan.mask.add.length === 0 &&
    plan.mask.remove.length === 0
  );
}

function snapshot(over: Partial<TableSnapshot> = {}): TableSnapshot {
  return {
    cols: 10,
    rows: 8,
    cellPx: 50,
    gridType: GridType.SQUARE,
    floorImageIdentifier: '',
    blockedCells: [],
    terrainBlocks: [],
    maskBlocks: [],
    triggerBlocks: [],
    ...over,
  };
}

describe('sceneFromTable()', () => {
  it('takes the size and the grid from the table', () => {
    const scene = sceneFromTable(snapshot({ cols: 12, rows: 9, cellPx: 64, gridType: GridType.HEX_VERTICAL }));

    expect(scene.cols).toBe(12);
    expect(scene.rows).toBe(9);
    expect(scene.cellPx).toBe(64);
    expect(scene.gridType).toBe(GridType.HEX_VERTICAL);
  });

  it('brings a table with nothing on it in as an empty scene', () => {
    expect(sceneFromTable(snapshot()).layers).toEqual([]);
  });

  it('brings the floor in as a locked picture covering the whole scene', () => {
    const scene = sceneFromTable(snapshot({ floorImageIdentifier: 'floor-image' }));

    const layer = scene.layers[0] as ImageLayer;
    expect(layer.kind).toBe('image');
    expect(layer.locked).toBe(true);
    expect(layer.items[0].imageIdentifier).toBe('floor-image');
    expect(layer.items[0].w).toBe(10 * 50);
    expect(layer.items[0].h).toBe(8 * 50);
  });

  it('places the floor by its middle, which is where a picture is hung from', () => {
    const scene = sceneFromTable(snapshot({ floorImageIdentifier: 'floor-image' }));

    // Hung from the corner instead, three quarters of the floor would sit off the map.
    const item = (scene.layers[0] as ImageLayer).items[0];
    expect(item.x).toBe(sceneWidthPx(scene) / 2);
    expect(item.y).toBe(sceneHeightPx(scene) / 2);
  });

  it('covers a hex map by the width the hexes actually take', () => {
    const scene = sceneFromTable(snapshot({ floorImageIdentifier: 'floor-image', gridType: GridType.HEX_VERTICAL }));

    const item = (scene.layers[0] as ImageLayer).items[0];
    expect(item.w).toBe(sceneWidthPx(scene));
    expect(item.h).toBe(sceneHeightPx(scene));
  });

  it('brings the cells the table is closed on in as a layer of their own', () => {
    const scene = sceneFromTable(snapshot({ blockedCells: ['1,1', '2,3'] }));

    const layer = scene.layers.find((held) => held.kind === 'function') as FunctionLayer;
    expect(layer.role).toBe('moveBlock');
    expect(Object.keys(layer.cells).sort()).toEqual(['1,1', '2,3']);
  });

  it('keeps each kind of painted cell in its own layer', () => {
    const scene = sceneFromTable(
      snapshot({
        blockedCells: ['0,0'],
        terrainBlocks: [{ col: 1, row: 0, width: 1, height: 1, spec: DEFAULT_FUNCTION_SPEC.terrain }],
        maskBlocks: [{ col: 2, row: 0, width: 1, height: 1, spec: DEFAULT_FUNCTION_SPEC.mask }],
      })
    );

    const roles = scene.layers.filter((held) => held.kind === 'function').map((held) => (held as FunctionLayer).role);
    expect(roles.sort()).toEqual(['mask', 'moveBlock', 'terrain']);
  });

  it('lays the floor under everything it painted', () => {
    const scene = sceneFromTable(snapshot({ floorImageIdentifier: 'floor-image', blockedCells: ['0,0'] }));

    expect(scene.layers[0].kind).toBe('image');
    expect(scene.layers[scene.layers.length - 1].kind).toBe('function');
  });

  it('refuses a table with no size at all rather than making a scene of nothing', () => {
    const scene = sceneFromTable(snapshot({ cols: 0, rows: -3 }));

    expect(scene.cols).toBe(1);
    expect(scene.rows).toBe(1);
  });
});

describe('the walls already on the table', () => {
  function wallBlock(over: Partial<{ col: number; row: number; width: number; height: number }>, wall: string) {
    return {
      col: 0,
      row: 0,
      width: 1,
      height: 1,
      ...over,
      spec: { ...DEFAULT_FUNCTION_SPEC.terrain, images: { ...DEFAULT_FUNCTION_SPEC.terrain.images, wall } },
    };
  }

  it('comes back as cells the brush can paint over', () => {
    const scene = sceneFromTable(snapshot({ terrainBlocks: [wallBlock({ col: 1, row: 1, width: 3, height: 1 }, '')] }));

    const layer = scene.layers.find((held) => held.kind === 'function') as FunctionLayer;
    expect(Object.keys(layer.cells).sort()).toEqual(['1,1', '2,1', '3,1']);
  });

  it('keeps two walls of different stone on layers of their own', () => {
    const scene = sceneFromTable(
      snapshot({
        terrainBlocks: [wallBlock({ col: 0, row: 0 }, 'granite'), wallBlock({ col: 5, row: 5 }, 'timber')],
      })
    );

    const layers = scene.layers.filter((held): held is FunctionLayer => held.kind === 'function');
    expect(layers).toHaveLength(2);
    expect(layers.map((layer) => layer.spec.terrain.images.wall).sort()).toEqual(['granite', 'timber']);
  });

  it('gathers two walls of the same stone onto one layer', () => {
    const scene = sceneFromTable(
      snapshot({
        terrainBlocks: [wallBlock({ col: 0, row: 0 }, 'granite'), wallBlock({ col: 5, row: 5 }, 'granite')],
      })
    );

    const layers = scene.layers.filter((held): held is FunctionLayer => held.kind === 'function');
    expect(layers).toHaveLength(1);
    expect(Object.keys(layers[0].cells).sort()).toEqual(['0,0', '5,5']);
  });
});

describe('a table that already has walls upon walls', () => {
  function wall(col: number, row: number, altitude: number, height = 1) {
    return {
      col,
      row,
      width: 1,
      height: 1,
      spec: { ...DEFAULT_FUNCTION_SPEC.terrain, altitude, height },
    };
  }

  it('leaves a storeyed wall standing where it stands', () => {
    const table = snapshot({ terrainBlocks: [wall(2, 2, 0), wall(2, 2, 50)] });

    const plan = planFunctionPaint(sceneFromTable(table), table)!;

    expect(changesNothing(plan, table)).toBe(true);
  });

  it('leaves a tall wall carrying a storey where it stands', () => {
    const table = snapshot({ terrainBlocks: [wall(2, 2, 0, 3), wall(2, 2, 150)] });

    const plan = planFunctionPaint(sceneFromTable(table), table)!;

    expect(changesNothing(plan, table)).toBe(true);
  });

  it('leaves two walls sharing a cell at one height where they stand', () => {
    const table = snapshot({ terrainBlocks: [wall(2, 2, 0), wall(2, 2, 0)] });

    const plan = planFunctionPaint(sceneFromTable(table), table)!;

    expect(changesNothing(plan, table)).toBe(true);
  });
});
