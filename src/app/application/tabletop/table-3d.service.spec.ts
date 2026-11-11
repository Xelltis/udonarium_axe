import { TestBed } from '@angular/core/testing';
import { EffectFrameService } from '@axe/application/effect/effect-frame.service';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { LightSlotsService } from '@axe/application/tabletop/light-slots.service';
import { ModelFitService } from '@axe/application/tabletop/model-fit.service';
import { TABLE_3D_ENGINES, TABLE_GRAPHICS, Table3dService } from '@axe/application/tabletop/table-3d.service';
import { Table3dQualityService } from '@axe/application/tabletop/table-3d-quality.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TableEyeService } from '@axe/application/tabletop/table-eye.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TableVeilService } from '@axe/application/tabletop/table-veil.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TransientPlacementService } from '@axe/application/tabletop/transient-placement.service';
import { BUNDLED_PIECE_MODELS } from '@axe/core/storage/bundled-models';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { ObjectStore } from '@axe/core/sync/object-store';
import { TableGraphics } from '@axe/core/util/graphics-acceleration';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { strongestEffectLights } from '@axe/domain/effect/effect-light';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { sceneLingerMsOf } from '@axe/domain/effect/scene/effect-frame';
import type { EffectFrame } from '@axe/domain/effect/scene/effect-scene';
import { DEFAULT_GAME_CLOCK } from '@axe/domain/game-clock/game-clock';
import { Config } from '@axe/domain/peer/config';
import { DEFAULT_TABLE_CAMERA_VIEW } from '@axe/domain/tabletop/camera/table-camera';
import { cellCenterOf, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { DoorStyle, Terrain } from '@axe/domain/tabletop/terrain';
import type { SceneLight } from '@axe/domain/tabletop/vision-scene';
import { type SkyDome, skyDomeAt } from '@axe/domain/tabletop/world/sky-dome';
import { type SkyLight, skyLightAt } from '@axe/domain/tabletop/world/sky-light';
import type { TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';
import type { TableWorld, TableWorldCap } from '@axe/domain/tabletop/world/table-world';
import type {
  Table3dCamera,
  Table3dDiceThrow,
  Table3dEffectLight,
  Table3dEngine,
  Table3dEngineOptions,
  Table3dFloorCanvas,
  Table3dFogAirSheet,
  Table3dGrid,
  Table3dLightMap,
  Table3dShadowLight,
  Table3dVeil,
  Table3dWeatherFall,
} from '@axe/infrastructure/table-3d/table-3d-port';
import { TABLE_3D_QUALITY, type Table3dQualityPlan } from '@axe/infrastructure/table-3d/table-3d-quality';
import { binaryGltf } from '@axe/testing/binary-gltf';
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
  effectLights: (readonly Table3dEffectLight[])[] = [];
  effectFrames: EffectFrame[] = [];
  glows: (Table3dVeil | null)[] = [];
  fogAirSheets: (readonly Table3dFogAirSheet[])[] = [];
  weathers: (Table3dWeatherFall | null)[] = [];
  diceThrows: (readonly Table3dDiceThrow[])[] = [];
  domes: (SkyDome | null)[] = [];
  qualities: Table3dQualityPlan[] = [];
  moving: boolean | 'slowly' = false;
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

  setWeather(weather: Table3dWeatherFall | null): void {
    this.weathers.push(weather);
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

  setEffectLights(lights: readonly Table3dEffectLight[]): void {
    this.effectLights.push(lights);
  }

  setEffects(frame: EffectFrame): void {
    this.effectFrames.push(frame);
  }

  /** How often it was handed the ground's heights for the marks effects leave on the floor. */
  grounds = 0;

  setEffectGround(): void {
    this.grounds++;
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

  advance(): boolean | 'slowly' {
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

  held = 0;
  heldMs(): number {
    return this.held;
  }

  modelFaceAt(): null {
    return null;
  }

  readiesFirst: boolean[] = [];

  readyBeforeDrawing(on: boolean): void {
    this.readiesFirst.push(on);
  }

  /** The waits on the graphics card not yet over, settled by {@link finishDrawing}. */
  drawing: (() => void)[] = [];

  whenDrawn(): Promise<void> {
    return new Promise((resolve) => this.drawing.push(resolve));
  }

  finishDrawing(): void {
    for (const resolve of this.drawing.splice(0)) resolve();
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
      weatherDrops: 0,
      sky: false,
      backdrops: 0,
      models: 0,
      modelMeshes: 0,
      dice: 0,
      effects: 0,
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
  /** Whether the graphics card refuses an engine asked for so, once it is asked; none is refused unless set. */
  let refused: (options: Table3dEngineOptions) => boolean = () => false;

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
                if (refused(options)) return Promise.reject(new Error('the graphics card refused'));
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
    refused = () => false;
  });

  it('draws through WebGPU until a seat asks for WebGL2 alone, and remembers the choice', () => {
    const scene = service();
    expect(scene.renderer()).toBe('three');

    scene.choose('three-webgl2');

    expect(scene.renderer()).toBe('three-webgl2');
    expect(localStorage.getItem(STORAGE_KEYS.tableRenderer)).toBe('three-webgl2');
  });

  it('lets go of the page’s own table that a browser remembers asking for, and draws on the canvas', () => {
    localStorage.setItem(STORAGE_KEYS.tableRenderer, 'css');

    expect(service().renderer()).toBe('three');
  });

  it('takes up the choice this browser remembers, and leaves one it does not know', () => {
    localStorage.setItem(STORAGE_KEYS.tableRenderer, 'three-webgl2');
    expect(service().renderer()).toBe('three-webgl2');

    TestBed.resetTestingModule();
    localStorage.setItem(STORAGE_KEYS.tableRenderer, 'something else');
    expect(service().renderer()).toBe('three');
  });

  it('has an engine ready the graphics card before drawing, and tells one made later what it was last told', async () => {
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    expect(engines[0].readiesFirst).toEqual([true]);

    scene.readyBeforeDrawing(false);
    expect(engines[0].readiesFirst).toEqual([true, false]);
  });

  it('waits on the graphics card through its engine to have drawn what it was handed, and on nothing with no canvas', async () => {
    const scene = service();
    await expect(scene.whenDrawn()).resolves.toBeUndefined();

    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    let drawn = false;
    void scene.whenDrawn().then(() => (drawn = true));
    await Promise.resolve();
    expect(drawn).toBe(false);

    engines[0].finishDrawing();
    await Promise.resolve();
    expect(drawn).toBe(true);
  });

  it('tells an engine made after it was asked not to ready the graphics card first', async () => {
    const scene = service();
    scene.readyBeforeDrawing(false);

    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();

    expect(engines[0].readiesFirst).toEqual([false]);
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

  it('draws frame after frame while something moves fast, and every other frame while all that moves drifts slowly', async () => {
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    TestBed.tick();
    await scene.whenIdle();
    const engine = engines[0];
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
    const runFrames = (from: number, count: number) => {
      for (let i = 0; i < count; i++) for (const callback of frames.splice(0)) callback(from + i * (1000 / 60));
    };
    try {
      engine.moving = true;
      TestBed.inject(TableCameraService).showView({ ...DEFAULT_TABLE_CAMERA_VIEW, rotateZ: 20 });
      TestBed.tick();
      let advanced = engine.advanced;
      runFrames(0, 12);
      expect(engine.advanced - advanced).toBe(12);

      engine.moving = 'slowly';
      runFrames(1000, 1);
      advanced = engine.advanced;
      runFrames(1000 + 1000 / 60, 12);
      expect(engine.advanced - advanced).toBe(6);

      advanced = engine.advanced;
      TestBed.inject(TableCameraService).showView({ ...DEFAULT_TABLE_CAMERA_VIEW, rotateZ: 25 });
      TestBed.tick();
      runFrames(2000, 1);
      expect(engine.advanced - advanced).toBe(1);
    } finally {
      engine.moving = false;
      runFrames(3000, 4);
      vi.unstubAllGlobals();
    }
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

  it('draws through WebGL2 where WebGPU was offered but refused once asked, and says so where both are refused', async () => {
    graphics = { webgpu: true, webgl2: true };
    refused = (options) => !options.forceWebGL;
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();

    expect(engines.map((engine) => engine.options.forceWebGL)).toEqual([true]);
    expect(scene.preparing()).toBe(false);

    TestBed.resetTestingModule();
    refused = () => true;
    const none = service();
    none.attach(document.createElement('canvas'));
    await none.whenIdle();

    expect(none.unavailable()).toBe(true);
    expect(none.preparing()).toBe(false);
  });

  it('tells the quality whether a graphics card draws the table, as asking the browser found', async () => {
    graphics = { webgpu: true, webgl2: true, hardware: true };
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();

    expect(TestBed.inject(Table3dQualityService).quality()).toBe('high');
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

  it('draws nothing where a seat asks for no drawing: no engine is loaded or made, and nothing covers the table', async () => {
    localStorage.setItem(STORAGE_KEYS.tableRenderer, 'none');
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(loaded.count).toBe(0);
    expect(engines).toHaveLength(0);
    expect(scene.backend()).toBeNull();
    expect(scene.preparing()).toBe(false);
    expect(scene.unavailable()).toBe(false);
  });

  it('loads the engine while the page is idle', async () => {
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

  it('reads the heights of the ground for the floor marks of effects only while an effect is drawn, once as it begins', async () => {
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    TestBed.tick();
    const engine = engines[0];
    expect(engine.grounds).toBe(0);
    const preset = new EffectPreset();
    preset.kind = 'bisect';
    preset.grade = 3;
    preset.durationMs = 600;
    ObjectStore.instance.add(preset, false);
    const playback = TestBed.inject(EffectPlaybackService);
    const active = playback.play({
      presetIdentifier: preset.identifier,
      targets: [{ identifier: 'somewhere', x: 120, y: 80, z: 0 }],
      seed: 1,
    })!;

    playback.now.set(active.startedAt + effectBlowsOf(preset)[0].atMs + 20);
    TestBed.tick();
    expect(engine.grounds).toBe(1);

    playback.now.set(active.startedAt + effectBlowsOf(preset)[0].atMs + 60);
    TestBed.tick();
    expect(engine.grounds).toBe(1);
    ObjectStore.instance.remove(preset);
  });

  it('lights the scene with the light a look that cuts a piece’s picture throws there, once, and with none once it has faded', async () => {
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    TestBed.tick();
    const engine = engines[0];
    const preset = new EffectPreset();
    preset.kind = 'bisect';
    preset.grade = 3;
    preset.durationMs = 600;
    preset.colorPrimary = '#ff7733';
    ObjectStore.instance.add(preset, false);
    const playback = TestBed.inject(EffectPlaybackService);
    const active = playback.play({
      presetIdentifier: preset.identifier,
      targets: [{ identifier: 'somewhere', x: 120, y: 80, z: 0 }],
      seed: 1,
    })!;

    playback.now.set(active.startedAt + effectBlowsOf(preset)[0].atMs + 20);
    TestBed.tick();
    const thrown = engine.effectLights.at(-1)!;
    expect(thrown.length).toBeGreaterThan(0);
    expect(thrown).toEqual(strongestEffectLights(TestBed.inject(EffectFrameService).frame().lights));

    playback.now.set(active.startedAt + 5000);
    TestBed.tick();
    expect(engine.effectLights.at(-1)).toEqual([]);
    ObjectStore.instance.remove(preset);
  });

  it('draws a look made for the scene among the pieces, lit by its own light, until what it leaves has cleared', async () => {
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    TestBed.tick();
    const engine = engines[0];
    const preset = new EffectPreset();
    preset.kind = 'burst';
    preset.durationMs = 600;
    ObjectStore.instance.add(preset, false);
    const playback = TestBed.inject(EffectPlaybackService);
    const active = playback.play({
      presetIdentifier: preset.identifier,
      targets: [{ identifier: 'somewhere', x: 120, y: 80, z: 0 }],
      seed: 1,
    })!;

    playback.now.set(active.startedAt + effectBlowsOf(preset)[0].atMs + 20);
    TestBed.tick();
    const drawn = engine.effectFrames.at(-1)!;
    expect(drawn.motes.length).toBeGreaterThan(0);
    expect(drawn.floor.length).toBeGreaterThan(0);
    expect(engine.effectLights.at(-1)!.length).toBeGreaterThan(0);

    playback.now.set(active.startedAt + 600 + sceneLingerMsOf(preset) * 0.5);
    TestBed.tick();
    expect(engine.effectFrames.at(-1)!.motes.length).toBeGreaterThan(0);

    playback.now.set(active.startedAt + 600 + sceneLingerMsOf(preset) + 500);
    TestBed.tick();
    expect(engine.effectFrames.at(-1)!.motes).toHaveLength(0);
    expect(engine.effectLights.at(-1)).toEqual([]);
    ObjectStore.instance.remove(preset);
  });

  it('lays the pictures of the grid the page hands it over the faces they are named for', async () => {
    const scene = service();
    const table = new GameTable();
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    const block = Terrain.create('箱', 1, 1, 2, 'wall-picture', 'floor-picture');
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

  it('shows a block nobody gave a picture to only to a seat that sees what is hidden, as glass', () => {
    const scene = service();
    const table = new GameTable();
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    const blank = Terrain.create('見えない壁', 1, 1, 2, '', '');
    table.appendChild(blank);
    const sees = vi.spyOn(TestBed.inject(RolePermissionService), 'canSeeHidden').mockReturnValue(false);
    const blankFaces = () => scene.world().walls.filter((wall) => wall.id.startsWith(blank.identifier));

    try {
      expect(blankFaces()).toEqual([]);

      sees.mockReturnValue(true);
      TestBed.inject(ObjectChangeService).notifyChanged(blank.identifier);

      expect(blankFaces().length).toBeGreaterThan(0);
      expect(blankFaces().every((wall) => wall.glass)).toBe(true);
    } finally {
      vi.restoreAllMocks();
      blank.destroy();
      table.destroy();
    }
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

  it('tells a block drawn as a joined wall the arms it reaches out to the walls and the door beside it with', async () => {
    const scene = service();
    vi.spyOn(TestBed.inject(ModelFitService), 'isJoined').mockImplementation((url) => url === 'blob:timber_frame_wall');
    vi.spyOn(TestBed.inject(ModelStorage), 'get').mockImplementation(
      (identifier: string) => ({ isReady: true, url: `blob:${identifier}` }) as never
    );
    const table = new GameTable();
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    const row = Terrain.create('壁', 2, 1, 2, '', '');
    row.location = { name: 'table', x: 50, y: 50 };
    row.modelIdentifier = 'timber_frame_wall';
    const column = Terrain.create('壁', 1, 1, 2, '', '');
    column.location = { name: 'table', x: 50, y: 100 };
    column.modelIdentifier = 'timber_frame_wall';
    const door = Terrain.create('扉', 1, 1, 2, '', '');
    door.location = { name: 'table', x: 150, y: 50 };
    door.doorStyle = DoorStyle.SWING;
    const tree = Terrain.create('木', 1, 1, 3, '', '');
    tree.location = { name: 'table', x: 100, y: 100 };
    tree.modelIdentifier = 'tree';
    const strays = [210, 260].map((x) => {
      const stray = Terrain.create('壁', 1, 1, 2, '', '');
      stray.location = { name: 'table', x, y: 260 };
      stray.modelIdentifier = 'timber_frame_wall';
      return stray;
    });
    const halfway = Terrain.create('壁', 1, 1, 2, '', '');
    halfway.location = { name: 'table', x: 325, y: 325 };
    halfway.modelIdentifier = 'timber_frame_wall';
    const turned = Terrain.create('壁', 2, 1, 2, '', '');
    turned.location = { name: 'table', x: 400, y: 400 };
    turned.rotate = 90;
    turned.modelIdentifier = 'timber_frame_wall';
    strays.push(halfway, turned);
    for (const block of [row, column, door, tree, ...strays]) table.appendChild(block);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const models = new Map(scene.world().models.map((model) => [model.owner, model]));
    const turns = (owner: string) => models.get(owner)!.joins!.map((cell) => cell.arms.map((arm) => arm.deg));

    expect(models.get(row.identifier)!.joins!.map((cell) => [cell.x, cell.y])).toEqual([
      [75, 75],
      [125, 75],
    ]);
    expect(turns(row.identifier)).toEqual([
      [0, 90],
      [0, 180],
    ]);
    expect(turns(column.identifier)).toEqual([[270]]);
    expect(models.get(tree.identifier)!.joins).toBeUndefined();
    expect(strays.map((stray) => models.get(stray.identifier)!.joins)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    table.destroy();
  });

  it('joins walls once their model is read to be a joined wall, and is not idle until it has read', async () => {
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    let answer: (response: Response) => void = () => undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>((resolve) => (answer = resolve)));
    vi.spyOn(TestBed.inject(ModelStorage), 'get').mockReturnValue({ isReady: true, url: 'blob:wall' } as never);
    const table = new GameTable();
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    for (const x of [50, 100]) {
      const wall = Terrain.create('壁', 1, 1, 2, '', '');
      wall.location = { name: 'table', x, y: 50 };
      wall.modelIdentifier = 'timber_frame_wall';
      table.appendChild(wall);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(scene.world().models.filter((model) => model.joins)).toEqual([]);
    let idle = false;
    void scene.whenIdle().then(() => (idle = true));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(idle).toBe(false);

    answer(new Response(joinedGlb()));
    await vi.waitFor(() => expect(scene.world().models.filter((model) => model.joins)).toHaveLength(2));
    await vi.waitFor(() => expect(idle).toBe(true));
    table.destroy();
  });

  it('is not idle while a model bundled with the app that a piece is drawn as is still to come from beside the page', async () => {
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    let answer: (response: Response) => void = () => undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>((resolve) => (answer = resolve)));
    const table = new GameTable();
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    const piece = GameCharacter.create('ゴブリン', 1, '');
    piece.location.name = 'table';
    piece.modelIdentifier = BUNDLED_PIECE_MODELS.goblin;
    table.appendChild(piece);
    await new Promise((resolve) => setTimeout(resolve, 0));

    let idle = false;
    void scene.whenIdle().then(() => (idle = true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(idle).toBe(false);
    expect(scene.busyWith()).toEqual([`bundled models to come: ${BUNDLED_PIECE_MODELS.goblin}`]);

    answer(new Response('', { status: 404 }));
    await vi.waitFor(() => expect(idle).toBe(true));
    expect(scene.busyWith()).toEqual([]);
    table.destroy();
  });

  it('joins a hex wall on every cell of its flower or its run, and a wall or a door turned by a step of the hexes', async () => {
    const scene = service();
    vi.spyOn(TestBed.inject(ModelFitService), 'isJoined').mockReturnValue(true);
    vi.spyOn(TestBed.inject(ModelStorage), 'get').mockReturnValue({ isReady: true, url: 'blob:wall' } as never);
    const table = new GameTable();
    table.gridType = GridType.HEX_VERTICAL;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    const standOn = (terrain: Terrain, col: number, row: number) => {
      const middle = cellCenterOf(grid, cellIndexOf(grid, col, row));
      terrain.location = {
        name: 'table',
        x: middle.x - (terrain.width * table.gridSize) / 2,
        y: middle.y - (terrain.depth * table.gridSize) / 2,
      };
      terrain.modelIdentifier = 'timber_frame_wall';
      table.appendChild(terrain);
      return terrain;
    };
    const flower = standOn(Terrain.create('壁', 2, 2, 2, '', ''), 4, 4);
    const turned = Terrain.create('壁', 1, 1, 2, '', '');
    turned.rotate = 60;
    standOn(turned, 10, 4);
    standOn(Terrain.create('壁', 1, 1, 2, '', ''), 11, 4);
    const column = standOn(Terrain.create('壁', 1, 3, 2, '', ''), 14, 5);
    standOn(Terrain.create('壁', 1, 1, 2, '', ''), 14, 7);
    const door = Terrain.create('扉', 1, 0.2, 2, '', '');
    door.rotate = 60;
    door.doorStyle = DoorStyle.SWING;
    standOn(door, 4, 9);
    const byDoor = standOn(Terrain.create('壁', 1, 1, 2, '', ''), 4, 8);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const models = new Map(scene.world().models.map((model) => [model.owner, model]));
    expect(models.get(flower.identifier)!.joins).toHaveLength(7);
    expect(models.get(turned.identifier)!.joins![0].arms).toHaveLength(1);
    expect(models.get(column.identifier)!.joins).toHaveLength(3);
    expect(models.get(byDoor.identifier)!.joins![0].arms).toHaveLength(1);
    table.destroy();
  });

  it('lifts a block’s model as high as the block floats, as a container stacked on another is', async () => {
    const scene = service();
    vi.spyOn(TestBed.inject(ModelStorage), 'get').mockReturnValue({ isReady: true, url: 'blob:container' } as never);
    const table = new GameTable();
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    const upper = Terrain.create('コンテナ', 4, 2, 1.7, '', '');
    upper.location = { name: 'table', x: 0, y: 0 };
    upper.altitude = 1.7;
    upper.modelIdentifier = 'container';
    table.appendChild(upper);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(scene.world().models).toEqual([expect.objectContaining({ altitudePx: 85 })]);
    table.destroy();
  });

  it('stands a door’s model in its box, and tells it how far the door’s opening has taken it', async () => {
    const scene = service();
    vi.spyOn(TestBed.inject(ModelStorage), 'get').mockReturnValue({ isReady: true, url: 'blob:door' } as never);
    const table = new GameTable();
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    const door = Terrain.create('扉', 1, 0.2, 2, '', '');
    door.location = { name: 'table', x: 100, y: 150 };
    door.doorStyle = DoorStyle.SWING;
    door.modelIdentifier = 'door';
    table.appendChild(door);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(scene.world().models).toEqual([
      expect.objectContaining({
        foot: { x: 125, y: 155, z: 0 },
        boxPx: { widthPx: 50, depthPx: 10, cellPx: 50 },
        rotateDeg: 0,
        door: { open: false, shiftX: 0, shiftY: 0, turnDeg: 0, liftPx: 0 },
      }),
    ]);

    door.isDoorOpen = true;
    await new Promise((resolve) => setTimeout(resolve, 0));
    const open = scene.world().models[0];
    expect(open.foot).toEqual({ x: 125, y: 155, z: 0 });
    expect(open.door!.open).toBe(true);
    expect(open.door!.turnDeg).toBe(95);
    expect(125 + open.door!.shiftX).toBeCloseTo(100 + 25 * Math.cos((95 * Math.PI) / 180), 6);
    expect(155 + open.door!.shiftY).toBeCloseTo(155 + 25 * Math.sin((95 * Math.PI) / 180), 6);
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

  it('lets rain fall over the board as high as its walls or ten cells, and stops it once the sky clears', async () => {
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    TestBed.tick();
    const engine = engines[0];
    expect(engine.weathers.at(-1)).toBeNull();

    const table = TestBed.inject(TabletopService).currentTable;
    Object.assign(table, {
      width: 20,
      height: 10,
      gridSize: 50,
      wallHeight: 3,
      weatherKind: 'rain',
      weatherDensity: 0.5,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    TestBed.tick();

    expect(engine.weathers.at(-1)).toMatchObject({
      fall: { shape: 'streak', density: 0.5 },
      board: { width: 1000, depth: 500 },
      ceilingPx: 500,
    });

    table.weatherKind = '';
    await new Promise((resolve) => setTimeout(resolve, 0));
    TestBed.tick();

    expect(engine.weathers.at(-1)).toBeNull();
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

/** A binary glTF file of a JSON chunk alone, its scene made as a wall joined to the walls beside it. */
function joinedGlb(): ArrayBuffer {
  return binaryGltf({ scenes: [{ nodes: [], extras: { fit: 'joined' } }], scene: 0 });
}
