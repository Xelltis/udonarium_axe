import { TestBed } from '@angular/core/testing';
import { DungeonBuildService } from '@axe/application/tabletop/dungeon-build.service';
import { wallLightInset, wallLightPitch } from '@axe/application/tabletop/dungeon-build.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ImageTag } from '@axe/domain/media/image-tag';
import { WALL_TEXTURE_ASSET_URLS } from '@axe/domain/media/texture-catalog';
import { atmosphereById } from '@axe/domain/tabletop/dungeon/dungeon-atmosphere';
import { planDungeon } from '@axe/domain/tabletop/dungeon/dungeon-generator';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { Terrain, TerrainViewState } from '@axe/domain/tabletop/terrain';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;

function options(overrides: Partial<Parameters<DungeonBuildService['build']>[3]> = {}) {
  return {
    name: 'Test dungeon',
    wall: { kind: 'texture' as const, id: 'wall_ashlar' },
    wallHeight: 2,
    floorImage: 'painted-ground',
    summary: 'notes',
    ...overrides,
  };
}

/** Where a light ends up, which for a bracket is set back against the stone it hangs on. */
function builtAt(lights: readonly LightSource[], planned: { x: number; y: number; kind: string; facing: number }) {
  const back = planned.kind === 'sconce' ? wallLightInset(planned.facing, 0.4) : { x: 0, y: 0 };
  const x = planned.x * 50 + back.x * 50;
  const y = planned.y * 50 + back.y * 50;
  return lights.find((entry) => Math.abs(entry.location.x - x) < 0.001 && Math.abs(entry.location.y - y) < 0.001);
}

describe('wallLightPitch', () => {
  /** Where the axis lands on the floor, which is the drop over the tangent of the angle. */
  function throwOf(altitudeCells: number, pitch: number): number {
    const drop = altitudeCells + 0.5;
    return drop / Math.tan((-pitch * Math.PI) / 180);
  }

  it('turns the lamp down, not up', () => {
    expect(wallLightPitch(2, 2)).toBeLessThan(0);
  });

  it('lands the pool the asked-for distance out from the wall', () => {
    expect(throwOf(2, wallLightPitch(2, 2))).toBeCloseTo(2, 6);
    expect(throwOf(5, wallLightPitch(5, 3))).toBeCloseTo(3, 6);
  });

  it('turns a lamp hung higher down more steeply', () => {
    expect(wallLightPitch(5, 2)).toBeLessThan(wallLightPitch(2, 2));
  });

  it('points a lamp straight down when it is asked to throw nothing', () => {
    expect(wallLightPitch(2, 0)).toBe(-90);
  });
});

describe('wallLightInset', () => {
  it.each([
    [0, -0.4, 0],
    [90, 0, -0.4],
    [180, 0.4, 0],
    [270, 0, 0.4],
  ])('sets a bracket throwing at %i back the way it came', (facing, x, y) => {
    const back = wallLightInset(facing, 0.4);

    expect(back.x).toBeCloseTo(x, 6);
    expect(back.y).toBeCloseTo(y, 6);
  });

  it('keeps the bracket inside the cell it was given, so its own stone cannot stop it', () => {
    const back = wallLightInset(0, 0.4);
    expect(Math.hypot(back.x, back.y)).toBeLessThan(0.5);
  });
});

describe('DungeonBuildService', () => {
  let service: DungeonBuildService;
  let store: ObjectStore;

  function wipe(): void {
    // The picture store outlives the object store, so a tag made in one test would look missing in the next.
    for (const image of ImageStorage.instance.images) ImageStorage.instance.delete(image.identifier);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    store = ObjectStore.instance;
    wipe();
    service = TestBed.inject(DungeonBuildService);
  });

  afterEach(() => {
    wipe();
    vi.clearAllMocks();
  });

  async function build(overrides: Partial<ReturnType<typeof options>> = {}) {
    const plan = planDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 7 });
    const result = await service.build(plan.layout, plan.atmosphere, plan.blocks, options(overrides));
    return { plan, result };
  }

  it('builds one table and leaves no other behind', async () => {
    const { result } = await build();

    expect(store.getObjects(GameTable).length).toBe(1);
    expect(store.getObjects(GameTable)[0]).toBe(result.table);
  });

  it('leaves the table uncovered unless the fog was asked for', async () => {
    const { result } = await build();

    expect(result.table.fogEnabled).toBe(false);
  });

  it('draws the fog over a table that was asked for it', async () => {
    const { result } = await build({ fogEnabled: true });

    expect(result.table.fogEnabled).toBe(true);
  });

  it('stands a party where it was told to, on the table and on the floor', async () => {
    const hero = GameCharacter.create('英雄', 1, '');
    hero.location = { name: 'graveyard', x: 0, y: 0 };
    hero.posZ = 300;

    await build({ muster: [{ piece: hero, cell: { x: 4, y: 6 } }] });

    expect(hero.location.name).toBe('table');
    expect(hero.location.x).toBe(4 * GRID);
    expect(hero.location.y).toBe(6 * GRID);
    expect(hero.posZ).toBe(0);
  });

  it('centres a piece wider than its cell on the ground it was given', async () => {
    const golem = GameCharacter.create('ゴーレム', 3, '');

    await build({ muster: [{ piece: golem, cell: { x: 5, y: 5 } }] });

    expect(golem.location.x).toBe(4 * GRID);
    expect(golem.location.y).toBe(4 * GRID);
  });

  it('leaves every piece alone where no party was asked for', async () => {
    const hero = GameCharacter.create('英雄', 1, '');
    hero.location = { name: 'graveyard', x: 7, y: 9 };

    await build();

    expect(hero.location.name).toBe('graveyard');
  });

  it('sizes the table to the dungeon and pins it to squares', async () => {
    const { plan, result } = await build();

    expect(result.table.width).toBe(plan.layout.width);
    expect(result.table.height).toBe(plan.layout.height);
    expect(result.table.gridSize).toBe(GRID);
    expect(result.table.gridType).toBe(GridType.SQUARE);
  });

  it('puts one terrain on the table for every block', async () => {
    const { plan, result } = await build();

    expect(result.terrainCount).toBe(plan.blocks.blocks.length);
    expect(result.table.terrains.length).toBe(plan.blocks.blocks.length);
  });

  it('gives each terrain the width, depth and height of its block', async () => {
    // Terrain.create takes name, width, depth, height: the depth comes third, which reads backwards.
    const { plan, result } = await build();
    const atmosphere = atmosphereById('stoneDungeon');

    plan.blocks.blocks.forEach((block, index) => {
      // A door is a slab thinner than its cell, which has its own tests.
      if (block.kind === 'door') return;
      const terrain = result.table.terrains[index];
      expect(terrain.width).toBe(block.rect.w);
      expect(terrain.depth).toBe(block.rect.h);
      if (block.kind === 'wall') expect(terrain.height).toBe(atmosphere.wallHeight);
    });
  });

  it('places each terrain at its cell times the grid', async () => {
    const { plan, result } = await build();

    plan.blocks.blocks.forEach((block, index) => {
      // A door is set in the middle of its cell, which has its own tests.
      if (block.kind === 'door') return;
      const terrain = result.table.terrains[index];
      expect(terrain.location.x).toBe(block.rect.x * GRID);
      expect(terrain.location.y).toBe(block.rect.y * GRID);
      expect(terrain.location.name).toBe('table');
    });
  });

  it('wears the painted ground as its surface, and builds no floor of its own', async () => {
    const { plan, result } = await build();

    expect(result.table.imageIdentifier).toBe('painted-ground');
    expect(plan.blocks.paint.length).toBeGreaterThan(0);
    expect(result.table.terrains.length).toBe(plan.blocks.blocks.length);
    expect(result.table.terrains.some((terrain) => terrain.mode === TerrainViewState.FLOOR && !terrain.isSlope)).toBe(
      false
    );
  });

  it('stands the walls and the doors at the height it was given', async () => {
    const { plan, result } = await build({ wallHeight: 4 });

    plan.blocks.blocks.forEach((block, index) => {
      if (block.kind !== 'wall' && block.kind !== 'door') return;
      expect(result.table.terrains[index].height).toBe(4);
    });
  });

  it('takes the height from the caller rather than the atmosphere', async () => {
    const stock = atmosphereById('stoneDungeon').wallHeight;
    const { plan, result } = await build({ wallHeight: stock + 1.5 });
    const index = plan.blocks.blocks.findIndex((block) => block.kind === 'wall');

    expect(result.table.terrains[index].height).toBe(stock + 1.5);
  });

  it('sets a door as a thin slab across the way it bars', async () => {
    const { plan, result } = await build();
    const index = plan.blocks.blocks.findIndex((block) => block.kind === 'door');
    const block = plan.blocks.blocks[index];
    const door = result.table.terrains[index];

    expect(index).toBeGreaterThanOrEqual(0);
    if (block.across === 'x') {
      expect(door.width).toBeLessThan(1);
      expect(door.depth).toBe(1);
    } else {
      expect(door.width).toBe(1);
      expect(door.depth).toBeLessThan(1);
    }
  });

  it('stands a wide door as one slab the width of its half of the opening', async () => {
    const plan = planDungeon({
      atmosphere: 'stoneDungeon',
      roomCount: 8,
      seed: 7,
      doorWidth: { least: 4, most: 4 },
      doubleDoorPercent: 100,
    });
    const result = await service.build(plan.layout, plan.atmosphere, plan.blocks, options());
    const index = plan.blocks.blocks.findIndex(
      (block) => block.kind === 'door' && Math.max(block.rect.w, block.rect.h) === 2
    );
    const block = plan.blocks.blocks[index];
    const door = result.table.terrains[index];

    expect(index).toBeGreaterThanOrEqual(0);
    expect(block.across === 'x' ? door.depth : door.width).toBe(2);
    expect(block.across === 'x' ? door.width : door.depth).toBeLessThan(1);
  });

  it('gives every door the way of opening its atmosphere calls for', async () => {
    const { plan, result } = await build();
    const style = atmosphereById('stoneDungeon').doorStyle;

    plan.blocks.blocks.forEach((block, index) => {
      if (block.kind !== 'door') return;
      const door = result.table.terrains[index];
      expect(door.doorStyle).toBe(style);
      expect(door.isDoor).toBe(true);
      expect(door.isDoorOpen).toBe(false);
      // Shut, it is a wall; the sight test must go on seeing it that way.
      expect(door.blocksSightNow).toBe(true);
    });
  });

  it('leaves the walls and floors alone, which are not doors', async () => {
    const { plan, result } = await build();

    plan.blocks.blocks.forEach((block, index) => {
      if (block.kind === 'door') return;
      expect(result.table.terrains[index].isDoor).toBe(false);
    });
  });

  it('centres a door in its cell rather than leaving it against one side', async () => {
    const { plan, result } = await build();

    plan.blocks.blocks.forEach((block, index) => {
      if (block.kind !== 'door') return;
      const door = result.table.terrains[index];
      const offsetX = door.location.x - block.rect.x * 50;
      const offsetY = door.location.y - block.rect.y * 50;
      expect(block.across === 'x' ? offsetX : offsetY).toBeGreaterThan(0);
      expect(block.across === 'x' ? offsetY : offsetX).toBe(0);
    });
  });

  it('shows walls whole and stairs flat', async () => {
    const { plan, result } = await build();

    plan.blocks.blocks.forEach((block, index) => {
      const terrain = result.table.terrains[index];
      if (block.kind === 'wall') expect(terrain.mode).toBe(TerrainViewState.ALL);
      if (block.kind === 'stairUp') expect(terrain.mode).toBe(TerrainViewState.FLOOR);
    });
  });

  it('locks every piece and tiles its texture', async () => {
    const { result } = await build();

    for (const terrain of result.table.terrains) {
      expect(terrain.isLocked).toBe(true);
      expect(terrain.isTiledTexture).toBe(true);
    }
  });

  it('stops sight only where the block says to', async () => {
    const { plan, result } = await build();

    plan.blocks.blocks.forEach((block, index) => {
      expect(result.table.terrains[index].blocksSight).toBe(block.blocksSight);
    });
  });

  it('stands a lit source of its own for every spot the plan picked', async () => {
    const { plan, result } = await build();
    const lights = result.table.lightSources;

    expect(plan.blocks.lights.length).toBeGreaterThan(0);
    expect(lights.length).toBe(plan.blocks.lights.length);
    for (const light of lights) {
      expect(light.lightEnabled).toBe(true);
      expect(['sconce', 'campfire', 'brazier', 'lantern']).toContain(light.lightPreset);
      expect(light.lightBrightRadius).toBeGreaterThan(0);
    }
  });

  it('gives every light a picture to stand as, and turns a bracket off the wall', async () => {
    const { plan, result } = await build();
    const lights = result.table.lightSources;

    expect(plan.blocks.lights.length).toBeGreaterThan(0);
    expect(lights.length).toBe(plan.blocks.lights.length);
    for (const light of lights) {
      expect(light.imageFile.identifier).toContain('assets/images/lights/');
    }
    for (const planned of plan.blocks.lights) {
      const built = builtAt(lights, planned);
      expect(built).toBeDefined();
      if (planned.kind === 'sconce') {
        expect(built!.lightDirection).toBe(planned.facing);
        expect(built!.altitude).toBeGreaterThan(0);
      }
      if (planned.kind === 'campfire') expect(built!.altitude).toBe(0);
    }
  });

  it('turns a bracket down toward the floor it is meant to light', async () => {
    const { plan, result } = await build();
    const lights = result.table.lightSources;
    const sconces = plan.blocks.lights.filter((planned) => planned.kind === 'sconce');

    expect(sconces.length).toBeGreaterThan(0);
    for (const planned of sconces) {
      const built = builtAt(lights, planned);
      expect(built!.lightPitch).toBeLessThan(0);
      expect(built!.lightPitch).toBeCloseTo(wallLightPitch(built!.altitude, 2), 3);
    }
  });

  it('keeps the light off the terrain entirely, so no block stops blocking it', async () => {
    // A lit terrain lets light through, and painted on a box the picture spills out four ways.
    const { result } = await build();

    expect(result.table.terrains.some((terrain) => terrain.lightEnabled)).toBe(false);
  });

  it('leaves nothing behind that outlives its table', async () => {
    const { result } = await build();
    const made = result.table.terrains.length;

    result.table.destroy();

    expect(made).toBeGreaterThan(0);
    expect(store.getObjects(Terrain).length).toBe(0);
    expect(store.getObjects(LightSource).length).toBe(0);
  });

  it('registers a bundled picture once and tags it', async () => {
    await build();
    const url = WALL_TEXTURE_ASSET_URLS.wall_ashlar;
    const image = ImageStorage.instance.get(url);

    expect(image).not.toBeNull();
    expect(ImageTag.get(image!.identifier)?.tag).toBe('地形');

    await build();
    expect(ImageStorage.instance.get(url)).toBe(image);
  });

  it('leaves a tag someone else already set alone', async () => {
    const url = WALL_TEXTURE_ASSET_URLS.wall_ashlar;
    ImageStorage.instance.add(url);
    ImageTag.create(url).tag = 'テクスチャ';

    await build();

    expect(ImageTag.get(url)?.tag).toBe('テクスチャ');
  });

  it('takes a picture from the library as it is', async () => {
    const { result } = await build({ wall: { kind: 'library', identifier: 'some-hash' } });
    const wall = result.table.terrains.find((terrain) => terrain.mode === TerrainViewState.ALL);

    expect(wall?.imageDataElement?.getFirstElementByName('wall')?.value).toBe('some-hash');
  });

  it('never switches the table on its own', async () => {
    const { result } = await build();

    expect(result.table.selected).toBe(false);
  });

  it('clears every terrain out of the store when the table goes', async () => {
    const { result } = await build();
    const identifiers = result.table.terrains.map((terrain) => terrain.identifier);

    result.table.destroy();

    for (const identifier of identifiers) expect(store.get(identifier)).toBeNull();
  });

  it('hands the notes back as text and leaves nothing on the tabletop', async () => {
    // A shared memo is not a child of its table, so notes left here would follow the master everywhere.
    const { result } = await build();

    expect(store.getObjects(TextNote).length).toBe(0);
    expect(result.summary).toBe('notes');
  });

  it('tells the caller how far it has got', async () => {
    const plan = planDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 7 });
    const seen: number[] = [];

    await service.build(plan.layout, plan.atmosphere, plan.blocks, options(), (done) => seen.push(done));

    expect(seen.length).toBeGreaterThan(1);
    expect(seen[seen.length - 1]).toBe(plan.blocks.blocks.length);
  });

  it('builds a cave with its hazard floor', async () => {
    const plan = planDungeon({ atmosphere: 'lavaCavern', roomCount: 8, seed: 7 });
    const result = await service.build(
      plan.layout,
      plan.atmosphere,
      plan.blocks,
      options({ wall: { kind: 'texture', id: 'wall_obsidian' } })
    );

    expect(result.table.terrains.length).toBe(plan.blocks.blocks.length);
    expect(plan.blocks.paint.some((patch) => patch.kind === 'hazard')).toBe(true);
  });

  describe('building on hexes', () => {
    async function buildOn(gridType: GridType) {
      const plan = planDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 7, gridType });
      return service.build(plan.layout, plan.atmosphere, plan.blocks, { ...options(), gridType });
    }

    it('gives the table the grid it was asked for', async () => {
      const result = await buildOn(GridType.HEX_VERTICAL);

      expect(result.table.gridType).toBe(GridType.HEX_VERTICAL);
    });

    it('is still squares when nothing was asked for', async () => {
      const { result } = await build();

      expect(result.table.gridType).toBe(GridType.SQUARE);
    });

    it('stands every hex block within a cell of its own, none spanning a run of them', async () => {
      const result = await buildOn(GridType.HEX_HORIZONTAL);

      // A door is thinner than its cell, so the test is that nothing reaches past one.
      expect(result.table.terrains.every((terrain) => terrain.width <= 1 && terrain.depth <= 1)).toBe(true);
      expect(result.table.terrains.some((terrain) => terrain.width === 1 && terrain.depth === 1)).toBe(true);
    });

    it('staggers the rows, which is the whole of what makes them hexes', async () => {
      const result = await buildOn(GridType.HEX_HORIZONTAL);
      const rows = new Set(result.table.terrains.map((terrain) => Math.round(terrain.location.y)));
      const lefts = new Set(result.table.terrains.map((terrain) => Math.round(terrain.location.x)));

      // Offset rows put twice as many distinct left edges on the table as there are columns.
      expect(lefts.size).toBeGreaterThan(rows.size);
    });
  });
});
