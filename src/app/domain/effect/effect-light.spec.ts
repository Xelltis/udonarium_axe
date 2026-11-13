import { MAX_EFFECT_LIGHTS, strongestEffectLights } from '@axe/domain/effect/effect-light';

describe('strongestEffectLights()', () => {
  it('keeps the strongest of the lights thrown at once, as many as may be thrown', () => {
    const light = (strength: number) => ({ x: 0, y: 0, z: 0, color: '#fff', strength, reachPx: 1 });
    const kept = strongestEffectLights([light(0.2), light(1.4), light(0.9), light(0.5)]);

    expect(kept.map((each) => each.strength)).toEqual([1.4, 0.9].slice(0, MAX_EFFECT_LIGHTS));
  });
});
