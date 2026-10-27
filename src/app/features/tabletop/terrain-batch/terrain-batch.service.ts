import { computed, inject, Injectable, linkedSignal, Signal } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { CellGrid, cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { capShadeRows, ShadeStop, wallShade } from '@axe/domain/tabletop/terrain-batch/batch-shade';
import { SquareCap } from '@axe/domain/tabletop/terrain-batch/square-caps';
import { SquareWall } from '@axe/domain/tabletop/terrain-batch/square-walls';
import { StillTerrainLayout, stillTerrainLayoutOf } from '@axe/domain/tabletop/terrain-batch/still-terrain-layout';
import { faceShadeOf, sideShadeLine, topShadeGrid } from '@axe/domain/tabletop/terrain-shade';

const NO_LAYOUT: StillTerrainLayout = {
  merged: new Set(),
  squareCaps: [],
  squareWalls: [],
  hexCaps: [],
  hexWalls: [],
};

function sameElements<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function sameSet<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  return a.size === b.size && [...a].every((item) => b.has(item));
}

function sameGrid(a: CellGrid, b: CellGrid): boolean {
  return a.cols === b.cols && a.rows === b.rows && a.sizePx === b.sizePx && a.type === b.type;
}

/** Whether two pieces of a layout hold the same numbers, strings and sets all the way down. */
function samePiece(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Set && b instanceof Set) return sameSet(a, b);
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => samePiece(item, b[i]));
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => samePiece((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
  );
}

/** The new pieces, with every one that has not changed handed back as the object it was before. */
function keptWhereUnchanged<T extends { readonly key?: string; readonly identifier?: string }>(
  before: readonly T[],
  after: readonly T[]
): readonly T[] {
  const keyOf = (piece: T) => piece.key ?? piece.identifier ?? '';
  const held = new Map(before.map((piece) => [keyOf(piece), piece]));
  const kept = after.map((piece) => {
    const old = held.get(keyOf(piece));
    return old && samePiece(old, piece) ? old : piece;
  });
  return sameElements(kept, before) ? before : kept;
}

/**
 * The blocks on the table that do not move, drawn together rather than each as a box of its own.
 *
 * Every face a block draws is a surface the browser keeps and moves with the camera, and a dungeon
 * is hundreds of blocks. Drawn together, the tops of neighbouring blocks are one surface, the sides
 * pressed between them are not drawn at all.
 *
 * The layout is worked out again when a block, the selection, the table or what the fog leaves of
 * a block changes, and a cap, wall or sheet that comes out the same is handed back as the same
 * object, so nothing is drawn again for it. How brightly each is lit is read apart from the layout,
 * so a light that changes redraws the shade without laying anything out again.
 */
@Injectable({ providedIn: 'root' })
export class TerrainBatchService {
  private readonly tabletopService = inject(TabletopService);
  private readonly visionService = inject(VisionService);
  private readonly selection = inject(SelectionSignalService);
  private readonly objectChange = inject(ObjectChangeService);

  private readonly terrains = computed<readonly Terrain[]>(
    () => {
      this.objectChange.collectionOf('terrain')();
      return this.tabletopService.terrains;
    },
    { equal: sameElements }
  );

  private readonly terrainsById = computed(
    () => new Map(this.terrains().map((terrain) => [terrain.identifier, terrain] as const))
  );

  private readonly grid = computed<CellGrid>(
    () => {
      const table = this.tabletopService.currentTableVersion();
      return cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    },
    { equal: sameGrid }
  );

  private readonly selectedTerrains = computed<ReadonlySet<string>>(
    () => {
      const selected = this.selection.selectedObjects();
      return new Set(
        this.terrains()
          .filter((terrain) => selected.has(terrain.identifier))
          .map((t) => t.identifier)
      );
    },
    { equal: sameSet }
  );

  /**
   * Whether the fog leaves each block drawn whole: all of it on a square board, any of it on a hex
   * board, where a block is shown or hidden whole.
   *
   * Read afresh whenever the light does, but it only changes when the fog does.
   */
  private readonly shownWhole = computed<readonly boolean[]>(
    () => {
      const hex = isHexGrid(this.grid().type);
      return this.terrains().map((terrain) => {
        this.objectChange.versionOf(terrain.identifier)();
        const cover = this.visionService.terrainFogCover(terrain);
        return cover === null || (hex ? cover.cleared.some(Boolean) : cover.cleared.every(Boolean));
      });
    },
    { equal: sameElements }
  );

  private readonly worked = computed<StillTerrainLayout>(() => {
    const terrains = this.terrains();
    for (const terrain of terrains) this.objectChange.versionOf(terrain.identifier)();
    const shown = this.shownWhole();
    const selected = this.selectedTerrains();
    return stillTerrainLayoutOf(
      terrains.map((terrain, index) => ({
        terrain,
        shownWhole: shown[index] ?? false,
        selected: selected.has(terrain.identifier),
      })),
      this.grid()
    );
  });

  private readonly kept = linkedSignal<StillTerrainLayout, StillTerrainLayout>({
    source: this.worked,
    computation: (next, previous) => {
      const before = previous?.value ?? NO_LAYOUT;
      return {
        merged: sameSet(before.merged, next.merged) ? before.merged : next.merged,
        squareCaps: keptWhereUnchanged(before.squareCaps, next.squareCaps),
        squareWalls: keptWhereUnchanged(before.squareWalls, next.squareWalls),
        hexCaps: keptWhereUnchanged(before.hexCaps, next.hexCaps),
        hexWalls: keptWhereUnchanged(before.hexWalls, next.hexWalls),
      };
    },
  });

  /** How the blocks that do not move are drawn together. */
  readonly layout: Signal<StillTerrainLayout> = this.kept.asReadonly();

  /** The identifiers of the blocks drawn together, which the table is not to draw alone as well. */
  readonly mergedTerrains: Signal<ReadonlySet<string>> = computed(() => this.layout().merged, { equal: sameSet });

  /** A block on the table in view, by identifier; null for one that is not there. */
  terrainOf(identifier: string): Terrain | null {
    return this.terrainsById().get(identifier) ?? null;
  }

  /** How brightly each cell of a cap is lit, as the shade across each of its rows. */
  capShade(cap: SquareCap): ShadeStop[][] {
    const gridSize = this.grid().sizePx;
    const readings = new Map<string, readonly number[] | number>();
    const light = (identifier: string): readonly number[] | number => {
      const held = readings.get(identifier);
      if (held !== undefined) return held;
      const terrain = this.terrainOf(identifier);
      if (!terrain) return 1;
      this.objectChange.versionOf(identifier)();
      const grid = topShadeGrid(true, true, 1, {
        roof: () => this.visionService.terrainTopCover(terrain),
        floor: () => null,
        top: () => this.topBrightnessOf(terrain),
        whole: () => 1,
      });
      const value = grid.brightness.length === 1 ? grid.brightness[0] : grid.brightness;
      readings.set(identifier, value);
      return value;
    };
    return capShadeRows(cap, gridSize, (cell) => {
      const reading = light(cell.identifier);
      return typeof reading === 'number' ? reading : (reading[cell.index] ?? 1);
    });
  }

  /** How brightly a wall is lit along its length, as the shade along it. */
  wallShade(wall: SquareWall): ShadeStop[] {
    const terrain = this.terrainOf(wall.identifier);
    if (!terrain) return wallShade(wall, [1]);
    this.objectChange.versionOf(wall.identifier)();
    const line = sideShadeLine(
      faceShadeOf(wall.side, terrain.isSurfaceShading),
      wall.side,
      this.visionService.terrainFogCover(terrain),
      () => this.visionService.ambientBrightness()
    );
    return wallShade(wall, line.brightness);
  }

  /** How brightly the top of a hex block is lit, which is one reading for all of it. */
  hexTopBrightness(identifier: string): number {
    const terrain = this.terrainOf(identifier);
    if (!terrain) return 1;
    this.objectChange.versionOf(identifier)();
    return this.topBrightnessOf(terrain);
  }

  /** How brightly the walls of a hex block are lit before each is turned to the light. */
  hexWallBrightness(identifier: string): number {
    const terrain = this.terrainOf(identifier);
    if (!terrain) return 1;
    this.objectChange.versionOf(identifier)();
    const { x, y, radius } = this.middleOf(terrain);
    return this.visionService.terrainBrightness(terrain, x, y, radius);
  }

  private topBrightnessOf(terrain: Terrain): number {
    const { x, y, radius } = this.middleOf(terrain);
    return this.visionService.terrainTopBrightness(terrain, x, y, radius);
  }

  private middleOf(terrain: Terrain): { x: number; y: number; radius: number } {
    const gridSize = this.grid().sizePx;
    const width = Math.max(0, terrain.width) * gridSize;
    const depth = Math.max(0, terrain.depth) * gridSize;
    return {
      x: terrain.location.x + width / 2,
      y: terrain.location.y + depth / 2,
      radius: Math.max(width, depth) / 2,
    };
  }
}
