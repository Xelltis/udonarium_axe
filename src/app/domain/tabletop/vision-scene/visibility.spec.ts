import type {
  SceneLight,
  SceneViewer,
  SceneVisionSource,
  VisionScene,
} from '@axe/domain/tabletop/vision-scene/scene-model';
import {
  darknessAlphaFor,
  isPointVisible,
  isPointVisibleFrom,
  objectBrightnessFor,
  objectLightLevel,
} from '@axe/domain/tabletop/vision-scene/visibility';
import { DOME_LOBES } from '@axe/domain/tabletop/vision-shape';
import { VisionType } from '@axe/domain/tabletop/vision-types';

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

function source(partial: Partial<SceneVisionSource> = {}): SceneVisionSource {
  return {
    x: 0,
    y: 0,
    z: 0,
    type: VisionType.NORMAL,
    rangePx: 0,
    owner: 'p1',
    sourceId: 'eyes',
    direction: 0,
    lobes: DOME_LOBES,
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

const player: SceneViewer = { userId: 'p1', isGameMaster: false };
const gameMaster: SceneViewer = { userId: 'gm', isGameMaster: true };

describe('darknessAlphaFor()', () => {
  it('is nothing with the dark switched off', () => {
    expect(darknessAlphaFor(scene({ darknessEnabled: false }), player)).toBe(0);
  });

  it('is the darkness less the global light, and much lighter for the game master', () => {
    const dim = scene({ darknessLevel: 0.8, globalIllumination: 0.5 });
    expect(darknessAlphaFor(dim, player)).toBeCloseTo(0.4);
    expect(darknessAlphaFor(dim, gameMaster)).toBeCloseTo(0.16);
  });
});

describe('isPointVisibleFrom()', () => {
  it('sees whatever is lit with no eyes to look through, and nothing in the dark', () => {
    const lit = scene({ lights: [light()] });
    expect(isPointVisibleFrom(lit, 50, 0, [])).toBe(true);
    expect(isPointVisibleFrom(lit, 500, 0, [])).toBe(false);
    expect(isPointVisibleFrom(scene({ darknessEnabled: false }), 500, 0, [])).toBe(true);
  });

  it('sees in the dark with dark vision as far as it reaches, and no further', () => {
    const eyes = source({ type: VisionType.DARKVISION, rangePx: 100 });
    expect(isPointVisibleFrom(scene(), 80, 0, [eyes])).toBe(true);
    expect(isPointVisibleFrom(scene(), 120, 0, [eyes])).toBe(false);
    expect(isPointVisibleFrom(scene(), 80, 0, [source({ rangePx: 100 })])).toBe(false);
  });

  it('is stopped by a wall between the eyes and the point', () => {
    const wall = { x1: 50, y1: -100, x2: 50, y2: 100 };
    const lit = scene({ lights: [light()], sightSegments: [wall] });
    expect(isPointVisibleFrom(lit, 80, 0, [source()])).toBe(false);
    expect(isPointVisibleFrom(lit, 20, 0, [source()])).toBe(true);
  });

  it('is held to the range of the eyes with no dark to see by', () => {
    const open = scene({ darknessEnabled: false });
    expect(isPointVisibleFrom(open, 80, 0, [source({ rangePx: 100 })])).toBe(true);
    expect(isPointVisibleFrom(open, 120, 0, [source({ rangePx: 100 })])).toBe(false);
  });
});

describe('isPointVisible()', () => {
  it('shows the game master everything, and a player only what their own eyes reach', () => {
    const dark = scene({ visionSources: [source({ type: VisionType.DARKVISION, rangePx: 100, owner: 'p2' })] });
    expect(isPointVisible(dark, 50, 0, gameMaster)).toBe(true);
    expect(isPointVisible(dark, 50, 0, player)).toBe(false);
    expect(isPointVisible(dark, 50, 0, { userId: 'p2', isGameMaster: false })).toBe(true);
  });
});

describe('objectLightLevel()', () => {
  it('is full within the bright reach, fades across the dim ring, and never falls under the global light', () => {
    const lit = scene({ lights: [light()], globalIllumination: 0.2 });
    expect(objectLightLevel(lit, 50, 0, 0)).toBe(1);
    expect(objectLightLevel(lit, 150, 0, 0)).toBeCloseTo(0.5);
    expect(objectLightLevel(lit, 500, 0, 0)).toBeCloseTo(0.2);
  });

  it('counts the edge of the thing nearest the light', () => {
    const lit = scene({ lights: [light()] });
    expect(objectLightLevel(lit, 250, 0, 0)).toBe(0);
    expect(objectLightLevel(lit, 250, 0, 60)).toBeGreaterThan(0);
  });
});

describe('objectBrightnessFor()', () => {
  it('is full with no dark on the table, or for a thing fully lit', () => {
    expect(objectBrightnessFor(scene({ darknessEnabled: false }), player, 500, 0, 0)).toBe(1);
    expect(objectBrightnessFor(scene({ lights: [light()] }), player, 50, 0, 0)).toBe(1);
  });

  it('starts a thing in sight at four tenths and carries it up with the light, leaving the unseen at the overlay', () => {
    const half = scene({ lights: [light()] });
    expect(objectBrightnessFor(half, player, 150, 0, 0)).toBeCloseTo(0.7);
    expect(objectBrightnessFor(half, player, 500, 0, 0)).toBe(0);
    expect(objectBrightnessFor(scene({ darknessLevel: 0.5 }), player, 500, 0, 0)).toBeCloseTo(0.5);
  });
});
