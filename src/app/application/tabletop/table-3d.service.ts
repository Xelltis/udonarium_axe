import {
  computed,
  DestroyRef,
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
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { AmbienceService } from '@axe/application/tabletop/ambience.service';
import { BundledModelsService } from '@axe/application/tabletop/bundled-models.service';
import { FloorCanvasesService } from '@axe/application/tabletop/floor-canvases.service';
import { GroundService } from '@axe/application/tabletop/ground.service';
import { LightFlickerClockService } from '@axe/application/tabletop/light-flicker-clock.service';
import { LightSlotsService } from '@axe/application/tabletop/light-slots.service';
import { Table3dQualityService } from '@axe/application/tabletop/table-3d-quality.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TableEyeService } from '@axe/application/tabletop/table-eye.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TableVeilService } from '@axe/application/tabletop/table-veil.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { WaterService } from '@axe/application/tabletop/water.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { TableGraphics, tableGraphicsOf } from '@axe/core/util/graphics-acceleration';
import type { DiceMaterial } from '@axe/domain/dice/dice-3d/dice-look';
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
import { sameTableWorld, TableWorld, tableWorldOf } from '@axe/domain/tabletop/world/table-world';
import { weatherFallOf } from '@axe/domain/tabletop/world/weather-fall';
import type {
  Table3dBackend,
  Table3dCamera,
  Table3dDiceThrow,
  Table3dEngine,
  Table3dEngineModule,
  Table3dGrid,
  Table3dStats,
  Table3dWeatherFall,
} from '@axe/infrastructure/table-3d/table-3d-port';

/**
 * How the canvas draws the table through three.js: through WebGPU where it can be had, or through
 * WebGL2 alone even then, for holding the two side by side.
 */
export type TableRenderer = 'three' | 'three-webgl2';

const RENDERERS: readonly TableRenderer[] = ['three', 'three-webgl2'];

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
  private readonly eyes = inject(TableEyeService);
  private readonly injector = inject(Injector);
  private readonly images = inject(ImageService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly vision = inject(VisionService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly pieces = inject(TablePiecesService);
  private readonly floorCanvases = inject(FloorCanvasesService);
  private readonly tableVeil = inject(TableVeilService);
  private readonly lightSlots = inject(LightSlotsService);
  private readonly flickerClock = inject(LightFlickerClockService);
  private readonly bundledModels = inject(BundledModelsService);
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
   * a 3D model held here is drawn as the model instead of its faces. The faces the page lays the
   * table's grid over wear it as the page has drawn it.
   */
  private readonly faces = computed(() => {
    const built = this.builtFaces();
    const grids = this.faceGrids();
    if (grids.size === 0) return built;
    return {
      ...built,
      walls: built.walls.map((wall) => {
        const gridUrl = grids.get(wall.id);
        return gridUrl ? { ...wall, gridUrl } : wall;
      }),
    };
  });

  /** The pictures of the table's grid the page lays over faces of the table, by the face each goes on. */
  private readonly faceGrids = signal<ReadonlyMap<string, string>>(new Map(), {
    equal: (a, b) => a.size === b.size && [...a].every(([id, url]) => b.get(id) === url),
  });

  /**
   * The faces of the board and of the blocks this seat may see. A block nobody gave a picture to
   * stops what it stops but is shown only to a seat that sees what is hidden, as glass.
   */
  private readonly builtFaces = computed(() => {
    this.objectChange.fileVersion();
    this.objectChange.collectionOf(TableBackgroundLayer.aliasName)();
    this.objectChange.collectionOf(Terrain.aliasName)();
    this.objectChange.trackMyCursor();
    const table = this.tabletop.currentTableVersion();
    const modelled = new Set(this.terrainModels().map((model) => model.owner));
    const seesGlass = this.rolePermission.canSeeHidden();
    const terrains = this.tabletop.terrains.filter((terrain) => {
      this.objectChange.versionOf(terrain.identifier)();
      if (!seesGlass && !terrain.hasFaceImage) return false;
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
   * builds the pieces again and leaves the blocks as they were. For an eye standing among the pieces,
   * the piece it looks out of is left out and the ceilings over it put in.
   */
  readonly world = computed<TableWorld>(
    () => {
      const faces = this.faces();
      const eye = this.eyes.scene();
      const seen = <T extends { readonly owner: string }>(parts: readonly T[]) =>
        eye ? parts.filter((part) => part.owner !== eye.without) : parts;
      const ceilings = [...(eye?.ceilings ?? []), ...this.eyes.overhead()];
      return {
        ...faces,
        caps: ceilings.length ? [...faces.caps, ...ceilings] : faces.caps,
        sprites: seen(this.pieces.sprites()),
        coins: this.pieces.coins(),
        layers: this.layers(),
        water: this.water(),
        backdrops: this.backdrops(),
        models: seen([...this.pieces.models(), ...this.terrainModels()]),
      };
    },
    { equal: sameTableWorld }
  );

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
        rollDeg: 0,
        pivotPx: 0,
        altitudePx: 0,
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

  /**
   * The rain, storm or snow falling through the air over the table in view, up to its walls or ten
   * cells, whichever is higher, where things may move.
   */
  private readonly weatherFall = computed<Table3dWeatherFall | null>(
    () => {
      const weather = this.ambience.weather();
      if (!weather || !this.motion.enabled()) return null;
      const fall = weatherFallOf(weather.kind, weather.color, weather.density);
      if (!fall) return null;
      const table = this.tabletop.currentTableVersion();
      return {
        fall,
        board: { width: table.width * table.gridSize, depth: table.height * table.gridSize },
        ceilingPx: Math.max(table.wallHeight, WEATHER_CEILING_CELLS) * table.gridSize,
      };
    },
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) }
  );

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
  readonly preparing = computed(() => this.backend() === null && !this.unavailable());

  private frame: number | null = null;
  private canvas: HTMLCanvasElement | null = null;
  /** How to let go each canvas the table draws on now, as its handle would. */
  private readonly attached = new Set<() => void>();
  /** Where the table keeps its canvas, to put it back once a view has done with it. */
  private canvasHome: { readonly parent: Node; readonly next: Node | null } | null = null;
  private lentTo: HTMLElement | null = null;
  private diceThrows: readonly Table3dDiceThrow[] = [];
  private readonly diceWarmed = new Set<DiceMaterial>();
  private frameForMotion = false;
  private engine: Table3dEngine | null = null;
  /** The page's grid, laid over the board on the canvas, or null while the page draws none. */
  private readonly grid = signal<Table3dGrid | null>(null);
  private starting: Promise<unknown> | null = null;
  private readonly idleWaiters: (() => void)[] = [];
  /** Whether what moves by itself is drawn only as the frame waited for is drawn at once. */
  private motionHeld = false;
  /** Whether the engine readies the graphics card for a new kind of thing before drawing it; see {@link readyBeforeDrawing}. */
  private readiesFirst = true;

  constructor() {
    this.loadSoon();
    inject(DestroyRef).onDestroy(() => {
      for (const letGo of [...this.attached]) letGo();
    });
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

  /**
   * Hands the canvas the pictures of the table's grid the page lays over faces of the table, as over
   * its walls and the fronts of the beams standing out from them, each by the face it goes on as the
   * scene names it.
   */
  showFaceGrids(grids: ReadonlyMap<string, string>): void {
    this.faceGrids.set(grids);
  }

  /** Draws the table the way given from now on, and remembers it in this browser. */
  choose(renderer: TableRenderer): void {
    this.renderer.set(renderer);
    writeLocal(STORAGE_KEYS.tableRenderer, renderer);
  }

  /**
   * Draws the table on a canvas until the function answered is called, which lets the canvas go, or
   * until the table itself goes. A browser that can draw it through neither interface is left alone
   * and said to be so.
   */
  attach(canvas: HTMLCanvasElement): () => void {
    let engine: Table3dEngine | null = null;
    let detached = false;
    this.canvas = canvas;
    this.canvasHome = canvas.parentNode ? { parent: canvas.parentNode, next: canvas.nextSibling } : null;
    this.placeCanvas();
    const effects: EffectRef[] = [];
    const started = this.start(canvas).then((made) => {
      if (detached) {
        made?.dispose();
        return;
      }
      engine = made;
      if (!made) return;
      this.engine = made;
      made.setDice(this.diceThrows);
      made.warmDice([...this.diceWarmed]);
      made.readyBeforeDrawing(this.readiesFirst);
      made.onNeedsFrame(() => this.drawSoon(made));
      effects.push(...this.follow(made));
      made.onLost(() => this.restart());
    });
    this.starting = started;
    void started.finally(() => {
      if (this.starting === started) this.starting = null;
      this.settleIfIdle();
    });
    const letGo = () => {
      if (detached) return;
      detached = true;
      this.attached.delete(letGo);
      if (this.canvas === canvas) {
        this.canvas = null;
        this.canvasHome = null;
      }
      for (const watching of effects) watching.destroy();
      if (this.frame !== null) cancelAnimationFrame(this.frame);
      this.frame = null;
      engine?.dispose();
      if (this.engine === engine) this.engine = null;
      this.backend.set(null);
      this.settleIfIdle();
    };
    this.attached.add(letGo);
    return letGo;
  }

  /**
   * Puts the dice of the rolls thrown on the table into the scene, each as far into its throw as
   * given, to be drawn on the next frame; an engine started later is handed them too.
   */
  showDice(throws: readonly Table3dDiceThrow[]): void {
    this.diceThrows = throws;
    const engine = this.engine;
    if (!engine) return;
    engine.setDice(throws);
    this.drawSoon(engine);
  }

  /** Has the shaders of the dice of these materials built ahead, now or once the engine has started. */
  warmDice(materials: readonly DiceMaterial[]): void {
    const fresh = materials.filter((material) => !this.diceWarmed.has(material));
    if (fresh.length < 1) return;
    for (const material of fresh) this.diceWarmed.add(material);
    this.engine?.warmDice(fresh);
  }

  /**
   * Lends the canvas to a view that stands an eye among the pieces and shows the table's scene in
   * place of the table, until the function answered is called and the canvas goes back to the table.
   * A canvas made afresh while it is lent is lent as well.
   */
  lend(host: HTMLElement): () => void {
    this.lentTo = host;
    this.placeCanvas();
    return () => {
      if (this.lentTo !== host) return;
      this.lentTo = null;
      this.placeCanvas();
    };
  }

  /** Puts the canvas where it is shown: in the view it is lent to, or back where the table keeps it. */
  private placeCanvas(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    if (this.lentTo) {
      if (canvas.parentNode !== this.lentTo) this.lentTo.appendChild(canvas);
      return;
    }
    const home = this.canvasHome;
    if (!home || canvas.parentNode === home.parent) return;
    home.parent.insertBefore(canvas, home.next?.parentNode === home.parent ? home.next : null);
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

  /**
   * Holds every flickering light of the table as it is at one moment, those the scene lights itself
   * and those the page's darkness adds the glow of, or lets them flicker by the clock again given
   * null: for pictures of the table that must come out the same however long the page took to get
   * there.
   */
  holdFlicker(timeMs: number | null): void {
    this.flickerClock.hold(timeMs);
  }

  /**
   * Has the lights that throw shadows of their own chosen again from where the camera looks now, as
   * though none did yet, rather than kept on the way the camera came: for pictures of the table that
   * must come out the same however the page got there.
   */
  chooseLightsAfresh(): void {
    this.lightSlots.chooseAfresh();
  }

  /**
   * Draws at once the frame the canvas waits for to draw what it was told, with what the engine
   * holds back to draw a moment later, and answers whether it has drawn everything: nothing left to
   * draw, nothing loading, not starting, and none of the pictures the page draws the darkness with
   * still to come. What moves by itself is drawn too, at the moment the clock stands at, but not
   * waited for: a frame asked for only for it, and every time while motion is held. For a page whose
   * clock is held, where no frame comes until the clock is moved on, so what moves is drawn as it
   * stands at that moment however late the rest arrived.
   */
  drawDueNow(): boolean {
    const engine = this.engine;
    if (engine?.isLoading()) {
      engine.stopHoldingBack();
      this.drawSoon(engine);
    }
    if (engine && (this.frame !== null || this.motionHeld)) {
      if (this.frame !== null) cancelAnimationFrame(this.frame);
      this.drawFrame(engine, performance.now());
    }
    return (
      !(this.frame !== null && !this.frameForMotion) &&
      this.starting === null &&
      !this.engine?.isLoading() &&
      this.tableVeil.loadingPictures() === 0
    );
  }

  /**
   * Has what moves by itself, as water and a tumbling die, drawn only as the frame waited for is
   * drawn at once, or by the clock again given false: for a page whose clock is held, which would
   * otherwise draw the whole scene again for every frame the clock is run through.
   */
  /**
   * Has the engine ready the graphics card for a new kind of thing before drawing it, as it does unless
   * told otherwise, or build it on the frame that draws it: for a page whose clock is held, which holds
   * the readying up with it.
   */
  readyBeforeDrawing(on: boolean): void {
    this.readiesFirst = on;
    this.engine?.readyBeforeDrawing(on);
  }

  holdMotion(held: boolean): void {
    this.motionHeld = held;
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
          engine.setGrid(this.eyes.scene() ? null : this.grid());
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
            engine.flicker(this.flickerClock.now());
            this.drawSoon(engine);
          }, FLICKER_INTERVAL_MS);
          onCleanup(() => clearInterval(timer));
        },
        { injector: this.injector }
      ),
      effect(
        () => {
          for (const identifier of this.pieces.missingModels()) this.bundledModels.read(identifier);
        },
        { injector: this.injector }
      ),
      effect(
        () => {
          this.flickerClock.held();
          engine.flicker(untracked(() => this.flickerClock.now()));
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
          engine.setFogAir(this.tableVeil.fogAir(), this.motion.enabled());
          this.drawSoon(engine);
        },
        { injector: this.injector }
      ),
      effect(
        () => {
          engine.setWeather(this.weatherFall());
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
          this.eyes.eye();
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
    const standing = this.eyes.eye();
    if (standing) return standing.camera;
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
      ...(view.perspectivePx ? { focalPx: view.perspectivePx, nearPx: FOLLOWING_NEAR_PX } : {}),
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
    this.frame = requestAnimationFrame((time) => this.drawFrame(engine, time));
  }

  private drawFrame(engine: Table3dEngine, time: number): void {
    this.frame = null;
    const moving = engine.advance(time);
    engine.renderIfChanged();
    if (moving && !this.motionHeld) this.drawSoon(engine, true);
    this.settleIfIdle();
  }

  private settleIfIdle(): void {
    const drawing = this.frame !== null && !this.frameForMotion;
    if (drawing || this.starting !== null || this.engine?.isLoading()) return;
    for (const resolve of this.idleWaiters.splice(0)) resolve();
  }
}

/** How high the weather falls from over a table with lower walls or none, in cells, so that it still has a sky. */
const WEATHER_CEILING_CELLS = 10;

/** How near the camera that follows a piece about still draws, in table pixels: a few cells off it, a wall may stand close. */
const FOLLOWING_NEAR_PX = 4;

/**
 * The way of drawing asked for in the address (`?renderer=`), which is then remembered, or the one
 * remembered, or else through WebGPU where it can be had. A way no longer offered, as the page's own
 * table once was, is let go of.
 */
function chosenRenderer(): TableRenderer {
  const asked = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('renderer');
  if (isRenderer(asked)) {
    writeLocal(STORAGE_KEYS.tableRenderer, asked);
    return asked;
  }
  const kept = readLocal(STORAGE_KEYS.tableRenderer);
  return isRenderer(kept) ? kept : 'three';
}

function isRenderer(value: string | null): value is TableRenderer {
  return value !== null && (RENDERERS as readonly string[]).includes(value);
}
