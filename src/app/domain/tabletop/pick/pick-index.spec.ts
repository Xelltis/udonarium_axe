import { TableRay } from '@axe/domain/tabletop/camera/table-camera';
import { PickPoint2 } from '@axe/domain/tabletop/pick/pick-geometry';
import { pickAll, pickFirst, PickTarget } from '@axe/domain/tabletop/pick/pick-index';

const square = (x: number, y: number, size: number): PickPoint2[] => [
  { x, y },
  { x: x + size, y },
  { x: x + size, y: y + size },
  { x, y: y + size },
];

const down: TableRay = { origin: { x: 50, y: 50, z: 1000 }, direction: { x: 0, y: 0, z: -1 } };

function block(id: string, top: number, order = 0): PickTarget {
  return { id, layer: 'terrain', order, shapes: [{ kind: 'prism', outline: square(0, 0, 100), base: 0, top }] };
}

describe('pick index', () => {
  it('puts what is nearer the eye first', () => {
    const hits = pickAll([block('low', 20), block('high', 80)], down);
    expect(hits.map((hit) => hit.target.id)).toEqual(['high', 'low']);
  });

  it('puts what is drawn in front first among things the same distance off', () => {
    const card = (id: string, order: number): PickTarget => ({
      id,
      layer: 'card',
      order,
      shapes: [{ kind: 'floor', outline: square(0, 0, 100), z: 0 }],
    });
    expect(pickFirst([card('under', 1), card('over', 2)], down)?.target.id).toBe('over');
  });

  it('looks through the see-through part of a picture to what is behind it', () => {
    const picture: PickTarget = {
      id: 'picture',
      layer: 'character',
      order: 0,
      shapes: [
        {
          kind: 'quad',
          corners: [
            { x: 0, y: 0, z: 50 },
            { x: 100, y: 0, z: 50 },
            { x: 100, y: 100, z: 50 },
            { x: 0, y: 100, z: 50 },
          ],
        },
      ],
      opaqueAt: (_shape, u) => u > 0.6,
    };
    expect(pickFirst([picture, block('floor', 10)], down)?.target.id).toBe('floor');
    const onSolid: TableRay = { ...down, origin: { x: 80, y: 50, z: 1000 } };
    expect(pickFirst([picture, block('floor', 10)], onSolid)?.target.id).toBe('picture');
  });

  it('looks past the kinds a caller leaves out', () => {
    const hits = pickAll([block('wall', 80), block('floor', 10)], down, (target) => target.id !== 'wall');
    expect(hits.map((hit) => hit.target.id)).toEqual(['floor']);
  });
});
