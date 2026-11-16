import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { lerpPoint } from '@axe/domain/effect/scene/parts';
import { drawGunShot } from '@axe/domain/effect/scene/shot/gun-shot';
import type { FiredShot } from '@axe/domain/effect/scene/shot/shot-flight';

const CELL = 50;
const RAMP = rampOf('#ffe9b0', '#ff8a2b', 7);
const MUZZLE = { x: 100, y: 300, z: 30 };
const BODY = { x: 500, y: 300, z: 27 };
const SHOTS = 10;

function roundAt(seconds: number, index: number, fields: Partial<FiredShot> = {}): Staged {
  const drawn = nothingStaged();
  drawGunShot(
    drawn,
    {
      from: MUZZLE,
      to: BODY,
      aim: BODY,
      cell: CELL,
      floorZ: 0,
      seconds,
      launch: 0,
      lands: 0.1,
      ends: 2.4,
      index,
      shots: SHOTS,
      seed: 5,
      grade: 2,
      landsIn: 'impact',
      pathAt: (along) => lerpPoint(MUZZLE, BODY, along),
      ...fields,
    },
    RAMP
  );
  return drawn;
}

/** Where a round struck: the middle of the white heart of its flash. */
const struckAt = (drawn: Staged) =>
  drawn.motes.find((mote) => mote.shape === 'puff' && mote.color === '#ffffff' && Math.abs(mote.x - MUZZLE.x) > CELL);

describe('a burst of light rounds', () => {
  it('strobes at the muzzle: a flash for every round, gone before the next is fired', () => {
    const flashOf = (seconds: number) =>
      roundAt(seconds, 0).motes.filter(
        (mote) => mote.shape === 'puff' && mote.color === '#ffffff' && Math.abs(mote.x - MUZZLE.x) < CELL * 0.4
      );

    expect(flashOf(0.02).length).toBeGreaterThan(0);
    expect(Math.max(...flashOf(0.02).map((mote) => mote.size))).toBeGreaterThan(CELL * 0.4);
    expect(flashOf(0.08)).toEqual([]);
  });

  it('flies every round as a tracer that glows about its streak, and hangs its line for a moment once it has struck', () => {
    const flying = roundAt(0.06, 3);
    const glows = flying.ribbons.filter((ribbon) => ribbon.blend === 'light' && ribbon.points.length === 2);
    const hung = roundAt(0.15, 3).ribbons.filter((ribbon) => ribbon.points.length === 2);

    expect(glows.length).toBe(1);
    expect(hung.length).toBeGreaterThan(0);
    expect(roundAt(0.3, 3).ribbons.filter((ribbon) => ribbon.points.length === 2)).toEqual([]);
  });

  it('walks its hits across the body of the target from one side to the other', () => {
    const across = (index: number) => struckAt(roundAt(0.12, index))!.y - BODY.y;

    expect(Math.sign(across(0))).not.toBe(Math.sign(across(8)));
    expect(Math.abs(across(0) - across(8))).toBeGreaterThan(CELL * 0.4);
  });

  it('kicks dirt up off the ground beside the target with every fourth round', () => {
    const jets = (index: number) => roundAt(0.2, index).motes.filter((mote) => mote.shape === 'jet');

    expect(jets(3).length).toBeGreaterThan(0);
    expect(jets(2)).toEqual([]);
  });

  it('draws nothing under the floor and nothing that is not a number', () => {
    for (let index = 0; index < SHOTS; index++) {
      for (let seconds = 0; seconds < 2.4; seconds += 0.05) {
        const drawn = roundAt(seconds, index);
        for (const mote of drawn.motes) expect(Number.isFinite(mote.x + mote.y + mote.z + mote.size)).toBe(true);
        for (const mote of drawn.motes) expect(mote.z).toBeGreaterThanOrEqual(-CELL * 0.4);
        for (const ribbon of drawn.ribbons)
          for (const point of ribbon.points) expect(point.z).toBeGreaterThanOrEqual(-1);
      }
    }
  });
});
