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
    ...partial,
  };
}

/** The most attributes a point may carry for a graphics card to draw it through WebGPU, which takes eight buffers at least. */
const MOST_ATTRIBUTES = 8;

describe('the water on a table drawn on a canvas', () => {
  it('draws the surface from no more attributes than a graphics card takes, silt and streaks and all', () => {
    const layer = new WaterLayer(
      () => undefined,
      () => new Texture()
    );
    const grid = cellGridOf(4, 4, G, GridType.SQUARE);

    layer.set(tableWaterOf(grid, waterCellsOf(grid, [area()]), [], [], true), null, '');

    const surface = layer.group.children[0] as Mesh;
    const names = Object.keys(surface.geometry.attributes);
    expect(names).toEqual(expect.arrayContaining(['silt', 'scum', 'scumRim', 'flow', 'extra']));
    expect(surface.geometry.getAttribute('extra').itemSize).toBe(2);
    expect(names.length).toBeLessThanOrEqual(MOST_ATTRIBUTES);
    layer.dispose();
  });
});
