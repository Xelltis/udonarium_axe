import { computed, inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TableAmbienceService } from '@axe/application/tabletop/table-ambience.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { type CellGrid, cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import { landingHeightsOn } from '@axe/domain/tabletop/move/landing-height';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { type WaterArea, type WaterCell, waterCellsOf } from '@axe/domain/tabletop/water/water-cells';

const NO_CELLS: ReadonlyMap<number, WaterCell> = new Map();

/**
 * The water on the table in view, as this seat sees it.
 *
 * Water is laid as areas like any other look on the ground, but it is drawn by the cell: a
 * pond laid as many areas side by side is one pond, and a piece wading into it asks what the
 * cell under its feet holds rather than which area it stands in.
 */
@Injectable({ providedIn: 'root' })
export class WaterService {
  private readonly ambiences = inject(TableAmbienceService);
  private readonly tabletopService = inject(TabletopService);
  private readonly vision = inject(VisionService);
  private readonly objectChange = inject(ObjectChangeService);

  /** The bodies of water this seat may see, in table pixels. */
  readonly areas = computed<WaterArea[]>(() => {
    const gridSize = this.tabletopService.gridSize();
    return this.ambiences
      .shown()
      .filter((area) => area.kind === 'water' && area.isVisibleOnTable)
      .map((area) => {
        const floorPx = area.posZ + area.altitude * gridSize;
        return {
          identifier: area.identifier,
          left: area.location.x,
          top: area.location.y,
          width: Math.max(1, area.width) * gridSize,
          height: Math.max(1, area.height) * gridSize,
          floorPx,
          surfacePx: floorPx + area.surface * gridSize,
          color: area.color,
          density: area.density,
          turbidity: area.murk,
        };
      });
  });

  /** The grid of the table in view, or null where there is none to lay water on. */
  readonly grid = computed<CellGrid | null>(() => this.vision.cellGrid());

  /**
   * How high the ground stands in every cell, read only while there is water to stand over it.
   *
   * The ground is the bottom of the water: a slope running down from a beach makes the water over
   * it shallow at the top and deep at the foot, and ground reaching the surface is the shore.
   */
  readonly ground = computed<Float64Array | null>(() => {
    const grid = this.grid();
    if (!grid || this.areas().length < 1) return null;
    this.objectChange.collectionOf(Terrain.aliasName)();
    const terrains = this.tabletopService.terrains;
    for (const terrain of terrains) this.objectChange.versionOf(terrain.identifier)();
    return landingHeightsOn(grid, terrains);
  });

  /** How high the ground stands in a cell, the floor where nothing stands there. */
  readonly groundOf = (index: number): number => {
    const ground = this.ground();
    return ground && index >= 0 && index < ground.length ? ground[index] : 0;
  };

  /**
   * The cells under water, by index.
   *
   * Ground nobody has walked to keeps its water hidden with everything else on it: a lake the
   * party has not reached is not drawn above the fog that hides its shore.
   */
  readonly cells = computed<ReadonlyMap<number, WaterCell>>(() => {
    const grid = this.grid();
    const areas = this.areas();
    if (!grid || areas.length < 1) return NO_CELLS;
    const cells = waterCellsOf(grid, areas, this.groundOf);
    for (const [index, cell] of cells) {
      if (this.vision.isHiddenByFog(cell.cx, cell.cy)) cells.delete(index);
    }
    return cells;
  });

  /**
   * How lit each cell of water is at its surface, or null while the table has no darkness to read.
   *
   * The dark is painted on the floor, and a surface standing over it is not covered by it, so
   * the surface has to wear the light of its own cells. Each is read at its very middle, as the
   * dark on the floor is; read over the width of the cell, the brightest edge of it would answer
   * and the water would show where the floor beside it is black.
   */
  readonly light = computed<ReadonlyMap<number, number> | null>(() => {
    if (!this.vision.active()) return null;
    const grid = this.grid();
    const cells = this.cells();
    if (!grid || cells.size < 1) return null;
    const light = new Map<number, number>();
    for (const cell of cells.values()) {
      light.set(cell.index, this.vision.objectBrightness(cell.cx, cell.cy, 0, true, cell.surfacePx));
    }
    return light;
  });

  /** The water at a point of the table, or null where there is none. */
  waterAt(x: number, y: number): WaterCell | null {
    const cells = this.cells();
    if (cells.size < 1) return null;
    const grid = this.grid();
    if (!grid) return null;
    return cells.get(cellIndexAt(grid, x, y)) ?? null;
  }
}
