import { cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { type WaterArea, waterCellsOf } from '@axe/domain/tabletop/water/water-cells';
import { tableWaterOf } from '@axe/domain/tabletop/world/table-water';
import { WaterLayer } from '@axe/infrastructure/table-3d/water-layer';
import { type Mesh, Texture } from 'three/webgpu';

const G = 50;

function area(partial: Partial<WaterArea> = {}): WaterArea {
  return {
    identifier: 'river',
    left: G,
    top: G,
    width: 2 * G,
    height: G,
    floorPx: 0,
    surfacePx: 25,
    color: '#3399cc',
    density: 0.6,
    turbidity: 0.8,
    dirt: 0.5,
    leaves: 0,
    flowSpeed: 0.6,
    flowDirection: 90,
    ice: 0,
    ...partial,
  };
}

/** The most attributes a point may carry for a graphics card to draw it through WebGPU, which takes eight buffers at least. */
const MOST_ATTRIBUTES = 8;

describe('the water on a table drawn on a canvas', () => {
  it('draws the surface from no more attributes than a graphics card takes, silt, streaks and ice and all', () => {
    const layer = new WaterLayer(
      () => undefined,
      () => new Texture()
    );
    const grid = cellGridOf(4, 4, G, GridType.SQUARE);

    layer.set(tableWaterOf(grid, waterCellsOf(grid, [area({ ice: 0.7 })]), [], [], true), null, '');

    const surface = layer.group.children[0] as Mesh;
    const names = Object.keys(surface.geometry.attributes);
    expect(names).toEqual(expect.arrayContaining(['silt', 'scum', 'scumRim', 'flow', 'extra']));
    const extra = surface.geometry.getAttribute('extra');
    expect(extra.itemSize).toBe(3);
    expect(extra.getZ(0)).toBeCloseTo(0.7);
    expect(names.length).toBeLessThanOrEqual(MOST_ATTRIBUTES);
    layer.dispose();
  });

  it('draws ice before what is painted on the floor and the sprites, which stand on it, and open water after them', () => {
    const layer = new WaterLayer(
      () => undefined,
      () => new Texture()
    );
    const grid = cellGridOf(6, 4, G, GridType.SQUARE);
    const cells = waterCellsOf(grid, [area({ ice: 1 }), area({ identifier: 'pool', left: 4 * G, width: G })]);

    layer.set(tableWaterOf(grid, cells, [], [], true), null, '');

    const surfaces = (layer.group.children as Mesh[]).filter((mesh) => mesh.geometry.getAttribute('scum'));
    const frozen = surfaces.find((mesh) => mesh.geometry.getAttribute('extra').getZ(0) === 1)!;
    const open = surfaces.find((mesh) => mesh.geometry.getAttribute('extra').getZ(0) === 0)!;
    expect(surfaces).toHaveLength(2);
    expect(frozen.geometry.getAttribute('position').count).toBe(2 * 2 * 3);
    expect(open.geometry.getAttribute('position').count).toBe(2 * 3);
    expect(frozen.renderOrder).toBeLessThan(2);
    expect(open.renderOrder).toBeGreaterThan(3);
    layer.dispose();
  });
});
