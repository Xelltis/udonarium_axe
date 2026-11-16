import { breathTimingOf } from '@axe/domain/effect/breath-timing';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectKind } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { effectJoltsOf, joltsEndOf } from '@axe/domain/effect/effect-reaction';
import { tornadoTimingOf } from '@axe/domain/effect/wind-looks';

const CELL = 50;

function makePreset(kind: EffectKind, grade = 2): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = kind;
  preset.grade = grade;
  preset.durationMs = 1000;
  return preset;
}

function cast(origin: { x: number; y: number; z: number } | null): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: 'caster',
    origin,
    targets: [{ identifier: 'target', x: 100, y: 0, z: 0 }],
    seed: 1,
  };
}

describe('effectJoltsOf()', () => {
  it('holds the struck piece still as the blow lands, then throws it back away from the one who struck', () => {
    const burst = makePreset('burst');
    const [blow] = effectBlowsOf(burst);
    const from = cast({ x: 0, y: 0, z: 0 });

    expect(effectJoltsOf(burst, from, blow.atMs, CELL).get('target')).toBeUndefined();
    const thrown = effectJoltsOf(burst, from, blow.atMs + 60, CELL).get('target')!;
    expect(thrown.x).toBeGreaterThan(0);
    expect(thrown.y).toBeCloseTo(0);
    expect(effectJoltsOf(burst, from, blow.atMs + 1000, CELL).get('target')).toBeUndefined();
  });

  it('throws the piece further at the higher grades', () => {
    const at = (grade: number) => {
      const preset = makePreset('burst', grade);
      return effectJoltsOf(preset, cast({ x: 0, y: 0, z: 0 }), effectBlowsOf(preset)[0].atMs + 60, CELL).get('target')!
        .x;
    };

    expect(at(1)).toBeLessThan(at(3));
  });

  it('presses a piece struck from no direction down instead', () => {
    const bolt = makePreset('burst');
    const jolt = effectJoltsOf(bolt, cast(null), effectBlowsOf(bolt)[0].atMs + 60, CELL).get('target')!;

    expect([jolt.x, jolt.y]).toEqual([0, 0]);
    expect(jolt.z).toBeLessThan(0);
  });

  it('throws a piece up off the floor where the ground heaves under it, whoever cast it and from wherever', () => {
    for (const kind of ['upheaval', 'rubble'] as const) {
      const preset = makePreset(kind, 3);
      const at = effectBlowsOf(preset)[0].atMs + 60;
      for (const origin of [{ x: 0, y: 0, z: 0 }, null]) {
        const jolt = effectJoltsOf(preset, cast(origin), at, CELL).get('target')!;

        expect([kind, jolt.x, jolt.y]).toEqual([kind, 0, 0]);
        expect(jolt.z).toBeGreaterThan(0);
      }
    }
  });

  it('throws a piece over the floor, not up, where a great sword lands in an upheaval', () => {
    const blade = makePreset('skyblade', 3);
    blade.impactKind = 'upheaval';
    const jolt = effectJoltsOf(blade, cast({ x: 0, y: 0, z: 0 }), effectBlowsOf(blade)[0].atMs + 60, CELL).get(
      'target'
    )!;

    expect(Math.hypot(jolt.x, jolt.y)).toBeGreaterThan(0);
    expect(jolt.z).toBe(0);
  });

  it('throws a piece back from a cut, but presses it down under a cleave from overhead', () => {
    const from = cast({ x: 0, y: 0, z: 0 });
    const joltOf = (slashStyle: string) => {
      const cut = makePreset('slash', 3);
      cut.slashStyle = slashStyle;
      return effectJoltsOf(cut, from, effectBlowsOf(cut)[0].atMs + 60, CELL).get('target')!;
    };

    expect(joltOf('wide').x).toBeGreaterThan(0);
    expect(joltOf('wide').z).toBe(0);
    expect(joltOf('heavy').x).toBe(0);
    expect(joltOf('heavy').z).toBeLessThan(0);
  });

  it('carries a piece the way each stroke of a cut went, a flurry knocking it about from side to side', () => {
    const from = cast({ x: 0, y: 0, z: 0 });
    const one = makePreset('slash', 2);
    const single = effectJoltsOf(one, from, effectBlowsOf(one)[0].atMs + 60, CELL).get('target')!;
    const flurry = makePreset('slash', 2);
    flurry.slashStyle = 'combo';
    flurry.durationMs = 2700;
    const blows = effectBlowsOf(flurry);
    const wayAt = (index: number) => {
      const jolt = effectJoltsOf(flurry, from, blows[index].atMs + 40, CELL).get('target')!;
      const size = Math.hypot(jolt.x, jolt.y);
      return { x: jolt.x / size, y: jolt.y / size };
    };

    expect(Math.abs(single.y)).toBeGreaterThan(Math.abs(single.x));
    expect(single.x).toBeGreaterThan(0);
    expect(wayAt(0).x * wayAt(2).x + wayAt(0).y * wayAt(2).y).toBeLessThan(0.8);
  });

  it('has the one who strikes lean in towards the target as the effect sets off, and stand back after', () => {
    const slash = makePreset('slash');
    const from = cast({ x: 0, y: 0, z: 0 });

    expect(effectJoltsOf(slash, from, 140, CELL).get('caster')!.x).toBeGreaterThan(0);
    expect(effectJoltsOf(slash, from, 1000, CELL).get('caster')).toBeUndefined();
  });

  it('throws by the blows it is handed, as a cast keeps those it lands from when it was played', () => {
    const heal = makePreset('heal');
    const from = cast({ x: 0, y: 0, z: 0 });
    const [blow] = effectBlowsOf(makePreset('bash'));
    const kept = [{ ...blow, atMs: 500 }];

    expect(effectJoltsOf(heal, from, 560, CELL, kept).get('target')!.x).toBeGreaterThan(0);
  });

  it('moves no piece once the last struck stands still again and the one who struck stands back', () => {
    const bash = makePreset('bash');
    const from = cast({ x: 0, y: 0, z: 0 });
    const blows = effectBlowsOf(bash);
    const end = joltsEndOf(bash, from, blows);

    expect(end).toBeGreaterThan(blows[0].atMs);
    expect(effectJoltsOf(bash, from, end, CELL, blows).size).toBe(0);
  });

  it('pulls a piece that is drained towards the one who drains it, and moves none drained from nowhere', () => {
    const drain = makePreset('drain', 2);
    const at = effectBlowsOf(drain)[0].atMs + 60;
    const jolt = effectJoltsOf(drain, cast({ x: 0, y: 0, z: 0 }), at, CELL).get('target')!;

    expect(jolt.x).toBeLessThan(0);
    expect(jolt.z).toBe(0);
    expect(effectJoltsOf(drain, cast(null), at, CELL).get('target')).toBeUndefined();
  });

  it('throws no piece back as the greatest aura breaks out: the one it is on is borne straight up', () => {
    const aura = makePreset('aura', 3);
    const at = effectBlowsOf(aura)[0].atMs + 60;
    const jolt = effectJoltsOf(aura, cast({ x: 0, y: 0, z: 0 }), at, CELL).get('target')!;

    expect(jolt.x).toBe(0);
    expect(jolt.y).toBe(0);
    expect(jolt.z).toBeGreaterThan(0);
  });

  it('throws nothing for what neither strikes nor sets off at a target', () => {
    expect(effectJoltsOf(makePreset('heal'), cast({ x: 0, y: 0, z: 0 }), 300, CELL).size).toBe(0);
  });
});

describe('how a breath moves the pieces', () => {
  const breathOf = (grade = 2, tagName = '炎') => {
    const preset = makePreset('breath', grade);
    preset.durationMs = 3000;
    preset.tagName = tagName;
    return preset;
  };
  const from = cast({ x: 0, y: 0, z: 0 });
  const joltOf = (preset: EffectPreset, ms: number, who = 'target') => effectJoltsOf(preset, from, ms, CELL).get(who);

  it('leans the one who breathes back as it draws the breath in, and throws it forward as the breath bursts', () => {
    const breath = breathOf();
    const timing = breathTimingOf(3);

    expect(joltOf(breath, 80, 'caster')!.x).toBeLessThan(0);
    expect(joltOf(breath, timing.burstsAt * 1000 - 5, 'caster')!.x).toBeLessThan(-CELL * 0.1);
    expect(joltOf(breath, timing.burstsAt * 1000 + 70, 'caster')!.x).toBeGreaterThan(0);
    expect(joltOf(breath, timing.burstsAt * 1000 + 400, 'caster')).toBeUndefined();
  });

  it('pushes the piece blown on downwind for as long as it is blown on, and lets it stand back after', () => {
    const breath = breathOf();
    const timing = breathTimingOf(3);
    const blown = [600, 1200, 1800, 2300].map((ms) => joltOf(breath, ms)!.x);

    expect(joltOf(breath, timing.reachesAt * 1000 - 10)).toBeUndefined();
    for (const push of blown) {
      expect(push).toBeGreaterThan(CELL * 0.04);
      expect(push).toBeLessThan(CELL * 0.12);
    }
    expect(joltOf(breath, timing.spentAt * 1000 + 200)!.x).toBeLessThan(blown[0]);
    expect(joltOf(breath, timing.spentAt * 1000 + 450)).toBeUndefined();
    expect(joltsEndOf(breath, from, [])).toBeCloseTo(timing.spentAt * 1000 + 400);
  });

  it('trembles the piece as it is blown on, across the wind as well as along it', () => {
    const breath = breathOf();
    const across = Array.from({ length: 30 }, (_unused, index) => joltOf(breath, 1000 + index * 7)!.y);

    expect(Math.max(...across)).toBeGreaterThan(CELL * 0.008);
    expect(Math.min(...across)).toBeLessThan(-CELL * 0.008);
  });

  it('pushes further at the higher grades, and each later target a stagger later', () => {
    const timing = breathTimingOf(3);
    const two = { ...from, targets: [...from.targets, { identifier: 'second', x: 100, y: 50, z: 0 }] };
    const breath = breathOf();
    breath.staggerMs = 200;

    expect(joltOf(breathOf(3), 1500)!.x).toBeGreaterThan(joltOf(breathOf(1), 1500)!.x);
    expect(effectJoltsOf(breath, two, timing.reachesAt * 1000 + 100, CELL).has('second')).toBe(false);
    expect(effectJoltsOf(breath, two, timing.reachesAt * 1000 + 350, CELL).has('second')).toBe(true);
  });

  it('pushes no one with the breath that heals', () => {
    const holy = breathOf(2, '回復');

    expect(joltOf(holy, 1500)).toBeUndefined();
    expect(joltOf(holy, 80, 'caster')!.x).toBeLessThan(0);
  });

  it('pushes no one with a breath from nowhere', () => {
    expect(effectJoltsOf(breathOf(), cast(null), 1500, CELL).size).toBe(0);
  });
});

describe('the pieces a wind moves', () => {
  function vortexOf(grade: number, areaRadius = 0): EffectPreset {
    const preset = makePreset('vortex', grade);
    preset.durationMs = 3000;
    preset.targeting = 'multi';
    preset.areaRadius = areaRadius;
    preset.staggerMs = 0;
    return preset;
  }

  const three: EffectCast = {
    presetIdentifier: 'preset',
    casterIdentifier: 'caster',
    origin: { x: 0, y: 0, z: 0 },
    targets: [
      { identifier: 'centre', x: 100, y: 0, z: 0 },
      { identifier: 'east', x: 200, y: 0, z: 0 },
      { identifier: 'south', x: 100, y: 150, z: 0 },
    ],
    seed: 1,
  };

  it('shoves the target of a gust downwind as its wall strikes, further than a blow of its grade throws, and lets it stand back', () => {
    const gust = vortexOf(1);
    const [blow] = effectBlowsOf(gust);
    const burst = makePreset('burst', 1);
    const shoved = effectJoltsOf(gust, cast({ x: 0, y: 0, z: 0 }), blow.atMs + 60, CELL).get('target')!;
    const struck = effectJoltsOf(burst, cast({ x: 0, y: 0, z: 0 }), effectBlowsOf(burst)[0].atMs + 60, CELL).get(
      'target'
    )!;

    expect(effectJoltsOf(gust, cast({ x: 0, y: 0, z: 0 }), blow.atMs - 10, CELL).get('target')).toBeUndefined();
    expect(shoved.x).toBeGreaterThan(CELL * 0.2);
    expect(shoved.x).toBeGreaterThan(struck.x * 3);
    expect(effectJoltsOf(gust, cast({ x: 0, y: 0, z: 0 }), blow.atMs + 500, CELL).get('target')).toBeUndefined();
  });

  it('has the one who throws a gust lean in as it is thrown, and no one lean in to a tornado', () => {
    const from = cast({ x: 0, y: 0, z: 0 });

    expect(effectJoltsOf(vortexOf(1), from, 140, CELL).get('caster')!.x).toBeGreaterThan(0);
    expect(effectJoltsOf(vortexOf(1), from, 1000, CELL).get('caster')).toBeUndefined();
    expect(effectJoltsOf(vortexOf(3, 3), from, 140, CELL).get('caster')).toBeUndefined();
  });

  it('takes the piece a tornado stands over up off the floor while it stands', () => {
    const tornado = vortexOf(3, 3);
    const lifted = [800, 1400, 2000].map((ms) => effectJoltsOf(tornado, three, ms, CELL).get('centre')!.z);

    for (const z of lifted) {
      expect(z).toBeGreaterThan(CELL * 0.06);
      expect(z).toBeLessThan(CELL * 0.2);
    }
  });

  it('drags each piece caught round a tornado towards the one it stands over, and trembles it', () => {
    const tornado = vortexOf(3, 3);
    const at = (ms: number) => effectJoltsOf(tornado, three, ms, CELL);
    const east = [1000, 1007, 1014, 1021, 1028, 1035, 1042].map((ms) => at(ms).get('east')!);

    for (const jolt of east) {
      expect(jolt.x).toBeLessThan(-CELL * 0.07);
      expect(jolt.x).toBeGreaterThan(-CELL * 0.22);
      expect(jolt.z).toBe(0);
    }
    expect(at(1000).get('south')!.y).toBeLessThan(-CELL * 0.07);
    expect(Math.max(...east.map((jolt) => jolt.y)) - Math.min(...east.map((jolt) => jolt.y))).toBeGreaterThan(
      CELL * 0.01
    );
    expect(Math.abs(at(1000).get('east')!.x)).toBeGreaterThan(
      Math.abs(effectJoltsOf(vortexOf(2), three, 1000, CELL).get('east')!.x)
    );
  });

  it('lets every piece down and back as a tornado thins away, and moves none once it is gone', () => {
    const tornado = vortexOf(3, 3);
    const timing = tornadoTimingOf(3);
    const end = joltsEndOf(tornado, three, []);

    expect(end).toBeCloseTo(timing.goneAt * 1000);
    expect(effectJoltsOf(tornado, three, timing.goneAt * 1000 - 100, CELL).get('centre')!.z).toBeLessThan(CELL * 0.04);
    expect(effectJoltsOf(tornado, three, end, CELL).size).toBe(0);
    expect(effectJoltsOf(tornado, three, 1000, CELL).has('caster')).toBe(false);
  });

  it('takes up each later target of a tornado its stagger later', () => {
    const tornado = vortexOf(3, 3);
    tornado.staggerMs = 300;

    expect(effectJoltsOf(tornado, three, 250, CELL).has('east')).toBe(false);
    expect(effectJoltsOf(tornado, three, 250, CELL).has('centre')).toBe(true);
    expect(effectJoltsOf(tornado, three, 450, CELL).has('east')).toBe(true);
  });
});

describe('how lightning moves the pieces', () => {
  const from = cast({ x: 0, y: 0, z: 0 });

  it('makes a piece struck by a bolt out of the sky start up off the floor, whoever cast it and from wherever', () => {
    for (const grade of [2, 3]) {
      const bolt = makePreset('bolt', grade);
      for (const each of [from, cast(null)]) {
        const jolt = effectJoltsOf(bolt, each, effectBlowsOf(bolt)[0].atMs + 60, CELL).get('target')!;

        expect([grade, jolt.z > 0]).toEqual([grade, true]);
      }
    }
  });

  it('throws a piece struck by a snap from its caster back from the caster', () => {
    const snap = makePreset('bolt', 1);
    const jolt = effectJoltsOf(snap, from, effectBlowsOf(snap)[0].atMs + 60, CELL).get('target')!;

    expect(jolt.x).toBeGreaterThan(0);
    expect(jolt.z).toBe(0);
  });

  it('shudders a piece struck by a bolt for a moment after the stroke, and then lets it stand', () => {
    const strike = makePreset('bolt', 2);
    const at = effectBlowsOf(strike)[0].atMs;
    const shudders = [150, 200, 250].map((after) => effectJoltsOf(strike, cast(null), at + after, CELL).get('target')!);

    expect(new Set(shudders.map((jolt) => jolt.x.toFixed(3))).size).toBe(3);
    expect(shudders.every((jolt) => Math.abs(jolt.x) < CELL * 0.05)).toBe(true);
    expect(effectJoltsOf(strike, cast(null), at + 500, CELL).get('target')).toBeUndefined();
  });

  it('shudders a piece under the column of a storm from its first stroke to its last', () => {
    const storm = makePreset('bolt', 3);
    storm.durationMs = 3048;
    const [first, last] = effectBlowsOf(storm).map((blow) => blow.atMs);
    const middle = effectJoltsOf(storm, cast(null), (first + last) / 2, CELL).get('target')!;

    expect(last - first).toBeGreaterThan(900);
    expect(Math.hypot(middle.x, middle.y)).toBeGreaterThan(0);
    expect(effectJoltsOf(storm, cast(null), last + 500, CELL).get('target')).toBeUndefined();
  });

  it('shudders a piece held by a current until the current breaks, and a little longer', () => {
    const current = makePreset('arc');
    const reaches = effectBlowsOf(current)[0].atMs;
    const breaks = current.duration * 0.78;
    const held = effectJoltsOf(current, from, (reaches + breaks) / 2 + 100, CELL).get('target')!;
    const after = effectJoltsOf(current, from, breaks + 200, CELL).get('target')!;

    expect(effectJoltsOf(current, from, reaches - 1, CELL).get('target')).toBeUndefined();
    expect(Math.hypot(held.x, held.y)).toBeGreaterThan(0);
    expect(held.z).toBe(0);
    expect(Math.hypot(after.x, after.y)).toBeGreaterThan(0);
    expect(effectJoltsOf(current, from, breaks + 400, CELL).get('target')).toBeUndefined();
    expect(joltsEndOf(current, from, effectBlowsOf(current))).toBeGreaterThanOrEqual(breaks + 380);
  });

  it('shudders each piece of a chain from the moment its own link lands', () => {
    const chain = makePreset('arc', 3);
    chain.staggerMs = 140;
    const two: EffectCast = {
      ...from,
      targets: [...from.targets, { identifier: 'second', x: 200, y: 0, z: 0 }],
    };
    const reaches = effectBlowsOf(chain)[0].atMs;

    expect(effectJoltsOf(chain, two, reaches + 100, CELL).has('target')).toBe(true);
    expect(effectJoltsOf(chain, two, reaches + 100, CELL).has('second')).toBe(false);
    expect(effectJoltsOf(chain, two, reaches + 240, CELL).has('second')).toBe(true);
  });

  it('shudders harder at the higher grades', () => {
    const farthest = (grade: number) => {
      const current = makePreset('arc', grade);
      const reaches = effectBlowsOf(current)[0].atMs;
      let far = 0;
      for (let ms = reaches + 200; ms < reaches + 500; ms += 7) {
        far = Math.max(far, Math.abs(effectJoltsOf(current, cast(null), ms, CELL).get('target')?.x ?? 0));
      }
      return far;
    };

    expect(farthest(3)).toBeGreaterThan(farthest(1) * 1.5);
  });
});
