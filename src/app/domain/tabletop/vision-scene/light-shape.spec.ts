import {
  clamp01,
  computeLightBeam,
  computeLightGlow,
  distance,
  floorRadii,
  lightAxis,
  lightFloorPool,
  seesInDark,
  withinCone,
} from '@axe/domain/tabletop/vision-scene/light-shape';
import type { SceneLight } from '@axe/domain/tabletop/vision-scene/scene-model';
import { VisionType } from '@axe/domain/tabletop/vision-types';

function light(partial: Partial<SceneLight> = {}): SceneLight {
  return {
    x: 100,
    y: 100,
    z: 0,
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
    sourceId: 'light',
    surface: 'floor',
    ...partial,
  };
}

describe('clamp01() and distance()', () => {
  it('holds a value between 0 and 1, and measures across the table', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.3)).toBe(0.3);
    expect(clamp01(2)).toBe(1);
    expect(distance(0, 0, 3, 4)).toBe(5);
  });
});

describe('lightAxis()', () => {
  it('points along the direction across the table, tilted by the pitch', () => {
    expect(lightAxis({ direction: 0, pitch: 0 })).toEqual({ x: 1, y: 0, z: 0 });
    const up = lightAxis({ direction: 90, pitch: 90 });
    expect(up.z).toBeCloseTo(1);
    expect(Math.hypot(up.x, up.y)).toBeCloseTo(0);
  });
});

describe('floorRadii()', () => {
  it('pays the climb down to the surface out of the reach', () => {
    expect(floorRadii(light())).toEqual({ brightFloor: 100, dimFloor: 200 });
    const hung = floorRadii(light({ z: 60 }));
    expect(hung.brightFloor).toBeCloseTo(80);
    expect(hung.dimFloor).toBeCloseTo(Math.sqrt(200 * 200 - 60 * 60));
    expect(floorRadii(light({ z: 300 }))).toEqual({ brightFloor: 0, dimFloor: 0 });
    expect(floorRadii(light({ z: 60 }), 60)).toEqual({ brightFloor: 100, dimFloor: 200 });
  });
});

describe('lightFloorPool()', () => {
  it('lays an all-round light about its own spot, and none for one hung out of reach', () => {
    expect(lightFloorPool(light())).toEqual({ cx: 100, cy: 100, brightPx: 100, dimPx: 200 });
    expect(lightFloorPool(light({ z: 300 }))).toBeNull();
  });

  it('lays a cone where its axis meets the floor, and none for one turned up away from it', () => {
    const down = lightFloorPool(light({ z: 100, angle: 60, pitch: -90 }))!;
    expect(down.cx).toBeCloseTo(100);
    expect(down.cy).toBeCloseTo(100);
    expect(down.brightPx / down.dimPx).toBeCloseTo(0.5);
    expect(lightFloorPool(light({ z: 100, angle: 60, pitch: 45 }))).toBeNull();
    const ahead = lightFloorPool(light({ z: 100, angle: 60, pitch: -45, direction: 0 }))!;
    expect(ahead.cx).toBeCloseTo(200);
    expect(ahead.cy).toBeCloseTo(100);
  });
});

describe('computeLightBeam()', () => {
  it('draws no beam for an all-round light, and three fins for a cone', () => {
    expect(computeLightBeam(light())).toBeNull();
    const beam = computeLightBeam(light({ angle: 60, pitch: 30 }))!;
    expect(beam.fins).toHaveLength(3);
    expect(beam.height).toBe(200);
    expect(beam.width).toBeCloseTo(2 * 200 * Math.tan(Math.PI / 6));
    expect(beam.origin).toEqual({ x: 100, y: 100, z: 0 });
  });

  it('cuts a beam turned down where it meets the floor', () => {
    expect(computeLightBeam(light({ z: 50, angle: 60, pitch: -90 }))!.height).toBeCloseTo(50);
    expect(computeLightBeam(light({ z: 0.5, angle: 60, pitch: -90 }))).toBeNull();
  });
});

describe('computeLightGlow()', () => {
  it('glows at an all-round light on the floor, within the bounds of a cell', () => {
    expect(computeLightGlow(light({ angle: 90 }), 50)).toBeNull();
    expect(computeLightGlow(light({ dimPx: 0 }), 50)).toBeNull();
    expect(computeLightGlow(light({ brightPx: 500, dimPx: 600 }), 50)).toBeNull();
    expect(computeLightGlow(light(), 50)).toEqual({
      x: 100,
      y: 100,
      z: 0,
      size: 60,
      color: '#ffcc88',
      transform: null,
    });
    expect(computeLightGlow(light({ brightPx: 400 }), 50)!.size).toBe(100);
  });

  it('lays a glow on a wall flat against it', () => {
    const glow = computeLightGlow(light({ surface: 'north-wall', z: 30 }), 50)!;
    expect(glow.transform).toMatch(/^matrix3d\(/);
    expect(glow.size).toBe(60);
  });
});

describe('withinCone()', () => {
  it('holds everything for an all-round light, and only what lies within the spread of a cone', () => {
    expect(withinCone(light(), 900, 900)).toBe(true);
    const cone = light({ angle: 90, direction: 0 });
    expect(withinCone(cone, 200, 100)).toBe(true);
    expect(withinCone(cone, 200, 180)).toBe(true);
    expect(withinCone(cone, 200, 220)).toBe(false);
    expect(withinCone(cone, 0, 100)).toBe(false);
    expect(withinCone(cone, 100, 100)).toBe(true);
  });
});

describe('seesInDark()', () => {
  it('is true of dark vision, truesight and heat vision alone', () => {
    expect(seesInDark(VisionType.DARKVISION)).toBe(true);
    expect(seesInDark(VisionType.TRUESIGHT)).toBe(true);
    expect(seesInDark(VisionType.THERMAL)).toBe(true);
    expect(seesInDark(VisionType.NORMAL)).toBe(false);
    expect(seesInDark(VisionType.BLIND)).toBe(false);
  });
});
