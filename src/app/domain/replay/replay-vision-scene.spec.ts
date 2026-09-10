import { PeerRole } from '@axe/domain/peer/peer-role';
import type { ReplayObjectSnapshot } from '@axe/domain/replay/replay-keyframe';
import { buildReplayVisionScene, replayOverlayPlan, replaySceneViewer } from '@axe/domain/replay/replay-vision-scene';
import { isPointVisible } from '@axe/domain/tabletop/vision-scene';
import { VisionType } from '@axe/domain/tabletop/vision-types';

function snapshot(identifier: string, aliasName: string, syncData: Record<string, unknown> = {}): ReplayObjectSnapshot {
  return { identifier, aliasName, syncData };
}

function table(overrides: Record<string, unknown> = {}): ReplayObjectSnapshot {
  return snapshot('table-1', 'game-table', {
    width: 20,
    height: 20,
    gridSize: 50,
    darknessEnabled: true,
    darknessLevel: 1,
    ambientColor: '#000000',
    globalIllumination: 0,
    ...overrides,
  });
}

function character(identifier: string, overrides: Record<string, unknown> = {}): ReplayObjectSnapshot {
  return snapshot(identifier, 'character', {
    location: { name: 'table', x: 500, y: 500, surface: 'floor' },
    isVisibleOnTable: true,
    ...overrides,
  });
}

describe('buildReplayVisionScene()', () => {
  it('builds nothing without a table', () => {
    expect(buildReplayVisionScene([])).toBeNull();
  });

  it('takes the darkness settings of the table as they are', () => {
    const scene = buildReplayVisionScene([table({ ambientColor: '#101020', globalIllumination: 0.25 })]);

    expect(scene).toMatchObject({
      darknessEnabled: true,
      ambientColor: '#101020',
      globalIllumination: 0.25,
      gridSize: 50,
      widthPx: 1000,
      heightPx: 1000,
    });
  });

  it('uses the table being watched', () => {
    const snapshots = [
      table(),
      snapshot('table-2', 'game-table', { width: 5, height: 5, gridSize: 100 }),
      snapshot('selecter', 'TableSelecter', { viewTableIdentifier: 'table-2' }),
    ];

    expect(buildReplayVisionScene(snapshots)?.widthPx).toBe(500);
  });

  it('takes sight from a piece that has an owner', () => {
    const snapshots = [
      table(),
      character('c1', { owner: 'alice', visionType: VisionType.DARKVISION, visionRange: 6 }),
      // A piece with no owner is nobody's eyes.
      character('c2', { visionType: VisionType.DARKVISION, visionRange: 6 }),
      // One put away does not count either.
      character('c3', { owner: 'bob', location: { name: 'inventory', x: 0, y: 0 } }),
    ];

    const sources = buildReplayVisionScene(snapshots)!.visionSources;
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ owner: 'alice', rangePx: 300 });
  });

  it('counts a piece carrying a light, and a light source, as light', () => {
    const snapshots = [
      table(),
      character('c1', { lightEnabled: true, lightBrightRadius: 2, lightDimRadius: 4, lightColor: '#ffddaa' }),
      snapshot('l1', 'light-source', {
        location: { name: 'table', x: 100, y: 100, surface: 'floor' },
        isVisibleOnTable: true,
        lightEnabled: true,
        lightBrightRadius: 1,
        lightDimRadius: 3,
      }),
      // An unlit one does not count.
      snapshot('l2', 'light-source', {
        location: { name: 'table', x: 0, y: 0 },
        isVisibleOnTable: true,
        lightEnabled: false,
      }),
    ];

    const lights = buildReplayVisionScene(snapshots)!.lights;
    expect(lights).toHaveLength(2);
    expect(lights.map((light) => light.dimPx).sort((a, b) => a - b)).toEqual([150, 200]);
  });

  it('lights a following light where its piece stands', () => {
    const snapshots = [
      table(),
      character('c1', { location: { name: 'table', x: 700, y: 300, surface: 'floor' } }),
      snapshot('l1', 'light-source', {
        location: { name: 'table', x: 0, y: 0, surface: 'floor' },
        isVisibleOnTable: true,
        lightEnabled: true,
        lightDimRadius: 2,
        followingCharacterIdentifier: 'c1',
      }),
    ];

    const light = buildReplayVisionScene(snapshots)!.lights[0];
    expect(light.x).toBe(725);
    expect(light.y).toBe(325);
  });

  it('blocks sight with terrain that stands as a wall', () => {
    const wall = snapshot('t1', 'terrain', {
      location: { name: 'table', x: 600, y: 0, surface: 'floor' },
      parentIdentifier: 'table-1',
      width: 1,
      depth: 20,
      hasWall: true,
      blocksSight: true,
    });
    const scene = buildReplayVisionScene([table(), wall])!;

    // The edge of the table and the four sides of the terrain are added.
    expect(scene.sightSegments.length).toBeGreaterThan(4);
    expect(isPointVisible(scene, 100, 500, { userId: 'gm', isGameMaster: true })).toBe(true);
  });

  it('hangs a block that came to rest on something at the height it rests at', () => {
    const shelf = snapshot('t1', 'terrain', {
      location: { name: 'table', x: 600, y: 0, surface: 'floor' },
      parentIdentifier: 'table-1',
      width: 1,
      depth: 20,
      height: 1,
      posZ: 150,
      hasWall: true,
      blocksSight: true,
    });
    const scene = buildReplayVisionScene([table(), shelf])!;
    const hung = scene.sightSegments.filter((segment) => segment.basePx !== undefined && segment.basePx > 0);

    expect(hung.length).toBeGreaterThan(0);
    expect(hung[0]).toMatchObject({ basePx: 150, heightPx: 200 });
  });
});

describe('replaySceneViewer()', () => {
  const snapshots = [
    table(),
    character('c1', { owner: 'alice', partyIdentifier: 'party-1' }),
    character('c2', { owner: 'bob', partyIdentifier: 'party-2' }),
  ];

  it('lets the game master see everything', () => {
    expect(replaySceneViewer(snapshots, { userId: 'gm', role: PeerRole.GameMaster })).toEqual({
      userId: 'gm',
      isGameMaster: true,
    });
  });

  it('gives a player their own companions alone', () => {
    expect(replaySceneViewer(snapshots, { userId: 'alice', role: PeerRole.Player })).toEqual({
      userId: 'alice',
      isGameMaster: false,
      partyIds: ['party-1'],
    });
  });

  it('lends a spectator the sight of the players at the table', () => {
    const viewer = replaySceneViewer(snapshots, { userId: 'watcher', role: PeerRole.Guest });

    expect(viewer.isGameMaster).toBe(false);
    expect([...(viewer.visionOwnerIds ?? [])].sort()).toEqual(['alice', 'bob']);
  });
});

describe('replayOverlayPlan()', () => {
  const gm = { userId: 'gm', role: PeerRole.GameMaster };

  it('draws nothing for a table that uses no darkness', () => {
    expect(replayOverlayPlan([table({ darknessEnabled: false })], gm)).toBeNull();
  });

  it('returns the darkness and the lights for one that does', () => {
    const plan = replayOverlayPlan(
      [table(), character('c1', { lightEnabled: true, lightBrightRadius: 2, lightDimRadius: 4 })],
      gm
    )!;

    expect(plan.darknessAlpha).toBeGreaterThan(0);
    expect(plan.reveals.length).toBeGreaterThan(0);
    expect(plan.glows.length).toBeGreaterThan(0);
  });

  it('shows a different reach to each viewer', () => {
    const snapshots = [
      table(),
      character('c1', {
        owner: 'alice',
        visionType: VisionType.DARKVISION,
        visionRange: 6,
        location: { name: 'table', x: 200, y: 200, surface: 'floor' },
      }),
    ];

    // The eyes of your own pieces are yours alone, and nobody borrows another's sight uninvited.
    const alice = replayOverlayPlan(snapshots, { userId: 'alice', role: PeerRole.Player })!;
    const bob = replayOverlayPlan(snapshots, { userId: 'bob', role: PeerRole.Player })!;

    expect(alice.reveals.length).toBeGreaterThan(bob.reveals.length);
  });
});
