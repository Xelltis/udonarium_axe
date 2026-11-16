import { GridType } from '@axe/domain/tabletop/grid-type';
import { Solid, solidOf } from '@axe/domain/tabletop/solid/solid';
import { reachDomeWire, solidWireSegments } from '@axe/domain/tabletop/solid/solid-wire';

function solid(more: Partial<Parameters<typeof solidOf>[0]>): Solid {
  const made = solidOf({
    kind: 'column',
    type: 'CUSTOM',
    length: 1,
    width: 1,
    rotate: 0,
    origin: { x: 25, y: 25 },
    cellPattern: '0,0',
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

describe('solidWireSegments', () => {
  it('outlines a block of one cell with its twelve edges', () => {
    expect(solidWireSegments(solid({}))).toHaveLength(12);
  });

  it('outlines cells lying side by side as one block, with no lines between them', () => {
    const segments = solidWireSegments(solid({ cellPattern: '0,0;1,0' }));
    expect(segments).toHaveLength(6 * 2 + 4);
    const between = segments.filter(([a, b]) => a.x === 50 && b.x === 50);
    expect(between).toHaveLength(0);
  });

  it('runs up the side of an L of cells only where its outline turns', () => {
    const upright = solidWireSegments(solid({ cellPattern: '0,0;1,0;0,1' })).filter(
      ([a, b]) => a.x === b.x && a.y === b.y
    );
    expect(upright).toHaveLength(6);
  });

  it('draws round solids with rings and lines over them, and a beam with its twelve edges', () => {
    expect(solidWireSegments(solid({ kind: 'sphere', type: 'CIRCLE' })).length).toBeGreaterThan(48 * 3);
    const cone = solidWireSegments(solid({ kind: 'cone', type: 'CORN', length: 3, width: 2 }));
    expect(cone.filter(([a]) => a.x === 25 && a.y === 25 && a.z === 0)).toHaveLength(8);
    expect(solidWireSegments(solid({ kind: 'beam', type: 'LINE' }))).toHaveLength(12);
  });
});

describe('reachDomeWire', () => {
  it('draws nothing wholly below the floor of the room', () => {
    const segments = reachDomeWire({ centre: { x: 0, y: 0, z: 0 }, radius: 200, floorZ: 0 });
    expect(segments.length).toBeGreaterThan(0);
    for (const [a, b] of segments) expect(Math.max(a.z, b.z)).toBeGreaterThanOrEqual(-1e-9);
  });

  it('reaches down to the ground round a caster up in the air', () => {
    const segments = reachDomeWire({ centre: { x: 0, y: 0, z: 150 }, radius: 200, floorZ: 0 });
    expect(Math.min(...segments.flatMap(([a, b]) => [a.z, b.z]))).toBeLessThan(100);
  });

  it('draws nothing for a room that reaches nowhere', () => {
    expect(reachDomeWire({ centre: { x: 0, y: 0, z: 0 }, radius: 0, floorZ: 0 })).toEqual([]);
  });
});
