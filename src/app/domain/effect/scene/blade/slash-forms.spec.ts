import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { effectJoltsOf } from '@axe/domain/effect/effect-reaction';
import { type Staged } from '@axe/domain/effect/scene/choreography';
import {
  bundledOf,
  CASTER,
  castOnTarget,
  CELL,
  cutOf,
  stagedAt,
  TARGET,
  wakesOf,
  widestOf,
} from '@axe/testing/blade-effect-stage';

const cast = castOnTarget();

/** The blade held ready: the white-cored band of seven points from its hilt to its point. */
function heldOf(drawn: Staged) {
  return drawn.ribbons.find((ribbon) => ribbon.points.length === 7 && ribbon.core === '#ffffff')!;
}

/** The highest and the lowest anything banded is drawn. */
function heightsOf(drawn: Staged): { top: number; bottom: number } {
  const zs = drawn.ribbons.flatMap((ribbon) => ribbon.points.map((point) => point.z));
  return { top: Math.max(...zs), bottom: Math.min(...zs) };
}

describe('a cleave', () => {
  const cleave = cutOf('heavy', 2256, 3);
  const strikes = effectBlowsOf(cleave)[0].atMs / 1000;

  it('holds a blade high over the target, drawn back towards its caster, long before it falls', () => {
    const held = stagedAt(cleave, cast, strikes * 0.6);
    const tip = heldOf(held).points.at(-1)!;

    expect(wakesOf(held)).toEqual([]);
    expect(tip.z).toBeGreaterThan(CELL * 2);
    expect(tip.x).toBeGreaterThan(TARGET.x + CELL * 0.4);
    expect(tip.x).toBeLessThan(CASTER.x + CELL);
  });

  it('draws the blade further back and brighter as it gathers', () => {
    const tipAt = (share: number) => heldOf(stagedAt(cleave, cast, strikes * share)).points.at(-1)!;
    const sparksAt = (share: number) =>
      stagedAt(cleave, cast, strikes * share).motes.filter((mote) => mote.shape === 'spark').length;

    expect(tipAt(0.85).z).toBeGreaterThan(tipAt(0.3).z);
    expect(sparksAt(0.5)).toBeGreaterThan(0);
  });

  it('comes down through the target to the floor in an instant, as its blow lands', () => {
    const before = heightsOf(stagedAt(cleave, cast, strikes - 0.12));
    const landed = stagedAt(cleave, cast, strikes);
    const [wake] = wakesOf(landed);
    const head = wake.points.at(-1)!;

    expect(before.bottom).toBeGreaterThan(CELL * 0.5);
    expect(wake.points[0].z).toBeGreaterThan(CELL * 2);
    expect(head.z).toBeLessThan(CELL * 1.3);
    expect(Math.hypot(head.x - TARGET.x, head.y - TARGET.y)).toBeLessThan(CELL * 0.6);
    expect(wakesOf(stagedAt(cleave, cast, strikes + 0.06))[0].points.at(-1)!.z).toBeLessThan(CELL * 0.4);
  });

  it('cuts the target from its head to its feet', () => {
    const struck = stagedAt(cleave, cast, strikes + 0.03);
    const upright = struck.ribbons.filter(
      (ribbon) =>
        ribbon.points.length === 9 &&
        ribbon.points.every((point) => Math.abs(point.x - TARGET.x) < 1 && Math.abs(point.y - TARGET.y) < 1)
    );
    const zs = upright.flatMap((ribbon) => ribbon.points.map((point) => point.z));

    expect(upright.length).toBeGreaterThan(1);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(CELL);
  });

  it('breaks nothing before it lands, then splits the ground on past the target and heaves rock out of it', () => {
    const before = stagedAt(cleave, cast, strikes - 0.02);
    const after = stagedAt(cleave, cast, strikes + 0.3);
    const split = after.floor.filter((mark) => mark.shape === 'fissure');
    const crags = after.motes.filter((mote) => mote.shape === 'crag');

    expect(before.floor).toEqual([]);
    expect(before.motes.filter((mote) => mote.shape === 'crag')).toEqual([]);
    expect(split.length).toBeGreaterThan(0);
    expect(split[0].x).toBeLessThan(TARGET.x);
    expect(crags.length).toBeGreaterThanOrEqual(4);
    expect(crags.every((crag) => crag.x < TARGET.x)).toBe(true);
  });

  it('heaves its crags one after another, the nearest first', () => {
    const cragsAt = (since: number) =>
      stagedAt(cleave, cast, strikes + since).motes.filter((mote) => mote.shape === 'crag').length;

    expect(cragsAt(0.06)).toBeGreaterThan(0);
    expect(cragsAt(0.06)).toBeLessThan(cragsAt(0.3));
  });

  it('lets the split glow at first and go cold, and clears everything by the end', () => {
    const glowAt = (since: number) =>
      stagedAt(cleave, cast, strikes + since).floor.filter((mark) => mark.blend === 'light').length;

    expect(glowAt(0.2)).toBeGreaterThan(0);
    expect(glowAt(1.4)).toBe(0);
  });

  it('presses the one it strikes down, not back', () => {
    const jolt = effectJoltsOf(cleave, cast, strikes * 1000 + 200, CELL).get('t0')!;

    expect([jolt.x, jolt.y]).toEqual([0, 0]);
    expect(jolt.z).toBeLessThan(0);
  });

  it('lands as its bundled sound crashes, most of a second in', () => {
    const [blow] = effectBlowsOf(bundledOf('兜割り'));

    expect(blow.atMs).toBeGreaterThan(850);
    expect(blow.atMs).toBeLessThan(930);
  });
});

describe('a wide sweep', () => {
  const sweep = cutOf('wide', 1752, 3);
  const crosses = effectBlowsOf(sweep)[0].atMs / 1000;

  it('holds a blade drawn back to one side of the target, growing, before it swings', () => {
    const tipAt = (share: number) => heldOf(stagedAt(sweep, cast, crosses * share));
    const reach = (share: number) => {
      const blade = tipAt(share);
      return Math.hypot(blade.points.at(-1)!.x - blade.points[0].x, blade.points.at(-1)!.y - blade.points[0].y);
    };

    expect(wakesOf(stagedAt(sweep, cast, crosses * 0.5))).toEqual([]);
    expect(reach(0.7)).toBeGreaterThan(reach(0.2));
    expect(Math.abs(tipAt(0.7).points.at(-1)!.y - TARGET.y)).toBeGreaterThan(CELL);
  });

  it('sweeps level right across, more than a cell wider than the target either side', () => {
    const [wake] = wakesOf(stagedAt(sweep, cast, crosses + 0.1));
    const ys = wake.points.map((point) => point.y);
    const zs = wake.points.map((point) => point.z);

    expect(Math.max(...ys)).toBeGreaterThan(TARGET.y + CELL * 1.5);
    expect(Math.min(...ys)).toBeLessThan(TARGET.y - CELL * 1.5);
    expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(CELL * 0.6);
  });

  it('leaves a thicker trail than one stroke does, which hangs longer', () => {
    const single = cutOf('single', 1752, 3);
    const one = effectBlowsOf(single)[0].atMs / 1000;

    expect(widestOf(wakesOf(stagedAt(sweep, cast, crosses + 0.1))[0])).toBeGreaterThan(
      widestOf(wakesOf(stagedAt(single, cast, one + 0.1))[0]) * 1.2
    );
    expect(wakesOf(stagedAt(sweep, cast, crosses + 0.45)).length).toBeGreaterThan(0);
    expect(wakesOf(stagedAt(single, cast, one + 0.45))).toEqual([]);
  });

  it('scores the floor along the stroke and sends the wind of it on past the target, away from the caster', () => {
    const after = stagedAt(sweep, cast, crosses + 0.25);
    const [score] = after.floor.filter((mark) => mark.shape === 'fissure');
    const wind = after.ribbons.filter((ribbon) => ribbon.points.length === 15 && ribbon.points[0].z < CELL * 0.2);
    const west = Math.min(...wind.flatMap((ribbon) => ribbon.points.map((point) => point.x)));

    expect(Math.hypot(score.x - TARGET.x, score.y - TARGET.y)).toBeLessThan(1);
    expect(Math.abs(Math.sin(score.turn))).toBeGreaterThan(0.9);
    expect(west).toBeLessThan(TARGET.x - CELL);
    expect(wind.every((ribbon) => ribbon.points.every((point) => point.x < TARGET.x + CELL * 0.5))).toBe(true);
  });

  it('lays no ring on the floor', () => {
    for (let since = 0; since < 1.5; since += 0.05) {
      expect(stagedAt(sweep, cast, crosses + since).floor.some((mark) => mark.shape === 'ring')).toBe(false);
    }
  });

  it('crosses as the rush of its bundled sound breaks', () => {
    const [blow] = effectBlowsOf(bundledOf('大斬撃'));

    expect(blow.atMs).toBeGreaterThan(330);
    expect(blow.atMs).toBeLessThan(400);
  });
});
