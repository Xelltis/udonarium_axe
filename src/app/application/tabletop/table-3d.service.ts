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
import { FloorCanvasesService } from '@axe/application/tabletop/floor-canvases.service';
import { GroundService } from '@axe/application/tabletop/ground.service';
import { LightSlotsService } from '@axe/application/tabletop/light-slots.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TableVeilService } from '@axe/application/tabletop/table-veil.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { TableGraphics, tableGraphicsOf } from '@axe/core/util/graphics-acceleration';
import { dayFractionOf } from '@axe/domain/game-clock/game-clock';
import { matrixColumns, tableEyeMatrix } from '@axe/domain/tabletop/camera/table-camera';
import { TableBackgroundLayer } from '@axe/domain/tabletop/table-background-layer';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { skyLightAt } from '@axe/domain/tabletop/world/sky-light';
import { eyeAxesOf } from '@axe/domain/tabletop/world/table-sprites';
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
  private readonly gameClock = inject(GameClockService);

  /** The light of the sky over the table at the story's hour, as the room's clock tells it. */
  readonly skyLight = computed(() =>
    skyLightAt(dayFractionOf(this.gameClock.clock(), this.gameClock.periods().length, this.gameClock.skies()))
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
   * all, and one it lies over in part is cut back to the cells the seat has reached.
   */
  private readonly faces = computed(() => {
    this.objectChange.fileVersion();
    this.objectChange.collectionOf(TableBackgroundLayer.aliasName)();
    this.objectChange.collectionOf(Terrain.aliasName)();
    const table = this.tabletop.currentTableVersion();
    const terrains = this.tabletop.terrains.filter((terrain) => {
      this.objectChange.versionOf(terrain.identifier)();
      return !this.hiddenByFog(terrain);
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
  }));

  /** Whether the canvas is asked for but not drawing yet, which the table covers until it is. */
  readonly preparing = computed(() => this.drawsOnCanvas() && this.backend() === null && !this.unavailable());

  private frame: number | null = null;
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
          engine.setShadowLights(this.lightSlots.lights());
          this.drawSoon(engine);
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
          engine.setSkyLight(this.skyLight());
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

  private drawSoon(engine: Table3dEngine): void {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      engine.renderIfChanged();
      this.settleIfIdle();
    });
  }

  private settleIfIdle(): void {
    if (this.frame !== null || this.starting !== null || this.engine?.isLoading()) return;
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
