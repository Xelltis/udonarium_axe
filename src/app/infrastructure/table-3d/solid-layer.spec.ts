import { GridType } from '@axe/domain/tabletop/grid-type';
import { Solid, solidOf } from '@axe/domain/tabletop/solid/solid';
import type { TableWorldSolid } from '@axe/domain/tabletop/world/table-solids';
import { geometryOf, SolidLayer } from '@axe/infrastructure/table-3d/solid-layer';
import { Box3, type Mesh } from 'three/webgpu';

function solid(more: Partial<Parameters<typeof solidOf>[0]>): Solid {
  const made = solidOf({
    kind: 'column',
    type: 'SQUARE',
    length: 1,
    width: 1,
    rotate: 0,
    origin: { x: 100, y: 200 },
    cellPattern: '',
    gridType: GridType.SQUARE,
    squarePx: 50,
    originZ: 0,
    height: 2,
    pitch: 0,
    ...more,
  });
  if (!made) throw new Error('expected a solid');
  return made;
}

function drawn(id: string, shape: Solid): TableWorldSolid {
  return { id, owner: id, solid: shape, fill: '#ffff00', edge: '#000000', fillOpacity: 0.3, edgeOpacity: 0.8 };
}

/** The box round a shape, in the table's own axes: x east, y south and z up. */
function tableBox(shape: Solid) {
  const box = new Box3().setFromBufferAttribute(geometryOf(shape).getAttribute('position') as never);
  return { min: { x: box.min.x, y: box.min.z, z: box.min.y }, max: { x: box.max.x, y: box.max.z, z: box.max.y } };
}

describe('SolidLayer', () => {
  it('stands a column where the range lies, from its bottom to its top', () => {
    const box = tableBox(solid({ originZ: 30 }));
    expect(box.min).toEqual({ x: 50, y: 150, z: 30 });
    expect(box.max).toEqual({ x: 150, y: 250, z: 130 });
  });

  it('draws a column of cells lying side by side without walls between them', () => {
    const one = geometryOf(solid({ type: 'CUSTOM', cellPattern: '0,0' })).getAttribute('position').count;
    const two = geometryOf(solid({ type: 'CUSTOM', cellPattern: '0,0;1,0' })).getAttribute('position').count;
    const apart = geometryOf(solid({ type: 'CUSTOM', cellPattern: '0,0;2,0' })).getAttribute('position').count;
    expect(apart).toBe(one * 2);
    expect(two).toBe(apart - 12);
  });

  it('opens a cone from its tip the way it points, up and away', () => {
    const box = tableBox(solid({ kind: 'cone', type: 'CORN', length: 4, width: 2, originZ: 25, pitch: 90 }));
    expect(box.min.z).toBeCloseTo(25);
    expect(box.max.z).toBeCloseTo(225);
    expect(box.max.x - box.min.x).toBeCloseTo(100, 0);
  });

  it('lays a level beam out from its start along its turn', () => {
    const box = tableBox(solid({ kind: 'beam', type: 'LINE', length: 4, width: 1, rotate: 90, originZ: 25 }));
    expect(box.min.y).toBeCloseTo(200);
    expect(box.max.y).toBeCloseTo(400);
    expect(box.min.x).toBeCloseTo(75);
    expect(box.max.x).toBeCloseTo(125);
    expect(box.min.z).toBeCloseTo(0);
    expect(box.max.z).toBeCloseTo(50);
  });

  it('draws each solid once and again only as it changes, and takes away those no longer given', () => {
    const layer = new SolidLayer();
    const sphere = drawn('a', solid({ kind: 'sphere', type: 'CIRCLE' }));
    layer.set([sphere, drawn('b', solid({}))]);
    expect(layer.count).toBe(2);
    const first = layer.group.children[0];
    layer.set([sphere, drawn('b', solid({}))]);
    expect(layer.group.children[0]).toBe(first);
    layer.set([{ ...sphere, fillOpacity: 0.1 }]);
    expect(layer.count).toBe(1);
    const [faces, edges] = layer.group.children[0].children as [Mesh, Mesh];
    expect((faces.material as { opacity: number }).opacity).toBe(0.1);
    expect((edges.material as { opacity: number }).opacity).toBe(0.8);
    layer.dispose();
    expect(layer.count).toBe(0);
  });
});
