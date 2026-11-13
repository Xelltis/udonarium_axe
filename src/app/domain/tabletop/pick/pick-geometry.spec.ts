import { TableRay } from '@axe/domain/tabletop/camera/table-camera';
import {
  hitShape,
  insideOutline,
  PickDraped,
  PickPoint2,
  withinOutline,
} from '@axe/domain/tabletop/pick/pick-geometry';

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

  it('reads a shape on a face stood up in the face’s own axes, and gives the point back on the board', () => {
    // A face standing on the line y = 300, its top edge 200 up, facing south.
    const frame = {
      origin: { x: 0, y: 300, z: 200 },
      u: { x: 1, y: 0, z: 0 },
      v: { x: 0, y: 0, z: -1 },
      normal: { x: 0, y: 1, z: 0 },
    };
    const box = { kind: 'prism', outline: square, base: 0, top: 20 } as const;
    const onFace = { kind: 'on-face', frame, shape: box } as const;
    const northward = (x: number, z: number): TableRay => ({
      origin: { x, y: 1000, z },
      direction: { x: 0, y: -1, z: 0 },
    });

    const hit = hitShape(northward(50, 150), onFace)!;

    expect(hit.t).toBeCloseTo(680, 9);
    expect(hit.point.x).toBeCloseTo(50, 9);
    expect(hit.point.y).toBeCloseTo(320, 9);
    expect(hit.point.z).toBeCloseTo(150, 9);
    expect(hitShape(northward(150, 150), onFace)).toBeNull();
    expect(hitShape(northward(50, 250), onFace)).toBeNull();
  });

  it('meets a sheet over the ground where the line comes down onto it, read across and down its box', () => {
    const sheet: PickDraped = {
      kind: 'draped',
      box: { x: 0, y: 0, width: 100, height: 100 },
      heightAt: (x) => (x < 50 ? 10 : 40),
      low: 9,
      high: 41,
    };

    const hit = hitShape({ origin: { x: 75, y: 25, z: 500 }, direction: { x: 0, y: 0, z: -1 } }, sheet);
    expect(hit?.point.z).toBeCloseTo(40, 1);
    expect(hit?.u).toBeCloseTo(0.75);
    expect(hit?.v).toBeCloseTo(0.25);

    expect(hitShape({ origin: { x: 120, y: 50, z: 20 }, direction: { x: -1, y: 0, z: 0 } }, sheet)).toBeNull();
  });

  it('meets a sheet over the ground from an eye standing over its box, below the highest of it', () => {
    const valley: PickDraped = {
      kind: 'draped',
      box: { x: 0, y: 0, width: 200, height: 100 },
      heightAt: (x) => Math.abs(x - 100),
      low: -1,
      high: 101,
    };
    const upward = { x: 0.8, y: 0, z: 0.6 };

    const hit = hitShape({ origin: { x: 100, y: 50, z: 20 }, direction: upward, from: 0 }, valley);

    expect(hit?.t).toBeCloseTo(100, 3);
    expect(hit?.point.z).toBeCloseTo(80, 3);
    expect(hitShape({ origin: { x: 100, y: 50, z: -5 }, direction: upward, from: 0 }, valley)).toBeNull();
  });

  it('takes a point within a little of an outline’s sides as within it', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    expect(withinOutline(square, 12, 5, 3)).toBe(true);
    expect(withinOutline(square, 14, 5, 3)).toBe(false);
    expect(withinOutline(square, 5, 5, 0)).toBe(true);
  });
});
