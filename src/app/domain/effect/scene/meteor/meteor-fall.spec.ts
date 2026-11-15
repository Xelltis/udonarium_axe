import { EffectPreset } from '@axe/domain/effect/effect-preset';
import type { Stage } from '@axe/domain/effect/scene/choreography';
import {
  fallPointAt,
  fallShareAt,
  fallSpeedAt,
  meteorFallOf,
  rockSizeAt,
} from '@axe/domain/effect/scene/meteor/meteor-fall';

const CELL = 50;

function stageOf(fields: Partial<Stage> = {}, scale = 1): Stage {
  const preset = new EffectPreset('preset');
  preset.kind = 'projectile';
  preset.projectileStyle = 'meteor';
  preset.scale = scale;
  return {
    x: 400,
    y: 300,
    z: 0,
    groundZ: 0,
    cell: CELL * scale,
    tall: CELL,
    seconds: 0,
    duration: 1.2,
    index: 0,
    areaPx: 0,
    origin: { x: 100, y: 300, z: 30 },
    targets: [],
    mouth: null,
    blowsAt: [1.05],
    seed: 11,
    preset,
    ...fields,
  };
}

describe('the fall of a meteor', () => {
  it('starts nine cells of the table up and four aside, whether the meteor is of the usual size or the bundled one', () => {
    for (const scale of [1, 1.6]) {
      const fall = meteorFallOf(stageOf({}, scale), 0, 1, 0, 1.05);

      expect((fall.from.z - fall.to.z) / CELL).toBeCloseTo(9, 5);
      expect(Math.hypot(fall.from.x - fall.to.x, fall.from.y - fall.to.y) / CELL).toBeCloseTo(4, 5);
    }
  });

  it('falls from higher for a rock so large that nine cells would be no fall, and never from further aside than eight cells', () => {
    const huge = meteorFallOf(stageOf({}, 6), 0, 1, 0, 1.05);
    const landed = rockSizeAt(huge, 1);

    expect(huge.from.z - huge.to.z).toBeGreaterThanOrEqual(landed * 4.2 - 0.001);
    expect(Math.hypot(huge.from.x - huge.to.x, huge.from.y - huge.to.y) / CELL).toBeLessThanOrEqual(8);
  });

  it('hangs in the sky for a seventh of its travel and then falls until it lands', () => {
    const fall = meteorFallOf(stageOf(), 0, 1, 0, 1.05);

    expect(fall.showsAt).toBe(0);
    expect(fall.fallsAt).toBeCloseTo(0.15, 5);
    expect(fall.landsAt).toBe(1.05);
    expect(fallShareAt(fall, 0.1)).toBe(0);
    expect(fallShareAt(fall, 1.05)).toBe(1);
  });

  it('falls a little faster all the way down: under half the way at half its time, and two thirds faster as it lands', () => {
    const fall = meteorFallOf(stageOf(), 0, 1, 0, 1.05);
    const halfway = fallShareAt(fall, 0.6);

    expect(halfway).toBeGreaterThan(0.4);
    expect(halfway).toBeLessThan(0.5);
    expect(fallSpeedAt(fall, 1.05) / fallSpeedAt(fall, 0.15)).toBeCloseTo(1.25 / 0.75, 5);
    for (let ms = 150; ms < 1050; ms += 50) {
      expect(fallShareAt(fall, (ms + 50) / 1000)).toBeGreaterThan(fallShareAt(fall, ms / 1000));
    }
  });

  it('grows the rock from half a cell to 1.3 cells of the effect as it nears', () => {
    const fall = meteorFallOf(stageOf({}, 1.6), 0, 1, 0, 1.05);

    expect(rockSizeAt(fall, 0)).toBeCloseTo(0.5 * CELL * 1.6, 5);
    expect(rockSizeAt(fall, 1)).toBeCloseTo(1.3 * CELL * 1.6, 5);
    expect(rockSizeAt(fall, 0.5)).toBeGreaterThan(rockSizeAt(fall, 0.25));
  });

  it('lands sunk into the floor where the target stands, nearly to the middle of the rock', () => {
    const fall = meteorFallOf(stageOf(), 0, 1, 0, 1.05);
    const lands = fallPointAt(fall, 1);

    expect([lands.x, lands.y]).toEqual([400, 300]);
    expect(lands.z).toBeCloseTo(rockSizeAt(fall, 1) * 0.25, 5);
    expect(fall.floor).toEqual({ x: 400, y: 300, z: 0 });
  });

  it('comes in over the shoulder of its caster for the first target', () => {
    const fall = meteorFallOf(stageOf(), 0, 1, 0, 1.05);

    expect(fall.from.x).toBeLessThan(400 - CELL * 3.5);
    expect(fall.across.x).toBeGreaterThan(0.95);
  });

  it('brings each target’s and each shot’s down from its own side', () => {
    const bearings = [0, 1, 2, 3, 4].map((index) => {
      const fall = meteorFallOf(stageOf({ index, seed: 11 + index * 7919 }), 0, 1, 0, 1.05);
      return Math.atan2(fall.across.y, fall.across.x);
    });
    const shots = [0, 1, 2].map((shot) => {
      const fall = meteorFallOf(stageOf(), shot, 3, 0, 1.05);
      return Math.atan2(fall.across.y, fall.across.x);
    });

    for (const set of [bearings, shots]) {
      for (const [index, bearing] of set.entries()) {
        for (const other of set.slice(index + 1)) expect(Math.abs(bearing - other)).toBeGreaterThan(0.2);
      }
    }
  });

  it('falls the same for the same cast, every time it is asked', () => {
    const stage = stageOf({ index: 2, seed: 4242 });

    expect(meteorFallOf(stage, 1, 3, 0.1, 1.2)).toEqual(meteorFallOf(stage, 1, 3, 0.1, 1.2));
  });

  it('crosses the table from the south-west when it is called from nowhere, or by one who stands on the target', () => {
    for (const origin of [null, { x: 402, y: 300, z: 30 }]) {
      const fall = meteorFallOf(stageOf({ origin }), 0, 1, 0, 1.05);

      expect(fall.across.x).toBeGreaterThan(0.5);
      expect(fall.across.y).toBeLessThan(-0.5);
    }
  });

  it('lands the meteors of a volley within half a cell of the target, the first on it', () => {
    const lands = [0, 1, 2, 3, 4, 5].map((shot) => meteorFallOf(stageOf(), shot, 6, 0, 1.05).floor);

    expect([lands[0].x, lands[0].y]).toEqual([400, 300]);
    for (const spot of lands) expect(Math.hypot(spot.x - 400, spot.y - 300)).toBeLessThanOrEqual(CELL * 0.5 + 0.001);
    expect(new Set(lands.map((spot) => `${Math.round(spot.x)},${Math.round(spot.y)}`)).size).toBe(6);
  });

  it('strikes a target standing over the floor where it stands, and marks the floor under it', () => {
    const fall = meteorFallOf(stageOf({ z: 120, groundZ: 20 }), 0, 1, 0, 1.05);

    expect(fall.to.z).toBeGreaterThan(120);
    expect(fall.floor.z).toBe(20);
  });
});
