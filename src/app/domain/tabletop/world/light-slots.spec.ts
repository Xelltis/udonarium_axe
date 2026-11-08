import type { SceneLight } from '@axe/domain/tabletop/vision-scene';
import { lightSlotScore, lightSlotsOf } from '@axe/domain/tabletop/world/light-slots';

function light(id: string, x: number, partial: Partial<SceneLight> = {}): SceneLight {
  return {
    x,
    y: 0,
    z: 25,
    brightPx: 100,
    dimPx: 200,
    color: '#ffcc88',
    angle: 360,
    direction: 0,
    pitch: 0,
    revealToAll: false,
    castShadows: true,
    ignoreOcclusion: false,
    animation: 'none',
    sourceId: id,
    surface: 'floor',
    ...partial,
  };
}

describe('the lights that throw shadows of their own', () => {
  const focus = { x: 0, y: 0 };

  it('reckons a light the more worth a slot the wider it reaches and the nearer it stands', () => {
    expect(lightSlotScore(light('a', 400), focus)).toBeGreaterThan(lightSlotScore(light('b', 800), focus));
    expect(lightSlotScore(light('a', 800, { dimPx: 400 }), focus)).toBeGreaterThan(
      lightSlotScore(light('b', 800), focus)
    );
    expect(lightSlotScore(light('a', 10), focus)).toBe(lightSlotScore(light('b', 50), focus));
  });

  it('chooses as many of the best as there are slots, among the lights set to throw shadows on the floor', () => {
    const lights = [
      light('far', 2000),
      light('near', 300),
      light('quiet', 100, { castShadows: false }),
      light('wall', 200, { surface: 'north-wall' }),
      light('mid', 900),
    ];

    expect(lightSlotsOf(lights, focus, 2)).toEqual(['near', 'mid']);
    expect(lightSlotsOf(lights, focus, 0)).toEqual([]);
  });

  it('keeps a light its slot until another is worth a quarter as much again', () => {
    const lights = [light('held', 1000), light('closer', 950)];

    expect(lightSlotsOf(lights, focus, 1, ['held'])).toEqual(['held']);
    expect(lightSlotsOf([light('held', 1000), light('much-closer', 500)], focus, 1, ['held'])).toEqual(['much-closer']);
  });
});
