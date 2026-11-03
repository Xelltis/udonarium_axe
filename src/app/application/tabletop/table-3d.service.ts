import {
  computed,
  effect,
  EffectRef,
  inject,
  Injectable,
  InjectionToken,
  Injector,
  signal,
  untracked,
} from '@angular/core';
import { GameClockService } from '@axe/application/game-clock/game-clock.service';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { AmbienceService } from '@axe/application/tabletop/ambience.service';
import { FloorCanvasesService } from '@axe/application/tabletop/floor-canvases.service';
import { GroundService } from '@axe/application/tabletop/ground.service';
import { LightSlotsService } from '@axe/application/tabletop/light-slots.service';
import { Table3dQualityService } from '@axe/application/tabletop/table-3d-quality.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TableVeilService } from '@axe/application/tabletop/table-veil.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { WaterService } from '@axe/application/tabletop/water.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { TableGraphics, tableGraphicsOf } from '@axe/core/util/graphics-acceleration';
import { dayFractionOf } from '@axe/domain/game-clock/game-clock';
import { matrixColumns, tableEyeMatrix } from '@axe/domain/tabletop/camera/table-camera';
import { groundLiftOfBlock } from '@axe/domain/tabletop/ground/ground-surface';
import { pieceModelOf } from '@axe/domain/tabletop/piece-model';
import { TableBackgroundLayer } from '@axe/domain/tabletop/table-background-layer';
import { tableSkyKindOf } from '@axe/domain/tabletop/table-sky';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { terrainBoxOf } from '@axe/domain/tabletop/terrain-box';
import { flickers } from '@axe/domain/tabletop/vision-scene/light-flicker';
import { waterShoreOf } from '@axe/domain/tabletop/water/water-shore';
import { waterSidesOf } from '@axe/domain/tabletop/water/water-sides';
import { skyDomeAt } from '@axe/domain/tabletop/world/sky-dome';
import { skyLightAt } from '@axe/domain/tabletop/world/sky-light';
import { tableBackdropsOf, tableLayersOf } from '@axe/domain/tabletop/world/table-layers';
import type { TableWorldModel } from '@axe/domain/tabletop/world/table-models';
import { eyeAxesOf } from '@axe/domain/tabletop/world/table-sprites';
import { tableWaterOf } from '@axe/domain/tabletop/world/table-water';
import { TableWorld, tableWorldOf } from '@axe/domain/tabletop/world/table-world';
import type {
  Table3dBackend,
  Table3dCamera,
  Table3dEngine,
  Table3dEngineModule,
  Table3dGrid,
  Table3dStats,
} from '@axe/infrastructure/table-3d/table-3d-port';

/**
 * What draws the table: the page's own 3D, or a canvas through three.js, made to go through WebGL2
 * alone where WebGPU could be had, for holding the two side by side.
 */
export type TableRenderer = 'css' | 'three' | 'three-webgl2';

const RENDERERS: readonly TableRenderer[] = ['css', 'three', 'three-webgl2'];

/** Loads the module the engine is made in, which holds three.js and so is loaded only when it is wanted. */
export const TABLE_3D_ENGINES = new InjectionToken<() => Promise<Table3dEngineModule>>('table 3d engines', {
  providedIn: 'root',
  factory: () => () => import('@axe/infrastructure/table-3d/table-3d-engine'),
});

/** How many times a canvas whose drawing the graphics card let go is made again, before the table is left alone. */
const RESTARTS = 3;

/** How often a flickering light the scene lights itself is brightened and dimmed, as the page redraws its own. */
const FLICKER_INTERVAL_MS = 50;

/** Asks which interfaces this browser can draw the table through. */
export const TABLE_GRAPHICS = new InjectionToken<() => Promise<TableGraphics>>('table graphics', {
  providedIn: 'root',
  factory: () => () => tableGraphicsOf(),
});

/**
 * Draws the table on a canvas through three.js, for a seat that has asked for it while the canvas
 * does not yet draw everything the page does.
 *
 * The scene is worked out from the room alone and handed to the engine, which is loaded only once a
 * canvas is given. The engine draws on the next frame after anything it was told changes, and not
 * otherwise.
 */
@Injectable({ providedIn: 'root' })
export class Table3dService {
  private readonly tabletop = inject(TabletopService);
  private readonly camera = inject(TableCameraService);
  private readonly injector = inject(Injector);
  private readonly images = inject(ImageService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly vision = inject(VisionService);
  private readonly pieces = inject(TablePiecesService);
  private readonly floorCanvases = inject(FloorCanvasesService);
  private readonly tableVeil = inject(TableVeilService);
  private readonly lightSlots = inject(LightSlotsService);
  private readonly quality = inject(Table3dQualityService);
  private readonly gameClock = inject(GameClockService);
  private readonly motion = inject(MotionService);
  private readonly waterCells = inject(WaterService);
  private readonly ambience = inject(AmbienceService);

  /** The light of the sky over the table at the story's hour, as the room's clock tells it. */
  readonly skyLight = computed(() => skyLightAt(this.dayFraction()));

  /** The sky drawn past the board of the table in view, as it is at the story's hour, or none where the table shows its background picture. */
  readonly sky = computed(() => {
    const table = this.tabletop.currentTableVersion();
    return tableSkyKindOf(table?.skyKind) === 'clock' ? skyDomeAt(this.dayFraction()) : null;
  });

  /** How far through the story's day it is, from 0 at midnight to 1. */
  private readonly dayFraction = computed(() =>
    dayFractionOf(this.gameClock.clock(), this.gameClock.periods().length, this.gameClock.skies())
  );
  private readonly ground = inject(GroundService);
  private readonly loadEngines = inject(TABLE_3D_ENGINES);
  private readonly askGraphics = inject(TABLE_GRAPHICS);

  /** What this seat draws the table with. */
  readonly renderer = signal<TableRenderer>(chosenRenderer());
  /** Whether the table is drawn on a canvas. */
  readonly drawsOnCanvas = computed(() => this.renderer() !== 'css');
  /** Whether a canvas was asked for in a browser that can make neither WebGPU nor WebGL2. */
  readonly unavailable = signal(false);
  /** The interface the canvas draws through, once it draws. */
  readonly backend = signal<Table3dBackend | null>(null);
  /**
   * Goes up each time a canvas is to be made afresh, after the graphics card let the old one's
   * drawing go: a canvas that lost its drawing cannot be drawn on again.
   */
  readonly canvasGeneration = signal(0);
  private restarts = 0;

  /**
   * The board and the blocks of the table in view, with the pictures they name read from where this
   * browser keeps them. A block the fog lies over entirely is left out, so nothing of it is drawn at
   * all, and one it lies over in part is cut back to the cells the seat has reached. A block drawn as
   * a 3D model held here is drawn as the model instead of its faces.
   */
  private readonly faces = computed(() => {
    this.objectChange.fileVersion();
    this.objectChange.collectionOf(TableBackgroundLayer.aliasName)();
    this.objectChange.collectionOf(Terrain.aliasName)();
    const table = this.tabletop.currentTableVersion();
    const modelled = new Set(this.terrainModels().map((model) => model.owner));
    const terrains = this.tabletop.terrains.filter((terrain) => {
      this.objectChange.versionOf(terrain.identifier)();
      return !this.hiddenByFog(terrain) && !modelled.has(terrain.identifier);
    });
    return tableWorldOf(
      table,
      (identifier) => this.images.getEmptyOr(identifier).url,
      terrains,
      (terrain) => this.vision.terrainFogCover(terrain),
      this.ground.surface()
    );
  });

  /**
   * The scene of the table in view: its board and blocks, and the pieces on it. A piece being moved
   * builds the pieces again and leaves the blocks as they were.
   */
  readonly world = computed<TableWorld>(() => ({
    ...this.faces(),
    sprites: this.pieces.sprites(),
    coins: this.pieces.coins(),
    layers: this.layers(),
    water: this.water(),
    backdrops: this.backdrops(),
    models: [...this.pieces.models(), ...this.terrainModels()],
  }));

  /**
   * The blocks this seat may see that are drawn as 3D models held here in full: each stood on the
   * middle of its box, at the foot of the block, as wide as the box is wide or deep.
   */
  private readonly terrainModels = computed<readonly TableWorldModel[]>(() => {
    this.objectChange.fileVersion();
    this.objectChange.collectionOf(Terrain.aliasName)();
    const gridSize = this.tabletop.currentTableVersion().gridSize;
    const ground = this.ground.surface();
    const models: TableWorldModel[] = [];
    for (const terrain of this.tabletop.terrains) {
      this.objectChange.versionOf(terrain.identifier)();
      const model = pieceModelOf(terrain);
      const url = model ? this.pieces.modelUrlOf(model.identifier) : '';
      if (!model || !url || this.hiddenByFog(terrain)) continue;
      const box = terrainBoxOf(terrain, gridSize);
      models.push({
        owner: terrain.identifier,
        kind: Terrain.aliasName,
        url,
        model,
        foot: {
          x: (box.minX + box.maxX) / 2,
          y: (box.minY + box.maxY) / 2,
          z: terrain.posZ + groundLiftOfBlock(ground, gridSize, terrain),
        },
        footprintPx: Math.max(terrain.width, terrain.depth) * gridSize,
        heightPx: Math.max(0, terrain.height) * gridSize,
        rotateDeg: terrain.rotate,
        walking: false,
      });
    }
    return models;
  });

  /**
   * The water on the table in view, as this seat sees it, with the floor of a map the weather puts
   * under water, moving where things may move.
   */
  private readonly water = computed(() => {
    const grid = this.waterCells.grid();
    const cells = this.waterCells.cells();
    const weather = this.ambience.weather();
    const underwater = weather?.kind === 'underwater' ? weather : null;
    const moving = this.motion.enabled();
    if (!grid || cells.size < 1) return tableWaterOf(grid, cells, [], [], moving, underwater);
    return tableWaterOf(
      grid,
      cells,
      waterSidesOf(grid, cells, this.waterCells.groundAt),
      waterShoreOf(grid, cells, this.waterCells.groundOf),
      moving,
      underwater
    );
  });

  /** The pictures the table in view lays under and over its board, drifting where things may move. */
  private readonly layers = computed(() =>
    tableLayersOf(this.layeredTable(), (identifier) => this.images.getEmptyOr(identifier).url, this.motion.enabled())
  );

  /** The pictures the table in view lays behind everything, drifting where things may move. */
  private readonly backdrops = computed(() =>
    tableBackdropsOf(this.layeredTable(), (identifier) => this.images.getEmptyOr(identifier).url, this.motion.enabled())
  );

  /** The table in view, read again as its pictures, its layers or what any of them says changes. */
  private readonly layeredTable = computed(
    () => {
      this.objectChange.fileVersion();
      this.objectChange.collectionOf(TableBackgroundLayer.aliasName)();
      const table = this.tabletop.currentTableVersion();
      for (const layer of table?.backgroundLayers ?? []) this.objectChange.versionOf(layer.identifier)();
      return table;
    },
    { equal: () => false }
  );

  /** Whether the canvas is asked for but not drawing yet, which the table covers until it is. */
  readonly preparing = computed(() => this.drawsOnCanvas() && this.backend() === null && !this.unavailable());

  private frame: number | null = null;
  private frameForMotion = false;
  private engine: Table3dEngine | null = null;
  /** The page's grid, laid over the board on the canvas, or null while the page draws none. */
  private readonly grid = signal<Table3dGrid | null>(null);
  private starting: Promise<unknown> | null = null;
  private readonly idleWaiters: (() => void)[] = [];

  constructor() {
    if (untracked(this.drawsOnCanvas)) this.loadSoon();
  }

  private hiddenByFog(terrain: Terrain): boolean {
    const cover = this.vision.terrainFogCover(terrain);
    return cover !== null && !cover.cleared.some((cell) => cell);
  }

  /**
   * Hands the canvas the grid the page draws on a canvas of its own, to lay over the board where
   * the page lays it, or takes it away with null.
   */
  showGrid(grid: Table3dGrid | null): void {
    this.grid.set(grid);
  }

  /** Draws on a canvas from now on, or goes back to the page, and remembers which in this browser. */
  choose(renderer: TableRenderer): void {
    this.renderer.set(renderer);
    writeLocal(STORAGE_KEYS.tableRenderer, renderer);
  }

  /**
   * Draws the table on a canvas until the function answered is called, which lets the canvas go. A
   * browser that can draw it through neither interface is left alone and said to be so.
   */
  attach(canvas: HTMLCanvasElement): () => void {
    let engine: Table3dEngine | null = null;
    let detached = false;
    const effects: EffectRef[] = [];
    const started = this.start(canvas).then((made) => {
      if (detached) {
        made?.dispose();
        return;
      }
      engine = made;
      if (!made) return;
      this.engine = made;
      made.onNeedsFrame(() => this.drawSoon(made));
      effects.push(...this.follow(made));
      made.onLost(() => this.restart());
    });
    this.starting = started;
    void started.finally(() => {
      if (this.starting === started) this.starting = null;
      this.settleIfIdle();
    });
    return () => {
      detached = true;
      for (const watching of effects) watching.destroy();
      if (this.frame !== null) cancelAnimationFrame(this.frame);
      this.frame = null;
      engine?.dispose();
      if (this.engine === engine) this.engine = null;
      this.backend.set(null);
      this.settleIfIdle();
    };
  }

  /**
   * Loads the engine while the page has nothing else to do, so a table drawn on a canvas does not
   * wait for it on opening.
   */
  private loadSoon(): void {
    const whenIdle =
      typeof requestIdleCallback === 'function' ? requestIdleCallback : (run: () => void) => setTimeout(run, 0);
    whenIdle(() => void this.loadEngines().catch(() => undefined));
  }

  /** Has a fresh canvas made, a few times at most, for one whose drawing the graphics card let go. */
  private restart(): void {
    this.backend.set(null);
    if (this.restarts >= RESTARTS) return;
    this.restarts++;
    this.canvasGeneration.update((generation) => generation + 1);
  }

  /** What the engine holds, counted, or null while there is no engine. */
  stats(): Table3dStats | null {
    return this.engine?.stats() ?? null;
  }

  /** Settles once the canvas has drawn everything it was told, or at once while it has nothing to draw. */
  whenIdle(): Promise<void> {
    return new Promise((resolve) => {
      this.idleWaiters.push(resolve);
      this.settleIfIdle();
    });
  }

  private async start(canvas: HTMLCanvasElement): Promise<Table3dEngine | null> {
    const graphics = await this.askGraphics();
    if (!graphics.webgpu && !graphics.webgl2) {
      this.unavailable.set(true);
      return null;
    }
    this.unavailable.set(false);
    const engines = await this.loadEngines();
    const forceWebGL = untracked(this.renderer) === 'three-webgl2' || !graphics.webgpu;
    const engine = await engines.createTable3dEngine(canvas, { forceWebGL });
    this.backend.set(engine.backend);
    return engine;
  }

  /** Tells the engine the scene and the camera whenever either changes. */
  private follow(engine: Table3dEngine): EffectRef[] {
    let size = '';
    return [
      effect(
        () => {
          engine.setWorld(this.world());
          this.drawSoon(engine);
        },
        { injector: this.injector }
      ),
      effect(
        () => {
          engine.setGrid(this.grid());
          this.drawSoon(engine);
        },
        { injector: this.injector }
      ),
      effect(
        () => {
          engine.setFloorCanvases(this.floorCanvases.all());
          this.drawSoon(engine);
        },
        { injector: this.injector }
      ),
      effect(
        () => {
          engine.setVeil(this.tableVeil.veil());
          this.drawSoon(engine);
        },
        { injector: this.injector }
      ),
      effect(
        () => {
          engine.setLightMap(this.tableVeil.lightMap());
          this.drawSoon(engine);
        },
        { injector: this.injector }
      ),
      effect(
        () => {
          engine.setQuality(this.quality.plan());
          this.drawSoon(engine);
        },
        { injector: this.injector }
      ),
      effect(
        (onCleanup) => {
          const lights = this.lightSlots.lights();
          engine.setShadowLights(lights);
          this.drawSoon(engine);
          if (!lights.some((light) => flickers(light.animation))) return;
          const timer = setInterval(() => {
            engine.flicker(performance.now());
            this.drawSoon(engine);
          }, FLICKER_INTERVAL_MS);
          onCleanup(() => clearInterval(timer));
        },
        { injector: this.injector }
      ),
      effect(
        () => {
          engine.setGlow(this.tableVeil.glow());
          this.drawSoon(engine);
        },
        { injector: this.injector }
      ),
      effect(
        () => {
          engine.setFogAir(this.tableVeil.fogAir(), this.motion.enabled());
          this.drawSoon(engine);
        },
        { injector: this.injector }
      ),
      effect(
        () => {
          engine.setSkyLight(this.skyLight());
          this.drawSoon(engine);
        },
        { injector: this.injector }
      ),
      effect(
        () => {
          engine.setSky(this.sky());
          this.drawSoon(engine);
        },
        { injector: this.injector }
      ),
      effect(
        () => {
          this.camera.version();
          const camera = untracked(() => this.cameraNow());
          if (!camera) return;
          const shown = `${camera.width}x${camera.height}x${devicePixelRatio}`;
          if (shown !== size) {
            size = shown;
            engine.resize(camera.width, camera.height, devicePixelRatio);
          }
          engine.setCamera(camera);
          this.drawSoon(engine);
        },
        { injector: this.injector }
      ),
    ];
  }

  private cameraNow(): Table3dCamera | null {
    const view = this.camera.view;
    const layout = this.camera.layout;
    if (!view || !layout) return null;
    const eye = tableEyeMatrix(view, layout);
    return {
      eye: matrixColumns(eye),
      axes: eyeAxesOf(eye),
      orthographic: view.orthographic,
      width: layout.width,
      height: layout.height,
    };
  }

  /**
   * Draws on the next frame whatever changed, and goes on drawing frame after frame while anything
   * moves by itself. A frame asked for only because something moves by itself is not waited for:
   * the table is idle once all it was told is drawn.
   */
  private drawSoon(engine: Table3dEngine, forMotion = false): void {
    if (!forMotion) this.frameForMotion = false;
    if (this.frame !== null) return;
    this.frameForMotion = forMotion;
    this.frame = requestAnimationFrame((time) => {
      this.frame = null;
      const moving = engine.advance(time);
      engine.renderIfChanged();
      if (moving) this.drawSoon(engine, true);
      this.settleIfIdle();
    });
  }

  private settleIfIdle(): void {
    const drawing = this.frame !== null && !this.frameForMotion;
    if (drawing || this.starting !== null || this.engine?.isLoading()) return;
    for (const resolve of this.idleWaiters.splice(0)) resolve();
  }
}

/** The renderer asked for in the address (`?renderer=`), which is then remembered, or the one remembered. */
function chosenRenderer(): TableRenderer {
  const asked = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('renderer');
  if (isRenderer(asked)) {
    writeLocal(STORAGE_KEYS.tableRenderer, asked);
    return asked;
  }
  const kept = readLocal(STORAGE_KEYS.tableRenderer);
  return isRenderer(kept) ? kept : 'css';
}

function isRenderer(value: string | null): value is TableRenderer {
  return value !== null && (RENDERERS as readonly string[]).includes(value);
}
