import {
  aimedPoint,
  aimOf,
  clampIntoReach,
  snapAim,
  SolidReach,
  withinReach,
} from '@axe/domain/tabletop/solid/solid-reach';

const dome: SolidReach = { centre: { x: 0, y: 0, z: 0 }, radius: 300, floorZ: 0 };

describe('clampIntoReach', () => {
  it('leaves a point inside the dome where it is', () => {
    expect(clampIntoReach({ x: 100, y: -50, z: 120 }, dome)).toEqual({ x: 100, y: -50, z: 120 });
  });

  it('slides a point pulled past the edge round the outside of the dome, towards its middle', () => {
    const slid = clampIntoReach({ x: 600, y: 0, z: 300 }, dome);
    expect(Math.hypot(slid.x, slid.y, slid.z)).toBeCloseTo(300);
    expect(slid.x).toBeCloseTo(600 / Math.sqrt(5));
    expect(slid.z).toBeCloseTo(300 / Math.sqrt(5));
  });

  it('keeps a point off the ground under the dome', () => {
    expect(clampIntoReach({ x: 100, y: 0, z: -80 }, dome)).toEqual({ x: 100, y: 0, z: 0 });
    const far = clampIntoReach({ x: 900, y: 0, z: -80 }, dome);
    expect(far.x).toBeCloseTo(300);
    expect(far.z).toBeCloseTo(0);
  });

  it('keeps the room below a caster in the air, down to the ground', () => {
    const aloft: SolidReach = { centre: { x: 0, y: 0, z: 200 }, radius: 300, floorZ: 0 };
    expect(clampIntoReach({ x: 0, y: 0, z: 50 }, aloft)).toEqual({ x: 0, y: 0, z: 50 });
    const below = clampIntoReach({ x: 280, y: 0, z: -40 }, aloft);
    expect(Math.hypot(below.x, below.y, below.z - 200)).toBeCloseTo(300);
    expect(below.z).toBeGreaterThanOrEqual(0);
    const underfoot = clampIntoReach({ x: 0, y: 0, z: -400 }, aloft);
    expect(underfoot).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('keeps a solid that reaches nowhere at its middle', () => {
    expect(clampIntoReach({ x: 300, y: 10, z: 40 }, { ...dome, radius: 0 })).toEqual({ x: 0, y: 0, z: 0 });
    expect(clampIntoReach({ x: 300, y: 10, z: 40 }, { ...dome, radius: Number.NaN })).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('tells a point within reach from one outside it', () => {
    expect(withinReach({ x: 0, y: 0, z: 300 }, dome)).toBe(true);
    expect(withinReach({ x: 0, y: 0, z: 301 }, dome)).toBe(false);
    expect(withinReach({ x: 10, y: 0, z: -1 }, dome)).toBe(false);
  });
});

describe('aim', () => {
  it('reads the way from one point to another as a turn from east and a tip from level', () => {
    expect(aimOf({ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 })).toEqual({ yaw: 0, pitch: 0 });
    const south = aimOf({ x: 0, y: 0, z: 0 }, { x: 0, y: 100, z: 100 });
    expect(south?.yaw).toBeCloseTo(90);
    expect(south?.pitch).toBeCloseTo(45);
    expect(aimOf({ x: 0, y: 0, z: 0 }, { x: -100, y: -1e-12, z: 0 })?.yaw).toBeCloseTo(180);
    expect(aimOf({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -50 })).toEqual({ yaw: 0, pitch: -90 });
    expect(aimOf({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 })).toBeNull();
  });

  it('finds the point so far along a way, and the way back to it again', () => {
    const from = { x: 10, y: 20, z: 30 };
    const point = aimedPoint(from, { yaw: 225, pitch: -30 }, 200);
    const back = aimOf(from, point);
    expect(back?.yaw).toBeCloseTo(225);
    expect(back?.pitch).toBeCloseTo(-30);
    expect(Math.hypot(point.x - 10, point.y - 20, point.z - 30)).toBeCloseTo(200);
  });

  it('keeps the way to the nearest steps of its turn and its tip', () => {
    expect(snapAim({ yaw: 52, pitch: 22 }, 45)).toEqual({ yaw: 45, pitch: 15 });
    expect(snapAim({ yaw: 350, pitch: 89 }, 30)).toEqual({ yaw: 0, pitch: 90 });
    expect(snapAim({ yaw: 10, pitch: -8 }, 0, 0)).toEqual({ yaw: 10, pitch: -8 });
  });
});
