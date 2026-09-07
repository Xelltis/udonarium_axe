import { Segment } from '@axe/domain/tabletop/los/segments';
import {
  computeLightBeam,
  computeLightGlow,
  computeOverlayPlan,
  computeWallLights,
  computeWallSilhouettes,
  EYE_HEIGHT_CELLS,
  eyeHeightPx,
  floorRadii,
  isLit,
  isPointVisible,
  lightAxis,
  lightFloorPool,
  lightLevelAt,
  lightReaches,
  objectBrightnessFor,
  objectLightLevel,
  type SceneLight,
  type SceneViewer,
  type SceneVisionSource,
  type ShadowCaster,
  viewerOwns,
  viewerShares,
  type VisionScene,
  type WallFace,
  withinCone,
} from '@axe/domain/tabletop/vision-scene';
import { DOME_LOBES, visionLobesOf, VisionShape } from '@axe/domain/tabletop/vision-shape';
import { VisionType } from '@axe/domain/tabletop/vision-types';

const WALL_AT_X100: Segment = { x1: 100, y1: -200, x2: 100, y2: 200 };

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

function caster(partial: Partial<ShadowCaster> = {}): ShadowCaster {
  return { ownerId: 'caster', x: 100, y: 0, radiusPx: 50, segments: [WALL_AT_X100], imageUrl: '', ...partial };
}

function source(partial: Partial<SceneVisionSource> = {}): SceneVisionSource {
  return {
    x: 0,
    y: 0,
    z: 0,
    type: VisionType.NORMAL,
    rangePx: 0,
    owner: 'p1',
    sourceId: 'src',
    direction: 0,
    lobes: DOME_LOBES,
    ...partial,
  };
}

function scene(partial: Partial<VisionScene> = {}): VisionScene {
  return {
    darknessEnabled: true,
    fogEnabled: false,
    darknessLevel: 0.9,
    ambientColor: '#05060a',
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

const GM: SceneViewer = { userId: 'gm', isGameMaster: true };
const PLAYER: SceneViewer = { userId: 'p1', isGameMaster: false };

describe('vision-scene', () => {
  describe('withinCone', () => {
    it('is always true through the full turn', () => {
      expect(withinCone(light({ angle: 360 }), 50, 50)).toBe(true);
    });

    it('is true inside the cone and false outside it', () => {
      const cone = light({ x: 0, y: 0, angle: 90, direction: 0 });
      expect(withinCone(cone, 100, 0)).toBe(true);
      expect(withinCone(cone, -100, 0)).toBe(false);
    });
  });

  describe('the geometry of height and pitch', () => {
    it('narrows the reach along the floor with height', () => {
      expect(floorRadii(light({ z: 0, dimPx: 200 })).dimFloor).toBeCloseTo(200);
      expect(floorRadii(light({ z: 120, dimPx: 200 })).dimFloor).toBeCloseTo(Math.sqrt(200 * 200 - 120 * 120));
      expect(floorRadii(light({ z: 250, dimPx: 200 })).dimFloor).toBe(0);
    });

    it('a high sphere reaches less of the floor once the distance is measured in three dimensions', () => {
      const s = scene({ lights: [light({ x: 0, y: 0, z: 180, dimPx: 200, brightPx: 100 })] });
      expect(lightLevelAt(s, 80, 0)).toBeGreaterThan(0);
      expect(lightLevelAt(s, 120, 0)).toBe(0);
    });

    it('carries along the surface it is level with, not only along the ground', () => {
      // A lamp 120px up reaches 160px across the floor of a 200px sphere, and the whole 200
      // along a walkway at its own height.
      const lamp = light({ x: 0, y: 0, z: 120, dimPx: 200, brightPx: 200 });

      expect(floorRadii(lamp).dimFloor).toBeCloseTo(160);
      expect(floorRadii(lamp, 120).dimFloor).toBeCloseTo(200);
    });

    it('lights a thing standing level with it as it lights the ground beneath itself', () => {
      const s = scene({ lights: [light({ x: 0, y: 0, z: 200, dimPx: 200, brightPx: 200 })] });

      // The sphere only grazes the floor, so nothing on the floor is lit by it.
      expect(objectLightLevel(s, 100, 0, 0, true, 0)).toBe(0);
      // A walkway at the lamp's own height is well inside it.
      expect(objectLightLevel(s, 100, 0, 0, true, 200)).toBeGreaterThan(0);
    });

    it('a high enough one reaches none of it', () => {
      const s = scene({ lights: [light({ x: 0, y: 0, z: 250, dimPx: 200 })] });
      expect(lightLevelAt(s, 0, 0)).toBe(0);
    });

    it('tips the axis of the light with the pitch', () => {
      expect(lightAxis(light({ pitch: 0 })).z).toBeCloseTo(0);
      expect(lightAxis(light({ pitch: -90 })).z).toBeCloseTo(-1);
      expect(lightAxis(light({ pitch: 90 })).z).toBeCloseTo(1);
    });

    it('a cone pointing straight down lights the ground below and nothing to the side', () => {
      const s = scene({
        lights: [light({ x: 0, y: 0, z: 100, dimPx: 1000, angle: 60, direction: 0, pitch: -90 })],
      });
      expect(lightReaches(s, s.lights[0], 0, 0)).toBe(true);
      expect(lightReaches(s, s.lights[0], 300, 0)).toBe(false);
    });

    it('one pointing forward and down lights the floor ahead and nothing behind', () => {
      const s = scene({
        lights: [light({ x: 0, y: 0, z: 50, dimPx: 1000, angle: 60, direction: 0, pitch: -30 })],
      });
      expect(lightReaches(s, s.lights[0], 100, 0)).toBe(true);
      expect(lightReaches(s, s.lights[0], -100, 0)).toBe(false);
    });

    it('builds a cone of several fins for a high light pointing down', () => {
      const beam = computeLightBeam(light({ x: 100, y: 100, z: 200, angle: 45, direction: 0, pitch: -52, dimPx: 600 }));
      expect(beam).not.toBeNull();
      expect(beam!.height).toBeGreaterThan(0);
      expect(beam!.width).toBeGreaterThan(0);
      expect(beam!.fins.length).toBeGreaterThan(1);
      expect(beam!.fins[0].startsWith('matrix3d(')).toBe(true);
      expect(beam!.clip.startsWith('polygon(')).toBe(true);
    });

    it('builds none for a sphere, nor for a light lying on the ground pointing down', () => {
      expect(computeLightBeam(light({ angle: 360, z: 200 }))).toBeNull();
      expect(computeLightBeam(light({ angle: 45, z: 0, pitch: -52 }))).toBeNull();
    });

    it('runs a beam turned upward the whole length the light carries', () => {
      const beam = computeLightBeam(light({ x: 0, y: 0, z: 25, angle: 23, direction: 334, pitch: 25, dimPx: 500 }));

      expect(beam).not.toBeNull();
      expect(beam!.height).toBeCloseTo(500, 6);
      expect(beam!.fins.length).toBeGreaterThan(1);
    });

    it('cuts a beam turned down where it meets the floor', () => {
      // Two hundred up and turned a right angle down: it has two hundred to run, not its five
      // hundred of reach.
      const beam = computeLightBeam(light({ x: 0, y: 0, z: 200, angle: 23, pitch: -90, dimPx: 500 }));

      expect(beam!.height).toBeCloseTo(200, 6);
    });

    it('holds a beam held level to the length the light carries', () => {
      const beam = computeLightBeam(light({ x: 0, y: 0, z: 100, angle: 23, pitch: 0, dimPx: 500 }));

      expect(beam!.height).toBeCloseTo(500, 6);
    });

    it('gives a sphere on the floor an orb that faces the camera', () => {
      const glow = computeLightGlow(light({ x: 100, y: 120, z: 80, angle: 360, brightPx: 150, dimPx: 300 }), 50);
      expect(glow).not.toBeNull();
      expect(glow!.x).toBe(100);
      expect(glow!.y).toBe(120);
      expect(glow!.z).toBe(80);
      expect(glow!.size).toBeGreaterThan(0);
      expect(glow!.transform).toBeNull();
    });

    it('gives one on a wall an orb in the plane of that wall', () => {
      const glow = computeLightGlow(light({ angle: 360, brightPx: 150, dimPx: 300, surface: 'north-wall' }), 50);
      expect(glow).not.toBeNull();
      expect(glow!.transform).not.toBeNull();
      expect(glow!.transform!.startsWith('matrix3d(')).toBe(true);
    });

    it('gives none to a cone or to something as large as the sun', () => {
      expect(computeLightGlow(light({ angle: 45, brightPx: 150 }), 50)).toBeNull();
      expect(computeLightGlow(light({ angle: 360, brightPx: 600, dimPx: 1200 }), 50)).toBeNull();
    });
  });

  describe('lightLevelAt', () => {
    it('is full inside the bright radius, half through the dim one and nothing beyond', () => {
      const s = scene({ lights: [light({ x: 0, y: 0, brightPx: 100, dimPx: 200 })] });
      expect(lightLevelAt(s, 50, 0)).toBe(1);
      expect(lightLevelAt(s, 150, 0)).toBe(0.5);
      expect(lightLevelAt(s, 300, 0)).toBe(0);
    });

    it('the global light acts as a floor under everything', () => {
      const s = scene({ globalIllumination: 0.3 });
      expect(lightLevelAt(s, 999, 999)).toBeCloseTo(0.3);
    });
  });

  describe('viewerOwns', () => {
    it('counts only their own as owned for an ordinary viewer', () => {
      expect(viewerOwns(PLAYER, 'p1')).toBe(true);
      expect(viewerOwns(PLAYER, 'p2')).toBe(false);
    });

    it('counts a named set as owned, which is how a spectator gathers several fields of view', () => {
      const spectator: SceneViewer = { userId: 'guest', isGameMaster: false, visionOwnerIds: ['p1', 'p2'] };
      expect(viewerOwns(spectator, 'p1')).toBe(true);
      expect(viewerOwns(spectator, 'p2')).toBe(true);
      expect(viewerOwns(spectator, 'p3')).toBe(false);
    });

    it('counts an empty owner as owned by nobody', () => {
      expect(viewerOwns(PLAYER, '')).toBe(false);
    });
  });

  describe('viewerShares', () => {
    const COMPANION: SceneViewer = { userId: 'p1', isGameMaster: false, partyIds: ['party-a'] };

    it('shares another players character from the same party', () => {
      expect(viewerShares(COMPANION, 'p2', 'party-a')).toBe(true);
    });

    it('shares nothing from another party or from none', () => {
      expect(viewerShares(COMPANION, 'p2', 'party-b')).toBe(false);
      expect(viewerShares(COMPANION, 'p2', '')).toBe(false);
      expect(viewerShares(COMPANION, 'p2', undefined)).toBe(false);
    });

    it('shares your own whatever the party', () => {
      expect(viewerShares(COMPANION, 'p1', '')).toBe(true);
      expect(viewerShares(PLAYER, 'p1', 'party-a')).toBe(true);
    });
  });

  describe('sharing sight between travelling companions', () => {
    const alone: SceneViewer = { userId: 'p1', isGameMaster: false };
    const companion: SceneViewer = { userId: 'p1', isGameMaster: false, partyIds: ['party-a'] };

    it('sees what a companions dark vision reaches', () => {
      const shared = scene({
        visionSources: [
          source({ x: 800, y: 800, type: VisionType.DARKVISION, rangePx: 200, owner: 'p2', partyId: 'party-a' }),
        ],
      });

      expect(isPointVisible(shared, 820, 820, companion)).toBe(true);
      expect(isPointVisible(shared, 820, 820, alone)).toBe(false);
    });

    it('shares nothing with a character who travels apart', () => {
      const unshared = scene({
        visionSources: [source({ x: 800, y: 800, type: VisionType.DARKVISION, rangePx: 200, owner: 'p2' })],
      });

      expect(isPointVisible(unshared, 820, 820, companion)).toBe(false);
    });
  });

  describe('isPointVisible', () => {
    it('the game master always sees', () => {
      expect(isPointVisible(scene(), 500, 500, GM)).toBe(true);
    });

    it('a player with no sight sees nothing', () => {
      expect(isPointVisible(scene(), 500, 500, PLAYER)).toBe(false);
    });

    it('one with ordinary sight sees what is lit', () => {
      const s = scene({
        lights: [light({ x: 500, y: 500, brightPx: 100, dimPx: 200 })],
        visionSources: [source({ type: VisionType.NORMAL, owner: 'p1' })],
      });
      expect(isPointVisible(s, 520, 500, PLAYER)).toBe(true);
      expect(isPointVisible(s, 900, 900, PLAYER)).toBe(false);
    });

    it('one with dark vision sees the dark within their range', () => {
      const s = scene({
        visionSources: [source({ x: 100, y: 100, type: VisionType.DARKVISION, rangePx: 150, owner: 'p1' })],
      });
      expect(isPointVisible(s, 180, 100, PLAYER)).toBe(true);
      expect(isPointVisible(s, 400, 100, PLAYER)).toBe(false);
    });

    it('what is lit can be seen even by a player with no source of sight', () => {
      const s = scene({ lights: [light({ x: 500, y: 500, dimPx: 200 })] });
      expect(isPointVisible(s, 520, 500, PLAYER)).toBe(true);
    });

    it('true sight sees through obstacles within its range, where dark vision is stopped by a wall', () => {
      const truesight = scene({
        sightSegments: [WALL_AT_X100],
        visionSources: [source({ x: 0, y: 0, type: VisionType.TRUESIGHT, rangePx: 300, owner: 'p1' })],
      });
      expect(isPointVisible(truesight, 200, 0, PLAYER)).toBe(true);
      expect(isPointVisible(truesight, 400, 0, PLAYER)).toBe(false);

      const darkvision = scene({
        sightSegments: [WALL_AT_X100],
        visionSources: [source({ x: 0, y: 0, type: VisionType.DARKVISION, rangePx: 300, owner: 'p1' })],
      });
      expect(isPointVisible(darkvision, 200, 0, PLAYER)).toBe(false);
    });

    it('a piece that casts a shadow is not hidden by its own footprint', () => {
      const footprint: Segment[] = [
        { x1: -25, y1: -25, x2: 25, y2: -25 },
        { x1: 25, y1: -25, x2: 25, y2: 25 },
        { x1: 25, y1: 25, x2: -25, y2: 25 },
        { x1: -25, y1: 25, x2: -25, y2: -25 },
      ];
      const s = scene({
        lights: [light({ x: 0, y: -100, dimPx: 1000, castShadows: true, sourceId: 'L' })],
        visionSources: [source({ x: 0, y: -200, type: VisionType.NORMAL, owner: 'p1' })],
        shadowCasters: [caster({ ownerId: 'mob', x: 0, y: 0, radiusPx: 25, segments: footprint })],
      });
      expect(isPointVisible(s, 0, 0, PLAYER)).toBe(true);
    });

    it('a blinded source gives no sight in the dark', () => {
      const s = scene({
        visionSources: [source({ x: 0, y: 0, type: VisionType.BLIND, rangePx: 1000, owner: 'p1' })],
      });
      expect(isPointVisible(s, 100, 0, PLAYER)).toBe(false);
    });

    it('a light meant for everybody is seen without any sight at all', () => {
      const s = scene({ lights: [light({ x: 500, y: 500, dimPx: 200, revealToAll: true })] });
      expect(isPointVisible(s, 550, 500, PLAYER)).toBe(true);
    });

    it('another players dark vision adds nothing to your own', () => {
      const s = scene({
        visionSources: [source({ x: 800, y: 800, type: VisionType.DARKVISION, rangePx: 200, owner: 'other' })],
      });
      expect(isPointVisible(s, 820, 800, PLAYER)).toBe(false);
    });

    it('a spectator takes up the dark vision of the players they watch', () => {
      const s = scene({
        visionSources: [source({ x: 800, y: 800, type: VisionType.DARKVISION, rangePx: 200, owner: 'other' })],
      });
      const spectator: SceneViewer = { userId: 'guest', isGameMaster: false, visionOwnerIds: ['other'] };
      expect(isPointVisible(s, 820, 800, spectator)).toBe(true);
    });

    it('one watching nobody sees nothing in the dark', () => {
      const s = scene({
        visionSources: [source({ x: 800, y: 800, type: VisionType.DARKVISION, rangePx: 200, owner: 'p1' })],
      });
      const spectator: SceneViewer = { userId: 'guest', isGameMaster: false, visionOwnerIds: [] };
      expect(isPointVisible(s, 820, 800, spectator)).toBe(false);
    });

    it('a spectator gathers the sight of several players', () => {
      const s = scene({
        visionSources: [
          source({ x: 100, y: 100, type: VisionType.DARKVISION, rangePx: 100, owner: 'p1' }),
          source({ x: 800, y: 800, type: VisionType.DARKVISION, rangePx: 100, owner: 'p2' }),
        ],
      });
      const spectator: SceneViewer = { userId: 'guest', isGameMaster: false, visionOwnerIds: ['p1', 'p2'] };
      expect(isPointVisible(s, 150, 100, spectator)).toBe(true);
      expect(isPointVisible(s, 820, 800, spectator)).toBe(true);
      expect(isPointVisible(s, 450, 450, spectator)).toBe(false);
    });

    it('a wall between the source and the target blocks it', () => {
      const s = scene({
        lights: [light({ x: 0, y: 0, dimPx: 1000 })],
        visionSources: [source({ x: 0, y: 0, type: VisionType.NORMAL, owner: 'p1' })],
        sightSegments: [WALL_AT_X100],
        lightSegments: [WALL_AT_X100],
      });
      expect(isPointVisible(s, 50, 0, PLAYER)).toBe(true);
      expect(isPointVisible(s, 200, 0, PLAYER)).toBe(false);
    });

    it('a window lets the light through, and what it lights can be seen', () => {
      const s = scene({
        lights: [light({ x: 0, y: 0, dimPx: 1000 })],
        sightSegments: [WALL_AT_X100],
        lightSegments: [],
      });
      expect(lightLevelAt(s, 200, 0)).toBeGreaterThan(0);
      expect(isPointVisible(s, 200, 0, PLAYER)).toBe(true);
    });

    it('a player with sight cannot see a lit place behind terrain that blocks it', () => {
      const s = scene({
        lights: [light({ x: 500, y: 0, dimPx: 1000 })],
        visionSources: [source({ x: 0, y: 0, type: VisionType.NORMAL, owner: 'p1' })],
        sightSegments: [WALL_AT_X100],
        lightSegments: [],
      });
      expect(isLit(s, 200, 0)).toBe(true);
      expect(isPointVisible(s, 200, 0, PLAYER)).toBe(false);
    });

    it('a window still stops dark vision', () => {
      const s = scene({
        visionSources: [source({ x: -50, y: 0, type: VisionType.DARKVISION, rangePx: 1000, owner: 'p1' })],
        sightSegments: [WALL_AT_X100],
        lightSegments: [],
      });
      expect(isPointVisible(s, 200, 0, PLAYER)).toBe(false);
    });

    it('a light that ignores obstacles shines through a wall', () => {
      const s = scene({
        lights: [light({ x: 0, y: 0, dimPx: 1000, ignoreOcclusion: true })],
        lightSegments: [WALL_AT_X100],
      });
      expect(lightLevelAt(s, 200, 0)).toBeGreaterThan(0);
    });

    it('a light that casts shadows throws them from the pieces', () => {
      const s = scene({
        lights: [light({ x: 0, y: 0, dimPx: 1000, castShadows: true, sourceId: 'light' })],
        shadowCasters: [caster({ ownerId: 'tokenA' })],
      });
      expect(lightLevelAt(s, 50, 0)).toBeGreaterThan(0);
      expect(lightLevelAt(s, 200, 0)).toBe(0);
    });

    it('one that does not passes them by', () => {
      const s = scene({
        lights: [light({ x: 0, y: 0, dimPx: 1000, castShadows: false })],
        shadowCasters: [caster({ ownerId: 'tokenA' })],
      });
      expect(lightLevelAt(s, 200, 0)).toBeGreaterThan(0);
    });

    it('a glowing piece does not shadow its own light', () => {
      const s = scene({
        lights: [light({ x: 0, y: 0, dimPx: 1000, castShadows: true, sourceId: 'tokenA' })],
        shadowCasters: [caster({ ownerId: 'tokenA' })],
      });
      expect(lightLevelAt(s, 200, 0)).toBeGreaterThan(0);
    });

    it('one that ignores obstacles and casts shadows throws them from the pieces alone', () => {
      const s = scene({
        lights: [light({ x: 0, y: 0, dimPx: 1000, ignoreOcclusion: true, castShadows: true, sourceId: 'light' })],
        lightSegments: [{ x1: 50, y1: -200, x2: 50, y2: 200 }],
        shadowCasters: [caster({ ownerId: 'tokenA' })],
      });
      expect(lightLevelAt(s, 70, 0)).toBeGreaterThan(0);
      expect(lightLevelAt(s, 200, 0)).toBe(0);
    });
  });

  describe('how bright each face is', () => {
    it('is lit near the source and dark far from it', () => {
      const s = scene({ lights: [light({ x: 0, y: 0, brightPx: 50, dimPx: 200 })] });
      expect(objectLightLevel(s, 100, 0, 0)).toBeGreaterThan(0);
      expect(objectLightLevel(s, 500, 0, 0)).toBe(0);
    });

    it('keeps a face bright by passing the pieces by', () => {
      const s = scene({
        lights: [light({ x: 0, y: 0, brightPx: 50, dimPx: 1000, castShadows: true, sourceId: 'L' })],
        shadowCasters: [caster({ ownerId: 'c', x: 100, y: 0, radiusPx: 10, segments: [WALL_AT_X100] })],
      });
      expect(objectLightLevel(s, 200, 0, 0, false)).toBe(0);
      expect(objectLightLevel(s, 200, 0, 0, true)).toBeGreaterThan(0);
    });

    it('is at full brightness everywhere once the dark is switched off', () => {
      const s = scene({
        darknessEnabled: false,
        lights: [light({ x: 0, y: 0, brightPx: 50, dimPx: 300 })],
        sightSegments: [WALL_AT_X100],
      });

      expect(objectBrightnessFor(s, PLAYER, 100, 0, 0)).toBe(1);
      expect(objectBrightnessFor(s, PLAYER, 600, 0, 0)).toBe(1);
    });

    it('is at full brightness everywhere once the whole table is lit', () => {
      const s = scene({
        globalIllumination: 1,
        sightSegments: [WALL_AT_X100],
      });

      expect(objectBrightnessFor(s, PLAYER, 600, 0, 0)).toBe(1);
    });

    it('asks the geometry nothing once the dark is switched off', () => {
      const s = scene({ darknessEnabled: false });
      let reads = 0;
      for (const field of ['lights', 'sightSegments', 'shadowCasters', 'visionSources'] as const) {
        const value = s[field];
        Object.defineProperty(s, field, {
          get: () => {
            reads++;
            return value;
          },
        });
      }

      objectBrightnessFor(s, PLAYER, 600, 0, 0);

      expect(reads).toBe(0);
    });

    it('falls away across the ring rather than dropping in one step', () => {
      const s = scene({ lights: [light({ x: 0, y: 0, brightPx: 100, dimPx: 300 })] });

      expect(objectLightLevel(s, 100, 0, 0)).toBe(1);
      expect(objectLightLevel(s, 200, 0, 0)).toBeCloseTo(0.5, 3);
      expect(objectLightLevel(s, 300, 0, 0)).toBeCloseTo(0, 3);
    });

    it('carries a thing from what the eye is worth up to the full light', () => {
      const s = scene({
        lights: [light({ x: 0, y: 0, brightPx: 100, dimPx: 300 })],
        visionSources: [source({ x: 0, y: 0, type: VisionType.NORMAL, owner: 'p1', rangePx: 1000 })],
      });

      expect(objectBrightnessFor(s, PLAYER, 100, 0, 0)).toBe(1);
      expect(objectBrightnessFor(s, PLAYER, 200, 0, 0)).toBeCloseTo(0.7, 3);
      expect(objectBrightnessFor(s, PLAYER, 300, 0, 0)).toBeCloseTo(0.4, 3);
    });

    it('rises without a step anywhere along the way', () => {
      const s = scene({
        lights: [light({ x: 0, y: 0, brightPx: 100, dimPx: 300 })],
        visionSources: [source({ x: 0, y: 0, type: VisionType.NORMAL, owner: 'p1', rangePx: 1000 })],
      });

      let previous = objectBrightnessFor(s, PLAYER, 300, 0, 0);
      for (let x = 295; x >= 100; x -= 5) {
        const here = objectBrightnessFor(s, PLAYER, x, 0, 0);
        expect(here).toBeGreaterThanOrEqual(previous);
        expect(here - previous).toBeLessThan(0.05);
        previous = here;
      }
    });

    it('lights the face turned to the light and leaves the opposite one dark', () => {
      const s = scene({
        lights: [light({ x: 0, y: 0, brightPx: 50, dimPx: 300 })],
        visionSources: [source({ x: 0, y: 0, type: VisionType.NORMAL, owner: 'p1' })],
      });
      const litFace = objectBrightnessFor(s, PLAYER, 100, 0, 0);
      const darkFace = objectBrightnessFor(s, PLAYER, 600, 0, 0);
      expect(litFace).toBeGreaterThan(darkFace);
    });
  });

  describe('the silhouettes thrown onto a wall', () => {
    const northFace: WallFace = { ax: 0, ay: 0, bx: 200, by: 0, nx: 0, ny: -1, heightPx: 100 };

    it('throws whatever stands between the light and the wall onto it', () => {
      const s = scene({
        lights: [light({ x: 100, y: -100, dimPx: 1000, castShadows: true, sourceId: 'L' })],
        shadowCasters: [caster({ ownerId: 'c', x: 100, y: -50, radiusPx: 25, segments: [] })],
      });
      const sils = computeWallSilhouettes(s, northFace, 75);
      expect(sils).toHaveLength(1);
      expect(sils[0].localX).toBeCloseTo(100);
      expect(sils[0].width).toBeCloseTo(100);
      expect(sils[0].height).toBeGreaterThan(0);
    });

    it('keeps the picture of what threw it', () => {
      const s = scene({
        lights: [light({ x: 100, y: -100, dimPx: 1000, castShadows: true, sourceId: 'L' })],
        shadowCasters: [caster({ ownerId: 'c', x: 100, y: -50, radiusPx: 25, segments: [], imageUrl: 'token.png' })],
      });
      expect(computeWallSilhouettes(s, northFace, 75)[0].imageUrl).toBe('token.png');
    });

    it('throws none from its own light', () => {
      const s = scene({
        lights: [light({ x: 100, y: -100, dimPx: 1000, castShadows: true, sourceId: 'c' })],
        shadowCasters: [caster({ ownerId: 'c', x: 100, y: -50, radiusPx: 25, segments: [] })],
      });
      expect(computeWallSilhouettes(s, northFace, 75)).toHaveLength(0);
    });

    it('throws none when the light is behind what would throw it', () => {
      const s = scene({
        lights: [light({ x: 100, y: 50, dimPx: 1000, castShadows: true, sourceId: 'L' })],
        shadowCasters: [caster({ ownerId: 'c', x: 100, y: -50, radiusPx: 25, segments: [] })],
      });
      expect(computeWallSilhouettes(s, northFace, 75)).toHaveLength(0);
    });

    it('throws one whose centre falls off the face as long as its width reaches it', () => {
      const s = scene({
        lights: [light({ x: 300, y: -100, dimPx: 1000, castShadows: true, sourceId: 'L' })],
        shadowCasters: [caster({ ownerId: 'c', x: 260, y: -50, radiusPx: 25, segments: [] })],
      });
      const sils = computeWallSilhouettes(s, northFace, 75);
      expect(sils).toHaveLength(1);
      expect(sils[0].localX).toBeCloseTo(220);
    });

    it('throws none that misses the face entirely', () => {
      const s = scene({
        lights: [light({ x: 600, y: -100, dimPx: 2000, castShadows: true, sourceId: 'L' })],
        shadowCasters: [caster({ ownerId: 'c', x: 560, y: -50, radiusPx: 10, segments: [] })],
      });
      expect(computeWallSilhouettes(s, northFace, 75)).toHaveLength(0);
    });

    it('throws none onto a wall another wall hides from the light', () => {
      const s = scene({
        lights: [light({ x: 100, y: -300, dimPx: 1000, castShadows: true, sourceId: 'L' })],
        shadowCasters: [caster({ ownerId: 'c', x: 100, y: -250, radiusPx: 25, segments: [] })],
        lightSegments: [{ x1: -100, y1: -150, x2: 300, y2: -150, heightPx: 100 }],
      });
      expect(computeWallSilhouettes(s, northFace, 75)).toHaveLength(0);
    });

    it('throws one over a wall too low to hide the face', () => {
      const s = scene({
        lights: [light({ x: 100, y: -300, dimPx: 1000, castShadows: true, sourceId: 'L' })],
        shadowCasters: [caster({ ownerId: 'c', x: 100, y: -250, radiusPx: 25, segments: [] })],
        lightSegments: [{ x1: -100, y1: -150, x2: 300, y2: -150, heightPx: 5 }],
      });
      expect(computeWallSilhouettes(s, northFace, 75)).toHaveLength(1);
    });

    it('throws none onto a face the light falls short of', () => {
      const s = scene({
        lights: [light({ x: 100, y: -300, dimPx: 100, castShadows: true, sourceId: 'L' })],
        shadowCasters: [caster({ ownerId: 'c', x: 100, y: -250, radiusPx: 25, segments: [] })],
      });
      expect(computeWallSilhouettes(s, northFace, 75)).toHaveLength(0);
    });
  });

  describe('the pools of light on a wall', () => {
    const northFace: WallFace = { ax: 0, ay: 0, bx: 200, by: 0, nx: 0, ny: -1, heightPx: 100 };

    it('pools a light in front of the face', () => {
      const s = scene({ lights: [light({ x: 100, y: -60, brightPx: 50, dimPx: 200 })] });
      const pools = computeWallLights(s, northFace);
      expect(pools).toHaveLength(1);
      expect(pools[0].localX).toBeCloseTo(100);
      expect(pools[0].radiusX).toBeCloseTo(Math.sqrt(200 * 200 - 60 * 60));
    });

    it('centres the pool at the height of the light', () => {
      const onFloor = scene({ lights: [light({ x: 100, y: -60, z: 0, dimPx: 200 })] });
      expect(computeWallLights(onFloor, northFace)[0].localY).toBeCloseTo(100);
      const elevated = scene({ lights: [light({ x: 100, y: -60, z: 40, dimPx: 200 })] });
      expect(computeWallLights(elevated, northFace)[0].localY).toBeCloseTo(100 - 40);
    });

    it('pools nothing from behind it', () => {
      const s = scene({ lights: [light({ x: 100, y: 60, dimPx: 200 })] });
      expect(computeWallLights(s, northFace)).toHaveLength(0);
    });

    it('pools nothing from beyond the dim radius', () => {
      const s = scene({ lights: [light({ x: 100, y: -300, dimPx: 200 })] });
      expect(computeWallLights(s, northFace)).toHaveLength(0);
    });

    it('pools nothing from a light a wall blocks', () => {
      const s = scene({
        lights: [light({ x: 100, y: -60, dimPx: 200 })],
        lightSegments: [{ x1: -10, y1: -30, x2: 210, y2: -30 }],
      });
      expect(computeWallLights(s, northFace)).toHaveLength(0);
    });

    it('pools nothing on a face the corner of a wall keeps the light off', () => {
      const s = scene({
        lights: [light({ x: 160, y: -60, dimPx: 200 })],
        lightSegments: [{ x1: 100, y1: 0, x2: 100, y2: -150, heightPx: 100 }],
      });
      const hidden: WallFace = { ax: 0, ay: 0, bx: 80, by: 0, nx: 0, ny: -1, heightPx: 100 };
      expect(computeWallLights(s, hidden)).toHaveLength(0);
    });

    it('cuts the pool where a wall as tall as the face stands in the way', () => {
      const s = scene({
        lights: [light({ x: 160, y: -60, dimPx: 200 })],
        lightSegments: [{ x1: 100, y1: 0, x2: 100, y2: -150, heightPx: 100 }],
      });
      const pools = computeWallLights(s, northFace);
      expect(pools).toHaveLength(1);
      const shadow = pools[0].shadow ?? [];
      expect(shadow.length).toBeGreaterThan(1);
      expect(shadow[0].y).toBe(0);
      expect(shadow[shadow.length - 1].y).toBe(100);
    });

    it('lets the light over a low wall onto the top of the face', () => {
      const s = scene({
        lights: [light({ x: 160, y: -60, z: 25, dimPx: 200 })],
        lightSegments: [{ x1: 100, y1: 0, x2: 100, y2: -150, heightPx: 30 }],
      });
      const shadow = computeWallLights(s, northFace)[0].shadow ?? [];
      const hidden = shadow.filter((point) => point.x < 90);
      expect(hidden.length).toBeGreaterThan(0);
      for (const point of hidden) {
        expect(point.y).toBeGreaterThan(0);
        expect(point.y).toBeLessThan(100);
      }
    });

    it('leaves a pool nothing blocks unclipped', () => {
      const s = scene({ lights: [light({ x: 100, y: -60, dimPx: 200 })] });
      expect(computeWallLights(s, northFace)[0].shadow).toBeUndefined();
    });

    it('is full through the bright range and falls off through the dim one', () => {
      const near = scene({ lights: [light({ x: 100, y: -30, brightPx: 50, dimPx: 200 })] });
      expect(computeWallLights(near, northFace)[0].intensity).toBe(1);
      const far = scene({ lights: [light({ x: 100, y: -120, brightPx: 50, dimPx: 200 })] });
      expect(computeWallLights(far, northFace)[0].intensity).toBeLessThan(1);
    });
  });

  describe('what a light bothers to look at', () => {
    it('is not blocked by a wall standing outside its reach', () => {
      const lit = light({ x: 0, y: 0, dimPx: 200 });
      const far: Segment = { x1: 900, y1: -500, x2: 900, y2: 500 };
      const built = scene({ lights: [lit], lightSegments: [far] });

      expect(lightReaches(built, lit, 150, 0)).toBe(true);
    });

    it('is still blocked by a wall standing inside it', () => {
      const lit = light({ x: 0, y: 0, dimPx: 200 });
      const built = scene({ lights: [lit], lightSegments: [WALL_AT_X100] });

      expect(lightReaches(built, lit, 150, 0)).toBe(false);
    });

    it('gives the same answer asked twice, having remembered what stands in its way', () => {
      const lit = light({ x: 0, y: 0, dimPx: 200 });
      const built = scene({ lights: [lit], lightSegments: [WALL_AT_X100] });

      expect(lightReaches(built, lit, 150, 0)).toBe(lightReaches(built, lit, 150, 0));
      expect(lightReaches(built, lit, 50, 0)).toBe(true);
    });

    it('answers for the scene it was asked about, not the one it was asked about first', () => {
      // The same light can stand in two scenes at once, and what remembering it saves must
      // not be what one scene knew handed to the other.
      const lit = light({ x: 0, y: 0, dimPx: 200 });
      const open = scene({ lights: [lit] });
      const walled = scene({ lights: [lit], lightSegments: [WALL_AT_X100] });

      expect(lightReaches(open, lit, 150, 0)).toBe(true);
      expect(lightReaches(walled, lit, 150, 0)).toBe(false);
      expect(lightReaches(open, lit, 150, 0)).toBe(true);
    });

    it('still sees a wall between a tilted light and the pool it throws off to one side', () => {
      // Pitched over and aimed along +x, so the pool lands well away from the light itself.
      const lit = light({ x: 0, y: 0, z: 200, dimPx: 600, angle: 60, direction: 0, pitch: -30 });
      const between: Segment = { x1: 250, y1: -400, x2: 250, y2: 400 };

      const open = computeOverlayPlan(scene({ lights: [lit] }), GM);
      const blocked = computeOverlayPlan(scene({ lights: [lit], lightSegments: [between] }), GM);

      const reachOf = (plan: typeof open) => Math.max(...(plan.glows[0].clipPolygon ?? []).map((point) => point.x));

      expect(open.glows).toHaveLength(1);
      expect(blocked.glows).toHaveLength(1);
      // The wall stands well beyond the light's own box, so culling has to reach past it
      // or the pool would spill straight through.
      expect(reachOf(open)).toBeGreaterThan(250);
      expect(reachOf(blocked)).toBeLessThan(reachOf(open));
    });
  });

  describe('the floor a cone light throws its pool on', () => {
    /** What the dungeon generator hangs on a wall: wide, and turned a little upward. */
    function sconce(): SceneLight {
      return light({ x: 500, y: 500, z: 150, brightPx: 150, dimPx: 350, angle: 200, pitch: 8 });
    }

    it('lights the floor under a lamp on a wall, turned a little upward', () => {
      const plan = computeOverlayPlan(scene({ lights: [sconce()] }), GM);

      expect(plan.reveals).toHaveLength(1);
      expect(plan.reveals[0].dimPx).toBeGreaterThan(0);
    });

    it('lays the pool about the spot below the lamp', () => {
      const plan = computeOverlayPlan(scene({ lights: [sconce()] }), GM);

      expect(plan.reveals[0].x).toBeCloseTo(500, 0);
      expect(plan.reveals[0].y).toBeCloseTo(500, 0);
    });

    it('lights a block only as far as the pool it throws on the floor', () => {
      const lamp = sconce();
      const s = scene({ lights: [lamp] });
      const pool = lightFloorPool(lamp);

      expect(pool).not.toBeNull();
      expect(objectLightLevel(s, pool!.cx + pool!.brightPx - 5, pool!.cy, 0)).toBeCloseTo(1, 2);
      expect(objectLightLevel(s, pool!.cx + pool!.dimPx + 5, pool!.cy, 0)).toBe(0);
    });

    it('reads a block and the floor beneath it off the same pool', () => {
      const lamp = sconce();
      const s = scene({ lights: [lamp] });
      const pool = lightFloorPool(lamp);
      const plan = computeOverlayPlan(s, GM);

      expect(plan.reveals[0].x).toBeCloseTo(pool!.cx, 0);
      expect(plan.reveals[0].y).toBeCloseTo(pool!.cy, 0);
      expect(pool!.brightPx / pool!.dimPx).toBeCloseTo(lamp.brightPx / lamp.dimPx, 3);
    });

    it('leaves a roof above it alone for a narrow light pointed at the floor', () => {
      // Pointed down and narrow: the highest ray it throws still goes down, so a surface
      // over the lamp catches nothing of it.
      const down = light({ x: 500, y: 500, z: 100, angle: 60, pitch: -30, brightPx: 150, dimPx: 300 });

      expect(lightFloorPool(down, 200)).toBeNull();
    });

    it('lays the pool a cone throws on a roof in front of it, never behind', () => {
      // Wide enough that its highest ray points up, so a roof above is lit - along the way
      // the lamp faces.
      const wide = light({ x: 500, y: 500, z: 100, angle: 200, pitch: 10, brightPx: 150, dimPx: 300 });

      const pool = lightFloorPool(wide, 200);

      expect(pool).not.toBeNull();
      expect(pool!.cx).toBeGreaterThanOrEqual(500);
    });

    it('leaves the floor alone for a narrow light pointed at the ceiling', () => {
      const upward = light({ x: 500, y: 500, z: 150, angle: 60, pitch: 80 });

      expect(computeOverlayPlan(scene({ lights: [upward] }), GM).reveals).toHaveLength(0);
    });

    it('still throws the pool where a light pointed down is aimed', () => {
      const spot = light({ x: 500, y: 500, z: 200, angle: 60, pitch: -90, dimPx: 400 });
      const plan = computeOverlayPlan(scene({ lights: [spot] }), GM);

      expect(plan.reveals).toHaveLength(1);
      expect(plan.reveals[0].x).toBeCloseTo(500, 0);
      expect(plan.reveals[0].y).toBeCloseTo(500, 0);
    });
  });

  describe('computeOverlayPlan', () => {
    it('shows the game master a dim preview, brighter than a player sees', () => {
      const s = scene({ lights: [light(), light()] });
      const gmPlan = computeOverlayPlan(s, GM);
      const playerView = scene({
        lights: [light(), light()],
        visionSources: [source({ type: VisionType.NORMAL, owner: 'p1' })],
      });
      const plPlan = computeOverlayPlan(playerView, PLAYER);
      expect(gmPlan.darknessAlpha).toBeGreaterThan(0);
      expect(gmPlan.darknessAlpha).toBeLessThan(plPlan.darknessAlpha);
      expect(gmPlan.reveals).toHaveLength(2);
      expect(gmPlan.glows).toHaveLength(2);
    });

    it('reveals the lit area to a player with sight', () => {
      const s = scene({
        lights: [light({ x: 500, y: 500 })],
        visionSources: [source({ type: VisionType.NORMAL, owner: 'p1' })],
      });
      const plan = computeOverlayPlan(s, PLAYER);
      expect(plan.darknessAlpha).toBeGreaterThan(0);
      expect(plan.reveals).toHaveLength(1);
      expect(plan.reveals[0].full).toBe(false);
    });

    it('reveals it even to one without a source of sight', () => {
      const s = scene({ lights: [light(), light()] });
      const plan = computeOverlayPlan(s, PLAYER);
      expect(plan.reveals).toHaveLength(2);
    });

    it('narrows what a high sphere reveals to what it reaches on the floor', () => {
      const s = scene({ lights: [light({ x: 100, y: 100, z: 150, dimPx: 200, brightPx: 100 })] });
      const plan = computeOverlayPlan(s, PLAYER);
      expect(plan.reveals).toHaveLength(1);
      expect(plan.reveals[0].dimPx).toBeCloseTo(Math.sqrt(200 * 200 - 150 * 150));
    });

    it('reveals none of it from too high up', () => {
      const s = scene({ lights: [light({ x: 100, y: 100, z: 250, dimPx: 200 })] });
      expect(computeOverlayPlan(s, PLAYER).reveals).toHaveLength(0);
    });

    it('gives a downward cone a footprint on the floor ahead', () => {
      const s = scene({
        lights: [light({ x: 100, y: 100, z: 50, dimPx: 600, angle: 45, direction: 0, pitch: -30 })],
      });
      const plan = computeOverlayPlan(s, PLAYER);
      expect(plan.reveals).toHaveLength(1);
      const reveal = plan.reveals[0];
      expect(reveal.clipPolygon && reveal.clipPolygon.length).toBeGreaterThan(3);
      expect(reveal.x).toBeGreaterThan(100);
    });

    it('adds a full circle for a source of dark vision', () => {
      const s = scene({
        visionSources: [source({ type: VisionType.DARKVISION, rangePx: 150, owner: 'p1' })],
      });
      const plan = computeOverlayPlan(s, PLAYER);
      const fullReveal = plan.reveals.find((r) => r.full);
      expect(fullReveal).toBeTruthy();
      expect(fullReveal?.dimPx).toBe(150);
    });

    it('adds one for true sight that obstacles do not clip', () => {
      const s = scene({
        sightSegments: [WALL_AT_X100],
        visionSources: [source({ type: VisionType.TRUESIGHT, rangePx: 150, owner: 'p1' })],
      });
      const plan = computeOverlayPlan(s, PLAYER);
      const reveal = plan.reveals.find((r) => r.full);
      expect(reveal).toBeTruthy();
      expect(reveal?.clipPolygon).toBeUndefined();
    });

    it('adds a warm glow for heat vision', () => {
      const s = scene({
        visionSources: [source({ type: VisionType.THERMAL, rangePx: 150, owner: 'p1' })],
      });
      const plan = computeOverlayPlan(s, PLAYER);
      const thermalGlow = plan.glows.find((g) => g.color === '#ff5a1e');
      expect(thermalGlow).toBeTruthy();
      expect(thermalGlow?.dimPx).toBe(150);
    });

    it('carries the animation of a light onto the shape', () => {
      const s = scene({ lights: [light({ animation: 'neon' })] });
      const plan = computeOverlayPlan(s, PLAYER);
      expect(plan.glows[0].animation).toBe('neon');
    });

    it('throws a silhouette from a piece under a light that casts shadows', () => {
      const s = scene({
        lights: [light({ x: 100, y: 300, dimPx: 600, castShadows: true })],
        shadowCasters: [caster({ ownerId: 'c1', x: 300, y: 300, radiusPx: 25, segments: [] })],
      });
      const plan = computeOverlayPlan(s, PLAYER);
      expect(plan.shadows).toHaveLength(1);
      // the shadow runs away from the light
      expect(plan.shadows[0].fx).toBeGreaterThan(300);
    });

    it('throws none from a light that does not', () => {
      const s = scene({
        lights: [light({ x: 100, y: 300, dimPx: 600, castShadows: false })],
        shadowCasters: [caster({ ownerId: 'c1', x: 300, y: 300, radiusPx: 25, segments: [] })],
      });
      expect(computeOverlayPlan(s, PLAYER).shadows).toHaveLength(0);
    });

    it('throws none of itself from its own light', () => {
      const s = scene({
        lights: [light({ x: 100, y: 300, dimPx: 600, castShadows: true, sourceId: 'c1' })],
        shadowCasters: [caster({ ownerId: 'c1', x: 300, y: 300, radiusPx: 25, segments: [] })],
      });
      expect(computeOverlayPlan(s, PLAYER).shadows).toHaveLength(0);
    });

    it('thins the darkness and lifts the base reveal with the global light', () => {
      const s = scene({
        globalIllumination: 0.5,
        visionSources: [source({ type: VisionType.NORMAL, owner: 'p1' })],
      });
      const plan = computeOverlayPlan(s, PLAYER);
      expect(plan.baseRevealAlpha).toBeCloseTo(0.5);
      expect(plan.darknessAlpha).toBeCloseTo(0.9 * 0.5);
    });
  });
});

describe('looking down from a height', () => {
  const player = { userId: 'p1', isGameMaster: false };
  const tower = { x1: 100, y1: -1000, x2: 100, y2: 1000, heightPx: 150 };

  function lookingFrom(z: number) {
    return scene({
      darknessEnabled: true,
      darknessLevel: 1,
      globalIllumination: 0,
      sightSegments: [tower],
      visionSources: [source({ x: 0, y: 0, z, type: VisionType.DARKVISION, rangePx: 500 })],
    });
  }

  it('sees nothing past a tower from the ground beside it', () => {
    expect(isPointVisible(lookingFrom(0), 300, 0, player)).toBe(false);
  });

  it('sees past it from on top of it', () => {
    expect(isPointVisible(lookingFrom(200), 300, 0, player)).toBe(true);
  });

  it('still sees nothing past it from halfway up', () => {
    expect(isPointVisible(lookingFrom(100), 300, 0, player)).toBe(false);
  });

  it('sees a head standing on top of the tower', () => {
    // The stone is a hundred out and a hundred and fifty up. A head just past its edge, a
    // hundred and seventy-five up, stands at a steeper angle than the parapet, so it is seen.
    expect(isPointVisible(lookingFrom(25), 110, 0, player, 175)).toBe(true);
  });

  it('does not see the same head away beyond the tower', () => {
    // Far enough back the look comes in under the parapet again, whatever it is aimed at.
    expect(isPointVisible(lookingFrom(25), 800, 0, player, 175)).toBe(false);
  });

  it('sees nothing standing on the ground behind it, as before', () => {
    expect(isPointVisible(lookingFrom(25), 110, 0, player)).toBe(false);
  });

  describe('a piece standing on a crate, seen by the light shone at it', () => {
    const crate = { x1: 100, y1: -1000, x2: 100, y2: 1000, heightPx: 150 };

    /** Ordinary sight, no range of its own: it sees what its own lamp picks out. */
    function withLamp() {
      return scene({
        darknessEnabled: true,
        darknessLevel: 1,
        globalIllumination: 0,
        sightSegments: [crate],
        lightSegments: [crate],
        lights: [light({ x: 0, y: 0, z: 25, brightPx: 300, dimPx: 600 })],
        visionSources: [source({ x: 0, y: 0, z: 25, type: VisionType.NORMAL, rangePx: 0 })],
      });
    }

    it('picks out a head standing on top of it', () => {
      expect(isPointVisible(withLamp(), 110, 0, player, 175)).toBe(true);
    });

    it('picks out nothing on the ground the crate stands on', () => {
      expect(isPointVisible(withLamp(), 110, 0, player, 0)).toBe(false);
    });
  });

  it('is not stopped by the edge of the table however high the eye is', () => {
    const walled = scene({
      darknessEnabled: true,
      darknessLevel: 1,
      globalIllumination: 0,
      sightSegments: [{ x1: 100, y1: -1000, x2: 100, y2: 1000 }],
      visionSources: [source({ x: 0, y: 0, z: 10_000, type: VisionType.DARKVISION, rangePx: 500 })],
    });

    expect(isPointVisible(walled, 300, 0, player)).toBe(false);
  });

  it('reaches round the tower rather than through it, whatever the height', () => {
    expect(isPointVisible(lookingFrom(0), 50, 0, player)).toBe(true);
  });
});

describe('eyeHeightPx()', () => {
  it('counts being written down as high up and having climbed as one and the same', () => {
    expect(eyeHeightPx(2, 0, 50)).toBe(eyeHeightPx(0, 100, 50));
  });

  it('adds the two where a character has both', () => {
    expect(eyeHeightPx(1, 100, 50)).toBe((1 + EYE_HEIGHT_CELLS) * 50 + 100);
  });

  it('sits an eye above the ground it stands on rather than in it', () => {
    expect(eyeHeightPx(0, 0, 50)).toBeGreaterThan(0);
  });
});

describe('a lamp carried up a tower', () => {
  const tower = { x1: 100, y1: -1000, x2: 100, y2: 1000, heightPx: 150 };

  function lamp(z: number): SceneLight {
    return light({ x: 0, y: 0, z, brightPx: 500, dimPx: 500 });
  }

  function around(z: number) {
    return scene({ darknessEnabled: true, darknessLevel: 1, lightSegments: [tower], lights: [lamp(z)] });
  }

  it('lights nothing past the tower from the ground beside it', () => {
    expect(isLit(around(25), 300, 0)).toBe(false);
  });

  it('lights the ground past it from the top of it', () => {
    expect(isLit(around(200), 300, 0)).toBe(true);
  });

  it('is still stopped by a tower it has not been carried above', () => {
    expect(isLit(around(100), 300, 0)).toBe(false);
  });

  it('is never carried above the edge of the table, whose height nobody has said', () => {
    const walled = scene({
      darknessEnabled: true,
      darknessLevel: 1,
      lightSegments: [{ x1: 100, y1: -1000, x2: 100, y2: 1000 }],
      lights: [lamp(10_000)],
    });

    expect(isLit(walled, 300, 0)).toBe(false);
  });

  it('lights what stands beside it either way, the tower being in neither path', () => {
    expect(isLit(around(25), 50, 0)).toBe(true);
    expect(isLit(around(200), 50, 0)).toBe(true);
  });
});

describe('a lamp burning where nobody can see it', () => {
  const wallBetween = scene({
    darknessLevel: 0.9,
    lights: [light({ x: 200, y: 0, brightPx: 50, dimPx: 200 })],
    visionSources: [source({ x: 0, y: 0, owner: 'p1' })],
    sightSegments: [WALL_AT_X100],
    lightSegments: [],
  });

  it('lights the ground it stands on', () => {
    expect(isLit(wallBetween, 200, 0, true, 0)).toBe(true);
  });

  it('is out of reach of the eye behind the wall, which is what the overlay is cut back to', () => {
    expect(isPointVisible(wallBetween, 200, 0, PLAYER)).toBe(false);
  });

  it('still shows it to the eye once the wall is gone', () => {
    const open = scene({
      darknessLevel: 0.9,
      lights: [light({ x: 200, y: 0, brightPx: 50, dimPx: 200 })],
      visionSources: [source({ x: 0, y: 0, owner: 'p1' })],
      sightSegments: [],
      lightSegments: [],
    });
    expect(objectBrightnessFor(open, PLAYER, 200, 0, 0)).toBeGreaterThan(0.5);
  });
});

describe('what a piece with a shaped sight is shown in the dark', () => {
  const cone = visionLobesOf({
    shape: VisionShape.CONE,
    coneAngle: 90,
    coneCount: 1,
    backAngle: 90,
    backScale: 0.4,
    peripheralScale: 0.3,
    direction: 0,
    lobes: '',
  });

  it('cuts the darkvision it is given to the shape of its sight', () => {
    const s = scene({
      visionSources: [source({ type: VisionType.DARKVISION, rangePx: 200, owner: 'p1', lobes: cone })],
    });
    const plan = computeOverlayPlan(s, PLAYER);
    expect(plan.reveals).toHaveLength(1);
    expect(plan.reveals[0].angle).toBe(90);
  });

  it('gives a piece with a face on every side a reveal for each of them', () => {
    const many = visionLobesOf({
      shape: VisionShape.CONE_MULTI,
      coneAngle: 60,
      coneCount: 3,
      backAngle: 90,
      backScale: 0.4,
      peripheralScale: 0.3,
      direction: 0,
      lobes: '',
    });
    const s = scene({
      visionSources: [source({ type: VisionType.DARKVISION, rangePx: 200, owner: 'p1', lobes: many })],
    });
    expect(computeOverlayPlan(s, PLAYER).reveals).toHaveLength(3);
  });

  it('does not look behind itself', () => {
    const s = scene({
      lights: [light({ x: 0, y: 0, brightPx: 400, dimPx: 400 })],
      visionSources: [source({ x: 0, y: 0, owner: 'p1', lobes: cone })],
    });
    expect(isPointVisible(s, 200, 0, PLAYER)).toBe(true);
    expect(isPointVisible(s, -200, 0, PLAYER)).toBe(false);
  });
});

describe('how far a piece is allowed to see', () => {
  const bright = { lights: [light({ x: 0, y: 0, brightPx: 900, dimPx: 900 })], sightSegments: [] };

  it('sees as far as the light carries when no range is set on it', () => {
    const s = scene({ ...bright, visionSources: [source({ x: 0, y: 0, owner: 'p1', rangePx: 0 })] });
    expect(isPointVisible(s, 700, 0, PLAYER)).toBe(true);
  });

  it('follows the light past the range, which is what it sees without one', () => {
    const s = scene({ ...bright, visionSources: [source({ x: 0, y: 0, owner: 'p1', rangePx: 200 })] });
    expect(isPointVisible(s, 150, 0, PLAYER)).toBe(true);
    expect(isPointVisible(s, 700, 0, PLAYER)).toBe(true);
  });

  it('sees only as far as the range where no light falls', () => {
    const dark = scene({
      lights: [],
      sightSegments: [],
      visionSources: [source({ x: 0, y: 0, owner: 'p1', rangePx: 200, type: VisionType.DARKVISION })],
    });
    expect(isPointVisible(dark, 150, 0, PLAYER)).toBe(true);
    expect(isPointVisible(dark, 700, 0, PLAYER)).toBe(false);
  });

  it('holds to it on a table with no dark on it at all', () => {
    const s = scene({
      darknessEnabled: false,
      fogEnabled: true,
      lights: [],
      sightSegments: [],
      visionSources: [source({ x: 0, y: 0, owner: 'p1', rangePx: 200 })],
    });
    expect(isPointVisible(s, 150, 0, PLAYER)).toBe(true);
    expect(isPointVisible(s, 700, 0, PLAYER)).toBe(false);
  });

  it('shortens the range with the lobe a look falls in', () => {
    const lobes = visionLobesOf({
      shape: VisionShape.CONE_PERIPHERAL,
      coneAngle: 90,
      coneCount: 1,
      backAngle: 90,
      backScale: 0.4,
      peripheralScale: 0.25,
      direction: 0,
      lobes: '',
    });
    // In the dark, where the range is the whole of what a piece has to see by.
    const s = scene({
      lights: [],
      sightSegments: [],
      visionSources: [source({ x: 0, y: 0, owner: 'p1', rangePx: 400, lobes, type: VisionType.DARKVISION })],
    });
    expect(isPointVisible(s, 350, 0, PLAYER)).toBe(true);
    expect(isPointVisible(s, -350, 0, PLAYER)).toBe(false);
    expect(isPointVisible(s, -80, 0, PLAYER)).toBe(true);
  });
});
