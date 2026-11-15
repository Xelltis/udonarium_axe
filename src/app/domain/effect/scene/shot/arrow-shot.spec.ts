import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { lerpPoint } from '@axe/domain/effect/scene/parts';
import { drawArrowShot } from '@axe/domain/effect/scene/shot/arrow-shot';
import type { FiredShot } from '@axe/domain/effect/scene/shot/shot-flight';

const CELL = 50;
const RAMP = rampOf('#e6ecf2', '#8a6a3c', 7);
const BOW = { x: 100, y: 300, z: 30 };
const BODY = { x: 500, y: 300, z: 27 };
const ENDS = 2.4;
const LANDS = 0.26;
const FEATHER = '#f2ece0';

function arrowAt(seconds: number, fields: Partial<FiredShot> = {}): Staged {
  const drawn = nothingStaged();
  drawArrowShot(
    drawn,
    {
      from: BOW,
      to: BODY,
      aim: BODY,
      cell: CELL,
      floorZ: 0,
      seconds,
      launch: 0,
      lands: LANDS,
      ends: ENDS,
      index: 0,
      shots: 1,
      seed: 5,
      grade: 1,
      landsIn: 'impact',
      pathAt: (along) => lerpPoint(BOW, BODY, along),
      ...fields,
    },
    RAMP
  );
  return drawn;
}

/** The feathers of every arrow drawn: one band each, of three points. */
const feathersOf = (drawn: Staged) => drawn.ribbons.filter((ribbon) => ribbon.color === FEATHER);
const ringsOf = (drawn: Staged) => drawn.ribbons.filter((ribbon) => ribbon.half !== undefined);

describe('an arrow shot from a bow', () => {
  it('flies on a low arc, large enough to be seen, lines of speed drawn out behind it', () => {
    const midway = arrowAt(LANDS / 2);
    const feathers = feathersOf(midway)[0];
    const speed = midway.ribbons.filter((ribbon) => ribbon.color === '#ffffff' && ribbon.points.length === 2);

    expect(feathers.points[0].z).toBeGreaterThan(BOW.z + CELL * 0.3);
    expect(feathers.points[0].x).toBeGreaterThan(BOW.x + CELL);
    expect(feathers.points[0].x).toBeLessThan(BODY.x - CELL * 3);
    expect(speed).toHaveLength(2);
    expect(Math.abs(speed[0].points[1].x - speed[0].points[0].x)).toBeGreaterThan(CELL * 2);
  });

  it('is left standing in what it struck, quivering at first and then still, until the look clears', () => {
    const tailAt = (seconds: number) => feathersOf(arrowAt(seconds))[0].points[0];

    expect(feathersOf(arrowAt(LANDS + 0.01))).toHaveLength(1);
    expect(tailAt(LANDS + 0.03)).not.toEqual(tailAt(LANDS + 0.05));
    expect(tailAt(LANDS + 1.2).z).toBeCloseTo(tailAt(LANDS + 1.5).z, 1);
    expect(tailAt(1.5).x).toBeLessThan(BODY.x);
    expect(feathersOf(arrowAt(ENDS - 0.2))[0].alpha).toBeLessThan(0.6);
    expect(feathersOf(arrowAt(ENDS))[0].alpha).toBe(0);
  });

  it('strikes with splinters and dust, and no ring: it does not go through', () => {
    const struck = arrowAt(LANDS + 0.05);

    expect(struck.motes.filter((mote) => mote.shape === 'flake').length).toBeGreaterThan(3);
    expect(struck.motes.some((mote) => mote.shape === 'smoke')).toBe(true);
    expect(ringsOf(struck)).toHaveLength(0);
  });

  it('goes through at the highest grade: rings open about it, it flies on and stands in the ground beyond', () => {
    const through = { grade: 3 as const };
    const passing = arrowAt(LANDS + 0.04, through);
    const stuck = arrowAt(LANDS + 0.6, through);

    expect(ringsOf(passing).length).toBeGreaterThan(0);
    expect(feathersOf(passing)[0].points[2].x).toBeGreaterThan(BODY.x - CELL * 2);
    expect(feathersOf(passing)[0].points[2].x).toBeLessThan(BODY.x + CELL * 3);
    expect(feathersOf(stuck)).toHaveLength(1);
    expect(feathersOf(stuck)[0].points[0].x).toBeGreaterThan(BODY.x + CELL);
    expect(stuck.floor.some((mark) => mark.shape === 'cracks' && mark.x > BODY.x + CELL * 2)).toBe(true);
  });

  it('holds an arrow that goes through drawn at the bow for a breath, light running in to its head, and looses any other at once', () => {
    const through = { grade: 3 as const };
    const tailOf = (seconds: number, fields: Partial<FiredShot> = {}): number =>
      feathersOf(arrowAt(seconds, fields))[0].points[0].x;

    expect(tailOf(0.08, through)).toBeLessThanOrEqual(tailOf(0.02, through));
    expect(arrowAt(0.05, through).motes.filter((mote) => mote.shape === 'spark').length).toBeGreaterThan(3);
    expect(tailOf(0.16, through)).toBeGreaterThan(tailOf(0.08, through) + CELL);
    expect(tailOf(0.08)).toBeGreaterThan(tailOf(0.02) + CELL);
  });

  it('hangs the line an arrow that goes through flew in the air behind it, and none behind one that does not', () => {
    const lineOf = (drawn: Staged) =>
      drawn.ribbons.filter(
        (ribbon) => ribbon.points.length === 2 && ribbon.points[0].x === BOW.x && ribbon.soft === 0.7
      );

    expect(lineOf(arrowAt(LANDS + 0.1, { grade: 3 }))).toHaveLength(1);
    expect(lineOf(arrowAt(LANDS + 0.1))).toHaveLength(0);
    expect(lineOf(arrowAt(LANDS + 0.7, { grade: 3 }))).toHaveLength(0);
  });

  it('draws nothing under the floor', () => {
    for (const grade of [1, 3] as const) {
      for (let seconds = 0; seconds < ENDS; seconds += 0.03) {
        const drawn = arrowAt(seconds, { grade });
        for (const mote of drawn.motes) expect(mote.z).toBeGreaterThanOrEqual(-CELL * 0.4);
        for (const ribbon of drawn.ribbons) {
          for (const point of ribbon.points) expect(point.z).toBeGreaterThanOrEqual(-CELL * 0.4);
        }
      }
    }
  });
});
