import { EffectPreset } from '@axe/domain/effect/effect-preset';
import type { Stage } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import {
  acrossOf,
  ball,
  circlePoints,
  floorMark,
  glow,
  haze,
  hueOf,
  keptFor,
  lerpPoint,
  lightBall,
  lightningPaths,
  type Point,
  smokePuff,
  stageKey,
  starBurst,
  throwerFor,
  wayBetween,
} from '@axe/domain/effect/scene/parts';

const AT: Point = { x: 10, y: 20, z: 30 };

function stage(partial: Partial<Stage> = {}): Stage {
  const preset = new EffectPreset('preset');
  preset.kind = 'burst';
  preset.grade = 2;
  return {
    x: 100,
    y: 200,
    z: 0,
    groundZ: 0,
    cell: 50,
    tall: 50,
    seconds: 0.2,
    duration: 1.2,
    index: 0,
    areaPx: 0,
    origin: null,
    targets: [],
    mouth: null,
    blowsAt: [0.5],
    seed: 7,
    preset,
    ...partial,
  };
}

describe('the parts of an effect', () => {
  it('are drawn at the point with their blend and shape, never less than wholly faded', () => {
    expect(glow(AT, 8, '#fff', -0.5, 1)).toEqual({
      ...AT,
      size: 8,
      color: '#fff',
      alpha: 0,
      blend: 'light',
      shape: 'glow',
      forward: 1,
    });
    expect(lightBall(AT, 8, '#fff', 0.5, 2)).toMatchObject({ alpha: 0.5, blend: 'light', shape: 'puff', variant: 0 });
    expect(ball(AT, 8, '#f00', 0.5, 2, 3)).toMatchObject({ alpha: 0.5, blend: 'color', shape: 'puff', variant: 3 });
    expect(smokePuff(AT, 8, '#888', 2, 0)).toMatchObject({ alpha: 2, blend: 'color', shape: 'smoke' });
    expect(haze(AT, 8, '#80f', -1, 0)).toMatchObject({ alpha: 0, blend: 'color', shape: 'glow' });
  });

  it('lay a mark flat on the floor about the point', () => {
    expect(floorMark('ring', AT, 40, 0.2, '#f80', -1, 'light', 5)).toEqual({
      shape: 'ring',
      x: 10,
      y: 20,
      z: 30,
      radius: 40,
      width: 0.2,
      color: '#f80',
      alpha: 0,
      blend: 'light',
      turn: 0,
      seed: 5,
    });
  });
});

describe('keptFor()', () => {
  it('makes a thing once for a key and forgets the oldest past the most kept', () => {
    const cache = new Map<string, number[]>();
    let made = 0;
    const make = () => [made++];
    expect(keptFor(cache, 'a', make, 2)).toBe(keptFor(cache, 'a', make, 2));
    keptFor(cache, 'b', make, 2);
    keptFor(cache, 'c', make, 2);
    expect(made).toBe(3);
    expect(cache.has('a')).toBe(false);
    expect([...cache.keys()]).toEqual(['b', 'c']);
  });
});

describe('stageKey() and throwerFor()', () => {
  it('tells stages apart by what they throw from, and throws the same for the same key', () => {
    expect(stageKey(stage(), 1)).toBe(stageKey(stage(), 1));
    expect(stageKey(stage(), 1)).not.toBe(stageKey(stage({ seed: 8 }), 1));
    expect(stageKey(stage(), 1)).not.toBe(stageKey(stage(), 2));
    const first = throwerFor(stage(), 2);
    const again = throwerFor(stage(), 2);
    expect([first.range(0, 1), first.range(0, 1)]).toEqual([again.range(0, 1), again.range(0, 1)]);
  });

  it('throws on the floor under the target, as many as the grade asks, each living within the effect', () => {
    const thrower = throwerFor(stage({ groundZ: -5 }), 2);
    expect(thrower.cell).toBe(50);
    expect(thrower.floorZ).toBe(-5);
    expect(thrower.fall).toBe(650);
    expect(thrower.count(4)).toBe(Math.max(1, Math.round(4 * stage().preset.gradeDensity)));
    expect(thrower.count(0)).toBe(1);
    const way = thrower.outward();
    expect(Math.hypot(way.cos, way.sin)).toBeCloseTo(1);
    expect(thrower.lifeOf(1.9, 5, 6)).toBeCloseTo(0.08);
    expect(thrower.lifeOf(5, 1, 2)).toBe(0.05);
    expect(
      thrower.mote({ x: 1, y: 2, z: 3, vx: 0, vy: 0, vz: 0, bornAt: 0, life: 1, gravity: 0, drag: 0, bounce: 0 }).floorZ
    ).toBe(-5);
  });
});

describe('the ways between points', () => {
  it('lerp a share of the way, and give the way and the length between two points', () => {
    expect(lerpPoint({ x: 0, y: 0, z: 0 }, { x: 10, y: 20, z: 30 }, 0.5)).toEqual({ x: 5, y: 10, z: 15 });
    expect(wayBetween({ x: 0, y: 0, z: 0 }, { x: 0, y: 3, z: 4 })).toEqual({
      way: { x: 0, y: 0.6, z: 0.8 },
      length: 5,
    });
    expect(wayBetween(AT, AT)).toEqual({ way: { x: 0, y: 0, z: 0 }, length: 1 });
  });

  it('give a level side and an upward lift across a way', () => {
    const { side, lift } = acrossOf({ x: 0, y: 1, z: 0 });
    expect(side).toEqual({ x: -1, y: 0, z: 0 });
    expect(lift.z).toBeGreaterThanOrEqual(0);
    expect(side.x * 0 + side.y * 1 + side.z * 0).toBeCloseTo(0);
    expect(acrossOf({ x: 0, y: 0, z: 1 }).side).toEqual({ x: 1, y: 0, z: 0 });
  });

  it('go round a level circle in as many steps as asked', () => {
    const points = circlePoints({ x: 0, y: 0, z: 5 }, 10, 4);
    expect(points).toHaveLength(5);
    for (const point of points) {
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(10);
      expect(point.z).toBe(5);
    }
    expect(points[0].x).toBeCloseTo(10);
    expect(points[2].x).toBeCloseTo(-10);
  });
});

describe('lightningPaths()', () => {
  it('runs from one point to the other with its bends between, never below the floor, the same for the same seed', () => {
    const from = { x: 0, y: 0, z: 10 };
    const to = { x: 100, y: 0, z: 10 };
    const bolt = lightningPaths(from, to, 3, 1, { bends: 6, jag: 0.5, forks: 2, floorZ: 8 });
    expect(bolt.main).toHaveLength(7);
    expect(bolt.main[0]).toEqual(from);
    expect(bolt.main[6]).toEqual(to);
    expect(bolt.forks).toHaveLength(2);
    for (const point of [...bolt.main, ...bolt.forks.flat()]) expect(point.z).toBeGreaterThanOrEqual(8);
    expect(bolt).toEqual(lightningPaths(from, to, 3, 1, { bends: 6, jag: 0.5, forks: 2, floorZ: 8 }));
    expect(bolt).not.toEqual(lightningPaths(from, to, 3, 2, { bends: 6, jag: 0.5, forks: 2, floorZ: 8 }));
  });
});

describe('starBurst()', () => {
  it('is nothing outside its run, and two streaks a spike with a glare under them within it', () => {
    expect(starBurst(AT, 10, '#fff', -0.1, 0)).toEqual([]);
    expect(starBurst(AT, 10, '#fff', 1, 0)).toEqual([]);
    const motes = starBurst(AT, 10, '#fff', 0.5, 0, 4);
    expect(motes).toHaveLength(9);
    expect(motes.slice(0, 8).every((mote) => mote.shape === 'flare')).toBe(true);
    expect(motes[8].shape).toBe('glow');
  });
});

describe('hueOf()', () => {
  it('takes the dark colour of a ramp a little towards its light one', () => {
    const ramp = ['#000000', '#102030', '#f0e0d0', '#ffffff'];
    expect(hueOf(ramp)).toBe(mixColor('#102030', '#f0e0d0', 0.3));
  });
});
