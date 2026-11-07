import { computed, inject, Injectable, Signal } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { CellGrid, cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { stillBlocksDrawnTogether } from '@axe/domain/tabletop/terrain-batch/still-terrain-layout';

function sameElements<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function sameSet<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  return a.size === b.size && [...a].every((item) => b.has(item));
}

function sameGrid(a: CellGrid, b: CellGrid): boolean {
  return a.cols === b.cols && a.rows === b.rows && a.sizePx === b.sizePx && a.type === b.type;
}

/**
 * Which blocks on the table do not move, so the canvas draws them together rather than each as a
 * piece of its own with its own box on the screen: worked out again when a block, the selection,
 * the table or what the fog leaves of a block changes.
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

  /** The identifiers of the blocks drawn together, which the table is not to draw alone as well. */
  readonly mergedTerrains: Signal<ReadonlySet<string>> = computed(
    () => {
      const terrains = this.terrains();
      for (const terrain of terrains) this.objectChange.versionOf(terrain.identifier)();
      const shown = this.shownWhole();
      const selected = this.selectedTerrains();
      return stillBlocksDrawnTogether(
        terrains.map((terrain, index) => ({
          terrain,
          shownWhole: shown[index] ?? false,
          selected: selected.has(terrain.identifier),
        })),
        this.grid()
      );
    },
    { equal: sameSet }
  );

  /** A block on the table in view, by identifier; null for one that is not there. */
  terrainOf(identifier: string): Terrain | null {
    return this.terrainsById().get(identifier) ?? null;
  }
}
