import { TestBed } from '@angular/core/testing';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { objectChanged$ } from '@axe/core/sync/object-event-extension';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PERF_VISION_SCENE, perfCounters } from '@axe/core/util/perf-counters';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { ensureFogMemoryOn, fogMemoryOn } from '@axe/domain/tabletop/fog/fog-memory';
import { FogMode } from '@axe/domain/tabletop/fog/fog-mode';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { Terrain, TerrainViewState } from '@axe/domain/tabletop/terrain';
import type { WallFace } from '@axe/domain/tabletop/vision-scene';
import { VisionType } from '@axe/domain/tabletop/vision-types';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function makeMyCursor(userId: string, role: PeerRole): void {
  const cursor = new PeerCursor();
  cursor.userId = userId;
  cursor.role = role;
  cursor.initialize();
  PeerCursor.myCursor = cursor;
}

function addPeer(userId: string, role: PeerRole): PeerCursor {
  const cursor = new PeerCursor();
  cursor.userId = userId;
  cursor.role = role;
  cursor.initialize();
  return cursor;
}

/** The throttle the service puts on a change before it acts on it. */
const GEOMETRY_THROTTLE = 50;

function makeDarkTable(): GameTable {
  const table = new GameTable();
  table.width = 20;
  table.height = 20;
  table.gridSize = 50;
  table.darknessEnabled = true;
  table.initialize();
  return table;
}

describe('VisionService', () => {
  let service: VisionService;
  let store: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS, VisionService] });
    store = ObjectStore.instance;
    store.getObjects().forEach((obj) => store.delete(obj, false));
    store.clearDeleteHistory();
    service = TestBed.inject(VisionService);
  });

  afterEach(() => {
    store.getObjects().forEach((obj) => store.delete(obj, false));
    store.clearDeleteHistory();
    PeerCursor.myCursor = null!;
    perfCounters.enabled = false;
    perfCounters.clear();
    vi.clearAllMocks();
  });

  describe('a lamp standing on top of a block', () => {
    /** A block three cells tall, with a lamp on top of it and a player watching. */
    function tableWithLampOnBlock(lampAltitudeCells: number): Terrain {
      makeMyCursor('p1', PeerRole.Player);
      const table = makeDarkTable();
      const terrain = Terrain.create('building', 2, 2, 5, 'wall.png', 'floor.png');
      terrain.location.x = 200;
      terrain.location.y = 200;
      table.appendChild(terrain);

      const lamp = LightSource.create('torch');
      lamp.lightBrightRadius = 2;
      lamp.lightDimRadius = 4;
      lamp.location.x = 250;
      lamp.location.y = 250;
      lamp.posZ = lampAltitudeCells * 50;
      table.appendChild(lamp);

      const pc = GameCharacter.create('PC', 1, '');
      pc.owner = 'p1';
      pc.location.x = 250;
      pc.location.y = 250;
      pc.posZ = lampAltitudeCells * 50;
      table.appendChild(pc);
      return terrain;
    }

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /** The scene is rebuilt on a throttle, so nothing is measured until it has caught up. */
    async function settleScene(service: VisionService): Promise<void> {
      for (let round = 0; round < 3; round++) {
        await vi.advanceTimersByTimeAsync(GEOMETRY_THROTTLE);
        service.scene();
      }
    }

    /** A wide, low box with a torch standing in the middle of its roof, as a reader would see. */
    function tableWithTorchOnWideRoof(): Terrain {
      makeMyCursor('p1', PeerRole.Player);
      const table = makeDarkTable();
      // Six cells across: the middle of its roof is nowhere near an open side.
      const terrain = Terrain.create('crate', 6, 6, 1, 'wall.png', 'floor.png');
      terrain.location.x = 200;
      terrain.location.y = 200;
      table.appendChild(terrain);

      const pc = GameCharacter.create('PC', 1, '');
      pc.owner = 'p1';
      // Standing on the middle of the roof, one cell up.
      pc.location.x = 350;
      pc.location.y = 350;
      pc.posZ = 50;
      pc.lightEnabled = true;
      pc.lightBrightRadius = 2;
      pc.lightDimRadius = 4;
      table.appendChild(pc);
      return terrain;
    }

    /** A crate with a lamp on its roof, shut away behind a wall the reader cannot see past. */
    function tableWithTorchOnRoofBehindAWall(): Terrain {
      makeMyCursor('p1', PeerRole.Player);
      const table = makeDarkTable();

      // The reader's own piece, up in the north-west corner with eyes but no lamp.
      const pc = GameCharacter.create('PC', 1, '');
      pc.owner = 'p1';
      pc.location.x = 75;
      pc.location.y = 75;
      pc.visionRange = 4;
      table.appendChild(pc);

      // A wall right across the room, tall enough to stop the look.
      const wall = Terrain.create('wall', 20, 1, 3, 'wall.png', 'floor.png');
      wall.location.x = 0;
      wall.location.y = 250;
      table.appendChild(wall);

      // Far beyond it, a crate with a torch standing on its roof.
      const crate = Terrain.create('crate', 6, 6, 1, 'wall.png', 'floor.png');
      crate.location.x = 200;
      crate.location.y = 500;
      table.appendChild(crate);

      const lamp = GameCharacter.create('NPC', 1, '');
      lamp.location.x = 350;
      lamp.location.y = 650;
      lamp.posZ = 50;
      lamp.lightEnabled = true;
      lamp.lightBrightRadius = 2;
      lamp.lightDimRadius = 4;
      table.appendChild(lamp);
      return crate;
    }

    it('leaves a roof dark where the lamp lighting it is one the reader cannot see', async () => {
      const crate = tableWithTorchOnRoofBehindAWall();
      await settleScene(service);

      const cover = service.terrainTopCover(crate)!;
      const middle = cover.brightness[3 * cover.cols + 3];

      expect(middle).toBeLessThan(0.2);
    });

    it('lights the middle of a wide roof it is standing on, not only its open edges', async () => {
      const terrain = tableWithTorchOnWideRoof();
      await settleScene(service);

      const cover = service.terrainTopCover(terrain)!;
      const middle = cover.brightness[2 * cover.cols + 2];

      expect(middle).toBeGreaterThan(0.5);
    });

    it('lights the top it is standing on, as it would light the ground', async () => {
      // Five cells up with four cells of reach: the sphere no longer touches the floor at all,
      // so read on the floor the lamp lights nothing anywhere, itself included.
      const terrain = tableWithLampOnBlock(5);
      await settleScene(service);

      const brightness = service.terrainTopBrightness(terrain, 250, 250, 50);

      expect(brightness).toBeGreaterThan(0.5);
    });
  });

  describe('the walls it cuts from what stands on the table', () => {
    async function announce(aliasName: string, identifier: string): Promise<void> {
      objectChanged$.emit({ aliasName, identifier, isSendFromSelf: true });
      await vi.advanceTimersByTimeAsync(GEOMETRY_THROTTLE);
    }

    /**
     * Everything the setup itself stirred up, so only what a test does is measured. Reading a
     * terrain writes the values nobody has set yet, so the second round is what settles.
     */
    async function settle(): Promise<void> {
      for (let round = 0; round < 3; round++) {
        await vi.advanceTimersByTimeAsync(GEOMETRY_THROTTLE);
        service.scene();
      }
    }

    beforeEach(() => {
      vi.useFakeTimers();
      makeMyCursor('p1', PeerRole.Player);
      const table = makeDarkTable();
      const terrain = Terrain.create('wall', 1, 1, 2, '', '');
      terrain.location.x = 200;
      terrain.location.y = 200;
      table.appendChild(terrain);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('hands the same walls back when a piece has moved and nothing else', async () => {
      const character = GameCharacter.create('c', 1, '');
      await settle();
      const before = service.scene()!.sightSegments;

      await announce('character', character.identifier);

      expect(service.scene()!.sightSegments).toBe(before);
    });

    it('hands back the same viewer when a piece has moved and nothing else', async () => {
      const character = GameCharacter.create('c', 1, '');
      await settle();
      const before = service.viewer();

      await announce('character', character.identifier);

      expect(service.viewer()).toBe(before);
    });

    it('cuts them again once something standing has changed', async () => {
      await settle();
      const before = service.scene()!.sightSegments;

      await announce('terrain', store.getObjects(Terrain)[0].identifier);

      expect(service.scene()!.sightSegments).not.toBe(before);
      expect(service.scene()!.sightSegments).toEqual(before);
    });
  });

  it('builds a scene with the darkness off, marked as such', () => {
    makeMyCursor('p1', PeerRole.Player);
    const table = makeDarkTable();
    table.darknessEnabled = false;
    expect(service.active()).toBe(false);
    const scene = service.scene();
    expect(scene).not.toBeNull();
    expect(scene!.darknessEnabled).toBe(false);
  });

  it('builds the scene with the darkness on, converting lights and sight sources to pixels', () => {
    makeMyCursor('p1', PeerRole.Player);
    makeDarkTable();

    const character = GameCharacter.create('PC', 1, '');
    character.owner = 'p1';
    character.visionType = VisionType.DARKVISION;
    character.visionRange = 4;
    character.location.x = 100;
    character.location.y = 100;

    const light = LightSource.create('torch');
    light.lightBrightRadius = 2;
    light.lightDimRadius = 5;
    light.location.x = 300;
    light.location.y = 300;

    const scene = service.scene();
    expect(scene).not.toBeNull();
    expect(scene!.gridSize).toBe(50);
    expect(scene!.widthPx).toBe(1000);
    expect(scene!.lights).toHaveLength(1);
    expect(scene!.lights[0].dimPx).toBe(5 * 50);
    expect(scene!.visionSources).toHaveLength(1);
    expect(scene!.visionSources[0].type).toBe(VisionType.DARKVISION);
    expect(scene!.visionSources[0].rangePx).toBe(4 * 50);
    expect(scene!.visionSources[0].owner).toBe('p1');
  });

  it('raises a light with the altitude of what carries it', () => {
    makeMyCursor('p1', PeerRole.Player);
    makeDarkTable();
    const torch = GameCharacter.create('Torch', 1, '');
    torch.location.x = 200;
    torch.location.y = 200;
    torch.altitude = 2;
    torch.lightEnabled = true;
    torch.lightBrightRadius = 2;
    torch.lightDimRadius = 4;
    const scene = service.scene();
    expect(scene!.lights[0].z).toBeCloseTo((2 + 0.5) * 50);
  });

  it('shines a wall-mounted character into the room from where it hangs', () => {
    makeMyCursor('p1', PeerRole.Player);
    const table = makeDarkTable();
    table.wallHeight = 6;

    const onFloor = GameCharacter.create('Floor', 1, '');
    onFloor.location.x = 100;
    onFloor.location.y = 100;
    onFloor.lightEnabled = true;
    onFloor.lightDimRadius = 4;

    const onWall = GameCharacter.create('Wall', 1, '');
    onWall.location.x = 200;
    onWall.location.y = 100;
    onWall.location.surface = 'north-wall';
    onWall.lightEnabled = true;
    onWall.lightDimRadius = 4;
    onWall.castsShadow = true;

    const scene = service.scene();
    expect(scene!.lights).toHaveLength(2);
    const wallLight = scene!.lights.find((l) => l.direction === 90);
    expect(wallLight).toBeTruthy();
    expect(wallLight!.y).toBeCloseTo(0.4 * 50);
    expect(wallLight!.z).toBeCloseTo(6 * 50 - (100 + 25));
    expect(scene!.shadowCasters.every((c) => c.ownerId !== onWall.identifier)).toBe(true);
    expect(service.isTokenVisible(onWall)).toBe(true);
  });

  it('still draws the orbs and beams on a table with no darkness', () => {
    makeMyCursor('p1', PeerRole.Player);
    const table = makeDarkTable();
    table.darknessEnabled = false;

    const torch = GameCharacter.create('Torch', 1, '');
    torch.location.x = 200;
    torch.location.y = 200;
    torch.altitude = 2;
    torch.lightEnabled = true;
    torch.lightAngle = 360;
    torch.lightBrightRadius = 3;
    torch.lightDimRadius = 7;

    const flash = GameCharacter.create('Flash', 1, '');
    flash.location.x = 400;
    flash.location.y = 400;
    flash.altitude = 3;
    flash.lightEnabled = true;
    flash.lightAngle = 45;
    flash.lightPitch = -40;
    flash.lightBrightRadius = 4;
    flash.lightDimRadius = 10;

    expect(service.scene()!.darknessEnabled).toBe(false);
    expect(service.lightGlows()).toHaveLength(1);
    expect(service.lightBeams()).toHaveLength(1);
  });

  it('shows every token to the game master', () => {
    makeMyCursor('gm', PeerRole.GameMaster);
    makeDarkTable();
    const enemy = GameCharacter.create('Enemy', 1, '');
    enemy.owner = 'enemy';
    enemy.location.x = 800;
    enemy.location.y = 800;
    expect(service.isTokenVisible(enemy)).toBe(true);
  });

  it('shows a player their own tokens and hides an enemy standing in the dark', () => {
    makeMyCursor('p1', PeerRole.Player);
    makeDarkTable();

    const mine = GameCharacter.create('Mine', 1, '');
    mine.owner = 'p1';
    mine.visionType = VisionType.NORMAL;
    mine.location.x = 100;
    mine.location.y = 100;

    const enemy = GameCharacter.create('Enemy', 1, '');
    enemy.owner = 'enemy';
    enemy.location.x = 800;
    enemy.location.y = 800;

    expect(service.isTokenVisible(mine)).toBe(true);
    expect(service.isTokenVisible(enemy)).toBe(false);
  });

  it('counts glowing terrain as a light and never lets it shadow itself', () => {
    makeMyCursor('p1', PeerRole.Player);
    const table = makeDarkTable();

    const terrain = Terrain.create('結晶', 2, 2, 2, '', '');
    terrain.location.x = 200;
    terrain.location.y = 200;
    terrain.lightEnabled = true;
    terrain.lightBrightRadius = 3;
    terrain.lightDimRadius = 6;
    table.appendChild(terrain);

    const scene = service.scene();
    expect(scene!.lights.some((l) => l.dimPx === 6 * 50)).toBe(true);
    expect(scene!.lightSegments).toHaveLength(0);
    expect(scene!.sightSegments.length).toBeGreaterThan(4);
  });

  it('lets the game master look through the eyes of a player', () => {
    makeMyCursor('gm', PeerRole.GameMaster);
    makeDarkTable();
    expect(service.viewer().isGameMaster).toBe(true);
    service.previewAsUserId.set('p1');
    expect(service.viewer().isGameMaster).toBe(false);
    expect(service.viewer().userId).toBe('p1');
  });

  it('gives a guest the combined sight of the connected players', () => {
    addPeer('player-1', PeerRole.Player);
    addPeer('player-2', PeerRole.Player);
    addPeer('gm-1', PeerRole.GameMaster);
    makeMyCursor('guest-1', PeerRole.Guest);

    const viewer = service.viewer();
    expect(viewer.isGameMaster).toBe(false);
    expect(viewer.visionOwnerIds).toEqual(expect.arrayContaining(['player-1', 'player-2']));
    expect(viewer.visionOwnerIds).not.toContain('gm-1');
    expect(viewer.visionOwnerIds).not.toContain('guest-1');
  });

  it('gives a player their own sight and no one elses', () => {
    makeMyCursor('player-x', PeerRole.Player);
    expect(service.viewer().visionOwnerIds).toBeUndefined();
  });

  it('gives the game master the combined sight of a guest when looking through their eyes', () => {
    addPeer('guest-2', PeerRole.Guest);
    addPeer('player-3', PeerRole.Player);
    makeMyCursor('gm-x', PeerRole.GameMaster);
    service.previewAsUserId.set('guest-2');

    const viewer = service.viewer();
    expect(viewer.userId).toBe('guest-2');
    expect(viewer.isGameMaster).toBe(false);
    expect(viewer.visionOwnerIds).toContain('player-3');
  });

  describe('what is remembered while the scene holds still', () => {
    it('hands back the same array when asked about a face again', () => {
      // One repaint asks eight times per terrain, and rebuilding the array, identical or not,
      // sends the view off to rebuild its list.
      const table = makeDarkTable();
      ObjectStore.instance.add(table);
      makeMyCursor('gm-1', PeerRole.GameMaster);
      const face = { ax: 100, ay: 100, bx: 200, by: 100, nx: 0, ny: -1, heightPx: 100 };

      expect(service.wallSilhouettes(face)).toBe(service.wallSilhouettes(face));
      expect(service.wallLights(face)).toBe(service.wallLights(face));
      expect(service.lightBeams()).toBe(service.lightBeams());
      expect(service.lightGlows()).toBe(service.lightGlows());
    });

    it('builds no new array for a table without darkness either', () => {
      const table = makeDarkTable();
      table.darknessEnabled = false;
      ObjectStore.instance.add(table);
      const face = { ax: 0, ay: 0, bx: 50, by: 0, nx: 0, ny: -1, heightPx: 50 };

      expect(service.wallSilhouettes(face)).toBe(service.wallSilhouettes(face));
      expect(service.wallLights(face)).toBe(service.wallLights(face));
    });

    it('builds no scene at all for a table with no dark in it', () => {
      const table = makeDarkTable();
      table.darknessEnabled = false;
      ObjectStore.instance.add(table);
      makeMyCursor('p1', PeerRole.Player);
      const face = { ax: 0, ay: 0, bx: 50, by: 0, nx: 0, ny: -1, heightPx: 50 };
      perfCounters.enabled = true;
      perfCounters.clear();

      expect(service.wallSilhouettes(face)).toHaveLength(0);
      expect(service.wallLights(face)).toHaveLength(0);
      expect(service.ambientBrightness()).toBe(1);
      expect(service.objectBrightness(25, 25, 10)).toBe(1);

      expect(perfCounters.drain().get(PERF_VISION_SCENE)).toBeUndefined();
    });
  });

  describe('what the party remembers of the board', () => {
    const GRID = cellGridOf(20, 20, 50, GridType.SQUARE);

    function tableRememberingCell(mode: FogMode, cell: number): GameTable {
      const table = makeDarkTable();
      table.fogEnabled = true;
      table.fogMode = mode;
      const bits = new CellBits(cellCount(GRID));
      bits.set(cell);
      ensureFogMemoryOn(table).write(GRID, bits);
      return table;
    }

    it('holds onto ground it has been shown when the table is easy', () => {
      tableRememberingCell('normal', 7);
      expect(service.exploredCells()?.get(7)).toBe(true);
    });

    it('lets it go again when the table is hard', () => {
      tableRememberingCell('hard', 7);
      expect(service.exploredCells()?.get(7)).toBe(false);
    });

    describe('the easy table, which keeps what the party has taken', () => {
      it('counts ground once cleared as still in sight', () => {
        tableRememberingCell('easy', 7);
        makeMyCursor('p1', PeerRole.Player);

        expect(service.overlayVision()?.visible.get(7)).toBe(true);
      });

      it('lays no veil over it, so it is not dimmed again', () => {
        tableRememberingCell('easy', 7);
        makeMyCursor('p1', PeerRole.Player);

        expect(service.overlayVision()?.veilAlpha).toBe(0);
        expect(service.overlayVision()?.clearedStaysLit).toBe(true);
      });

      it('holds a wall on that ground at full light, with no lamp anywhere near it', () => {
        const table = tableRememberingCell('easy', NPC_CELL);
        makeMyCursor('p1', PeerRole.Player);
        const wall = terrainAt(200, 200, 1, true);
        table.appendChild(wall);

        expect(service.terrainFogCover(wall)?.brightness[0]).toBe(1);
      });

      it('leaves the ground nobody has walked to dark all the same', () => {
        const table = tableRememberingCell('easy', NPC_CELL);
        makeMyCursor('p1', PeerRole.Player);
        const far = terrainAt(800, 800, 1, true);
        table.appendChild(far);

        expect(service.terrainFogCover(far)?.brightness[0]).toBeLessThan(1);
      });

      it('shows the game master the board as it stands, not as the party holds it', () => {
        tableRememberingCell('easy', 7);
        makeMyCursor('gm', PeerRole.GameMaster);

        expect(service.overlayVision()?.clearedStaysLit).toBe(false);
        expect(service.overlayVision()?.veilAlpha).toBeGreaterThan(0);
      });

      it('follows a piece it has met wherever it goes', () => {
        const table = tableRememberingCell('easy', NPC_CELL);
        makeMyCursor('p1', PeerRole.Player);
        const npc = GameCharacter.create('NPC', 1, '');
        npc.location.x = 800;
        npc.location.y = 800;
        fogMemoryOn(table)!.writeFound(new Set([npc.identifier]));

        expect(service.isTokenVisible(npc)).toBe(true);
      });

      it('follows nobody it has not met', () => {
        const table = tableRememberingCell('easy', NPC_CELL);
        makeMyCursor('p1', PeerRole.Player);
        const npc = GameCharacter.create('NPC', 1, '');
        npc.location.x = 800;
        npc.location.y = 800;
        fogMemoryOn(table)!.writeFound(new Set(['somebody-else']));

        expect(service.isTokenVisible(npc)).toBe(false);
      });

      it('follows nobody at all on the middle table, however it was met', () => {
        const table = tableRememberingCell('normal', NPC_CELL);
        makeMyCursor('p1', PeerRole.Player);
        const npc = GameCharacter.create('NPC', 1, '');
        npc.location.x = 800;
        npc.location.y = 800;
        fogMemoryOn(table)!.writeFound(new Set([npc.identifier]));

        expect(service.isTokenVisible(npc)).toBe(false);
      });
    });

    it('hides a piece standing in the fog from a reader with no eyes of their own', () => {
      const table = makeDarkTable();
      table.darknessEnabled = false;
      table.fogEnabled = true;
      makeMyCursor('p1', PeerRole.Player);
      const npc = GameCharacter.create('NPC', 1, '');
      npc.owner = 'p2';
      npc.location.x = 200;
      npc.location.y = 200;

      expect(service.isTokenVisible(npc)).toBe(false);
    });

    it('still shows a reader their own piece wherever it stands', () => {
      const table = makeDarkTable();
      table.darknessEnabled = false;
      table.fogEnabled = true;
      makeMyCursor('p1', PeerRole.Player);
      const mine = GameCharacter.create('PC', 1, '');
      mine.owner = 'p1';
      mine.location.x = 200;
      mine.location.y = 200;

      expect(service.isTokenVisible(mine)).toBe(true);
    });

    /** Where a piece at (200, 200) stands, on the twenty cell board these tests use. */
    const NPC_CELL = 4 * 20 + 4;

    function npcAt(x: number, y: number): GameCharacter {
      const npc = GameCharacter.create('NPC', 1, '');
      npc.owner = 'p2';
      npc.location.x = x;
      npc.location.y = y;
      return npc;
    }

    it('keeps showing a piece once found, while it stands on ground the party has cleared', () => {
      tableRememberingCell('normal', NPC_CELL);
      makeMyCursor('p1', PeerRole.Player);

      expect(service.isTokenVisible(npcAt(200, 200))).toBe(true);
    });

    it('loses it again the moment it steps somewhere nobody has been', () => {
      tableRememberingCell('normal', NPC_CELL);
      makeMyCursor('p1', PeerRole.Player);

      expect(service.isTokenVisible(npcAt(600, 600))).toBe(false);
    });

    it('shows nothing outside the party sight on a hard table', () => {
      tableRememberingCell('hard', NPC_CELL);
      makeMyCursor('p1', PeerRole.Player);

      expect(service.isTokenVisible(npcAt(200, 200))).toBe(false);
    });

    it('clears the fog for a piece the game master owns when nobody else has one', () => {
      const table = makeDarkTable();
      table.fogEnabled = true;
      table.globalIllumination = 1;
      makeMyCursor('gm', PeerRole.GameMaster);
      const piece = GameCharacter.create('PC', 1, '');
      piece.owner = 'gm';
      piece.location.x = 200;
      piece.location.y = 200;

      expect(service.sharedVisibleCells()?.cells.get(NPC_CELL)).toBe(true);
    });

    it('leaves what the game master keeps aside out of the party map', () => {
      const table = makeDarkTable();
      table.fogEnabled = true;
      makeMyCursor('gm', PeerRole.GameMaster);
      addPeer('p1', PeerRole.Player);
      // The monster carries the only lamp near its own ground, and a wall stands between it
      // and the player, so the cell is cleared only if the master's eyes count towards it.
      const monster = GameCharacter.create('Monster', 1, '');
      monster.owner = 'gm';
      monster.location.x = 200;
      monster.location.y = 200;
      monster.lightEnabled = true;
      monster.lightBrightRadius = 2;
      monster.lightDimRadius = 4;
      const wall = Terrain.create('wall', 20, 1, 4, '', '');
      wall.mode = TerrainViewState.ALL;
      wall.blocksSight = true;
      wall.location.x = 0;
      wall.location.y = 400;
      table.appendChild(wall);
      const pc = GameCharacter.create('PC', 1, '');
      pc.owner = 'p1';
      pc.location.x = 800;
      pc.location.y = 800;

      expect(service.sharedVisibleCells()?.cells.get(NPC_CELL)).toBe(false);
    });

    it('hides a lamp left standing on ground nobody has walked to', () => {
      tableRememberingCell('normal', NPC_CELL);
      makeMyCursor('p1', PeerRole.Player);
      const lamp = LightSource.create('torch');
      lamp.location.x = 600;
      lamp.location.y = 600;

      expect(service.isPieceHiddenByFog(lamp)).toBe(true);
    });

    it('leaves one standing on ground the party has cleared', () => {
      tableRememberingCell('normal', NPC_CELL);
      makeMyCursor('p1', PeerRole.Player);
      const lamp = LightSource.create('torch');
      lamp.location.x = 200;
      lamp.location.y = 200;

      expect(service.isPieceHiddenByFog(lamp)).toBe(false);
    });

    it('hides nothing from the game master', () => {
      tableRememberingCell('normal', NPC_CELL);
      makeMyCursor('gm', PeerRole.GameMaster);
      const lamp = LightSource.create('torch');
      lamp.location.x = 600;
      lamp.location.y = 600;

      expect(service.isPieceHiddenByFog(lamp)).toBe(false);
    });

    function terrainAt(x: number, y: number, cells: number, blocksSight: boolean, deep = cells): Terrain {
      const terrain = Terrain.create('block', cells, deep, 1, '', '');
      terrain.mode = TerrainViewState.ALL;
      terrain.blocksSight = blocksSight;
      terrain.location.x = x;
      terrain.location.y = y;
      return terrain;
    }

    it('tells the cells of a terrain the party has walked to from the rest', () => {
      tableRememberingCell('normal', NPC_CELL);
      makeMyCursor('p1', PeerRole.Player);
      // Four cells across, from (200, 200), with only its near corner cleared.
      const cover = service.terrainFogCover(terrainAt(200, 200, 4, true));
      expect(cover).not.toBeNull();
      expect(cover!.cols).toBe(4);
      expect(cover!.rows).toBe(4);
      expect(cover!.cleared[0]).toBe(true);
      expect(cover!.cleared.filter((cell) => cell)).toHaveLength(1);
    });

    it('answers the same way for a floor as for a wall', () => {
      tableRememberingCell('normal', NPC_CELL);
      makeMyCursor('p1', PeerRole.Player);
      const wall = service.terrainFogCover(terrainAt(200, 200, 4, true));
      const floor = service.terrainFogCover(terrainAt(200, 200, 4, false));
      expect(floor?.cleared).toEqual(wall?.cleared);
    });

    it('leaves a wall dark that only a brazier it cannot see lights', () => {
      const table = tableRememberingCell('normal', NPC_CELL);
      makeMyCursor('p1', PeerRole.Player);
      // The remembered wall stands beside its own brazier, but a screen wall stands between
      // all of that and the player's piece: lit, remembered, and out of sight.
      const wall = Terrain.create('wall', 10, 1, 2, '', '');
      wall.mode = TerrainViewState.ALL;
      wall.blocksSight = true;
      wall.location.x = 200;
      wall.location.y = 200;
      table.appendChild(wall);
      const brazier = LightSource.create('torch');
      brazier.lightBrightRadius = 2;
      brazier.lightDimRadius = 4;
      brazier.location.x = 175;
      brazier.location.y = 275;
      table.appendChild(brazier);
      const screen = Terrain.create('screen', 20, 1, 4, '', '');
      screen.mode = TerrainViewState.ALL;
      screen.blocksSight = true;
      screen.location.x = 0;
      screen.location.y = 450;
      table.appendChild(screen);
      const pc = GameCharacter.create('PC', 1, '');
      pc.owner = 'p1';
      pc.location.x = 200;
      pc.location.y = 700;

      expect(service.terrainBrightness(wall, 450, 225, 250)).toBeLessThan(0.2);
    });

    it('lights a long wall only where the torch and the line of sight agree', () => {
      const table = tableRememberingCell('normal', NPC_CELL);
      makeMyCursor('p1', PeerRole.Player);
      // One long wall forms the north side of a row of corridors, cross walls part the
      // corridors, and a brazier burns in the far one. Everything was walked in an earlier
      // session, so the whole wall is remembered and drawn.
      const grid = cellGridOf(20, 20, 50, GridType.SQUARE);
      const all = new CellBits(cellCount(grid));
      for (let i = 0; i < cellCount(grid); i++) all.set(i);
      ensureFogMemoryOn(table).write(grid, all);

      function wallAt(x: number, y: number, w: number, d: number): Terrain {
        const built = Terrain.create('wall', w, d, 2, '', '');
        built.mode = TerrainViewState.ALL;
        built.blocksSight = true;
        built.blocksLight = true;
        built.location.x = x;
        built.location.y = y;
        table.appendChild(built);
        return built;
      }
      const long = wallAt(0, 300, 20, 1);
      wallAt(500, 350, 1, 4);
      wallAt(750, 350, 1, 4);

      const brazier = LightSource.create('brazier');
      brazier.lightBrightRadius = 2;
      brazier.lightDimRadius = 4;
      brazier.location.x = 850;
      brazier.location.y = 400;
      table.appendChild(brazier);

      const pc = GameCharacter.create('PC', 1, '');
      pc.owner = 'p1';
      pc.location.x = 150;
      pc.location.y = 400;
      pc.lightEnabled = true;
      pc.lightBrightRadius = 2;
      pc.lightDimRadius = 4;

      const cover = service.terrainFogCover(long);
      expect(cover?.cleared.every((cell) => cell)).toBe(true);
      // Bright where the torch stands, and only there.
      expect(Math.min(...cover!.brightness.slice(2, 5))).toBeGreaterThan(0.9);
      // The stretch by the brazier is lit, but no line of sight crosses the parting walls.
      for (const value of cover!.brightness.slice(10)) expect(value).toBeLessThan(0.15);
    });

    it('lets a piece nobody has claimed clear and light the walls beside it', () => {
      const table = makeDarkTable();
      table.fogEnabled = true;
      table.fogMode = 'hard';
      makeMyCursor('p1', PeerRole.Player);
      // Two long bars form a T, and a torch-bearing piece that no one owns stands in the
      // crook of it. The bright walls must be the ones beside the torch, and the far ends
      // of both bars must stay under the fog: sight belongs to the piece, not to whoever
      // is written down as its owner.
      function wallAt(x: number, y: number, w: number, d: number): Terrain {
        const built = Terrain.create('wall', w, d, 2, '', '');
        built.mode = TerrainViewState.ALL;
        built.blocksSight = true;
        built.blocksLight = true;
        built.location.x = x;
        built.location.y = y;
        table.appendChild(built);
        return built;
      }
      const across = wallAt(100, 250, 12, 1);
      const down = wallAt(400, 300, 1, 8);

      const torchbearer = GameCharacter.create('PC', 1, '');
      torchbearer.location.x = 450;
      torchbearer.location.y = 300;
      torchbearer.lightEnabled = true;
      torchbearer.lightBrightRadius = 2;
      torchbearer.lightDimRadius = 4;

      const standingCell = 6 * 20 + 9;
      expect(service.sharedVisibleCells()?.cells.get(standingCell)).toBe(true);

      const beside = service.terrainFogCover(down);
      expect(beside!.cleared[0]).toBe(true);
      expect(beside!.brightness[0]).toBeGreaterThan(0.5);
      expect(beside!.cleared[7]).toBe(false);
      expect(beside!.brightness[7]).toBeLessThan(0.15);

      const overhead = service.terrainFogCover(across);
      expect(overhead!.cleared[7]).toBe(true);
      expect(overhead!.brightness[7]).toBeGreaterThan(0.5);
      expect(overhead!.cleared[0]).toBe(false);
      expect(overhead!.brightness[0]).toBeLessThan(0.15);
    });

    it('keeps a monster nobody has claimed out of the party map', () => {
      const table = makeDarkTable();
      table.fogEnabled = true;
      table.fogMode = 'hard';
      makeMyCursor('p1', PeerRole.Player);
      const monster = GameCharacter.create('NPC', 1, '');
      monster.isNpc = true;
      monster.location.x = 450;
      monster.location.y = 300;
      monster.lightEnabled = true;
      monster.lightBrightRadius = 2;
      monster.lightDimRadius = 4;
      table.appendChild(monster);

      const standingCell = 6 * 20 + 9;
      expect(service.sharedVisibleCells()?.cells.get(standingCell)).toBe(false);
    });

    it('shows a reader with no piece of their own the party view, not every lamp on the map', () => {
      const table = tableRememberingCell('normal', NPC_CELL);
      makeMyCursor('p1', PeerRole.Player);
      addPeer('p2', PeerRole.Player);
      // The torch-bearing piece belongs to the other player; the reader has none. Their
      // brightness must follow the party's sight, as the fog itself does - asked any other
      // way, a reader with no eyes was answered with 'whatever a lamp touches', and every
      // brazier on the map lit its own walls for them.
      const grid = cellGridOf(20, 20, 50, GridType.SQUARE);
      const all = new CellBits(cellCount(grid));
      for (let i = 0; i < cellCount(grid); i++) all.set(i);
      ensureFogMemoryOn(table).write(grid, all);

      function wallAt(x: number, y: number, w: number, d: number): Terrain {
        const built = Terrain.create('wall', w, d, 2, '', '');
        built.mode = TerrainViewState.ALL;
        built.blocksSight = true;
        built.blocksLight = true;
        built.location.x = x;
        built.location.y = y;
        table.appendChild(built);
        return built;
      }
      const long = wallAt(0, 300, 20, 1);
      wallAt(500, 350, 1, 4);
      wallAt(750, 350, 1, 4);

      const brazier = LightSource.create('brazier');
      brazier.lightBrightRadius = 2;
      brazier.lightDimRadius = 4;
      brazier.location.x = 850;
      brazier.location.y = 400;
      table.appendChild(brazier);

      const pc = GameCharacter.create('PC', 1, '');
      pc.owner = 'p2';
      pc.location.x = 150;
      pc.location.y = 400;
      pc.lightEnabled = true;
      pc.lightBrightRadius = 2;
      pc.lightDimRadius = 4;

      const cover = service.terrainFogCover(long);
      expect(Math.min(...cover!.brightness.slice(2, 5))).toBeGreaterThan(0.9);
      for (const value of cover!.brightness.slice(10)) expect(value).toBeLessThan(0.15);
    });

    it('hides nothing from the game master, and lights their view by the lamps alone', () => {
      const table = tableRememberingCell('normal', NPC_CELL);
      makeMyCursor('gm', PeerRole.GameMaster);
      const lamp = LightSource.create('torch');
      lamp.lightBrightRadius = 2;
      lamp.lightDimRadius = 4;
      lamp.location.x = 150;
      lamp.location.y = 300;
      table.appendChild(lamp);

      // Ten cells of wall with the lamp against its west end: shown whole, bright only there.
      const wall = terrainAt(200, 350, 10, true, 1);
      table.appendChild(wall);
      const cover = service.terrainFogCover(wall);
      expect(cover).not.toBeNull();
      expect(cover!.cleared.every((cell) => cell)).toBe(true);
      expect(cover!.brightness[0]).toBeGreaterThan(0.5);
      expect(cover!.brightness[9]).toBeLessThan(cover!.brightness[0]);
    });

    it('reads a wall by the cell of it the party has reached, not by its middle', () => {
      const table = tableRememberingCell('normal', NPC_CELL);
      makeMyCursor('p1', PeerRole.Player);
      // Ten cells of wall from (200, 200), of which only the first has been cleared, with a
      // lamp off to one side of that end and the rest of it left in the dark.
      const wall = Terrain.create('wall', 10, 1, 2, '', '');
      wall.mode = TerrainViewState.ALL;
      wall.blocksSight = true;
      wall.location.x = 200;
      wall.location.y = 200;
      table.appendChild(wall);
      const lamp = LightSource.create('torch');
      lamp.lightBrightRadius = 2;
      lamp.lightDimRadius = 4;
      lamp.location.x = 175;
      lamp.location.y = 275;
      table.appendChild(lamp);
      // A party member stands in sight of the lit end; without any eyes at the table there
      // would rightly be nothing bright at all.
      const pc = GameCharacter.create('PC', 1, '');
      pc.owner = 'p1';
      pc.location.x = 175;
      pc.location.y = 400;

      // Read at its middle, the wall is asked about from inside itself and comes out dark.
      expect(service.objectBrightness(225, 225, 25, true)).toBeLessThan(0.5);
      expect(service.terrainBrightness(wall, 700, 225, 250)).toBeGreaterThan(0.5);
    });

    it('remembers nothing at all with the fog switched off', () => {
      const table = tableRememberingCell('normal', 7);
      table.fogEnabled = false;
      expect(service.exploredCells()).toBeNull();
    });
  });
});

describe('VisionService, the pools thrown on a wall', () => {
  let service: VisionService;
  let store: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS, VisionService] });
    store = ObjectStore.instance;
    store.getObjects().forEach((obj) => store.delete(obj, false));
    store.clearDeleteHistory();
    service = TestBed.inject(VisionService);
  });

  afterEach(() => {
    store.getObjects().forEach((obj) => store.delete(obj, false));
    store.clearDeleteHistory();
    PeerCursor.myCursor = null!;
  });

  /** The long wall runs from (0, 0) to (600, 50); the face looked at is its southern one. */
  const LONG_FACE: WallFace = { ax: 0, ay: 50, bx: 600, by: 50, nx: 0, ny: 1, heightPx: 100 };

  function wall(table: GameTable, x: number, y: number, cellsWide: number, cellsDeep: number): Terrain {
    const built = Terrain.create('wall', cellsWide, cellsDeep, 2, '', '');
    built.mode = TerrainViewState.ALL;
    built.blocksSight = true;
    built.blocksLight = true;
    built.location.x = x;
    built.location.y = y;
    table.appendChild(built);
    return built;
  }

  function lamp(x: number, y: number): LightSource {
    const built = LightSource.create('torch');
    built.lightBrightRadius = 2;
    built.lightDimRadius = 4;
    built.location.x = x;
    built.location.y = y;
    return built;
  }

  function watcher(x: number, y: number): GameCharacter {
    const pc = GameCharacter.create('PC', 1, '');
    pc.owner = 'p1';
    pc.location.x = x;
    pc.location.y = y;
    return pc;
  }

  it('lights the stretch of a long wall the lamp stands against, and no more', () => {
    const table = makeDarkTable();
    makeMyCursor('p1', PeerRole.Player);
    wall(table, 0, 0, 12, 1);
    lamp(75, 150);
    watcher(75, 200);

    const pools = service.wallLights(LONG_FACE);
    expect(pools).toHaveLength(1);
    // A piece stands in the middle of the cell it is put on, half a cell in from the corner.
    expect(pools[0].localX).toBeCloseTo(100, 0);
    // Its reach along the face falls well short of the far end of it.
    expect(pools[0].localX + pools[0].radiusX).toBeLessThan(400);
  });

  it('throws no pool at all from a lamp the reader cannot see', () => {
    const table = makeDarkTable();
    makeMyCursor('p1', PeerRole.Player);
    wall(table, 0, 0, 12, 1);
    wall(table, 0, 300, 12, 1);
    lamp(75, 150);
    watcher(75, 500);

    expect(service.wallLights(LONG_FACE)).toHaveLength(0);
  });

  it('throws it for the game master whatever stands in the way', () => {
    const table = makeDarkTable();
    makeMyCursor('gm', PeerRole.GameMaster);
    wall(table, 0, 0, 12, 1);
    wall(table, 0, 300, 12, 1);
    lamp(75, 150);

    expect(service.wallLights(LONG_FACE)).toHaveLength(1);
  });
});
