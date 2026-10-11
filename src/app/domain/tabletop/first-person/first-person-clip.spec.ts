import {
  clipBillboardToEye,
  clipPolygonToEye,
  clipWallToEye,
  depthOf,
  eyeFrameOf,
  inViewOpening,
  lateralOf,
  viewDepthOf,
} from '@axe/domain/tabletop/first-person/first-person-clip';
import { describe, expect, it } from 'vitest';

const northward = eyeFrameOf({ x: 0, y: 0, z: 25, yaw: 0 });
const eastward = eyeFrameOf({ x: 0, y: 0, z: 25, yaw: 90 });

describe('the eye frame', () => {
  it('counts depth along the facing and the lateral to its right', () => {
    expect(depthOf(northward, { x: 0, y: -100 })).toBe(100);
    expect(depthOf(northward, { x: 0, y: 100 })).toBe(-100);
    expect(lateralOf(northward, { x: 30, y: -100 })).toBe(30);
    expect(depthOf(eastward, { x: 100, y: 0 })).toBe(100);
    expect(lateralOf(eastward, { x: 100, y: 40 })).toBe(40);
  });
});

describe('clipWallToEye at level', () => {
  it('keeps the whole of a wall in front of the eye', () => {
    const cut = clipWallToEye(northward, { x: -50, y: -100 }, { x: 50, y: -100 }, 0, 100, 10);

    expect(cut).toEqual({ t0: 0, t1: 1, lowPx: 0, highPx: 100, outline: null });
  });

  it('drops a wall behind the eye', () => {
    expect(clipWallToEye(northward, { x: -50, y: 100 }, { x: 50, y: 100 }, 0, 100, 10)).toBeNull();
  });

  it('cuts a wall running past the eye where it crosses the near plane, from either end', () => {
    const cut = clipWallToEye(northward, { x: 20, y: 50 }, { x: 20, y: -150 }, 0, 100, 10)!;
    expect(cut.t0).toBeCloseTo(0.3);
    expect(cut.t1).toBe(1);

    const reversed = clipWallToEye(northward, { x: 20, y: -150 }, { x: 20, y: 50 }, 0, 100, 10)!;
    expect(reversed.t0).toBe(0);
    expect(reversed.t1).toBeCloseTo(0.7);
  });
});

describe('clipPolygonToEye', () => {
  const square = [
    { x: -25, y: -25 },
    { x: 25, y: -25 },
    { x: 25, y: 25 },
    { x: -25, y: 25 },
  ];

  it('leaves a patch wholly in front as it was', () => {
    const ahead = square.map((point) => ({ x: point.x, y: point.y - 100 }));

    expect(clipPolygonToEye(northward, ahead, 10)).toEqual(ahead);
  });

  it('drops a patch wholly behind', () => {
    expect(
      clipPolygonToEye(
        northward,
        square.map((point) => ({ x: point.x, y: point.y + 100 })),
        10
      )
    ).toEqual([]);
  });

  it('cuts a patch the eye stands in down to what is in front of it', () => {
    const kept = clipPolygonToEye(northward, square, 10);

    expect(kept.length).toBeGreaterThanOrEqual(3);
    for (const point of kept) expect(depthOf(northward, point)).toBeGreaterThanOrEqual(10 - 1e-9);
    expect(Math.min(...kept.map((point) => point.y))).toBe(-25);
  });
});

describe('a camera tipped up or down', () => {
  const lookingUp = eyeFrameOf({ x: 0, y: 0, z: 25, yaw: 0, pitch: 60 });
  const lookingDown = eyeFrameOf({ x: 0, y: 0, z: 25, yaw: 0, pitch: -60 });

  it('counts what lies above the eye as further ahead once it looks up, and nearer once it looks down', () => {
    const ahead = { x: 0, y: -100 };

    expect(viewDepthOf(northward, ahead, 125)).toBeCloseTo(100);
    expect(viewDepthOf(lookingUp, ahead, 125)).toBeGreaterThan(100);
    expect(viewDepthOf(lookingDown, ahead, 125)).toBeLessThan(0);
  });

  it('keeps the ground about the feet once the camera looks down, and cuts it ahead of them at level', () => {
    const square = [
      { x: -20, y: -20 },
      { x: 20, y: -20 },
      { x: 20, y: 20 },
      { x: -20, y: 20 },
    ];

    const level = clipPolygonToEye(northward, square, 10, 0);
    const down = clipPolygonToEye(lookingDown, square, 10, 0);

    expect(Math.max(...level.map((point) => point.y))).toBeCloseTo(-10);
    expect(Math.max(...down.map((point) => point.y))).toBeGreaterThan(0);
  });

  it('cuts a wall along its length only at level, where it crosses the near plane', () => {
    const a = { x: 30, y: 50 };
    const b = { x: 30, y: -100 };

    const cut = clipWallToEye(northward, a, b, 0, 100, 10);

    expect(cut).not.toBeNull();
    expect(cut!.t0).toBeCloseTo(0.4);
    expect(cut!.t1).toBeCloseTo(1);
    expect(cut!.lowPx).toBe(0);
    expect(cut!.highPx).toBe(100);
    expect(cut!.outline).toBeNull();
  });

  it('cuts a wall beside the eye on a slant once it looks up, keeping only what lies ahead', () => {
    const a = { x: 30, y: 50 };
    const b = { x: 30, y: -100 };

    const cut = clipWallToEye(lookingUp, a, b, 0, 100, 10)!;

    expect(cut.outline).not.toBeNull();
    for (const point of cut.outline!) {
      const at = { x: a.x + (b.x - a.x) * point.t, y: a.y + (b.y - a.y) * point.t };
      expect(viewDepthOf(lookingUp, at, point.z)).toBeGreaterThanOrEqual(10 - 1e-9);
    }
  });

  it('drops a wall wholly behind a camera looking up', () => {
    expect(clipWallToEye(lookingUp, { x: -50, y: 80 }, { x: 50, y: 80 }, 0, 10, 10)).toBeNull();
  });

  it('cuts a board square to the heading from below as the camera looks up, and from above as it looks down', () => {
    const near = { x: 0, y: -20 };

    expect(clipBillboardToEye(northward, near, 0, 200, 10)).toEqual({ lowPx: 0, highPx: 200 });
    expect(clipBillboardToEye(lookingUp, near, 0, 200, 10)!.lowPx).toBeGreaterThan(0);
    expect(clipBillboardToEye(lookingUp, near, 0, 200, 10)!.highPx).toBe(200);
    expect(clipBillboardToEye(lookingDown, near, 0, 200, 10)!.highPx).toBeLessThan(200);
    expect(clipBillboardToEye(northward, { x: 0, y: 20 }, 0, 200, 10)).toBeNull();
  });

  it('drops what lies above a level view, and keeps it once the camera looks up', () => {
    const overhead = [{ x: 0, y: -10, z: 500 }];
    const opening = { tanHalfWidth: 1, tanHalfHeight: 0.625 };

    expect(inViewOpening(northward, overhead, opening)).toBe(false);
    expect(inViewOpening(eyeFrameOf({ x: 0, y: 0, z: 25, yaw: 0, pitch: 80 }), overhead, opening)).toBe(true);
    expect(inViewOpening(northward, overhead, { tanHalfWidth: 1 })).toBe(true);
  });

  it('keeps a shape that reaches across the view though each corner lies past an edge', () => {
    const across = [
      { x: -500, y: -100, z: 25 },
      { x: 500, y: -100, z: 25 },
    ];

    expect(inViewOpening(northward, across, { tanHalfWidth: 1, tanHalfHeight: 0.625 })).toBe(true);
  });
});
