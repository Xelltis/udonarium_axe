import { GridType } from '@axe/domain/tabletop/game-table';
import { FunctionLayer, ImageLayer, sceneHeightPx, sceneWidthPx } from '@axe/features/map-editor/model/scene';
import { sceneFromTable, TableSnapshot } from '@axe/features/map-editor/model/table-import';

function snapshot(over: Partial<TableSnapshot> = {}): TableSnapshot {
  return {
    cols: 10,
    rows: 8,
    cellPx: 50,
    gridType: GridType.SQUARE,
    floorImageIdentifier: '',
    blockedCells: [],
    terrainCells: [],
    maskCells: [],
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
    const scene = sceneFromTable(snapshot({ blockedCells: ['0,0'], terrainCells: ['1,0'], maskCells: ['2,0'] }));

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
