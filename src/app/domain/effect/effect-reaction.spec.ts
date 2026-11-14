import { breathTimingOf } from '@axe/domain/effect/breath-timing';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectKind } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { effectJoltsOf, joltsEndOf } from '@axe/domain/effect/effect-reaction';

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
    const bash = makePreset('bash');
    const [blow] = effectBlowsOf(bash);
    const from = cast({ x: 0, y: 0, z: 0 });

    expect(effectJoltsOf(bash, from, blow.atMs, CELL).get('target')).toBeUndefined();
    const thrown = effectJoltsOf(bash, from, blow.atMs + 60, CELL).get('target')!;
    expect(thrown.x).toBeGreaterThan(0);
    expect(thrown.y).toBeCloseTo(0);
    expect(effectJoltsOf(bash, from, blow.atMs + 1000, CELL).get('target')).toBeUndefined();
  });

  it('throws the piece further at the higher grades', () => {
    const at = (grade: number) => {
      const preset = makePreset('bash', grade);
      return effectJoltsOf(preset, cast({ x: 0, y: 0, z: 0 }), effectBlowsOf(preset)[0].atMs + 60, CELL).get('target')!
        .x;
    };

    expect(at(1)).toBeLessThan(at(3));
  });

  it('presses a piece struck from no direction down instead', () => {
    const bolt = makePreset('bolt');
    const jolt = effectJoltsOf(bolt, cast(null), effectBlowsOf(bolt)[0].atMs + 60, CELL).get('target')!;

    expect([jolt.x, jolt.y]).toEqual([0, 0]);
    expect(jolt.z).toBeLessThan(0);
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
