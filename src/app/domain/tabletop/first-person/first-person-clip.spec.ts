import {
  clipPolygonToEye,
  clipSpanToEye,
  depthOf,
  eyeFrameOf,
  lateralOf,
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

describe('clipSpanToEye', () => {
  it('keeps the whole of a wall in front of the eye', () => {
    expect(clipSpanToEye(northward, { x: -50, y: -100 }, { x: 50, y: -100 }, 10)).toEqual({ t0: 0, t1: 1 });
  });

  it('drops a wall behind the eye', () => {
    expect(clipSpanToEye(northward, { x: -50, y: 100 }, { x: 50, y: 100 }, 10)).toBeNull();
  });

  it('cuts a wall running past the eye where it crosses the near plane, from either end', () => {
    const cut = clipSpanToEye(northward, { x: 20, y: 50 }, { x: 20, y: -150 }, 10)!;
    expect(cut.t0).toBeCloseTo(0.3);
    expect(cut.t1).toBe(1);

    const reversed = clipSpanToEye(northward, { x: 20, y: -150 }, { x: 20, y: 50 }, 10)!;
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
