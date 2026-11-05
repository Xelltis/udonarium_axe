import {
  clipBillboardToEye,
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

describe('a camera tipped up or down', () => {
  const lookingUp = eyeFrameOf({ x: 0, y: 0, z: 25, yaw: 0, pitch: 60 });
  const lookingDown = eyeFrameOf({ x: 0, y: 0, z: 25, yaw: 0, pitch: -60 });

  it('cuts a board square to the heading from below as the camera looks up, and from above as it looks down', () => {
    const near = { x: 0, y: -20 };

    expect(clipBillboardToEye(northward, near, 0, 200, 10)).toEqual({ lowPx: 0, highPx: 200 });
    expect(clipBillboardToEye(lookingUp, near, 0, 200, 10)!.lowPx).toBeGreaterThan(0);
    expect(clipBillboardToEye(lookingUp, near, 0, 200, 10)!.highPx).toBe(200);
    expect(clipBillboardToEye(lookingDown, near, 0, 200, 10)!.highPx).toBeLessThan(200);
    expect(clipBillboardToEye(northward, { x: 0, y: 20 }, 0, 200, 10)).toBeNull();
  });
});
