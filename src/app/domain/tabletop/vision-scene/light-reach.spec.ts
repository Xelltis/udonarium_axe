import {
  cullSegments,
  isLit,
  isSnuffed,
  lightLevelAt,
  lightReaches,
  occludersFor,
  occludersOf,
} from '@axe/domain/tabletop/vision-scene/light-reach';
import type { SceneBrightness, SceneLight, VisionScene } from '@axe/domain/tabletop/vision-scene/scene-model';

const WALL_AT_X50 = { x1: 50, y1: -100, x2: 50, y2: 100 };
const WALL_FAR_AWAY = { x1: 900, y1: -100, x2: 900, y2: 100 };

function light(partial: Partial<SceneLight> = {}): SceneLight {
  return {
    x: 0,
    y: 0,
    z: 0,
    brightPx: 100,
    dimPx: 200,
    color: '#ffffff',
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

function scene(partial: Partial<VisionScene> = {}): VisionScene {
  return {
    darknessEnabled: true,
    fogEnabled: false,
    darknessLevel: 1,
    ambientColor: '#000000',
    globalIllumination: 0,
    gridSize: 50,
    widthPx: 1000,
    heightPx: 1000,
    lights: [],
    visionSources: [],
    sightSegments: [],
    lightSegments: [],
    shadowCasters: [],
    ...partial,
  };
}

function patch(partial: Partial<SceneBrightness> = {}): SceneBrightness {
  return { x: 0, y: 0, widthPx: 100, heightPx: 100, level: 1, snuffs: false, ...partial };
}

describe('cullSegments()', () => {
  it('keeps only the segments that could cross the box', () => {
    const kept = cullSegments(
      [WALL_AT_X50, WALL_FAR_AWAY, { x1: -10, y1: 150, x2: 10, y2: 150 }],
      -100,
      -100,
      100,
      100
    );
    expect(kept).toEqual([WALL_AT_X50]);
  });
});

describe('occludersOf()', () => {
  it('gathers the walls and the shadows of the other pieces, leaving out the light bearer', () => {
    const lit = scene({
      lightSegments: [WALL_FAR_AWAY],
      shadowCasters: [
        { ownerId: 'light', x: 0, y: 0, radiusPx: 10, segments: [{ x1: 0, y1: 0, x2: 1, y2: 1 }], imageUrl: '' },
        { ownerId: 'other', x: 50, y: 0, radiusPx: 10, segments: [WALL_AT_X50], imageUrl: '' },
      ],
    });
    const held = occludersOf(lit, light(), false);
    expect(held.all).toEqual([WALL_FAR_AWAY, WALL_AT_X50]);
    expect(held.near).toEqual([WALL_AT_X50]);
    expect(occludersFor(lit, light(), true)).toEqual([WALL_FAR_AWAY]);
  });

  it('is nothing for a light that goes through walls, and is remembered for the same light and scene', () => {
    const lit = scene({ lightSegments: [WALL_AT_X50] });
    const through = light({ ignoreOcclusion: true });
    expect(occludersOf(lit, through, false).all).toEqual([]);
    expect(occludersOf(lit, through, false)).toBe(occludersOf(lit, through, false));
  });

  it('leaves out what the light hangs above', () => {
    const lit = scene({
      lightSegments: [
        { ...WALL_AT_X50, heightPx: 20 },
        { ...WALL_FAR_AWAY, heightPx: 80 },
      ],
    });
    expect(occludersOf(lit, light({ z: 40 }), false).overhead).toEqual([{ ...WALL_FAR_AWAY, heightPx: 80 }]);
  });
});

describe('lightReaches()', () => {
  it('reaches as far as its dim radius, within its cone, with nothing in the way', () => {
    expect(lightReaches(scene(), light(), 150, 0)).toBe(true);
    expect(lightReaches(scene(), light(), 250, 0)).toBe(false);
    expect(lightReaches(scene(), light({ angle: 90, direction: 0 }), 100, 0)).toBe(true);
    expect(lightReaches(scene(), light({ angle: 90, direction: 0 }), -100, 0)).toBe(false);
  });

  it('is stopped by a wall, but not by a shadow caster it was told to ignore', () => {
    const walled = scene({ lightSegments: [WALL_AT_X50] });
    expect(lightReaches(walled, light(), 100, 0)).toBe(false);
    const shadowed = scene({
      shadowCasters: [{ ownerId: 'o', x: 50, y: 0, radiusPx: 10, segments: [WALL_AT_X50], imageUrl: '' }],
    });
    expect(lightReaches(shadowed, light(), 100, 0)).toBe(false);
    expect(lightReaches(shadowed, light(), 100, 0, true)).toBe(true);
  });
});

describe('lightLevelAt()', () => {
  it('is full within the bright reach, half within the dim, and never under the global light', () => {
    const lit = scene({ lights: [light()], globalIllumination: 0.1 });
    expect(lightLevelAt(lit, 50, 0)).toBe(1);
    expect(lightLevelAt(lit, 150, 0)).toBe(0.5);
    expect(lightLevelAt(lit, 500, 0)).toBe(0.1);
  });

  it('is raised by a bright patch and held down by a dark one, the dark one last', () => {
    const bright = scene({ brightAreas: [patch({ level: 0.8 })] });
    expect(lightLevelAt(bright, 50, 50)).toBe(0.8);
    expect(lightLevelAt(bright, 150, 50)).toBe(0);
    const dark = scene({ lights: [light()], brightAreas: [patch({ level: 0.2, snuffs: true })] });
    expect(lightLevelAt(dark, 50, 50)).toBe(0.2);
  });
});

describe('isSnuffed() and isLit()', () => {
  it('snuffs a point only under a patch that puts every light out', () => {
    const out = scene({ lights: [light()], brightAreas: [patch({ level: 0, snuffs: true })] });
    expect(isSnuffed(out, 50, 50)).toBe(true);
    expect(isSnuffed(out, 150, 50)).toBe(false);
    expect(isSnuffed(scene({ brightAreas: [patch({ level: 0.2, snuffs: true })] }), 50, 50)).toBe(false);
    expect(isLit(out, 50, 50)).toBe(false);
    expect(isLit(out, 150, 50)).toBe(true);
    expect(isLit(scene(), 50, 50)).toBe(false);
  });
});
