import { areaShareOf, effectAreaTargets } from '@axe/domain/effect/effect-area';
import { type EffectKind } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';

describe('effectAreaTargets()', () => {
  const candidates = [
    { identifier: 'near', x: 60, y: 0 },
    { identifier: 'center', x: 0, y: 0 },
    { identifier: 'far', x: 400, y: 0 },
    { identifier: 'mid', x: 0, y: 150 },
  ];

  it('returns what falls within the radius, nearest first', () => {
    // That order is the order they fire in, so it spreads from the centre out.
    expect(effectAreaTargets({ x: 0, y: 0 }, candidates, 200, 10)).toEqual(['center', 'near', 'mid']);
  });

  it('stops at the limit', () => {
    expect(effectAreaTargets({ x: 0, y: 0 }, candidates, 200, 2)).toEqual(['center', 'near']);
  });

  it('picks up nothing without a radius', () => {
    expect(effectAreaTargets({ x: 0, y: 0 }, candidates, 0, 10)).toEqual([]);
    expect(effectAreaTargets({ x: 0, y: 0 }, candidates, Number.NaN, 10)).toEqual([]);
  });

  it('takes in what sits exactly on the edge', () => {
    expect(effectAreaTargets({ x: 0, y: 0 }, [{ identifier: 'edge', x: 100, y: 0 }], 100, 10)).toEqual(['edge']);
  });
});

describe('areaShareOf()', () => {
  function makePreset(kind: EffectKind, areaRadius: number): EffectPreset {
    const preset = new EffectPreset('preset');
    preset.kind = kind;
    preset.targeting = 'multi';
    preset.maxTargets = 8;
    preset.areaRadius = areaRadius;
    return preset;
  }
  const three = { targets: [0, 1, 2].map((index) => ({ identifier: `t${index}`, x: index * 50, y: 0, z: 0 })) };

  it('sets an area blast off whole at its centre only, and strikes the rest round it with small ones', () => {
    const nova = makePreset('nova', 3);

    expect([0, 1, 2].map((index) => areaShareOf(nova, three, index))).toEqual([1, 0.4, 0.4]);
  });

  it('draws whole on every target what is not an area blast', () => {
    expect(areaShareOf(makePreset('nova', 0), three, 2)).toBe(1);
    expect(areaShareOf(makePreset('heal', 3), three, 2)).toBe(1);
    expect(areaShareOf(makePreset('nova', 3), { targets: three.targets.slice(0, 1) }, 0)).toBe(1);
  });
});
