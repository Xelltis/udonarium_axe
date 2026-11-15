import { breathTimingOf } from '@axe/domain/effect/breath-timing';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { breathConeOf } from '@axe/domain/effect/scene/breath/breath-cone';
import {
  breakingPoint,
  type Gout,
  goutAt,
  type GoutKind,
  type StreamSetting,
  throwGouts,
  wayPoint,
} from '@axe/domain/effect/scene/breath/breath-stream';
import { type Stage, type StageTarget } from '@axe/domain/effect/scene/choreography';
import { throwerFor } from '@axe/domain/effect/scene/parts';

const CELL = 50;
const TIMING = breathTimingOf(3);
const MOUTH = { x: 0, y: 0, z: 30, widthPx: CELL };
const BODY: GoutKind = { rate: 100, pace: [0.85, 1.1], edge: [0.15, 1], size: [0.3, 0.44], rolls: 1.2, breaks: true };

function target(index: number, x: number, y: number): StageTarget {
  return { index, x, y, z: 0, groundZ: 0, widthPx: CELL };
}

function settingOn(targets: readonly StageTarget[]): StreamSetting {
  return {
    cone: breathConeOf(MOUTH, targets, CELL, TIMING, 0),
    timing: TIMING,
    targets,
    pace: 9 * CELL,
    buoyancy: 0,
    seed: 5,
  };
}

function thrown(setting: StreamSetting, kind: GoutKind = BODY, grade = 2): Gout[] {
  const preset = new EffectPreset('preset');
  preset.kind = 'breath';
  preset.grade = grade;
  const stage: Stage = {
    x: 300,
    y: 0,
    z: 0,
    groundZ: 0,
    cell: CELL,
    tall: CELL,
    seconds: 0,
    duration: 3,
    index: 0,
    areaPx: 0,
    origin: null,
    targets: setting.targets,
    mouth: MOUTH,
    blowsAt: [],
    seed: 5,
    preset,
  };
  return throwGouts(throwerFor(stage, 5), setting, kind);
}

function aliveAt(setting: StreamSetting, gouts: readonly Gout[], seconds: number) {
  return gouts.flatMap((gout) => {
    const state = goutAt(setting, gout, seconds);
    return state ? [{ gout, state }] : [];
  });
}

describe('throwGouts()', () => {
  const setting = settingOn([target(0, 300, 0)]);

  it('throws the same gouts for the same seed', () => {
    expect(JSON.stringify(thrown(setting))).toBe(JSON.stringify(thrown(setting)));
  });

  it('throws them at the same rate from the burst until the breath fails, and fewer as it fails', () => {
    const gouts = thrown(setting);
    const bornIn = (from: number, to: number) => gouts.filter((gout) => gout.bornAt >= from && gout.bornAt < to).length;

    expect(bornIn(0.5, 1.5)).toBeGreaterThan(90);
    expect(bornIn(0.5, 1.5)).toBeLessThan(110);
    expect(Math.abs(bornIn(0.5, 1.5) - bornIn(1.4, 2.4))).toBeLessThan(6);
    expect(bornIn(TIMING.failsAt, TIMING.spentAt)).toBeLessThan(100 * 0.3 * 0.9);
    expect(bornIn(TIMING.spentAt, 10)).toBe(0);
  });

  it('throws more at the higher grades', () => {
    expect(thrown(setting, BODY, 3).length).toBeGreaterThan(thrown(setting, BODY, 2).length * 1.5);
    expect(thrown(setting, BODY, 1).length).toBeLessThan(thrown(setting, BODY, 2).length * 0.7);
  });

  it('breaks on the target the gouts that run into it, and spends the rest where the cone ends', () => {
    const gouts = thrown(setting);
    const broken = gouts.filter((gout) => gout.struck === 0);
    const spent = gouts.filter((gout) => gout.struck < 0);

    expect(broken.length).toBeGreaterThan(gouts.length * 0.2);
    expect(spent.length).toBeGreaterThan(gouts.length * 0.2);
    for (const gout of broken) {
      const at = wayPoint(setting, gout, gout.flies);
      expect(Math.hypot(at.x - 300, at.y)).toBeLessThan(CELL * 0.42 + CELL * 0.13);
      expect(gout.end).not.toBe('spent');
    }
    for (const gout of spent) {
      expect(gout.end).toBe('spent');
      expect(gout.flies).toBeLessThanOrEqual(setting.cone.ends * 1.04);
    }
  });

  it('stops at the first of two targets standing one behind the other', () => {
    const both = settingOn([target(0, 300, 0), target(1, 150, 0)]);
    const gouts = thrown(both);
    const first = gouts.filter((gout) => gout.struck === 1).length;
    const second = gouts.filter((gout) => gout.struck === 0).length;

    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(0);
    for (const gout of gouts.filter((one) => Math.hypot(one.across, one.up) < 0.2 && one.rolls === 0)) {
      expect(gout.struck).toBe(1);
    }
    expect(thrown(both, { ...BODY, edge: [0, 0.1], rolls: 0 }).every((gout) => gout.struck === 1)).toBe(true);
  });

  it('runs a kind that does not break straight on through the targets', () => {
    expect(thrown(setting, { ...BODY, breaks: false }).every((gout) => gout.struck < 0)).toBe(true);
  });
});

describe('goutAt()', () => {
  const setting = settingOn([target(0, 300, 0)]);
  const gouts = thrown(setting);

  it('shows nothing before the burst, and the stream all the way to the target 0.15 seconds after it', () => {
    expect(aliveAt(setting, gouts, TIMING.burstsAt - 0.01)).toHaveLength(0);
    const early = aliveAt(setting, gouts, TIMING.burstsAt + 0.04);
    const reached = aliveAt(setting, gouts, TIMING.reachesAt + 0.01);

    expect(Math.max(...early.map(({ state }) => state.x))).toBeLessThan(250);
    expect(Math.max(...reached.map(({ state }) => state.x))).toBeGreaterThan(270);
    expect(reached.length).toBeGreaterThan(early.length);
  });

  it('keeps as many gouts in the air through the whole of a long breath, running at the same pace', () => {
    const counts = [0.8, 1.2, 1.6, 2, 2.4].map((seconds) => aliveAt(setting, gouts, seconds).length);
    const flying = gouts.find((gout) => gout.bornAt > 1 && gout.flies > 200)!;
    const paceEarly = goutAt(setting, flying, flying.bornAt + 0.2)!.x - goutAt(setting, flying, flying.bornAt + 0.1)!.x;

    expect(Math.min(...counts)).toBeGreaterThan(55);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThan(Math.max(...counts) * 0.25);
    expect(paceEarly).toBeGreaterThan(9 * CELL * 0.1 * 0.7);
    expect(paceEarly).toBeLessThan(9 * CELL * 0.1 * 1.3);
  });

  it('widens the stream from the mouth to the target, within the cone', () => {
    const alive = aliveAt(setting, gouts, 1.5).filter(({ state }) => state.breaking === 0);
    const near = alive.filter(({ state }) => state.x < 60).map(({ state }) => Math.abs(state.y));
    const far = alive.filter(({ state }) => state.x > 220).map(({ state }) => Math.abs(state.y));

    expect(Math.max(...near)).toBeLessThan(CELL * 0.6);
    expect(Math.max(...far)).toBeGreaterThan(CELL * 0.7);
    expect(Math.max(...far)).toBeLessThan(CELL * 1.5);
  });

  it('grows a gout as it flies, and has it gone once it has broken', () => {
    const flying = gouts.find((gout) => gout.bornAt > 1 && gout.struck < 0)!;
    const young = goutAt(setting, flying, flying.bornAt + 0.05)!;
    const old = goutAt(setting, flying, flying.bornAt + (flying.flies / flying.pace) * 0.95)!;

    expect(old.grown).toBeGreaterThan(young.grown * 2);
    expect(goutAt(setting, flying, flying.bornAt + flying.flies / flying.pace + flying.endS + 0.01)).toBeNull();
  });

  it('thins the stream from the mouth as the breath fails, the last of it running on', () => {
    const last = aliveAt(setting, gouts, TIMING.spentAt + 0.25).map(({ state }) => state.x);

    expect(last.length).toBeGreaterThan(0);
    expect(Math.min(...last)).toBeGreaterThan(60);
    expect(aliveAt(setting, gouts, TIMING.spentAt + 2)).toHaveLength(0);
  });

  it('never sinks a gout below the floor', () => {
    const sinking = { ...setting, buoyancy: -CELL * 2 };
    const low = thrown(sinking);
    for (const seconds of [0.6, 1.2, 2.4, 3.2]) {
      for (const { state } of aliveAt(sinking, low, seconds)) expect(state.z).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('breakingPoint()', () => {
  const setting = settingOn([target(0, 300, 0)]);
  const gouts = thrown(setting);
  const ending = (end: Gout['end']) => gouts.filter((gout) => gout.end === end && gout.struck === 0);

  it('slides a gout that wraps round the side of the target it struck, to behind it', () => {
    const wraps = ending('wrap');

    expect(wraps.length).toBeGreaterThan(10);
    for (const gout of wraps) {
      const start = breakingPoint(setting, gout, 0);
      const end = breakingPoint(setting, gout, 1);
      expect(start.x).toBeLessThan(300);
      expect(end.x).toBeGreaterThan(start.x);
      for (const share of [0, 0.25, 0.5, 0.75, 1]) {
        const at = breakingPoint(setting, gout, share);
        expect(Math.hypot(at.x - 300, at.y)).toBeGreaterThanOrEqual(CELL * 0.42);
        expect(Math.hypot(at.x - 300, at.y)).toBeLessThan(CELL * 1.2);
      }
    }
    expect(wraps.filter((gout) => breakingPoint(setting, gout, 1).x > 300).length).toBeGreaterThan(wraps.length * 0.5);
  });

  it('throws a gout that curls back towards the caster and aside, and up', () => {
    const curls = ending('curl');

    expect(curls.length).toBeGreaterThan(5);
    for (const gout of curls) {
      const start = breakingPoint(setting, gout, 0);
      if (start.x > 290) continue;
      const end = breakingPoint(setting, gout, 1);
      expect(end.x).toBeLessThan(start.x + CELL * 0.3);
      expect(Math.hypot(end.x - 300, end.y)).toBeGreaterThan(Math.hypot(start.x - 300, start.y));
      expect(breakingPoint(setting, gout, 0.6).z).toBeGreaterThan(start.z);
    }
  });

  it('lifts a gout that climbs over the top of the target', () => {
    const over = ending('over');

    expect(over.length).toBeGreaterThan(2);
    for (const gout of over) expect(breakingPoint(setting, gout, 1).z).toBeGreaterThan(CELL * 0.75);
  });

  it('breaks the gouts about equally to either side of a target struck head on', () => {
    const wraps = ending('wrap');
    const left = wraps.filter((gout) => breakingPoint(setting, gout, 0.5).y < 0).length;

    expect(left).toBeGreaterThan(wraps.length * 0.25);
    expect(left).toBeLessThan(wraps.length * 0.75);
  });
});
