import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { lerpPoint } from '@axe/domain/effect/scene/parts';
import { drawGunShot } from '@axe/domain/effect/scene/shot/gun-shot';
import type { FiredShot } from '@axe/domain/effect/scene/shot/shot-flight';
import { drawSniperShot } from '@axe/domain/effect/scene/shot/sniper-shot';

const CELL = 50;
const RAMP = rampOf('#ffd98a', '#ff9a3c', 7);
const MUZZLE = { x: 100, y: 300, z: 30 };
const BODY = { x: 500, y: 300, z: 27 };
const ENDS = 2.4;

function firedOf(seconds: number, fields: Partial<FiredShot> = {}): FiredShot {
  return {
    from: MUZZLE,
    to: BODY,
    aim: BODY,
    cell: CELL,
    floorZ: 0,
    seconds,
    launch: 0,
    lands: 0.13,
    ends: ENDS,
    index: 0,
    shots: 1,
    seed: 5,
    grade: 1,
    landsIn: 'impact',
    pathAt: (along) => lerpPoint(MUZZLE, BODY, along),
    ...fields,
  };
}

function roundAt(seconds: number, fields: Partial<FiredShot> = {}): Staged {
  const drawn = nothingStaged();
  drawGunShot(drawn, firedOf(seconds, fields), RAMP);
  return drawn;
}

function sniperAt(seconds: number, fields: Partial<FiredShot> = {}): Staged {
  const drawn = nothingStaged();
  drawSniperShot(drawn, firedOf(seconds, { launch: 0.3, lands: 0.37, grade: 3, ...fields }), RAMP);
  return drawn;
}

/** The tongues of a flash: bands of four points rooted at the muzzle and drawn to a point. */
const tonguesOf = (drawn: Staged) =>
  drawn.ribbons.filter(
    (ribbon) => ribbon.points.length === 4 && ribbon.points[0].x === MUZZLE.x && (ribbon.widths as number[])[3] === 0
  );
const casingOf = (drawn: Staged) => drawn.motes.find((mote) => mote.shape === 'chunk' && mote.color.startsWith('#'));
const linesOf = (drawn: Staged) => drawn.ribbons.filter((ribbon) => ribbon.points.length === 2 && !ribbon.about);
const jetsOf = (drawn: Staged) => drawn.motes.filter((mote) => mote.shape === 'jet');
const sparksOf = (drawn: Staged) => drawn.motes.filter((mote) => mote.shape === 'spark');
const ringsOf = (drawn: Staged) => drawn.ribbons.filter((ribbon) => ribbon.half !== undefined);

describe('a round fired from a gun', () => {
  it('flashes at the muzzle as tongues of flame drawn to a point, the longest thrown forward, and is dark again in a moment', () => {
    const flash = roundAt(0.02);
    const reach = (index: number): number => tonguesOf(flash)[index].points[3].x - MUZZLE.x;

    expect(tonguesOf(flash)).toHaveLength(12);
    expect(reach(0)).toBeGreaterThan(CELL);
    expect(reach(0)).toBeGreaterThan(reach(3) * 1.5);
    expect(flash.floor.some((mark) => mark.blend === 'light' && mark.x === MUZZLE.x)).toBe(true);
    expect(tonguesOf(roundAt(0.2))).toHaveLength(0);
  });

  it('throws its casing out to one side, which falls, comes to lie and is gone as the look clears', () => {
    const flying = casingOf(roundAt(0.15, { lands: 5 }))!;
    const lying = casingOf(roundAt(1.2, { lands: 5 }))!;
    const later = casingOf(roundAt(1.6, { lands: 5 }))!;

    expect(flying.z).toBeGreaterThan(CELL * 0.3);
    expect(Math.abs(lying.y - MUZZLE.y)).toBeGreaterThan(CELL * 0.5);
    expect(lying.z).toBeLessThan(CELL * 0.2);
    expect([later.x, later.y, later.z, later.spin]).toEqual([lying.x, lying.y, lying.z, lying.spin]);
    expect(casingOf(roundAt(ENDS, { lands: 5 }))).toBeUndefined();
  });

  it('leaves the line it flew hanging in the air after it has struck, fading away', () => {
    const hung = linesOf(roundAt(0.2)).filter((ribbon) => ribbon.points[1].x === BODY.x);
    const fainter = linesOf(roundAt(0.4)).filter((ribbon) => ribbon.points[1].x === BODY.x);

    expect(hung.length).toBeGreaterThan(0);
    expect(fainter[0].alpha).toBeLessThan(hung[0].alpha);
    expect(linesOf(roundAt(0.7))).toHaveLength(0);
  });

  it('sprays sparks back the way it came where it strikes a body, and pocks the ground behind it', () => {
    const struck = roundAt(0.17);
    const pocks = struck.floor.filter((mark) => mark.shape === 'cracks');

    expect(sparksOf(struck).length).toBeGreaterThan(8);
    expect(sparksOf(struck).filter((spark) => spark.x < BODY.x).length).toBeGreaterThan(sparksOf(struck).length * 0.7);
    expect(pocks).toHaveLength(1);
    expect(pocks[0].x).toBeGreaterThan(BODY.x);
    expect(jetsOf(struck)).toHaveLength(0);
    expect(ringsOf(struck)).toHaveLength(0);
    expect(roundAt(1.5).floor.some((mark) => mark.shape === 'cracks')).toBe(true);
  });

  it('curls smoke up off where it struck a body, which climbs and is gone well before the look clears', () => {
    const curlOf = (seconds: number) =>
      roundAt(seconds).motes.filter(
        (mote) => mote.shape === 'smoke' && Math.abs(mote.x - BODY.x) < CELL && mote.z > BODY.z + CELL * 0.6
      );

    expect(curlOf(0.8).length).toBeGreaterThan(1);
    expect(curlOf(1.95)).toHaveLength(0);
  });

  it('sends a heavy round through, a ring opening about it, into the ground behind in a jet of dirt', () => {
    const through = roundAt(0.2, { landsIn: 'rubble', grade: 2 });

    expect(ringsOf(through).length).toBeGreaterThan(0);
    expect(jetsOf(through).length).toBeGreaterThan(0);
    for (const jet of jetsOf(through)) expect(jet.x).toBeGreaterThan(BODY.x + CELL);
  });

  it('walks a long burst of heavy rounds up the ground onto the body, none of the dirt thrown up over it', () => {
    const burst = { landsIn: 'rubble', grade: 3 as const, shots: 14 };
    const jetOf = (index: number) => jetsOf(roundAt(0.15, { ...burst, index, lands: 0.13 }));
    const firstAt = jetOf(0)[0].x;
    const laterAt = jetOf(5)[0].x;

    expect(firstAt).toBeLessThan(BODY.x - CELL * 2);
    expect(laterAt).toBeGreaterThan(firstAt);
    for (let index = 0; index < 14; index++) {
      for (const jet of jetOf(index)) expect(Math.abs(jet.x - BODY.x)).toBeGreaterThan(CELL * 0.7);
    }
    expect(sparksOf(roundAt(0.15, { ...burst, index: 13 })).some((spark) => Math.abs(spark.x - BODY.x) < CELL)).toBe(
      true
    );
  });

  it('rattles: each round of a burst leaves the muzzle a little off the last, and every third of a heavy burst is a tracer', () => {
    const lineOf = (index: number, landsIn: string) =>
      roundAt(0.06, { shots: 10, index, landsIn, lands: 0.13 }).ribbons.filter(
        (ribbon) => ribbon.points.length === 4 && (ribbon.widths as number[])[3] > 0
      )[1];

    expect(lineOf(1, 'impact').points[0]).not.toEqual(lineOf(2, 'impact').points[0]);
    expect(lineOf(3, 'rubble').color).not.toBe(lineOf(4, 'rubble').color);
    expect(lineOf(4, 'rubble').color).toBe(lineOf(5, 'rubble').color);
  });

  it('draws nothing under the floor and nothing that is not a number', () => {
    for (const fields of [{}, { landsIn: 'rubble', grade: 3 as const }, { landsIn: 'rubble', shots: 14, index: 2 }]) {
      for (let seconds = 0; seconds < ENDS; seconds += 0.03) {
        const drawn = roundAt(seconds, fields);
        for (const mote of drawn.motes) expect(Number.isFinite(mote.x + mote.y + mote.z + mote.size)).toBe(true);
        for (const mote of drawn.motes) expect(mote.z).toBeGreaterThanOrEqual(-CELL * 0.4);
        for (const ribbon of drawn.ribbons)
          for (const point of ribbon.points) expect(point.z).toBeGreaterThanOrEqual(-1);
      }
    }
  });
});

describe("a sniper's shot", () => {
  it('is aimed before it is fired: a thread of red to a dot on the target, and no flash', () => {
    const aiming = sniperAt(0.15);

    expect(aiming.ribbons.every((ribbon) => ribbon.color === '#ff2a22')).toBe(true);
    expect(aiming.ribbons.length).toBeGreaterThan(0);
    expect(aiming.motes.some((mote) => Math.hypot(mote.x - BODY.x, mote.y - BODY.y) < CELL * 0.3)).toBe(true);
    expect(aiming.lights).toHaveLength(0);
    expect(sniperAt(0.001).ribbons.length).toBeGreaterThan(0);
  });

  it('stands its whole line white at once as it fires, straight through the target and on past it', () => {
    const fired = sniperAt(0.32);
    const line = fired.ribbons.filter((ribbon) => ribbon.points.length === 3 && ribbon.color === '#ffffff');
    const slope = (BODY.z - MUZZLE.z) / (BODY.x - MUZZLE.x);

    expect(line).toHaveLength(1);
    expect(line[0].points[0]).toEqual(MUZZLE);
    expect(line[0].points[1]).toEqual(BODY);
    expect(line[0].points[2].x).toBeGreaterThan(BODY.x + CELL);
    expect(line[0].points[2].z).toBeCloseTo(BODY.z + slope * (line[0].points[2].x - BODY.x), 6);
    expect(fired.lights.length).toBeGreaterThan(0);
  });

  it('leaves its line as a trail of vapour that swells and thins long after it has struck', () => {
    const vapourOf = (seconds: number) => sniperAt(seconds).ribbons.filter((ribbon) => ribbon.points.length === 15);
    const fresh = vapourOf(0.5)[0];
    const old = vapourOf(1.3)[0];

    expect(old.widths as number).toBeGreaterThan(fresh.widths as number);
    expect(old.alpha).toBeLessThan(fresh.alpha);
    expect(vapourOf(1.7)).toHaveLength(0);
  });

  it('sprays on behind the target as well as back from it, and throws a jet of dirt where it buries itself', () => {
    const struck = sniperAt(0.42);
    const sparks = sparksOf(struck);

    expect(sparks.filter((spark) => spark.x > BODY.x).length).toBeGreaterThan(10);
    expect(sparks.filter((spark) => spark.x < BODY.x).length).toBeGreaterThan(10);
    expect(jetsOf(struck).every((jet) => jet.x > BODY.x + CELL)).toBe(true);
    expect(jetsOf(struck).length).toBeGreaterThan(0);
  });
});
