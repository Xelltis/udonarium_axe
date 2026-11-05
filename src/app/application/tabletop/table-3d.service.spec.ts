import { TestBed } from '@angular/core/testing';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { LightSlotsService } from '@axe/application/tabletop/light-slots.service';
import { TABLE_3D_ENGINES, TABLE_GRAPHICS, Table3dService } from '@axe/application/tabletop/table-3d.service';
import { Table3dQualityService } from '@axe/application/tabletop/table-3d-quality.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TableEyeService } from '@axe/application/tabletop/table-eye.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TableVeilService } from '@axe/application/tabletop/table-veil.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TransientPlacementService } from '@axe/application/tabletop/transient-placement.service';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { TableGraphics } from '@axe/core/util/graphics-acceleration';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { DEFAULT_GAME_CLOCK } from '@axe/domain/game-clock/game-clock';
import { Config } from '@axe/domain/peer/config';
import { DEFAULT_TABLE_CAMERA_VIEW } from '@axe/domain/tabletop/camera/table-camera';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { Terrain } from '@axe/domain/tabletop/terrain';
import type { SceneLight } from '@axe/domain/tabletop/vision-scene';
import { type SkyDome, skyDomeAt } from '@axe/domain/tabletop/world/sky-dome';
import { type SkyLight, skyLightAt } from '@axe/domain/tabletop/world/sky-light';
import type { TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';
import type { TableWorld, TableWorldCap } from '@axe/domain/tabletop/world/table-world';
import type {
  Table3dCamera,
  Table3dDiceThrow,
  Table3dEngine,
  Table3dEngineOptions,
  Table3dFloorCanvas,
  Table3dFogAirSheet,
  Table3dGrid,
  Table3dLightMap,
  Table3dShadowLight,
  Table3dVeil,
} from '@axe/infrastructure/table-3d/table-3d-port';
import { TABLE_3D_QUALITY, type Table3dQualityPlan } from '@axe/infrastructure/table-3d/table-3d-quality';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

/** An engine that keeps what it is told and counts what it draws. */
class FakeEngine implements Table3dEngine {
  floorCanvases: readonly Table3dFloorCanvas[] = [];
  readonly backend: 'webgpu' | 'webgl2';
  worlds: TableWorld[] = [];
  cameras: Table3dCamera[] = [];
  sizes: [number, number][] = [];
  grids: (Table3dGrid | null)[] = [];
  veils: (Table3dVeil | null)[] = [];
  skies: SkyLight[] = [];
  lightMaps: (Table3dLightMap | null)[] = [];
  shadowLights: (readonly Table3dShadowLight[])[] = [];
  glows: (Table3dVeil | null)[] = [];
  fogAirSheets: (readonly Table3dFogAirSheet[])[] = [];
  diceThrows: (readonly Table3dDiceThrow[])[] = [];
  domes: (SkyDome | null)[] = [];
  qualities: Table3dQualityPlan[] = [];
  moving = false;
  advanced = 0;
  flickeredAt: number[] = [];
  drawn = 0;
  disposed = false;
  lose: () => void = () => undefined;
  arrive: () => void = () => undefined;
  loading = false;
  /** Whether what keeps it loading is only held back a moment, which it can draw at once. */
  heldBack = false;
  private changed = false;

  constructor(readonly options: Table3dEngineOptions) {
    this.backend = options.forceWebGL ? 'webgl2' : 'webgpu';
  }

  setWorld(world: TableWorld): void {
    this.worlds.push(world);
    this.changed = true;
  }

  setCamera(camera: Table3dCamera): void {
    this.cameras.push(camera);
    this.changed = true;
  }

  setGrid(grid: Table3dGrid | null): void {
    this.grids.push(grid);
    this.changed = true;
  }

  setFloorCanvases(canvases: readonly Table3dFloorCanvas[]): void {
    this.floorCanvases = canvases;
  }

  setVeil(veil: Table3dVeil | null): void {
    this.veils.push(veil);
    this.changed = true;
  }

  setLightMap(map: Table3dLightMap | null): void {
    this.lightMaps.push(map);
    this.changed = true;
  }

  setGlow(glow: Table3dVeil | null): void {
    this.glows.push(glow);
  }

  setSky(sky: SkyDome | null): void {
    this.domes.push(sky);
    this.changed = true;
  }

  setFogAir(sheets: readonly Table3dFogAirSheet[]): void {
    this.fogAirSheets.push(sheets);
  }

  setDice(throws: readonly Table3dDiceThrow[]): void {
    this.diceThrows.push(throws);
    this.changed = true;
  }

  warmDice(): void {}

  flicker(timeMs: number): void {
    this.flickeredAt.push(timeMs);
  }

  setShadowLights(lights: readonly Table3dShadowLight[]): void {
    this.shadowLights.push(lights);
  }

  setQuality(plan: Table3dQualityPlan): void {
    this.qualities.push(plan);
    this.changed = true;
  }

  setSkyLight(light: SkyLight): void {
    if (JSON.stringify(light) === JSON.stringify(this.skies.at(-1))) return;
    this.skies.push(light);
    this.changed = true;
  }

  resize(width: number, height: number): void {
    this.sizes.push([width, height]);
  }

  advance(): boolean {
    this.advanced++;
    return this.moving;
  }

  renderIfChanged(): boolean {
    if (!this.changed) return false;
    this.changed = false;
    this.drawn++;
    return true;
  }

  dispose(): void {
    this.disposed = true;
  }

  onLost(listener: () => void): void {
    this.lose = listener;
  }

  onNeedsFrame(listener: () => void): void {
    this.arrive = () => {
      this.loading = false;
      this.changed = true;
      listener();
    };
  }

  isLoading(): boolean {
    return this.loading;
  }

  stopHoldingBack(): void {
    if (!this.heldBack) return;
    this.heldBack = false;
    this.loading = false;
    this.changed = true;
  }

  stats() {
    return {
      chunks: 0,
      boardGridTriangles: 0,
      topsGridTriangles: 0,
      sprites: 0,
      coins: 0,
      floorCanvases: 0,
      layers: 0,
      waterParts: 0,
      fogAirSheets: 0,
      sky: false,
      backdrops: 0,
      models: 0,
      modelMeshes: 0,
      dice: 0,
      veilRevision: 0,
      lightMapRevision: 0,
      shadowLights: 0,
      glowRevision: 0,
      shadowCasters: 0,
      draws: this.drawn,
      drawCalls: 0,
    };
  }
}

describe('Table3dService', () => {
  let engines: FakeEngine[];
  let graphics: TableGraphics;
  /** How many times the engine was loaded for the service made last; each service counts its own. */
  let loaded: { count: number };

  function service(): Table3dService {
    engines = [];
    const counted = { count: 0 };
    loaded = counted;
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: TABLE_3D_ENGINES,
          useValue: () => {
            counted.count++;
            return Promise.resolve({
              createTable3dEngine: (_canvas: HTMLCanvasElement, options: Table3dEngineOptions) => {
                const engine = new FakeEngine(options);
                engines.push(engine);
                return Promise.resolve(engine);
              },
            });
          },
        },
        { provide: TABLE_GRAPHICS, useValue: () => Promise.resolve(graphics) },
      ],
    });
    const camera = TestBed.inject(TableCameraService);
    camera.setLayout({ left: 0, top: 0, width: 1280, height: 800, boardWidth: 1000, boardHeight: 750 });
    camera.showView(DEFAULT_TABLE_CAMERA_VIEW);
    return TestBed.inject(Table3dService);
  }

  beforeEach(() => {
    graphics = { webgpu: true, webgl2: true };
    localStorage.removeItem(STORAGE_KEYS.tableRenderer);
    localStorage.removeItem(STORAGE_KEYS.tableQuality);
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEYS.tableRenderer);
    localStorage.removeItem(STORAGE_KEYS.tableQuality);
  });

  it('draws on a canvas until a seat asks for the page, and remembers the choice', () => {
    const scene = service();
    expect(scene.renderer()).toBe('three');
    expect(scene.drawsOnCanvas()).toBe(true);

    scene.choose('css');

    expect(scene.drawsOnCanvas()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.tableRenderer)).toBe('css');
  });

  it('takes up the choice this browser remembers, and leaves one it does not know', () => {
    localStorage.setItem(STORAGE_KEYS.tableRenderer, 'three-webgl2');
    expect(service().renderer()).toBe('three-webgl2');

    TestBed.resetTestingModule();
    localStorage.setItem(STORAGE_KEYS.tableRenderer, 'something else');
    expect(service().renderer()).toBe('three');
  });

  it('draws the scene and the camera on the frame after it is given a canvas, and once only', async () => {
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    TestBed.tick();
    await scene.whenIdle();

    const engine = engines[0];
    expect(scene.backend()).toBe('webgpu');
    expect(engine.options.forceWebGL).toBe(false);
    expect(engine.worlds.at(-1)).toBe(scene.world());
    expect(engine.cameras.at(-1)).toMatchObject({ width: 1280, height: 800, orthographic: false });
    expect(engine.sizes).toEqual([[1280, 800]]);
    expect(engine.drawn).toBe(1);
  });

  it('draws again when the camera moves, and not otherwise', async () => {
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    TestBed.tick();
    await scene.whenIdle();

    TestBed.inject(TableCameraService).showView({ ...DEFAULT_TABLE_CAMERA_VIEW, rotateZ: 40 });
    TestBed.tick();
    await scene.whenIdle();
    TestBed.tick();
    await scene.whenIdle();

    expect(engines[0].drawn).toBe(2);
  });

  it('draws at once what it waits on a frame to draw, for a page whose clock is held, and says when it is drawn through', async () => {
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    TestBed.tick();
    await scene.whenIdle();
    const engine = engines[0];

    TestBed.inject(TableCameraService).showView({ ...DEFAULT_TABLE_CAMERA_VIEW, rotateZ: 40 });
    TestBed.tick();
    expect(engine.drawn).toBe(1);

    expect(scene.drawDueNow()).toBe(true);
    expect(engine.drawn).toBe(2);
    engine.loading = true;
    expect(scene.drawDueNow()).toBe(false);
    engine.heldBack = true;
    expect(scene.drawDueNow()).toBe(true);
    expect(engine.drawn).toBe(3);
    const loaded = TestBed.inject(TableVeilService).pictureLoading();
    expect(scene.drawDueNow()).toBe(false);
    loaded();
    expect(scene.drawDueNow()).toBe(true);
  });

  it('draws what moves by itself only as it is asked to draw at once while motion is held, and frame after frame again once let go', async () => {
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    TestBed.tick();
    await scene.whenIdle();
    const engine = engines[0];
    engine.moving = true;

    scene.holdMotion(true);
    TestBed.inject(TableCameraService).showView({ ...DEFAULT_TABLE_CAMERA_VIEW, rotateZ: 40 });
    TestBed.tick();
    await scene.whenIdle();
    const advanced = engine.advanced;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(engine.advanced).toBe(advanced);

    expect(scene.drawDueNow()).toBe(true);
    expect(engine.advanced).toBe(advanced + 1);
    scene.holdMotion(false);
    TestBed.inject(TableCameraService).showView({ ...DEFAULT_TABLE_CAMERA_VIEW, rotateZ: 60 });
    TestBed.tick();
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );
    expect(engine.advanced).toBeGreaterThan(advanced + 2);
  });

  it('stops drawing and lets its engine go once it goes itself, with its canvas still held', async () => {
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    const engine = engines[0];
    engine.moving = true;
    TestBed.inject(TableCameraService).showView({ ...DEFAULT_TABLE_CAMERA_VIEW, rotateZ: 30 });
    TestBed.tick();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    TestBed.resetTestingModule();
    const advanced = engine.advanced;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );

    expect(engine.disposed).toBe(true);
    expect(engine.advanced).toBe(advanced);
  });

  it('lights a flickering light as it was at the moment held, however the clock runs on, until let go', async () => {
    const scene = service();
    const torch = { sourceId: 'torch', animation: 'flicker' } as SceneLight;
    vi.spyOn(TestBed.inject(LightSlotsService), 'lights').mockReturnValue([torch]);
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    TestBed.tick();
    await scene.whenIdle();
    const engine = engines[0];

    scene.holdFlicker(2000);
    TestBed.tick();
    const held = engine.flickeredAt.length;
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(engine.flickeredAt.length).toBeGreaterThan(held);
    expect(new Set(engine.flickeredAt.slice(held - 1))).toEqual(new Set([2000]));
    scene.holdFlicker(null);
    TestBed.tick();
    expect(engine.flickeredAt.at(-1)).not.toBe(2000);
  });

  it('hands the engine the pieces again as one is moved, with the blocks’ faces as they were', async () => {
    const scene = service();
    const table = new GameTable();
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    const die = DiceSymbol.create('D6', DiceType.D6, 1);
    die.location = { name: 'table', x: 100, y: 100 };
    await new Promise((resolve) => setTimeout(resolve, 0));
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    TestBed.tick();
    await scene.whenIdle();
    const before = engines[0].worlds.at(-1)!;

    TestBed.inject(TransientPlacementService).place(die.identifier, { surface: 'floor', x: 10, y: 20, z: 0 });
    TestBed.tick();
    await scene.whenIdle();

    const after = engines[0].worlds.at(-1)!;
    expect(after).not.toBe(before);
    expect(after.walls).toBe(before.walls);
    expect(after.caps).toBe(before.caps);
  });

  it('draws for an eye standing among the pieces on the canvas lent to its view, then gives the canvas back', async () => {
    const scene = service();
    vi.spyOn(TestBed.inject(TablePiecesService), 'sprites').mockReturnValue([
      { id: 'viewer#picture', owner: 'viewer' },
      { id: 'other#picture', owner: 'other' },
    ] as unknown as TableWorldSprite[]);
    const home = document.createElement('div');
    const canvas = document.createElement('canvas');
    home.append(canvas);
    scene.attach(canvas);
    await scene.whenIdle();
    TestBed.tick();
    await scene.whenIdle();
    const engine = engines[0];
    const host = document.createElement('div');
    const ceiling = { id: 'ceiling:3', zPx: 100, facing: 'down', colour: '#000000' } as unknown as TableWorldCap;
    const eyes = TestBed.inject(TableEyeService);

    const giveBack = scene.lend(host);
    eyes.show({
      camera: {
        eye: [],
        axes: { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 } },
        orthographic: false,
        width: 640,
        height: 360,
        focalPx: 320,
      },
      standsAt: { x: 75, y: 125 },
      without: 'viewer',
      ceilings: [ceiling],
    });
    TestBed.tick();
    await scene.whenIdle();

    expect(canvas.parentNode).toBe(host);
    expect(engine.cameras.at(-1)).toMatchObject({ width: 640, height: 360, focalPx: 320 });
    expect(engine.sizes.at(-1)).toEqual([640, 360]);
    expect(engine.worlds.at(-1)!.sprites.map((sprite) => sprite.owner)).toEqual(['other']);
    expect(engine.worlds.at(-1)!.caps).toContain(ceiling);
    expect(engine.grids.at(-1)).toBeNull();

    eyes.clear();
    giveBack();
    TestBed.tick();
    await scene.whenIdle();

    expect(canvas.parentNode).toBe(home);
    expect(engine.cameras.at(-1)).toMatchObject({ width: 1280, height: 800 });
    expect(engine.worlds.at(-1)!.sprites.map((sprite) => sprite.owner)).toEqual(['viewer', 'other']);
  });

  it('hands the engine no scene again when the pieces are worked out afresh with nothing in them changed', async () => {
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    TestBed.tick();
    await scene.whenIdle();
    const handed = engines[0].worlds.length;

    TestBed.inject(ObjectChangeService).networkVersion.update((version) => version + 1);
    TestBed.tick();
    await scene.whenIdle();

    expect(engines[0].worlds).toHaveLength(handed);
  });

  it('draws through WebGL2 where it is asked to, or where WebGPU cannot be had', async () => {
    localStorage.setItem(STORAGE_KEYS.tableRenderer, 'three-webgl2');
    const asked = service();
    asked.attach(document.createElement('canvas'));
    await asked.whenIdle();
    expect(engines[0].options.forceWebGL).toBe(true);

    TestBed.resetTestingModule();
    localStorage.removeItem(STORAGE_KEYS.tableRenderer);
    graphics = { webgpu: false, webgl2: true };
    const without = service();
    without.attach(document.createElement('canvas'));
    await without.whenIdle();
    expect(engines[0].options.forceWebGL).toBe(true);
  });

  it('says so, and makes no engine, where neither interface can be had', async () => {
    graphics = { webgpu: false, webgl2: false };
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();

    expect(scene.unavailable()).toBe(true);
    expect(engines).toHaveLength(0);
  });

  it('lets the canvas go when it is taken away', async () => {
    const scene = service();
    const detach = scene.attach(document.createElement('canvas'));
    await scene.whenIdle();

    detach();

    expect(engines[0].disposed).toBe(true);
    expect(scene.backend()).toBeNull();
  });

  it('has a fresh canvas made when the graphics card lets the drawing go, a few times at most', async () => {
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();

    engines[0].lose();

    expect(scene.backend()).toBeNull();
    expect(scene.canvasGeneration()).toBe(1);
    for (let again = 0; again < 5; again++) engines[0].lose();
    expect(scene.canvasGeneration()).toBe(3);
  });

  it('loads the engine while the page is idle for a seat that draws on a canvas, and not for one that does not', async () => {
    localStorage.setItem(STORAGE_KEYS.tableRenderer, 'css');
    service();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(loaded.count).toBe(0);

    TestBed.resetTestingModule();
    localStorage.setItem(STORAGE_KEYS.tableRenderer, 'three');
    service();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(loaded.count).toBe(1);
  });

  it('is preparing from when the canvas is asked for until it draws', async () => {
    localStorage.setItem(STORAGE_KEYS.tableRenderer, 'three');
    const scene = service();
    expect(scene.preparing()).toBe(true);

    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();

    expect(scene.preparing()).toBe(false);
  });

  it('waits for what the engine is loading, and draws once it has come', async () => {
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    TestBed.tick();
    await scene.whenIdle();
    const engine = engines[0];
    engine.loading = true;

    let settled = false;
    void scene.whenIdle().then(() => (settled = true));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(settled).toBe(false);

    engine.arrive();
    await scene.whenIdle();
    expect(settled).toBe(true);
    expect(engine.drawn).toBe(2);
  });

  it('reads the pictures the scene names from where this browser keeps them', () => {
    const scene = service();
    expect(scene.world().board?.pictureUrl).toBe(
      TestBed.inject(ImageService).getEmptyOr(TestBed.inject(TabletopService).currentTable.imageIdentifier).url
    );
  });

  it('hands the engine the grid the page draws, and draws it on the next frame', async () => {
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    TestBed.tick();
    await scene.whenIdle();
    const engine = engines[0];
    const grid = {
      canvas: document.createElement('canvas'),
      box: { x: 0, y: 0, width: 1000, height: 750 },
      opacity: 1,
      revision: 1,
    };

    scene.showGrid(grid);
    TestBed.tick();
    await scene.whenIdle();

    expect(engine.grids.at(-1)).toBe(grid);
    expect(engine.drawn).toBe(2);
  });

  it('hands the engine the veil and the darkness the page draws each time they are drawn again', async () => {
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    TestBed.tick();
    await scene.whenIdle();
    const engine = engines[0];
    const drawn = engine.drawn;
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { left: '-40px', top: '-40px', width: '1080px', height: '830px' });
    const veil = TestBed.inject(TableVeilService);

    veil.show(canvas);
    TestBed.tick();
    await scene.whenIdle();
    veil.show(canvas);
    TestBed.tick();
    await scene.whenIdle();

    expect(engine.veils.at(-1)).toEqual({ canvas, box: { x: -40, y: -40, width: 1080, height: 830 }, revision: 2 });
    expect(engine.drawn).toBe(drawn + 2);

    veil.showDarkness(canvas, 0.8);
    TestBed.tick();

    expect(engine.lightMaps.at(-1)).toEqual({
      canvas,
      box: { x: -40, y: -40, width: 1080, height: 830 },
      revision: 1,
      darkness: 0.8,
    });

    veil.forget();
    TestBed.tick();

    expect(engine.veils.at(-1)).toBeNull();
    expect(engine.lightMaps.at(-1)).toBeNull();
  });

  it('lights the scene as the sky does at the hour the room’s clock tells, and again as the clock moves on', async () => {
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    TestBed.tick();
    await scene.whenIdle();
    const engine = engines[0];
    const atHour = async (hour: number) => {
      Config.instance.gameClock = { ...DEFAULT_GAME_CLOCK, mode: 'hours', minutes: hour * 60 };
      await new Promise((resolve) => setTimeout(resolve, 0));
      TestBed.tick();
    };

    await atHour(12);
    expect(engine.skies.at(-1)).toEqual(skyLightAt(0.5));

    await atHour(0);
    expect(engine.skies.at(-1)).toEqual(skyLightAt(0));
  });

  it('lays the pictures of the grid the page hands it over the faces they are named for', async () => {
    const scene = service();
    const table = new GameTable();
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    const block = Terrain.create('箱', 1, 1, 2, '', '');
    block.location = { name: 'table', x: 100, y: 150 };
    table.appendChild(block);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const side = scene.world().walls.find((wall) => wall.id.startsWith(block.identifier))!;

    scene.showFaceGrids(new Map([[side.id, 'data:image/png;base64,GRID']]));

    const walls = scene.world().walls;
    expect(walls.find((wall) => wall.id === side.id)?.gridUrl).toBe('data:image/png;base64,GRID');
    expect(walls.filter((wall) => wall.gridUrl)).toHaveLength(1);
    table.destroy();
  });

  it('draws a block given a model held here as the model, in place of its faces', async () => {
    const scene = service();
    vi.spyOn(TestBed.inject(ModelStorage), 'get').mockReturnValue({ isReady: true, url: 'blob:tree' } as never);
    const table = new GameTable();
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    const block = Terrain.create('木', 1, 1, 2, '', '');
    block.location = { name: 'table', x: 100, y: 150 };
    block.modelIdentifier = 'tree';
    table.appendChild(block);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const world = scene.world();

    expect(world.models).toEqual([
      expect.objectContaining({
        owner: block.identifier,
        url: 'blob:tree',
        foot: { x: 125, y: 175, z: 0 },
        footprintPx: 50,
      }),
    ]);
    expect([...world.walls, ...world.caps].filter((face) => face.id.startsWith(block.identifier))).toEqual([]);
    table.destroy();
  });

  it('draws a sky past the board only on a table that asks for one, as it is at the hour the clock tells', async () => {
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    TestBed.tick();
    await scene.whenIdle();
    const engine = engines[0];
    expect(engine.domes.at(-1)).toBeNull();

    Config.instance.gameClock = { ...DEFAULT_GAME_CLOCK, mode: 'hours', minutes: 0 };
    TestBed.inject(TabletopService).currentTable.skyKind = 'clock';
    await new Promise((resolve) => setTimeout(resolve, 0));
    TestBed.tick();

    expect(engine.domes.at(-1)).toEqual(skyDomeAt(0));
  });

  it('draws at the quality the seat chose, and again at another once it chooses that', async () => {
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    TestBed.tick();
    await scene.whenIdle();
    const engine = engines[0];
    expect(engine.qualities.at(-1)).toEqual(TABLE_3D_QUALITY.standard);

    TestBed.inject(Table3dQualityService).set('high');
    TestBed.tick();
    await scene.whenIdle();

    expect(engine.qualities.at(-1)).toEqual(TABLE_3D_QUALITY.high);
    expect(engine.drawn).toBe(2);
  });
});
