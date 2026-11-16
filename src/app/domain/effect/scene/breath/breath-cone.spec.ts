import { breathTimingOf } from '@axe/domain/effect/breath-timing';
import {
  breathConeOf,
  coneAxis,
  coneWidthAt,
  firstStruck,
  headTurnAt,
  nearestBodyFrom,
  streamFrontAt,
  strikes,
} from '@axe/domain/effect/scene/breath/breath-cone';
import { type StageTarget } from '@axe/domain/effect/scene/choreography';

const CELL = 50;
const TIMING = breathTimingOf(3);
const MOUTH = { x: 0, y: 0, z: 30, widthPx: CELL };

function target(index: number, x: number, y: number, widthPx = CELL): StageTarget {
  return { index, x, y, z: 0, groundZ: 0, widthPx };
}

describe('breathConeOf()', () => {
  it('blows one cone at a single target, 0.4 cells wide at the mouth and 2.5 where it reaches', () => {
    const cone = breathConeOf(MOUTH, [target(0, 300, 0)], CELL, TIMING, 0);

    expect(cone.yaw).toBeCloseTo(0);
    expect(cone.reach).toBeCloseTo(Math.hypot(300, 22.5 - 30));
    expect(cone.ends).toBeCloseTo(cone.reach + CELL * 0.5);
    expect(coneWidthAt(cone, 0)).toBeCloseTo(CELL * 0.4);
    expect(coneWidthAt(cone, cone.reach)).toBeCloseTo(CELL * 2.5);
    expect(coneWidthAt(cone, cone.reach / 2)).toBeGreaterThan(CELL * 1.45);
    expect(cone.turns).toBe(0);
  });

  it('aims between the outermost of several targets and reaches the furthest', () => {
    const cone = breathConeOf(MOUTH, [target(0, 300, 40), target(1, 300, -40), target(2, 400, 0)], CELL, TIMING, 0);

    expect(cone.yaw).toBeCloseTo(0);
    expect(cone.reach).toBeGreaterThan(399);
    expect(cone.turns).toBe(0);
  });

  it('turns its head from side to side over targets standing too far apart to cover at once', () => {
    const cone = breathConeOf(MOUTH, [target(0, 200, 200), target(1, 200, -200)], CELL, TIMING, 0);
    const turned = Array.from({ length: 60 }, (_unused, index) => headTurnAt(cone, TIMING, index / 20, 3));

    expect(cone.yaw).toBeCloseTo(0);
    expect(cone.turns).toBeGreaterThan(0.4);
    expect(Math.max(...turned)).toBeGreaterThan(cone.turns * 0.9);
    expect(Math.min(...turned)).toBeLessThan(-cone.turns * 0.9);
  });

  it('only sways a few degrees where the cone covers every target', () => {
    const cone = breathConeOf(MOUTH, [target(0, 300, 0)], CELL, TIMING, 0);
    const turned = Array.from({ length: 60 }, (_unused, index) => Math.abs(headTurnAt(cone, TIMING, index / 20, 3)));

    expect(Math.max(...turned)).toBeLessThan(0.06);
    expect(Math.max(...turned)).toBeGreaterThan(0.03);
  });

  it('is wider at the mouth of a larger caster, and narrower where it reaches only a little way', () => {
    const large = breathConeOf({ ...MOUTH, widthPx: CELL * 3 }, [target(0, 300, 0)], CELL, TIMING, 0);
    const short = breathConeOf(MOUTH, [target(0, 60, 0)], CELL, TIMING, 0);

    expect(large.widthAtMouth).toBeCloseTo(CELL * 0.9);
    expect(large.widthAtReach).toBeGreaterThan(CELL * 2.5);
    expect(short.widthAtReach).toBeLessThan(CELL * 1.5);
  });

  it('blows down from a high mouth at a low target, its axis of length one', () => {
    const cone = breathConeOf({ ...MOUTH, z: 200 }, [target(0, 300, 0)], CELL, TIMING, 0);
    const { way, side, lift } = coneAxis(cone, 0);

    expect(way.z).toBeLessThan(-0.4);
    expect(Math.hypot(way.x, way.y, way.z)).toBeCloseTo(1);
    expect(way.x * side.x + way.y * side.y + way.z * side.z).toBeCloseTo(0);
    expect(lift.z).toBeGreaterThan(0);
  });
});

describe('streamFrontAt()', () => {
  it('holds the stream in until it bursts, then shoots it to the end of the cone in 0.15 seconds', () => {
    const cone = breathConeOf(MOUTH, [target(0, 300, 0)], CELL, TIMING, 0);

    expect(streamFrontAt(cone, TIMING, TIMING.burstsAt - 0.01)).toBe(0);
    expect(streamFrontAt(cone, TIMING, TIMING.burstsAt + 0.075)).toBeGreaterThan(cone.ends * 0.8);
    expect(streamFrontAt(cone, TIMING, TIMING.burstsAt + 0.15)).toBeCloseTo(cone.ends);
    expect(streamFrontAt(cone, TIMING, TIMING.failsAt)).toBeCloseTo(cone.ends);
  });
});

describe('firstStruck()', () => {
  const standing = [target(0, 300, 0), target(1, 150, 0)];

  it('finds the first target a path runs into, and where', () => {
    const struck = firstStruck((along) => ({ x: along, y: 0, z: 20 }), 0, 400, 5, standing);

    expect(struck?.target).toBe(1);
    expect(struck?.along).toBeGreaterThan(150 - 21 - 5);
    expect(struck?.along).toBeLessThan(150 - 21 + 5);
  });

  it('lets a path pass beside the targets, and over their heads', () => {
    expect(firstStruck((along) => ({ x: along, y: 30, z: 20 }), 0, 400, 5, standing)).toBeNull();
    expect(firstStruck((along) => ({ x: along, y: 0, z: 60 }), 0, 400, 5, standing)).toBeNull();
  });

  it('takes a target as an upright drum about its middle, as wide as the target', () => {
    expect(strikes(target(0, 0, 0, 150), { x: 60, y: 0, z: 140 })).toBe(true);
    expect(strikes(target(0, 0, 0, 150), { x: 70, y: 0, z: 140 })).toBe(false);
    expect(strikes(target(0, 0, 0), { x: 0, y: 0, z: -1 })).toBe(false);
  });

  it('tells how far off the nearest target begins', () => {
    expect(nearestBodyFrom({ x: 0, y: 0, z: 0 }, standing)).toBeCloseTo(150 - 21);
    expect(nearestBodyFrom({ x: 150, y: 0, z: 0 }, standing)).toBe(0);
  });
});
