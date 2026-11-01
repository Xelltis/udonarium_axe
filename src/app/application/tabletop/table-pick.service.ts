import { inject, Injectable, untracked } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { TableRay, tableRayOfPage } from '@axe/domain/tabletop/camera/table-camera';
import { pickAll, pickFirst, PickHit, PickTarget } from '@axe/domain/tabletop/pick/pick-index';
import { terrainPickTarget } from '@axe/domain/tabletop/pick/terrain-pick';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';

/**
 * Says what a point of the page lands on among the things on the table, by running the line of
 * sight through it against the shapes those things make, rather than by asking the page what is
 * drawn there.
 *
 * Only what stands on the board's own floor is picked so far; what hangs on a wall or lies on a
 * white board is read on that surface's own frame, which comes later.
 */
@Injectable({
  providedIn: 'root',
})
export class TablePickService {
  private readonly tabletop = inject(TabletopService);
  private readonly vision = inject(VisionService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly camera = inject(TableCameraService);

  /** Each object's target, kept until the object or the table's grid changes. */
  private readonly made = new Map<string, { key: string; target: PickTarget }>();

  /** The line of sight through a point of the page, or null before the table has a camera. */
  rayAt(pageX: number, pageY: number): TableRay | null {
    const inverse = this.camera.inverseSceneMatrix();
    return inverse ? tableRayOfPage(inverse, pageX, pageY) : null;
  }

  /** What a point of the page lands on first, or null where it lands on nothing. */
  pickAt(pageX: number, pageY: number, accepts?: (target: PickTarget) => boolean): PickHit | null {
    const ray = this.rayAt(pageX, pageY);
    return ray ? pickFirst(this.targets(), ray, accepts) : null;
  }

  /** Everything a point of the page lands on, nearest the eye first. */
  allAt(pageX: number, pageY: number, accepts?: (target: PickTarget) => boolean): PickHit[] {
    const ray = this.rayAt(pageX, pageY);
    return ray ? pickAll(this.targets(), ray, accepts) : [];
  }

  /** The targets of what stands on the table in view, and is not hidden from this seat. */
  targets(): PickTarget[] {
    return untracked(() => {
      const table = this.tabletop.currentTable;
      const grid = `${table.gridSize}|${table.gridType}`;
      const live = new Set<string>();
      const targets: PickTarget[] = [];
      for (const terrain of this.tabletop.terrains) {
        if (surfaceOf(terrain) !== 'floor' || this.hiddenByFog(terrain)) continue;
        live.add(terrain.identifier);
        targets.push(
          this.keep(terrain.identifier, grid, () => terrainPickTarget(terrain, table.gridSize, table.gridType))
        );
      }
      for (const identifier of this.made.keys()) if (!live.has(identifier)) this.made.delete(identifier);
      return targets;
    });
  }

  private keep(identifier: string, grid: string, make: () => PickTarget): PickTarget {
    const key = `${grid}|${this.objectChange.versionOf(identifier)()}`;
    const kept = this.made.get(identifier);
    if (kept?.key === key) return kept.target;
    const target = make();
    this.made.set(identifier, { key, target });
    return target;
  }

  /** A block the fog lies over entirely is not drawn, so nothing lands on it. */
  private hiddenByFog(terrain: Terrain): boolean {
    const cover = this.vision.terrainFogCover(terrain);
    return cover !== null && !cover.cleared.some((cell) => cell);
  }
}
