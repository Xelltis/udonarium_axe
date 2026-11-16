import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import { GLOOM } from '@axe/domain/effect/scene/storm/bolt-parts';
import {
  boltsBetween,
  boltsOnto,
  castOn,
  CELL,
  HAND,
  liesOnFloor,
  stagedAt,
  thunderPresetOf,
  widestOf,
} from '@axe/testing/thunder-effect-stage';

const TARGET = { x: 400, y: 300 };
const OTHER = { x: 520, y: 340 };

function strokesOf(preset: EffectPreset): number[] {
  return effectBlowsOf(preset).map((blow) => blow.atMs / 1000);
}

/** The thickest bolt that comes down onto a place at a moment, or nothing. */
function trunkOnto(preset: EffectPreset, cast: ReturnType<typeof castOn>, seconds: number, onto = TARGET) {
  return boltsOnto(stagedAt(preset, cast, seconds), onto).find((ribbon) => ribbon.points[0].z > CELL * 2);
}

describe('a snap, a bolt of the lowest grade', () => {
  const snap = thunderPresetOf('bolt', 1, { durationMs: 1332 });
  const cast = castOn([TARGET]);
  const [strikes] = strokesOf(snap);

  it('gathers in the hand of its caster and feels its way across before it strikes, lighting nothing', () => {
    const drawn = stagedAt(snap, cast, strikes * 0.6);

    expect(drawn.ribbons.length).toBeGreaterThan(0);
    expect(drawn.ribbons.every((ribbon) => ribbon.points[0].x === HAND.x && ribbon.points[0].y === HAND.y)).toBe(true);
    expect(boltsBetween(drawn, HAND, TARGET)).toEqual([]);
    expect(drawn.lights).toEqual([]);
    expect(drawn.floor).toEqual([]);
  });

  it('cracks from the hand to the body of the target as it strikes, forking, and lights the table', () => {
    const drawn = stagedAt(snap, cast, strikes + 0.01);
    const [trunk] = boltsBetween(drawn, HAND, TARGET);

    expect(trunk).toBeDefined();
    expect(trunk.points[0].z).toBe(HAND.z);
    expect(trunk.points.at(-1)!.z).toBeGreaterThan(CELL * 0.3);
    expect(trunk.points.at(-1)!.z).toBeLessThan(CELL);
    expect(drawn.ribbons.filter((ribbon) => trunk.points.includes(ribbon.points[0] as never)).length).toBeGreaterThan(
      3
    );
    expect(Math.max(...drawn.lights.map((light) => light.strength))).toBeGreaterThan(0.7);
  });

  it('drops a short way out of the air onto the head of the piece where no one casts it', () => {
    const trunk = trunkOnto(snap, castOn([TARGET], false), strikes + 0.01)!;

    expect(trunk.points[0].z).toBeGreaterThan(CELL * 3.5);
    expect(trunk.points[0].z).toBeLessThan(CELL * 6);
    expect(Math.hypot(trunk.points[0].x - TARGET.x, trunk.points[0].y - TARGET.y)).toBeLessThan(CELL);
    expect(trunk.points.at(-1)!.z).toBeGreaterThan(CELL * 0.8);
  });

  it('strikes a second time along another path, its track glowing as colour between the two', () => {
    const first = boltsBetween(stagedAt(snap, cast, strikes + 0.01), HAND, TARGET)[0];
    const between = stagedAt(snap, cast, strikes + 0.09);
    const second = boltsBetween(stagedAt(snap, cast, strikes + 0.12), HAND, TARGET)[0];

    expect(boltsBetween(between, HAND, TARGET)).toEqual([]);
    expect(
      between.ribbons.some((ribbon) => ribbon.blend === 'color' && ribbon.points.length === first.points.length)
    ).toBe(true);
    expect(second.points[16]).not.toEqual(first.points[16]);
    expect(widestOf(second)).toBeLessThan(widestOf(first));
  });

  it('goes on crackling over the piece and the floor now and then until its thunder has died away', () => {
    let crackles = 0;
    let was = false;
    for (let seconds = strikes + 0.45; seconds < 1.332; seconds += 0.01) {
      const lit = stagedAt(snap, cast, seconds).ribbons.some((ribbon) => ribbon.blend === 'light');
      if (lit && !was) crackles++;
      was = lit;
    }

    expect(crackles).toBeGreaterThanOrEqual(3);
    expect(stagedAt(snap, cast, 1.4).ribbons).toEqual([]);
  });
});

describe('a strike, a bolt of the middle grade', () => {
  const strike = thunderPresetOf('bolt', 2);
  const cast = castOn([TARGET]);
  const [strikes] = strokesOf(strike);
  const lowestAt = (seconds: number) =>
    Math.min(...stagedAt(strike, cast, seconds).ribbons.flatMap((ribbon) => ribbon.points.map((point) => point.z)));

  it('darkens the floor under the target and closes a ring on it while it is seen coming', () => {
    const early = stagedAt(strike, cast, strikes * 0.3);
    const late = stagedAt(strike, cast, strikes * 0.9);
    const darkOf = (drawn: typeof early) => drawn.floor.find((mark) => mark.color === GLOOM)!;
    const ringOf = (drawn: typeof early) =>
      Math.max(...drawn.floor.filter((mark) => mark.shape === 'ring').map((mark) => mark.radius));

    expect(darkOf(early).blend).toBe('color');
    expect(darkOf(late).alpha).toBeGreaterThan(darkOf(early).alpha);
    expect(ringOf(late)).toBeLessThan(ringOf(early));
    expect(early.lights).toEqual([]);
  });

  it('sends a leader down out of the sky in steps, which does not reach the piece before the bolt does', () => {
    const steps = [0.15, 0.45, 0.75, 0.97].map((share) => lowestAt(strikes * share));

    expect(steps[1]).toBeLessThan(steps[0]);
    expect(steps[2]).toBeLessThan(steps[1]);
    expect(steps[3]).toBeGreaterThan(CELL * 0.9);
    expect(trunkOnto(strike, cast, strikes * 0.97)).toBeUndefined();
  });

  it('comes down from high over the target onto its head as one thick trunk with forks reaching for the floor', () => {
    const drawn = stagedAt(strike, cast, strikes);
    const trunk = boltsOnto(drawn, TARGET).find((ribbon) => ribbon.points[0].z > CELL * 2)!;
    const forks = drawn.ribbons.filter(
      (ribbon) => ribbon.blend === 'light' && ribbon !== trunk && trunk.points.includes(ribbon.points[0] as never)
    );

    expect(trunk.points[0].z).toBeGreaterThan(CELL * 8);
    expect(Math.hypot(trunk.points[0].x - TARGET.x, trunk.points[0].y - TARGET.y)).toBeLessThan(CELL);
    expect(trunk.points.at(-1)!.z).toBeGreaterThan(CELL * 0.8);
    expect(widestOf(trunk)).toBeGreaterThan(CELL * 0.25);
    expect(forks.length).toBeGreaterThanOrEqual(5);
    for (const fork of forks) expect(fork.points.at(-1)!.z).toBeLessThan(fork.points[0].z);
  });

  it('lays a dark sheath under the trunk, so that it reads on a bright floor', () => {
    const drawn = stagedAt(strike, cast, strikes);
    const trunk = boltsOnto(drawn, TARGET).find((ribbon) => ribbon.points[0].z > CELL * 2)!;
    const under = drawn.ribbons.filter(
      (ribbon) => ribbon.blend === 'color' && ribbon.points.length === trunk.points.length
    );

    expect(Math.max(...under.map(widestOf))).toBeGreaterThan(widestOf(trunk) * 2);
  });

  it('strikes three times, each along another path and each thinner than the last', () => {
    const strokes = [0, 0.16, 0.34].map((after) => trunkOnto(strike, cast, strikes + after + 0.01)!);

    expect(strokes.map(widestOf)).toEqual([...strokes.map(widestOf)].sort((a, b) => b - a));
    expect(new Set(strokes.map((stroke) => stroke.points[16].x)).size).toBe(3);
    expect(trunkOnto(strike, cast, strikes + 0.12)).toBeUndefined();
    expect(trunkOnto(strike, cast, strikes + 0.6)).toBeUndefined();
  });

  it('lights the table hard for the instant of each stroke and not between them', () => {
    const strongestAt = (after: number) =>
      Math.max(0, ...stagedAt(strike, cast, strikes + after).lights.map((light) => light.strength));

    expect(strongestAt(0)).toBeGreaterThan(1.2);
    expect(strongestAt(0.12)).toBe(0);
    expect(strongestAt(0.17)).toBeGreaterThan(0.6);
    expect(stagedAt(strike, cast, strikes).lights.length).toBeLessThanOrEqual(2);
  });

  it('sends discharges crawling out over the floor from where it struck, and sparks skittering low', () => {
    const drawn = stagedAt(strike, cast, strikes + 0.2);
    const crawling = drawn.ribbons.filter(
      (ribbon) =>
        ribbon.blend === 'light' &&
        liesOnFloor(ribbon) &&
        Math.hypot(ribbon.points[0].x - TARGET.x, ribbon.points[0].y - TARGET.y) < CELL * 0.2 &&
        Math.hypot(ribbon.points.at(-1)!.x - TARGET.x, ribbon.points.at(-1)!.y - TARGET.y) > CELL
    );
    const sparks = drawn.motes.filter((mote) => mote.shape === 'spark');

    expect(crawling.length).toBeGreaterThanOrEqual(5);
    expect(sparks.length).toBeGreaterThan(15);
    expect(Math.max(...sparks.map((spark) => spark.z))).toBeLessThan(CELL);
  });

  it('lifts the dark again, and leaves soot and what crackles on the piece', () => {
    const later = stagedAt(strike, cast, strikes + 1.2);

    expect(later.floor.some((mark) => mark.color === GLOOM && mark.alpha > 0)).toBe(false);
    expect(later.floor.some((mark) => mark.shape === 'disc' && mark.blend === 'color')).toBe(true);
  });
});

describe('a storm, a bolt of the highest grade', () => {
  const storm = thunderPresetOf('bolt', 3, { durationMs: 3048 });
  const cast = castOn([TARGET, OTHER]);
  const [strikes, last] = strokesOf(storm);

  it('gathers: the floor darkens under a cloud, and leaders come down out of it from several places', () => {
    const drawn = stagedAt(storm, castOn([TARGET]), strikes * 0.8);
    const leaders = drawn.ribbons.filter((ribbon) => ribbon.blend === 'light' && ribbon.points[0].z > CELL * 5);
    const starts = new Set(
      leaders.map((leader) => `${Math.round(leader.points[0].x)},${Math.round(leader.points[0].y)}`)
    );

    expect(drawn.floor.some((mark) => mark.color === GLOOM && mark.radius > CELL * 3)).toBe(true);
    expect(drawn.motes.filter((mote) => mote.blend === 'color' && mote.z > CELL * 5).length).toBeGreaterThan(8);
    expect(starts.size).toBeGreaterThanOrEqual(4);
    expect(trunkOnto(storm, castOn([TARGET]), strikes * 0.8)).toBeUndefined();
  });

  it('stands a column on the target from its first stroke to its last, in a new shape every twentieth of a second', () => {
    const shapes = new Set<number>();
    for (let seconds = strikes; seconds < last - 0.01; seconds += 0.05) {
      const trunk = trunkOnto(storm, castOn([TARGET]), seconds + 0.001);
      expect(trunk).toBeDefined();
      shapes.add(trunk!.points[16].x);
    }

    expect(shapes.size).toBeGreaterThan(15);
  });

  it('winds thinner trunks about the great one, and is far thicker than a strike', () => {
    const drawn = stagedAt(storm, castOn([TARGET]), strikes + 0.3);
    const trunks = boltsOnto(drawn, TARGET).filter((ribbon) => ribbon.points[0].z > CELL * 5);
    const strike = thunderPresetOf('bolt', 2);

    expect(trunks.length).toBeGreaterThanOrEqual(3);
    expect(widestOf(trunks[0])).toBeGreaterThan(widestOf(trunks[1]) * 1.5);
    expect(widestOf(trunks[0])).toBeGreaterThan(
      widestOf(trunkOnto(strike, castOn([TARGET]), strokesOf(strike)[0])!) * 1.3
    );
  });

  it('throws a fork off the column to every other piece the cast strikes', () => {
    const drawn = stagedAt(storm, cast, strikes + 0.1);
    const forks = boltsOnto(drawn, OTHER).filter(
      (ribbon) => Math.hypot(ribbon.points[0].x - TARGET.x, ribbon.points[0].y - TARGET.y) < CELL * 1.5
    );

    expect(forks.length).toBeGreaterThan(0);
    expect(forks[0].points[0].z).toBeGreaterThan(CELL);
  });

  it('ends in a last stroke thicker than the column, with rings racing out along the floor', () => {
    const standing = trunkOnto(storm, castOn([TARGET]), last - 0.2)!;
    const ending = trunkOnto(storm, castOn([TARGET]), last + 0.01)!;
    const drawn = stagedAt(storm, castOn([TARGET]), last + 0.1);

    expect(widestOf(ending)).toBeGreaterThan(widestOf(standing) * 1.3);
    expect(drawn.floor.filter((mark) => mark.shape === 'ring' && mark.blend === 'light').length).toBeGreaterThanOrEqual(
      2
    );
  });

  it('goes on dropping bolts about the place after it, until its thunder has rolled away', () => {
    const only = castOn([TARGET]);
    let aftershocks = 0;
    let was = false;
    for (let seconds = last + 0.3; seconds < 3.048; seconds += 0.01) {
      const falls = stagedAt(storm, only, seconds).ribbons.some(
        (ribbon) =>
          ribbon.blend === 'light' &&
          ribbon.points[0].z > CELL * 5 &&
          Math.hypot(ribbon.points.at(-1)!.x - TARGET.x, ribbon.points.at(-1)!.y - TARGET.y) > CELL * 0.6
      );
      if (falls && !was) aftershocks++;
      was = falls;
    }

    expect(aftershocks).toBeGreaterThanOrEqual(4);
  });

  it('thins the dark and the cloud away as the thunder ends, and leaves the soot to cool', () => {
    const drawn = stagedAt(storm, castOn([TARGET]), 3.048 + 1.2);

    expect(drawn.floor.some((mark) => mark.color === GLOOM)).toBe(false);
    expect(drawn.motes.filter((mote) => mote.z > CELL * 5)).toEqual([]);
    expect(drawn.ribbons).toEqual([]);
    expect(drawn.floor.some((mark) => mark.shape === 'disc' && mark.blend === 'color')).toBe(true);
  });
});

describe('the bolt a shot or a great blade lands in', () => {
  it('lands a shot of any grade in the least of the bolts, dropped a short way onto where it struck', () => {
    const shot = thunderPresetOf('projectile', 3, { impactKind: 'bolt', tagName: '射撃', durationMs: 850 });
    const lands = effectBlowsOf(shot)[0].atMs / 1000;
    const drawn = stagedAt(shot, castOn([TARGET]), lands + 0.02);
    const trunk = boltsOnto(drawn, TARGET).find((ribbon) => ribbon.points[0].z > CELL * 2)!;

    expect(trunk.points[0].z).toBeLessThan(CELL * 7);
    expect(drawn.floor.some((mark) => mark.color === GLOOM)).toBe(false);
    expect(boltsBetween(drawn, HAND, TARGET)).toEqual([]);
  });

  it('lands a great blade of the highest grade in a storm that strikes at once', () => {
    const blade = thunderPresetOf('skyblade', 3, { impactKind: 'bolt', durationMs: 3000 });
    const lands = effectBlowsOf(blade)[0].atMs / 1000;
    const trunk = trunkOnto(blade, castOn([TARGET]), lands + 0.02);

    expect(trunk).toBeDefined();
    expect(trunk!.points[0].z).toBeGreaterThan(CELL * 5);
  });
});
