import { computed, inject, Injectable, Signal } from '@angular/core';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { hiddenFacesByTerrain, hiddenFacesOf } from '@axe/domain/tabletop/terrain-occlusion/hidden-faces';
import { OcclusionShape, occlusionShapeOf } from '@axe/domain/tabletop/terrain-occlusion/occlusion-shape';

function sameElements<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * Which sides of the blocks on the table nobody can see, because another block is pressed flat
 * against them.
 *
 * A dungeon is mostly blocks packed wall to wall, and every side a block draws is a surface the
 * browser keeps and moves with the camera. The sides buried between two blocks are never seen from
 * anywhere the camera can stand, so a block leaves them out.
 *
 * Worked out afresh whenever a block on the table changes, the table itself changes, or the fog
 * shows a block differently to whoever is looking. Read it only where a change arriving a moment
 * later is fine, such as a template: the versions it follows rise after the change is made.
 */
@Injectable({ providedIn: 'root' })
export class TerrainOcclusionService {
  private readonly tabletopService = inject(TabletopService);
  private readonly visionService = inject(VisionService);

  private readonly terrainList = computed<readonly Terrain[]>(
    () => this.tabletopService.currentTableVersion().terrains,
    {
      equal: sameElements,
    }
  );

  /** Every block's hidden sides, by identifier; a block with none hidden is not in it. */
  readonly hiddenFaces: Signal<ReadonlyMap<string, ReadonlySet<string>>> = computed(() => {
    const table = this.tabletopService.currentTableVersion();
    const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    const hex = isHexGrid(grid.type);
    const shapes: OcclusionShape[] = [];
    for (const terrain of this.terrainList()) {
      const cover = this.visionService.terrainFogCover(terrain);
      // A hex block the fog has reached any of is shown whole; a square one is cut to the cells reached.
      const shownWhole = cover === null || (hex ? cover.cleared.some(Boolean) : cover.cleared.every(Boolean));
      const shape = occlusionShapeOf(terrain, grid, shownWhole);
      if (shape) shapes.push(shape);
    }
    return hiddenFacesByTerrain(shapes);
  });

  /** The hidden sides of one block, empty when it has none. */
  hiddenFacesFor(identifier: string): ReadonlySet<string> {
    return hiddenFacesOf(this.hiddenFaces(), identifier);
  }
}
