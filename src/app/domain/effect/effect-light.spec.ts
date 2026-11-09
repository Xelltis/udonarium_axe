import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectKind } from '@axe/domain/effect/effect-kind';
import { effectLightsOf, MAX_EFFECT_LIGHTS, strongestEffectLights } from '@axe/domain/effect/effect-light';
import { EffectPreset } from '@axe/domain/effect/effect-preset';

const CELL = 50;

function makePreset(kind: EffectKind, grade = 2, fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = kind;
  preset.grade = grade;
  preset.durationMs = 1000;
  preset.colorPrimary = '#ff8844';
  Object.assign(preset, fields);
  return preset;
}

function castOn(...points: [number, number][]): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: '',
    origin: null,
    targets: points.map(([x, y], index) => ({ identifier: `t${index}`, x, y, z: 0 })),
    seed: 7,
  };
}

function strengthAt(preset: EffectPreset, elapsedMs: number): number {
  return effectLightsOf(preset, castOn([100, 100]), elapsedMs, CELL)[0]?.strength ?? 0;
}

describe('effectLightsOf()', () => {
  it('flashes as a blow lands and fades after, throwing nothing before it', () => {
    const burst = makePreset('burst');
    const [blow] = effectBlowsOf(burst);

    expect(strengthAt(burst, blow.atMs - 1)).toBe(0);
    const peak = strengthAt(burst, blow.atMs);
    expect(peak).toBeGreaterThan(1);
    expect(strengthAt(burst, blow.atMs + 150)).toBeLessThan(peak);
    expect(strengthAt(burst, blow.atMs + 3000)).toBe(0);
  });

  it('flashes brighter and further at the higher grades', () => {
    const at = (grade: number) => {
      const preset = makePreset('bash', grade);
      return effectLightsOf(preset, castOn([0, 0]), effectBlowsOf(preset)[0].atMs, CELL)[0];
    };

    expect(at(1).strength).toBeLessThan(at(3).strength);
    expect(at(1).reachPx).toBeLessThan(at(3).reachPx);
  });

  it('glows over a fire for as long as it burns, and throws nothing over a heal once it is done', () => {
    const fire = makePreset('flame');

    expect(strengthAt(fire, 500)).toBeGreaterThan(0.3);
    expect(strengthAt(fire, 1000)).toBe(0);
    expect(strengthAt(makePreset('heal'), 1200)).toBe(0);
  });

  it('throws no light for what neither strikes nor glows', () => {
    expect(strengthAt(makePreset('curse'), 500)).toBe(0);
  });

  it('hangs the light over the target, in the colour of the effect, high enough to light the ground round it', () => {
    const burst = makePreset('burst');
    const [light] = effectLightsOf(burst, castOn([100, 200]), effectBlowsOf(burst)[0].atMs, CELL);

    expect([light.x, light.y]).toEqual([100, 200]);
    expect(light.z).toBeGreaterThan(0);
    expect(light.color).toBe('#ff8844');
  });

  it('throws one light over several targets, reaching them all', () => {
    const burst = makePreset('burst', 2, { staggerMs: 0 });
    const lights = effectLightsOf(burst, castOn([0, 0], [400, 0]), effectBlowsOf(burst)[0].atMs, CELL);

    expect(lights).toHaveLength(1);
    expect(lights[0].x).toBe(200);
    expect(lights[0].reachPx).toBeGreaterThan(200);
  });

  it('is the same at the same moment whatever came before, as every seat draws it', () => {
    const fire = makePreset('flame');

    expect(effectLightsOf(fire, castOn([0, 0]), 432, CELL)).toEqual(effectLightsOf(fire, castOn([0, 0]), 432, CELL));
  });
});

describe('strongestEffectLights()', () => {
  it('keeps the strongest of the lights thrown at once, as many as may be thrown', () => {
    const light = (strength: number) => ({ x: 0, y: 0, z: 0, color: '#fff', strength, reachPx: 1 });
    const kept = strongestEffectLights([light(0.2), light(1.4), light(0.9), light(0.5)]);

    expect(kept.map((each) => each.strength)).toEqual([1.4, 0.9].slice(0, MAX_EFFECT_LIGHTS));
  });
});
