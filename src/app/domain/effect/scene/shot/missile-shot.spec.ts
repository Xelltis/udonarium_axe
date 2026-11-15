import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { lerpPoint } from '@axe/domain/effect/scene/parts';
import { drawCruiseShot, drawMissileShot } from '@axe/domain/effect/scene/shot/missile-shot';
import type { FiredShot } from '@axe/domain/effect/scene/shot/shot-flight';

const CELL = 50;
const RAMP = rampOf('#ffe6a8', '#ff6a2b', 7);
const TUBE = { x: 100, y: 300, z: 30 };
const MARK = { x: 600, y: 300, z: 27 };
const ENDS = 4.2;
const LANDS = 0.42;

function firedOf(seconds: number, fields: Partial<FiredShot>): FiredShot {
  return {
    from: TUBE,
    to: MARK,
    aim: MARK,
    cell: CELL,
    floorZ: 0,
    seconds,
    launch: 0,
    lands: LANDS,
    ends: ENDS,
    index: 0,
    shots: 1,
    seed: 5,
    grade: 2,
    landsIn: 'burst',
    pathAt: (along) => lerpPoint(TUBE, MARK, along),
    ...fields,
  };
}

function missileAt(seconds: number, fields: Partial<FiredShot> = {}): Staged {
  const drawn = nothingStaged();
  drawMissileShot(drawn, firedOf(seconds, fields), RAMP);
  return drawn;
}

function cruiseAt(seconds: number, fields: Partial<FiredShot> = {}): Staged {
  const drawn = nothingStaged();
  drawCruiseShot(drawn, firedOf(seconds, { lands: 1.4, grade: 3, ...fields }), RAMP);
  return drawn;
}

const smokeOf = (drawn: Staged) => drawn.motes.filter((mote) => mote.shape === 'smoke' && mote.x > TUBE.x + CELL);
const flamesOf = (drawn: Staged) => drawn.motes.filter((mote) => mote.shape === 'lick');
const noseOf = (drawn: Staged) =>
  drawn.ribbons.find((ribbon) => ribbon.blend === 'color' && !ribbon.soft)!.points.at(-1)!;

describe('a missile', () => {
  it('leaves slowly and comes in fast, a flame streaming from its motor', () => {
    const early = noseOf(missileAt(LANDS * 0.25)).x - TUBE.x;
    const late = noseOf(missileAt(LANDS * 0.75)).x - noseOf(missileAt(LANDS * 0.5)).x;

    expect(early).toBeLessThan(late);
    expect(flamesOf(missileAt(LANDS * 0.5))).toHaveLength(2);
    expect(flamesOf(missileAt(LANDS + 0.1))).toHaveLength(0);
  });

  it('leaves a trail of smoke along the whole of its way, which hangs long after it has struck and thins away', () => {
    const flying = smokeOf(missileAt(LANDS * 0.9));
    const hanging = smokeOf(missileAt(LANDS + 0.8));
    const alphaOf = (motes: readonly { alpha: number }[]) => Math.max(...motes.map((mote) => mote.alpha));

    expect(flying.length).toBeGreaterThan(30);
    expect(hanging.length).toBeGreaterThan(15);
    expect(Math.max(...hanging.map((mote) => mote.x))).toBeGreaterThan(MARK.x - CELL * 2);
    expect(alphaOf(hanging)).toBeLessThan(alphaOf(flying));
    expect(smokeOf(missileAt(LANDS + 1.7))).toHaveLength(0);
  });

  it('swells its smoke as it ages, the oldest of it the widest', () => {
    const trail = missileAt(LANDS).ribbons.find((ribbon) => ribbon.soft === 0.7)!;
    const widths = trail.widths as number[];

    expect(widths[0]).toBeGreaterThan(widths.at(-1)! * 1.5);
  });

  it('winds the missiles of a swarm off their courses, each its own way, and flies one alone straight', () => {
    const alone = noseOf(missileAt(LANDS * 0.5));
    const first = noseOf(missileAt(LANDS * 0.5, { shots: 12, index: 0 }));
    const second = noseOf(missileAt(LANDS * 0.5, { shots: 12, index: 1 }));

    expect(alone.y).toBeCloseTo(TUBE.y, 3);
    expect(Math.hypot(first.y - TUBE.y, first.z - 28.5)).toBeGreaterThan(CELL * 0.2);
    expect(Math.hypot(first.y - second.y, first.z - second.z)).toBeGreaterThan(CELL * 0.2);
  });

  it('lays the trail of each of a swarm in fewer puffs than that of one alone', () => {
    expect(smokeOf(missileAt(LANDS, { shots: 12 })).length).toBeLessThan(smokeOf(missileAt(LANDS)).length * 0.6);
  });

  it('closes a red ring on what a cruise missile has found, and none under a missile', () => {
    const ringed = (drawn: Staged) => drawn.floor.filter((mark) => mark.shape === 'sigil');
    const early = ringed(cruiseAt(0.7))[0];
    const late = ringed(cruiseAt(1.3))[0];

    expect(ringed(cruiseAt(0.2))).toHaveLength(0);
    expect(late.radius).toBeLessThan(early.radius);
    expect([early.x, early.y]).toEqual([MARK.x, MARK.y]);
    expect(ringed(missileAt(LANDS * 0.8))).toHaveLength(0);
    expect(ringed(cruiseAt(1.45))).toHaveLength(0);
  });

  it('draws nothing under the floor, its flame cut short where it would reach it', () => {
    const low = {
      from: { ...TUBE, z: 6 },
      pathAt: (along: number) => lerpPoint({ ...TUBE, z: 6 }, { ...MARK, z: 300 }, along),
    };
    for (let seconds = 0; seconds < 2.5; seconds += 0.03) {
      for (const drawn of [
        missileAt(seconds, low),
        cruiseAt(seconds, low),
        missileAt(seconds, { shots: 12, index: 3 }),
      ]) {
        for (const mote of drawn.motes) expect(mote.z).toBeGreaterThanOrEqual(-CELL * 0.4);
        for (const ribbon of drawn.ribbons)
          for (const point of ribbon.points) expect(point.z).toBeGreaterThanOrEqual(-1);
      }
    }
  });
});
