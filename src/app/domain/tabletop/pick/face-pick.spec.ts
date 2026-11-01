import { TableRay } from '@axe/domain/tabletop/camera/table-camera';
import { faceTarget } from '@axe/domain/tabletop/pick/face-pick';
import { pickFirst } from '@axe/domain/tabletop/pick/pick-index';
import { surfaceFrame } from '@axe/domain/tabletop/surface-space';

const dims = { widthPx: 1000, depthPx: 750, wallHeightPx: 300 };

describe('face pick target', () => {
  it('spans a face across and down its frame, and names the face', () => {
    const wall = faceTarget('north-wall', surfaceFrame('north-wall', dims), 1000, 300);
    const northward: TableRay = { origin: { x: 400, y: 900, z: 100 }, direction: { x: 0, y: -1, z: 0 } };

    const hit = pickFirst([wall], northward)!;

    expect(hit.target.surface).toBe('north-wall');
    expect(hit.u).toBeCloseTo(0.4, 9);
    expect(hit.v).toBeCloseTo(2 / 3, 9);
    expect(pickFirst([wall], { ...northward, origin: { x: 400, y: 900, z: 320 } })).toBeNull();
  });

  it('puts a face given the greater order in front of one lying in the same place', () => {
    const floor = faceTarget('floor', surfaceFrame('floor', dims), 1000, 750);
    const board = faceTarget('a-board', surfaceFrame('floor', dims), 200, 200, 1);
    const down: TableRay = { origin: { x: 100, y: 100, z: 1000 }, direction: { x: 0, y: 0, z: -1 } };

    expect(pickFirst([floor, board], down)?.target.id).toBe('a-board');
    expect(pickFirst([floor, board], { ...down, origin: { x: 500, y: 500, z: 1000 } })?.target.id).toBe('floor');
  });
});
