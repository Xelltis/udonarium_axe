import { moteAt, seededRun, type ThrownMote } from '@axe/domain/effect/scene/effect-sim';

function spark(fields: Partial<ThrownMote> = {}): ThrownMote {
  return {
    x: 0,
    y: 0,
    z: 20,
    vx: 300,
    vy: 0,
    vz: 200,
    bornAt: 0.1,
    life: 2,
    gravity: 950,
    drag: 2,
    bounce: 0.4,
    floorZ: 0,
    ...fields,
  };
}

describe('moteAt()', () => {
  it('is nowhere before it is thrown or once it is gone', () => {
    expect(moteAt(spark(), 0.05)).toBeNull();
    expect(moteAt(spark(), 2.2)).toBeNull();
    expect(moteAt(spark(), 0.1)).not.toBeNull();
  });

  it('is at the same place at the same moment however it was asked before', () => {
    const asked = spark();
    for (const at of [0.2, 0.5, 0.9]) moteAt(asked, at);
    const fresh = moteAt(spark(), 0.9)!;

    expect(moteAt(asked, 0.9)).toEqual(fresh);
    expect(moteAt(asked, 0.4)).toEqual(moteAt(spark(), 0.4));
  });

  it('flies out fast and slows as the air takes its speed', () => {
    const early = moteAt(spark({ gravity: 0 }), 0.15)!;
    const late = moteAt(spark({ gravity: 0 }), 1)!;

    expect(Math.abs(late.vx)).toBeLessThan(Math.abs(early.vx) / 3);
  });

  it('falls to the floor, never through it, bounces off it, and comes to rest on it', () => {
    const thrown = spark();
    let bounced = false;
    let lastVz = 0;
    for (let at = 0.1; at < 2; at += 0.01) {
      const state = moteAt(thrown, at)!;
      expect(state.z).toBeGreaterThanOrEqual(0);
      if (lastVz < 0 && state.vz > 0) bounced = true;
      lastVz = state.vz;
    }
    expect(bounced).toBe(true);
    expect(moteAt(thrown, 1.9)!.landed).toBe(true);
  });

  it('rises where it is pulled the other way, as smoke and embers do, and is never stopped by the floor', () => {
    const smoke = moteAt(spark({ vx: 0, vz: 0, gravity: -80, drag: 1 }), 1.5)!;

    expect(smoke.z).toBeGreaterThan(20);
    expect(smoke.landed).toBe(false);
  });

  it('says how far through its life it is', () => {
    expect(moteAt(spark(), 1.1)!.age).toBeCloseTo(0.5);
  });
});

describe('seededRun()', () => {
  it('gives the same numbers for the same seed, and others for another', () => {
    const take = (seed: number) => {
      const next = seededRun(seed);
      return [next(), next(), next()];
    };

    expect(take(7)).toEqual(take(7));
    expect(take(7)).not.toEqual(take(8));
    expect(take(7).every((value) => value >= 0 && value < 1)).toBe(true);
  });
});
