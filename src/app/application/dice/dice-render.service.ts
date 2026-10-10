import { DestroyRef, effect, inject, Injectable, InjectionToken, untracked } from '@angular/core';
import { DiceThrow, DiceThrowService, throwKeyOf } from '@axe/application/dice/dice-throw.service';
import { DICE_PICTURE_MAX_SIDE, MyDiceService } from '@axe/application/dice/my-dice.service';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { Logger } from '@axe/core/logging/logger';
import { ImageState } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { clipMatrixOf, columnsOf, eyeOf, multiply, Point3, transform } from '@axe/core/transform/css-clip-matrix';
import { type DiceMaterial, wornDiceLook } from '@axe/domain/dice/dice-3d/dice-look';
import type { Tray } from '@axe/domain/dice/dice-3d/throw-validation';
import { Config } from '@axe/domain/peer/config';
import type { Dice3dEngine, DicePicture, DrawnRegion, PreparedThrow } from '@axe/infrastructure/dice-3d/dice-3d-engine';
import type { FacePicture } from '@axe/infrastructure/dice-3d/dice-textures';

/** What the dice are drawn with: the part of the 3D engine the page uses. */
export type DiceEngine = Pick<
  Dice3dEngine,
  'canvas' | 'isLost' | 'prepare' | 'render' | 'release' | 'warm' | 'forgetPicture' | 'dispose'
>;

/** Starts the engine, loading it and the drawing library with it on first use. */
export const DICE_ENGINE_LOADER = new InjectionToken<() => Promise<DiceEngine>>('DICE_ENGINE_LOADER', {
  providedIn: 'root',
  factory: () => () =>
    import('@axe/infrastructure/dice-3d/dice-3d-engine').then(({ Dice3dEngine }) => Dice3dEngine.create()),
});

/**
 * Reads a picture dice wear, by its identifier among the room's images, as something the engine can
 * draw; null while it has not arrived whole. A line may point at any of the room's images, so one
 * larger than a dice picture is made is read down to that size.
 */
export const DICE_PICTURE_LOADER = new InjectionToken<(identifier: string) => Promise<FacePicture | null>>(
  'DICE_PICTURE_LOADER',
  {
    providedIn: 'root',
    factory: () => async (identifier) => {
      const image = ImageStorage.instance.get(identifier);
      if (!image || image.state < ImageState.COMPLETE || !image.blob) return null;
      const whole = await createImageBitmap(image.blob);
      const scale = DICE_PICTURE_MAX_SIDE / Math.max(whole.width, whole.height);
      if (scale >= 1) return whole;
      const small = await createImageBitmap(whole, {
        resizeWidth: Math.max(1, Math.round(whole.width * scale)),
        resizeHeight: Math.max(1, Math.round(whole.height * scale)),
        resizeQuality: 'high',
      });
      whole.close();
      return small;
    },
  }
);

/** The sharpest the dice are drawn, in device pixels to a CSS pixel, and on a device drawn lightly. */
const MAX_PIXEL_RATIO = 2;
const LITE_PIXEL_RATIO = 1.5;
/** How long dice at rest stay on the table before they fade, and how long they take to, in seconds. */
export const TABLE_HOLD_SECONDS = 2.5;
export const TABLE_FADE_SECONDS = 0.6;
/**
 * How far around its tray a throw on the table is drawn, in the tray's units: high enough for the
 * dice as they come in, outside the edge they come in over, and out to where their shadows fall.
 */
const TABLE_REACH_UP = 6;
const TABLE_REACH_IN = 3;
const TABLE_REACH_SHADOW = 6;
/**
 * How long after a throw is worked out it may still begin to play when it is first drawn, in
 * milliseconds; longer than the drawing library takes to load on a slow device.
 */
export const LATE_START_MS = 12_000;
/**
 * How long drawing one frame may take before the dice on show are held back by the time it took, in
 * milliseconds, as when the first die of a material has its shaders built: far longer than a frame.
 */
export const STALL_MS = 200;
/** How long the engine waits for a quiet moment to be readied in, at most, in milliseconds. */
const WARM_UP_WITHIN_MS = 3000;
/** How often the table's view is read again while it seems to stand still, in milliseconds. */
const STILL_VIEW_MS = 1000;

/** A canvas a throw is shown on, and how it stands now. */
export interface DiceStageHandle {
  /** Tells the stage its size in CSS pixels, which it is redrawn at. */
  resize(width: number, height: number): void;
  /** Takes the canvas off the stage. */
  release(): void;
}

interface Stage {
  readonly canvas: HTMLCanvasElement;
  /** The key of the throw it shows. */
  readonly key: string;
  width: number;
  height: number;
  /** Whether the canvas holds a picture of the throw as it stands now. */
  drawn: boolean;
}

interface TableStage {
  readonly canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

/**
 * Draws the dice of every throw on show.
 *
 * One engine draws them all, off screen, a throw at a time, and its picture is copied onto each
 * canvas the throw is shown on: a line's frame, however many chat windows show the line, or the
 * sheet laid over the table. The drawing library is loaded only when there is a throw to draw,
 * and frames are drawn only while a throw on show is moving; one at rest in a frame is drawn once
 * and left, and one on the table stays a while and fades.
 */
@Injectable({ providedIn: 'root' })
export class DiceRenderService {
  private readonly throws = inject(DiceThrowService);
  private readonly renderLite = inject(RenderLiteService);
  private readonly myDice = inject(MyDiceService);
  private readonly coordinates = inject(CoordinateService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly loadEngine = inject(DICE_ENGINE_LOADER);
  private readonly loadPicture = inject(DICE_PICTURE_LOADER);
  /** The pictures dice wear that have arrived and been read, and those being read, by identifier. */
  private readonly pictures = new Map<string, FacePicture>();
  private readonly readingPictures = new Set<string>();
  /**
   * The pictures that had arrived whole but could not be read, which are not read again: a picture
   * is known by its bytes, so reading the same one again would fail again.
   */
  private readonly unreadablePictures = new Set<string>();
  private readonly stages = new Set<Stage>();
  private table: TableStage | null = null;
  private readonly prepared = new Map<
    string,
    { result: DiceThrow['result']; picture: string; prepared: PreparedThrow }
  >();
  /** The throws on the table whose dice have gone from it, which are not looked at again. */
  private readonly offTable = new Set<string>();
  /**
   * When each throw on the table came to rest, kept from when it is first known: a throw whose
   * recording is cut down to where its dice rest would otherwise seem to have stopped sooner.
   */
  private readonly restedAt = new Map<string, number>();
  private engine: DiceEngine | null = null;
  private starting: Promise<DiceEngine | null> | null = null;
  private broken = false;
  private frame = 0;
  private view: { key: string; columns: number[] } | null = null;
  /** The throws as they stood when the stages were last told what to draw again. */
  private seen: ReadonlyMap<string, DiceThrow> = new Map();
  /** When each throw began to play here, on the clock frames are drawn by. */
  private readonly playFrom = new Map<string, number>();

  constructor() {
    // A throw worked out, come to rest or dropped is drawn afresh wherever it is on show, and one
    // that comes after the dice could not be drawn is put away at once.
    effect(() => {
      const throws = this.throws.throws();
      if (this.broken) {
        untracked(() => this.failAll(throws));
        return;
      }
      for (const stage of this.stages) {
        if (throws.get(stage.key) !== this.seen.get(stage.key)) stage.drawn = false;
      }
      this.seen = throws;
      this.wake();
    });
    // A room that shows its rolls' dice has the engine readied in a quiet moment, so the first roll
    // does not wait while the drawing library loads and its shaders are built.
    effect(() => {
      this.objectChange.versionOf('Config')();
      const config = this.objectStore.get<Config>('Config');
      if (!config || config.diceStage === 'off') return;
      untracked(() => this.warmUp());
    });
    // The shaders of a material are built ahead while a throw that wears it is worked out, and ahead
    // of this seat's own first roll.
    effect(() => {
      const throws = this.throws.throws();
      const wanted = [wornDiceLook(this.myDice.look()).material];
      for (const diceThrow of throws.values()) if (diceThrow.phase === 'working') wanted.push(diceThrow.look.material);
      untracked(() => this.warm(wanted));
    });
    // A picture the dice wear is read once it has arrived whole, and until then they are drawn
    // without it; every throw wearing it is drawn again once it is here.
    effect(() => {
      this.objectChange.fileVersion();
      const throws = this.throws.throws();
      untracked(() => this.readPictures(throws));
    });
    // So is the table's sheet when the table is turned or moved under it.
    effect(() => {
      this.coordinates.tabletopTransformVersion();
      this.wake();
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.frame) cancelAnimationFrame(this.frame);
      this.engine?.dispose();
    });
  }

  /**
   * Shows a throw, by its key, on a canvas until the handle is released. A throw no longer on show
   * anywhere lets its meshes go, and is set up again if it comes back into view.
   */
  register(canvas: HTMLCanvasElement, key: string): DiceStageHandle {
    const stage: Stage = { canvas, key, width: 0, height: 0, drawn: false };
    this.stages.add(stage);
    this.wake();
    return {
      resize: (width, height) => {
        if (width === stage.width && height === stage.height) return;
        stage.width = width;
        stage.height = height;
        stage.drawn = false;
        this.wake();
      },
      release: () => {
        this.stages.delete(stage);
        if (![...this.stages].some((other) => other.key === stage.key)) this.drop(stage.key);
      },
    };
  }

  /** Shows the throws on the table on a canvas laid over it, until the handle is released. */
  registerTable(canvas: HTMLCanvasElement): DiceStageHandle {
    const stage: TableStage = { canvas, width: 0, height: 0 };
    this.table = stage;
    this.wake();
    return {
      resize: (width, height) => {
        stage.width = width;
        stage.height = height;
        this.wake();
      },
      release: () => {
        if (this.table === stage) this.table = null;
      },
    };
  }

  /** Has the stages drawn again on the next frame, as when a throw on show has moved on. */
  wake(): void {
    if (this.frame || this.broken || (this.stages.size < 1 && !this.table)) return;
    this.frame = requestAnimationFrame((now) => this.draw(now));
  }

  /** Draws a frame, holding the dice on show back by the time it took where that was long. */
  private draw(now: number): void {
    const began = performance.now();
    this.drawFrame(now);
    const spent = performance.now() - began;
    if (spent > STALL_MS) this.holdBack(spent);
  }

  /**
   * Has every throw on show carry on from where it was after a frame that took long to draw, rather
   * than leap ahead by the time the frame took: the dice keep their tumble, and their while on the
   * table, as though the frame had come at once.
   */
  private holdBack(ms: number): void {
    for (const [key, from] of this.playFrom) {
      this.playFrom.set(key, from + ms);
      this.throws.played(key, from + ms);
    }
    for (const [key, rest] of this.restedAt) this.restedAt.set(key, rest + ms);
  }

  private drawFrame(now: number): void {
    this.frame = 0;
    const throws = this.throws.throws();
    const onTable = [...throws.values()].some((t) => t.stage === 'table' && t.result && t.phase !== 'failed');
    if (this.stages.size < 1 && !onTable) {
      this.clearTable();
      return;
    }
    const engine = this.engine;
    if (!engine) {
      void this.start();
      return;
    }
    if (engine.isLost) {
      this.giveUp();
      return;
    }

    for (const id of this.prepared.keys()) if (!throws.has(id)) this.drop(id);
    for (const id of this.playFrom.keys()) if (!throws.has(id)) this.playFrom.delete(id);
    for (const id of this.restedAt.keys()) if (!throws.has(id) || this.offTable.has(id)) this.restedAt.delete(id);
    for (const id of this.offTable) if (!throws.has(id)) this.offTable.delete(id);
    const pixelRatio = Math.min(devicePixelRatio || 1, this.renderLite.active() ? LITE_PIXEL_RATIO : MAX_PIXEL_RATIO);

    let moving = false;
    for (const [id, stages] of this.byThrow()) {
      const diceThrow = throws.get(id);
      if (!diceThrow?.result || diceThrow.phase === 'failed' || diceThrow.stage !== 'frame') continue;
      const prepared = this.preparedFor(engine, diceThrow);
      const seconds = diceThrow.still ? prepared.endSeconds : (now - this.playedFrom(diceThrow, now)) / 1000;
      const tumbling = seconds < prepared.endSeconds;
      moving ||= tumbling;
      const due = stages.filter((stage) => (tumbling || !stage.drawn) && stage.width > 0);
      if (due.length < 1) continue;

      const width = Math.max(...due.map((stage) => stage.width));
      const height = Math.max(...due.map((stage) => stage.height));
      const region = engine.render(
        prepared,
        Math.min(seconds, prepared.endSeconds),
        { kind: 'frame' },
        { width, height, pixelRatio }
      );
      for (const stage of due) copy(engine.canvas, region, stage, pixelRatio);
    }
    if (this.drawTable(engine, throws, now, pixelRatio)) moving = true;
    if (moving) this.wake();
  }

  /**
   * Draws the throws on the table over it, each where its tray lies as the table is seen now, and
   * says whether any is still on show.
   */
  private drawTable(
    engine: DiceEngine,
    throws: ReadonlyMap<string, DiceThrow>,
    now: number,
    pixelRatio: number
  ): boolean {
    const table = this.table;
    if (!table) return false;
    const rests = this.restsOnTable(engine, throws, now);
    const showing = [...throws.values()].filter((diceThrow) => this.isOnTable(diceThrow, rests, now));
    const context = this.clearTable(showing.length > 0 ? pixelRatio : 0);
    if (!context || showing.length < 1) return false;

    const host = table.canvas.getBoundingClientRect();
    for (const diceThrow of showing) {
      const prepared = this.preparedFor(engine, diceThrow);
      const seconds = (now - this.playedFrom(diceThrow, now)) / 1000;
      const total = diceThrow.still ? 0 : prepared.endSeconds;
      const shot = this.shotOf(diceThrow.placement!.model, diceThrow.tray, host, now);
      if (!shot) continue;
      const region = engine.render(
        prepared,
        diceThrow.still ? prepared.endSeconds : Math.min(seconds, total),
        { kind: 'table', projection: shot.clip, eye: shot.eye },
        { width: shot.width, height: shot.height, pixelRatio }
      );
      const sinceRest = (now - rests.get(diceThrow.messageIdentifier)!) / 1000;
      context.globalAlpha =
        sinceRest <= TABLE_HOLD_SECONDS ? 1 : Math.max(0, 1 - (sinceRest - TABLE_HOLD_SECONDS) / TABLE_FADE_SECONDS);
      context.drawImage(
        engine.canvas,
        region.x,
        region.y,
        region.width,
        region.height,
        (shot.left - host.left) * pixelRatio,
        (shot.top - host.top) * pixelRatio,
        shot.width * pixelRatio,
        shot.height * pixelRatio
      );
    }
    context.globalAlpha = 1;
    return true;
  }

  /**
   * When the dice of each roll on the table have all come to rest, by the roll: the trays of a large
   * roll stay and fade together, from when the last of them stops. A roll with a tray still being
   * worked out has not come to rest.
   */
  private restsOnTable(engine: DiceEngine, throws: ReadonlyMap<string, DiceThrow>, now: number): Map<string, number> {
    const rests = new Map<string, number>();
    for (const diceThrow of throws.values()) {
      if (diceThrow.stage !== 'table' || !diceThrow.placement || diceThrow.phase === 'failed') continue;
      if (this.offTable.has(diceThrow.key)) continue;
      const rest = diceThrow.result ? this.restOf(engine, diceThrow, now) : Infinity;
      const roll = diceThrow.messageIdentifier;
      rests.set(roll, Math.max(rests.get(roll) ?? -Infinity, rest));
    }
    return rests;
  }

  /** When a throw on the table came to rest, worked out once from the whole of its recording. */
  private restOf(engine: DiceEngine, diceThrow: DiceThrow, now: number): number {
    let rest = this.restedAt.get(diceThrow.key);
    if (rest === undefined) {
      const seconds = diceThrow.still ? 0 : this.preparedFor(engine, diceThrow).endSeconds;
      rest = this.playedFrom(diceThrow, now) + seconds * 1000;
      this.restedAt.set(diceThrow.key, rest);
    }
    return rest;
  }

  /** Whether a throw is on the table and still to be seen there: tumbling, at rest a while with its roll, or fading. */
  private isOnTable(diceThrow: DiceThrow, rests: ReadonlyMap<string, number>, now: number): boolean {
    if (diceThrow.stage !== 'table' || !diceThrow.result || !diceThrow.placement) return false;
    if (diceThrow.phase === 'failed' || this.offTable.has(diceThrow.key)) return false;
    const rest = rests.get(diceThrow.messageIdentifier) ?? Infinity;
    const on = (now - rest) / 1000 < TABLE_HOLD_SECONDS + TABLE_FADE_SECONDS;
    if (!on) {
      this.offTable.add(diceThrow.key);
      this.drop(diceThrow.key);
    }
    return on;
  }

  /**
   * When a throw begins to play: the first frame it is drawn in, so one worked out while the drawing
   * library was still loading is not half over by the time it is seen. One first drawn long after it
   * was worked out, such as a line scrolled back into view, is not thrown again but shown at rest.
   */
  private playedFrom(diceThrow: DiceThrow, now: number): number {
    let from = this.playFrom.get(diceThrow.key);
    if (from === undefined) {
      from = now - diceThrow.startedAt <= LATE_START_MS ? now : diceThrow.startedAt - LATE_START_MS;
      this.playFrom.set(diceThrow.key, from);
      if (from === now) this.throws.played(diceThrow.key, now);
    }
    return from;
  }

  /**
   * Empties the table's sheet and sizes it to its stage, or with no pixel ratio shrinks it to
   * nothing, so a sheet with no dice on it holds no picture the size of the screen.
   */
  private clearTable(pixelRatio = 0): CanvasRenderingContext2D | null {
    const table = this.table;
    if (!table) return null;
    const width = pixelRatio > 0 ? Math.max(1, Math.round(table.width * pixelRatio)) : 1;
    const height = pixelRatio > 0 ? Math.max(1, Math.round(table.height * pixelRatio)) : 1;
    if (table.canvas.width !== width) table.canvas.width = width;
    if (table.canvas.height !== height) table.canvas.height = height;
    const context = table.canvas.getContext('2d');
    context?.clearRect(0, 0, width, height);
    return context;
  }

  /**
   * How a tray on the table is drawn: the part of the screen its dice can reach, and the matrix and
   * eye that lay the dice over the table there. Null when none of it is on the screen.
   */
  private shotOf(model: readonly number[], tray: Tray, host: DOMRect, now: number) {
    const toPage = multiply(this.tableView(now), model);
    const bounds: Point3[] = [
      -tray.halfWidth - Math.max(TABLE_REACH_IN, TABLE_REACH_SHADOW),
      tray.halfWidth + TABLE_REACH_SHADOW,
    ].flatMap((x) =>
      [-tray.halfDepth - TABLE_REACH_SHADOW, tray.halfDepth + TABLE_REACH_SHADOW].flatMap((y) =>
        [0, TABLE_REACH_UP].map((z): Point3 => [x, y, z])
      )
    );
    const corners = bounds.map((point) => transform(toPage, point));
    if (corners.some(([, , , w]) => w <= 0)) return null;
    const xs = corners.map(([x, , , w]) => x / w);
    const ys = corners.map(([, y, , w]) => y / w);
    const left = Math.floor(Math.max(host.left, Math.min(...xs)));
    const top = Math.floor(Math.max(host.top, Math.min(...ys)));
    const right = Math.ceil(Math.min(host.right, Math.max(...xs)));
    const bottom = Math.ceil(Math.min(host.bottom, Math.max(...ys)));
    if (right - left < 1 || bottom - top < 1) return null;
    const rect = { left, top, width: right - left, height: bottom - top };
    const clip = clipMatrixOf(toPage, rect, bounds);
    return { ...rect, clip, eye: eyeOf(clip) };
  }

  /**
   * The table's matrix onto the page, read again when the view has been written out and now and
   * then while it stands still, since reading it lays the page out.
   */
  private tableView(now: number): number[] {
    const key = `${this.coordinates.tabletopTransformVersion()}:${Math.floor(now / STILL_VIEW_MS)}`;
    if (this.view?.key !== key) this.view = { key, columns: columnsOf(this.coordinates.tabletopSceneMatrix()) };
    return this.view.columns;
  }

  private warmUp(): void {
    if (this.engine || this.starting || this.broken) return;
    const idle = globalThis.requestIdleCallback;
    if (typeof idle === 'function') idle(() => void this.start(), { timeout: WARM_UP_WITHIN_MS });
    else setTimeout(() => void this.start(), 0);
  }

  private start(): Promise<DiceEngine | null> {
    this.starting ??= this.loadEngine()
      .then((engine) => {
        this.engine = engine;
        this.warm([wornDiceLook(this.myDice.look()).material]);
        this.wake();
        return engine;
      })
      .catch((error: unknown) => {
        Logger.warn('The 3D dice could not be drawn on this device', error);
        this.giveUp();
        return null;
      });
    return this.starting;
  }

  /** Stops drawing for good, and has every throw on show put away. */
  private giveUp(): void {
    this.broken = true;
    this.clearTable();
    this.failAll(this.throws.throws());
  }

  private failAll(throws: ReadonlyMap<string, DiceThrow>): void {
    for (const [id, diceThrow] of throws) if (diceThrow.phase !== 'failed') this.throws.fail(id);
  }

  private preparedFor(engine: DiceEngine, diceThrow: DiceThrow): PreparedThrow {
    const picture = this.pictureOf(diceThrow);
    const kept = this.prepared.get(diceThrow.key);
    if (kept && kept.result === diceThrow.result && kept.picture === (picture?.key ?? '')) return kept.prepared;
    if (kept) engine.release(kept.prepared);
    const prepared = engine.prepare({
      dice: diceThrow.dice,
      color: diceThrow.color,
      ink: diceThrow.look.ink,
      material: this.drawnAs(diceThrow.look.material),
      ...(picture ? { picture } : {}),
      accent: diceThrow.outcome === 'critical' || diceThrow.outcome === 'fumble' ? diceThrow.outcome : '',
      seedKey: throwKeyOf(diceThrow.messageIdentifier, diceThrow.part, 'frame'),
      tray: diceThrow.tray,
      result: diceThrow.result!,
    });
    this.prepared.set(diceThrow.key, { result: diceThrow.result, picture: picture?.key ?? '', prepared });
    return prepared;
  }

  /** What a material is drawn as here: glass, which costs a second drawing of the scene, is resin on a device drawn lightly. */
  private drawnAs(material: DiceMaterial): DiceMaterial {
    return material === 'glass' && this.renderLite.active() ? 'resin' : material;
  }

  /** Builds the shaders of materials ahead of the first die that wears them, once the engine is here. */
  private warm(materials: readonly DiceMaterial[]): void {
    const engine = this.engine;
    if (!engine || this.broken) return;
    for (const material of new Set(materials.map((material) => this.drawnAs(material)))) {
      if (material !== 'resin') void engine.warm(material);
    }
  }

  /** The picture a throw's dice wear, once it has been read; until then they are drawn without it. */
  private pictureOf(diceThrow: DiceThrow): DicePicture | null {
    const key = diceThrow.look.picture;
    const source = key ? this.pictures.get(key) : undefined;
    return source ? { key, source, fit: diceThrow.look.pictureFit } : null;
  }

  /**
   * Reads the pictures the throws' dice wear that are not read yet, and draws again what wears one
   * read. A picture no throw kept wears any more is let go, with what was set up wearing it.
   *
   * One of this seat's own that the room's images lack, as on a line it said before the page was
   * opened again, is put back among them from this browser; by then the seat has joined the room
   * the line is in, and its role is known.
   */
  private readPictures(throws: ReadonlyMap<string, DiceThrow>): void {
    const wanted = new Set([...throws.values()].map((diceThrow) => diceThrow.look.picture).filter(Boolean));
    for (const [key, source] of this.pictures) {
      if (wanted.has(key)) continue;
      for (const [id, kept] of this.prepared) if (kept.picture === key) this.drop(id);
      this.engine?.forgetPicture(key);
      this.pictures.delete(key);
      (source as Partial<ImageBitmap>).close?.();
    }
    for (const key of this.unreadablePictures) if (!wanted.has(key)) this.unreadablePictures.delete(key);
    for (const key of wanted) {
      if (this.pictures.has(key) || this.readingPictures.has(key) || this.unreadablePictures.has(key)) continue;
      this.readingPictures.add(key);
      void this.loadPicture(key)
        .catch(() => {
          this.unreadablePictures.add(key);
          return null;
        })
        .then((source) => {
          this.readingPictures.delete(key);
          if (!source) {
            if (key === this.myDice.look().picture) void this.myDice.ensureShared();
            return;
          }
          this.pictures.set(key, source);
          for (const stage of this.stages)
            if (this.throws.throws().get(stage.key)?.look.picture === key) stage.drawn = false;
          this.wake();
        });
    }
  }

  /** Lets a throw's meshes go, once nothing draws it. */
  private drop(key: string): void {
    const kept = this.prepared.get(key);
    if (!kept) return;
    this.engine?.release(kept.prepared);
    this.prepared.delete(key);
  }

  private byThrow(): Map<string, Stage[]> {
    const grouped = new Map<string, Stage[]>();
    for (const stage of this.stages) {
      const list = grouped.get(stage.key) ?? [];
      list.push(stage);
      grouped.set(stage.key, list);
    }
    return grouped;
  }
}

/** Copies the engine's picture onto a stage's canvas, sized to the stage. */
function copy(source: HTMLCanvasElement, region: DrawnRegion, stage: Stage, pixelRatio: number): void {
  const width = Math.max(1, Math.round(stage.width * pixelRatio));
  const height = Math.max(1, Math.round(stage.height * pixelRatio));
  if (stage.canvas.width !== width) stage.canvas.width = width;
  if (stage.canvas.height !== height) stage.canvas.height = height;
  const context = stage.canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, width, height);
  context.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, width, height);
  stage.drawn = true;
}
