import { TableRay } from '@axe/domain/tabletop/camera/table-camera';
import { hitShape, insideOutline, PickPoint2 } from '@axe/domain/tabletop/pick/pick-geometry';

/** Looking straight down onto a point of the board from high above it. */
function downOnto(x: number, y: number): TableRay {
  return { origin: { x, y, z: 1000 }, direction: { x: 0, y: 0, z: -1 } };
}

/** Looking along the board towards the east, at one height. */
function eastwardAt(y: number, z: number): TableRay {
  return { origin: { x: -1000, y, z }, direction: { x: 1, y: 0, z: 0 } };
}

const square: PickPoint2[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

/** An L, with its notch in the top right. */
const ell: PickPoint2[] = [
  { x: 0, y: 0 },
  { x: 50, y: 0 },
  { x: 50, y: 50 },
  { x: 100, y: 50 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe('pick geometry', () => {
  it('tells inside from outside, notch included', () => {
    expect(insideOutline(ell, 25, 25)).toBe(true);
    expect(insideOutline(ell, 75, 25)).toBe(false);
    expect(insideOutline(ell, 75, 75)).toBe(true);
  });

  it('finds an outline lying on the board where the eye looks down on it', () => {
    const floor = { kind: 'floor', outline: square, z: 0 } as const;
    expect(hitShape(downOnto(30, 70), floor)?.point.z).toBeCloseTo(0, 9);
    expect(hitShape(downOnto(130, 70), floor)).toBeNull();
  });

  it('meets a block on its top from above and on its nearest side from beside', () => {
    const block = { kind: 'prism', outline: square, base: 0, top: 50 } as const;
    const fromAbove = hitShape(downOnto(40, 60), block)!;
    expect(fromAbove.point.z).toBeCloseTo(50, 9);
    const fromBeside = hitShape(eastwardAt(60, 20), block)!;
    expect(fromBeside.point.x).toBeCloseTo(0, 9);
    expect(hitShape(eastwardAt(60, 70), block)).toBeNull();
  });

  it('lets the eye pass down through the notch of a block whose outline has one', () => {
    const block = { kind: 'prism', outline: ell, base: 0, top: 50 } as const;
    expect(hitShape(downOnto(75, 25), block)).toBeNull();
    expect(hitShape(downOnto(75, 75), block)?.point.z).toBeCloseTo(50, 9);
  });

  it('meets a sloping top where it stands under the point looked at', () => {
    const ramp = { kind: 'prism', outline: square, base: 0, top: 50, roofAt: (x: number) => x / 2 } as const;
    expect(hitShape(downOnto(40, 50), ramp)!.point.z).toBeCloseTo(20, 4);
    // Looking east just over the low end, the eye runs on until the slope climbs into it.
    expect(hitShape(eastwardAt(50, 30), ramp)!.point.x).toBeCloseTo(60, 3);
  });

  it('meets a picture standing up, and says where on it', () => {
    const picture = {
      kind: 'quad',
      corners: [
        { x: 0, y: 50, z: 100 },
        { x: 50, y: 50, z: 100 },
        { x: 50, y: 50, z: 0 },
        { x: 0, y: 50, z: 0 },
      ],
    } as const;
    const ray: TableRay = { origin: { x: 10, y: 500, z: 75 }, direction: { x: 0, y: -1, z: 0 } };
    const hit = hitShape(ray, picture)!;
    expect(hit.u).toBeCloseTo(0.2, 9);
    expect(hit.v).toBeCloseTo(0.25, 9);
    expect(hitShape({ ...ray, origin: { x: 60, y: 500, z: 75 } }, picture)).toBeNull();
  });

  it('meets a coin on its face from above and on its rim from beside', () => {
    const coin = { kind: 'cylinder', centerX: 50, centerY: 50, radius: 20, base: 0, top: 4 } as const;
    expect(hitShape(downOnto(60, 50), coin)!.point.z).toBeCloseTo(4, 9);
    expect(hitShape(eastwardAt(50, 2), coin)!.point.x).toBeCloseTo(30, 9);
    expect(hitShape(downOnto(75, 50), coin)).toBeNull();
  });
});
