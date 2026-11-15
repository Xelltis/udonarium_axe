import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { effectJoltsOf, joltsEndOf } from '@axe/domain/effect/effect-reaction';
import { strikeLandsAt, strikeLookOf } from '@axe/domain/effect/strike-looks';

const CELL = 50;

function strike(grade: number, durationMs = 1000, staggerMs = 0): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = 'bash';
  preset.grade = grade;
  preset.durationMs = durationMs;
  preset.staggerMs = staggerMs;
  return preset;
}

function castOn(count = 1): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: 'caster',
    origin: { x: 0, y: 0, z: 30 },
    targets: Array.from({ length: count }, (_unused, index) => ({
      identifier: `t${index}`,
      x: 100 + index * 50,
      y: 0,
      z: 0,
    })),
    seed: 1,
  };
}

describe('the blows of a strike', () => {
  it('draws a jab, a swing and a crushing blow by grade, and lands each once it has been drawn back, the heavier the longer', () => {
    expect([1, 2, 3].map((grade) => strikeLookOf({ gradeLevel: grade as 1 | 2 | 3 }))).toEqual([
      'jab',
      'swing',
      'crush',
    ]);
    const lands = [strike(1, 1056), strike(2, 1080), strike(3, 2880)].map((preset) => effectBlowsOf(preset)[0].atMs);

    expect(lands).toEqual([90, 220, 290]);
    expect(strikeLandsAt(3, 1)).toBeCloseTo(0.14);
  });
});

describe('how a strike moves the pieces', () => {
  it('draws the one who strikes back as the blow is drawn back, carries it in as it lands, and stands it again', () => {
    const preset = strike(2, 1080);
    const [blow] = effectBlowsOf(preset);
    const cast = castOn();

    expect(effectJoltsOf(preset, cast, blow.atMs * 0.5, CELL).get('caster')!.x).toBeLessThan(0);
    expect(effectJoltsOf(preset, cast, blow.atMs + 20, CELL).get('caster')!.x).toBeGreaterThan(0);
    expect(effectJoltsOf(preset, cast, joltsEndOf(preset, cast, effectBlowsOf(preset)), CELL).size).toBe(0);
  });

  it('snaps the target of a jab straight back, buckling it, and lets it stand again at once', () => {
    const preset = strike(1, 1056);
    const [blow] = effectBlowsOf(preset);
    const thrown = effectJoltsOf(preset, castOn(), blow.atMs + 50, CELL).get('t0')!;

    expect(thrown.x).toBeGreaterThan(CELL * 0.15);
    expect(thrown.y).toBeCloseTo(0);
    expect(thrown.z).toBeLessThan(0);
    expect(effectJoltsOf(preset, castOn(), blow.atMs + 600, CELL).get('t0')).toBeUndefined();
  });

  it('sends the target of a swing skidding further, carried on round the way the swing sweeps, and holds it there ringing', () => {
    const preset = strike(2, 1080);
    const [blow] = effectBlowsOf(preset);
    const jab = strike(1, 1056);
    const snapped = effectJoltsOf(jab, castOn(), effectBlowsOf(jab)[0].atMs + 150, CELL).get('t0')!;
    const skidded = effectJoltsOf(preset, castOn(), blow.atMs + 150, CELL).get('t0')!;
    const held = effectJoltsOf(preset, castOn(), blow.atMs + 300, CELL).get('t0')!;

    expect(Math.hypot(skidded.x, skidded.y)).toBeGreaterThan(Math.hypot(snapped.x, snapped.y) * 1.5);
    expect(skidded.y).toBeGreaterThan(CELL * 0.05);
    expect(skidded.z).toBe(0);
    expect(Math.hypot(held.x, held.y)).toBeGreaterThan(CELL * 0.25);
  });

  it('throws the target of a crushing blow up off its feet and back, to come down and stand back long after', () => {
    const preset = strike(3, 2880);
    const [blow] = effectBlowsOf(preset);
    const at = (since: number) => effectJoltsOf(preset, castOn(), blow.atMs + since, CELL).get('t0')!;

    expect(at(100).z).toBeGreaterThan(CELL * 0.12);
    expect(at(100).x).toBeGreaterThan(CELL * 0.35);
    expect(at(600).z).toBe(0);
    expect(at(600).x).toBeGreaterThan(CELL * 0.35);
    expect(effectJoltsOf(preset, castOn(), blow.atMs + 1500, CELL).get('t0')).toBeUndefined();
  });

  it('moves each later target as the first, its stagger later', () => {
    const preset = strike(2, 1080, 90);
    const [blow] = effectBlowsOf(preset);
    const cast = castOn(2);

    expect(effectJoltsOf(preset, cast, blow.atMs + 60, CELL).get('t1')).toBeUndefined();
    const first = effectJoltsOf(preset, cast, blow.atMs + 60, CELL).get('t0')!;
    const second = effectJoltsOf(preset, cast, blow.atMs + 150, CELL).get('t1')!;
    expect(second.x).toBeCloseTo(first.x);
  });
});
