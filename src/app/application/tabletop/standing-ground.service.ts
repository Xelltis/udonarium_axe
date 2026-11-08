import { computed, inject, Injectable, untracked } from '@angular/core';
import { GroundService } from '@axe/application/tabletop/ground.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { WaterService } from '@axe/application/tabletop/water.service';
import { groundOverIce } from '@axe/domain/tabletop/ground/ground-over-ice';
import type { GroundSurface } from '@axe/domain/tabletop/ground/ground-surface';

/**
 * The ground of the table in view as what stands on the floor stands on it: the raised and sunk
 * ground, lifted to the ice wherever water is frozen over it (`groundOverIce`). Pieces and blocks on
 * the floor stand on it, where they may move is worked out and drawn over it, and the eye looking out
 * of a piece stands on it; the ground itself is still what is drawn, and what the water lies on.
 */
@Injectable({ providedIn: 'root' })
export class StandingGroundService {
  private readonly ground = inject(GroundService);
  private readonly water = inject(WaterService);
  private readonly tabletop = inject(TabletopService);

  /** The ground stood on; the very ground of `GroundService` where no water is frozen. */
  readonly surface = computed<GroundSurface>(() =>
    groundOverIce(this.ground.surface(), this.water.frozen(), this.water.grid())
  );

  /** How high what stands on the floor stands at a point of the board, in table pixels. */
  heightPxAt(x: number, y: number): number {
    const gridSize = untracked(this.tabletop.currentTableVersion).gridSize;
    if (!(gridSize > 0)) return 0;
    return untracked(this.surface).heightAt(x / gridSize, y / gridSize) * gridSize;
  }
}
