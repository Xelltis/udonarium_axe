import { computed, inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TableAmbienceService } from '@axe/application/tabletop/table-ambience.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { type CellGrid, cellIndexAt, forEachCellInBox } from '@axe/domain/tabletop/fog/cell-grid';
import { canBeStoodOn, landingHeightsOn } from '@axe/domain/tabletop/move/landing-height';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { terrainBoxOf, terrainCovers } from '@axe/domain/tabletop/terrain-box';
import { terrainTopPxAt } from '@axe/domain/tabletop/terrain-slope-surface';
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
          dirt: area.dirt,
          leaves: area.leaves,
          flowSpeed: area.flow,
          flowDirection: area.flowHeading,
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
    return landingHeightsOn(grid, this.terrainsByWater());
  });

  /**
   * The blocks standing in or beside the water, which are all the ground the water and its banks
   * stand on. A board of a dungeon holds thousands of blocks, and the water asks about the ground
   * point by point; only the few near it are worth asking.
   */
  private readonly terrainsByWater = computed<Terrain[]>(() => {
    const areas = this.areas();
    if (areas.length < 1) return [];
    const gridSize = this.tabletopService.gridSize();
    this.objectChange.collectionOf(Terrain.aliasName)();
    return this.tabletopService.terrains.filter((terrain) => {
      this.objectChange.versionOf(terrain.identifier)();
      const box = terrainBoxOf(terrain, gridSize);
      return areas.some(
        (area) =>
          box.maxX >= area.left - gridSize &&
          box.minX <= area.left + area.width + gridSize &&
          box.maxY >= area.top - gridSize &&
          box.minY <= area.top + area.height + gridSize
      );
    });
  });

  /** The blocks standing on each cell by the water, counted by the middle of the cell as the ground is. */
  private readonly terrainsByCell = computed<Map<number, Terrain[]>>(() => {
    const grid = this.grid();
    const byCell = new Map<number, Terrain[]>();
    if (!grid || grid.sizePx <= 0) return byCell;
    for (const terrain of this.terrainsByWater()) {
      if (!canBeStoodOn(terrain)) continue;
      const box = terrainBoxOf(terrain, grid.sizePx);
      forEachCellInBox(grid, box.minX, box.minY, box.maxX, box.maxY, (index, cx, cy) => {
        if (!terrainCovers(terrain, grid.sizePx, cx, cy)) return;
        const held = byCell.get(index);
        if (held) held.push(terrain);
        else byCell.set(index, [terrain]);
      });
    }
    return byCell;
  });

  /**
   * How high the ground of one cell stands at a point of it, the floor where nothing stands there.
   *
   * It is the ground standing on that cell read at the point, which follows a slope across the cell
   * rather than holding to its middle; that is what lets the bank of the water follow it. A block is
   * asked about the cells it stands on alone, so a point near the corner of a hex never reads the
   * ground of the hex beside it.
   */
  readonly groundAt = (index: number, x: number, y: number): number => {
    const grid = this.grid();
    const standing = this.terrainsByCell().get(index);
    if (!grid || !standing) return 0;
    let highest = 0;
    for (const terrain of standing) highest = Math.max(highest, terrainTopPxAt(terrain, grid.sizePx, grid.type, x, y));
    return highest;
  };

  /** How high the ground stands in a cell, the floor where nothing stands there. */
  readonly groundOf = (index: number): number => {
    const ground = this.ground();
    return ground && index >= 0 && index < ground.length ? ground[index] : 0;
  };

  /**
   * The cells under water, by index.
   *
   * Ground nobody has walked to keeps its water hidden with everything else on it: a lake the
   * party has not reached is not drawn above the fog that hides its shore. Worked out again as the
   * fog or the ground changes, it is handed on only where the water has changed with them.
   */
  readonly cells = computed<ReadonlyMap<number, WaterCell>>(
    () => {
      const grid = this.grid();
      const areas = this.areas();
      if (!grid || areas.length < 1) return NO_CELLS;
      const cells = waterCellsOf(grid, areas, this.groundOf);
      for (const [index, cell] of cells) {
        if (this.vision.isHiddenByFog(cell.cx, cell.cy)) cells.delete(index);
      }
      return cells;
    },
    { equal: sameWaterCells }
  );

  /**
   * How lit each cell of water is at its surface, or null while the table has no darkness to read.
   *
   * The dark is painted on the floor, and a surface standing over it is not covered by it, so
   * the surface has to wear the light of its own cells. Each is read at its very middle, as the
   * dark on the floor is; read over the width of the cell, the brightest edge of it would answer
   * and the water would show where the floor beside it is black. Worked out again whenever what is
   * seen changes, it is handed on only where the light on the water has changed with it.
   */
  readonly light = computed<ReadonlyMap<number, number> | null>(
    () => {
      if (!this.vision.active()) return null;
      const grid = this.grid();
      const cells = this.cells();
      if (!grid || cells.size < 1) return null;
      const light = new Map<number, number>();
      for (const cell of cells.values()) {
        light.set(cell.index, this.vision.objectBrightness(cell.cx, cell.cy, 0, true, cell.surfacePx));
      }
      return light;
    },
    { equal: sameLight }
  );

  /** The water at a point of the table, or null where there is none. */
  waterAt(x: number, y: number): WaterCell | null {
    const cells = this.cells();
    if (cells.size < 1) return null;
    const grid = this.grid();
    if (!grid) return null;
    return cells.get(cellIndexAt(grid, x, y)) ?? null;
  }
}

/** Whether two readings of the water hold the same cells, each the same in every way. */
function sameWaterCells(a: ReadonlyMap<number, WaterCell>, b: ReadonlyMap<number, WaterCell>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [index, cell] of a) {
    const other = b.get(index);
    if (!other) return false;
    for (const key of Object.keys(cell) as (keyof WaterCell)[]) {
      if (cell[key] !== other[key]) return false;
    }
  }
  return true;
}

/** Whether two readings of the light on the water are the same, cell by cell. */
function sameLight(a: ReadonlyMap<number, number> | null, b: ReadonlyMap<number, number> | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.size !== b.size) return false;
  for (const [index, value] of a) {
    if (b.get(index) !== value) return false;
  }
  return true;
}
