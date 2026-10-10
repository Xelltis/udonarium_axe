import { TestBed } from '@angular/core/testing';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PERF_TERRAIN_COVER_MISS, perfCounters } from '@axe/core/util/perf-counters';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The throttle the service puts on a change before it acts on it. */
const GEOMETRY_THROTTLE = 50;

describe('the fog cover of a terrain on a hex table', () => {
  let service: VisionService;
  let store: ObjectStore;
  let table: GameTable;
  let wall: Terrain;
  let lamp: LightSource;
  let hidden: GameCharacter;

  beforeEach(async () => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS, VisionService] });
    store = ObjectStore.instance;
    store.getObjects().forEach((object) => store.delete(object, false));
    store.clearDeleteHistory();
    service = TestBed.inject(VisionService);

    const cursor = new PeerCursor();
    cursor.userId = 'gm';
    cursor.role = PeerRole.GameMaster;
    cursor.initialize();
    PeerCursor.myCursor = cursor;

    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = 50;
    table.gridType = GridType.HEX_VERTICAL;
    table.darknessEnabled = true;
    table.fogEnabled = true;
    table.initialize();

    wall = Terrain.create('wall', 1, 1, 1, 'wall.png', 'floor.png');
    wall.location.x = 150;
    wall.location.y = 150;
    table.appendChild(wall);

    lamp = LightSource.create('torch');
    lamp.lightBrightRadius = 2;
    lamp.lightDimRadius = 5;
    lamp.location.x = 75;
    lamp.location.y = 75;
    table.appendChild(lamp);

    hidden = GameCharacter.create('物置きの中', 1, '');
    table.appendChild(hidden);
    // A piece that is not standing on the table: moving it builds the scene again and changes
    // nothing a cover is read against.
    hidden.location.name = 'hand';
    hidden.location.x = 400;
    hidden.location.y = 400;

    await settle();
  });

  afterEach(() => {
    perfCounters.enabled = false;
    perfCounters.clear();
    store.getObjects().forEach((object) => store.delete(object, false));
    store.clearDeleteHistory();
    PeerCursor.myCursor = null!;
    vi.useRealTimers();
  });

  async function settle(): Promise<void> {
    for (let round = 0; round < 3; round++) {
      await vi.advanceTimersByTimeAsync(GEOMETRY_THROTTLE);
      service.scene();
    }
  }

  it('is worked out once, kept while the scene is rebuilt around it, and read again when a lamp moves', async () => {
    perfCounters.enabled = true;
    perfCounters.clear();

    const first = service.terrainFogCover(wall);
    expect(first).not.toBeNull();
    expect(perfCounters.drain().get(PERF_TERRAIN_COVER_MISS)).toBe(1);

    hidden.location.x = 500;
    hidden.update();
    await settle();

    expect(service.terrainFogCover(wall)).toBe(first);
    expect(perfCounters.drain().get(PERF_TERRAIN_COVER_MISS) ?? 0).toBe(0);

    lamp.location.x = 300;
    lamp.update();
    await settle();

    expect(service.terrainFogCover(wall)).not.toBe(first);
    expect(perfCounters.drain().get(PERF_TERRAIN_COVER_MISS) ?? 0).toBeGreaterThan(0);
  });
});
