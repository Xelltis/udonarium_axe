import { computed, inject, Injectable, untracked } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { applyGroundDab, GroundDab } from '@axe/domain/tabletop/ground/ground-brush';
import { ensureGroundFieldOn, groundFieldOn } from '@axe/domain/tabletop/ground/ground-field';
import { FLAT_GROUND, GroundSurface, groundSurfaceOf } from '@axe/domain/tabletop/ground/ground-surface';

/**
 * The raised, sunk and painted ground of the table in view, which what stands on the floor stands
 * on. A piece keeps the height it is put at over the board, as a version that knows nothing of the
 * ground reads it; the ground is added where it is drawn and judged.
 */
@Injectable({ providedIn: 'root' })
export class GroundService {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tabletop = inject(TabletopService);

  /** The ground of the table in view; flat where it keeps none. Follows every change to its chunks. */
  readonly surface = computed<GroundSurface>(() => {
    const table = this.tabletop.currentTableVersion();
    this.objectChange.collectionOf('ground-field')();
    this.objectChange.collectionOf('ground-chunk')();
    const field = groundFieldOn(table);
    if (!field) return FLAT_GROUND;
    this.objectChange.versionOf(field.identifier)();
    for (const chunk of field.children) this.objectChange.versionOf(chunk.identifier)();
    return groundSurfaceOf(field.readChunks());
  });

  /** How high the ground stands at a point of the board, in table pixels. */
  heightPxAt(x: number, y: number): number {
    const gridSize = untracked(this.tabletop.currentTableVersion).gridSize;
    if (!(gridSize > 0)) return 0;
    return untracked(this.surface).heightAt(x / gridSize, y / gridSize) * gridSize;
  }

  /**
   * How far the ground under a box on the floor lifts what stands in it, in table pixels: the lowest
   * the ground stands anywhere in the box, so that a block stood on uneven ground sinks into the rise
   * rather than hanging over the dip. The box is read at its corners and every half cell along and
   * across it.
   */
  lowestPxIn(x: number, y: number, width: number, height: number): number {
    const gridSize = untracked(this.tabletop.currentTableVersion).gridSize;
    const surface = untracked(this.surface);
    if (!(gridSize > 0) || surface.isFlat) return 0;
    const along = (length: number): number[] => {
      const at: number[] = [];
      for (let d = 0; d < length; d += gridSize / 2) at.push(d);
      return [...at, length];
    };
    let lowest = Infinity;
    for (const across of along(width)) {
      for (const down of along(height)) {
        lowest = Math.min(lowest, surface.heightAt((x + across) / gridSize, (y + down) / gridSize));
      }
    }
    return lowest * gridSize;
  }

  /**
   * Lays a dab of the brush on the ground of the table in view, keeping the chunks it changes on the
   * table. The change syncs to every peer.
   */
  dab(dab: GroundDab): void {
    const table = this.tabletop.currentTable;
    if (!table.identifier) return;
    const field = ensureGroundFieldOn(table);
    for (const chunk of applyGroundDab(field.readChunks(), dab)) field.writeChunk(chunk);
  }
}
