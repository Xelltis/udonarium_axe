import { inject, Injectable } from '@angular/core';
import { GameObject } from '@axe/core/sync/game-object';
import { DataElement } from '@axe/domain/data/data-element';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellColRow, CellGrid, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { FunctionPaintPlan, TerrainPaintSpec } from '@axe/domain/tabletop/function-paint';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { ensureMoveBlockMapOn, moveBlockMapOn } from '@axe/domain/tabletop/move/move-block-map';
import { encodePaintedCell, parsePaintedCell } from '@axe/domain/tabletop/painted-cell';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TableSnapshot } from '@axe/domain/tabletop/table-snapshot';
import { Terrain, TERRAIN_FACES } from '@axe/domain/tabletop/terrain';

function cellKeyOf(col: number, row: number): string {
  return `${col},${row}`;
}

/** Lays one block of terrain wearing everything the brush was set to. */
function layTerrainBlock(spec: TerrainPaintSpec, width: number, depth: number): Terrain {
  const terrain = Terrain.create('', width, depth, Math.max(0, spec.height), spec.images.wall, spec.images.floor);
  terrain.mode = spec.mode;
  terrain.blocksSight = spec.blocksSight;
  terrain.blocksLight = spec.blocksLight;
  terrain.isTiledTexture = spec.tiledTexture;
  terrain.isGrid = spec.showsGrid;
  terrain.isDropShadow = spec.dropShadow;
  terrain.isSurfaceShading = spec.surfaceShading;
  for (const face of TERRAIN_FACES) {
    const held = spec.images[face];
    if (held.length > 0) terrain.setFaceImage(face, held);
  }
  return terrain;
}

/** A mask counts its opacity out of this, so the fraction it shows is the current value over it. */
const MASK_OPACITY_FULL = 100;

/**
 * A mask carries no colour until one is written down for it, and the setter will not write
 * what is not already there, so the element has to be laid alongside it.
 */
function paintMaskColor(mask: GameTableMask, color: string): void {
  const common = mask.commonDataElement;
  if (!common) return;
  common.appendChild(DataElement.create('color', color, { currentValue: '#0a0a0a' }, `color_${mask.identifier}`));
}

function setMaskOpacity(mask: GameTableMask, fraction: number): void {
  const element = mask.commonDataElement?.getFirstElementByName('opacity');
  if (!element) return;
  element.currentValue = Math.round(Math.min(1, Math.max(0, fraction)) * MASK_OPACITY_FULL);
}

function parseCellKey(key: string): { col: number; row: number } | null {
  const cell = parsePaintedCell(key);
  return cell;
}

/** The cells a table is closed on, in the editor's own way of naming them. */
export function blockedCellKeysOn(table: GameTable, grid: CellGrid): string[] {
  const map = moveBlockMapOn(table);
  if (!map) return [];
  const bits = map.read(grid);
  const keys: string[] = [];
  for (let index = 0; index < grid.cols * grid.rows; index++) {
    if (!bits.get(index)) continue;
    const { col, row } = cellColRow(grid, index);
    keys.push(cellKeyOf(col, row));
  }
  return keys;
}

/** The cells the editor painted an object onto. Anything placed by hand answers with nothing. */
export function paintedCellKeysOf(objects: readonly { paintCell: string }[]): string[] {
  const keys: string[] = [];
  for (const object of objects) {
    const cell = parsePaintedCell(object.paintCell);
    if (cell) keys.push(cellKeyOf(cell.col, cell.row));
  }
  return keys;
}

@Injectable({ providedIn: 'root' })
export class FunctionalPaintService {
  private readonly tableSelecter = inject(TableSelecter);

  /**
   * Lays what was painted on the table.
   *
   * Only the objects the editor painted are made and unmade. Anything a person placed by
   * hand is passed over without being read, moved or counted, whatever the plan says.
   */
  apply(plan: FunctionPaintPlan): boolean {
    const table = this.tableSelecter.viewTable;
    if (!table) return false;
    if (table.gridSize <= 0 || table.width <= 0 || table.height <= 0) return false;
    const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);

    GameObject.batch(() => {
      this.closeCells(table, grid, plan.blocked);
      this.layTerrain(table, plan);
      this.layMasks(table, plan);
    });
    return true;
  }

  private closeCells(table: GameTable, grid: CellGrid, blocked: readonly string[]): void {
    const bits = new CellBits(grid.cols * grid.rows);
    for (const key of blocked) {
      const cell = parseCellKey(key);
      if (!cell) continue;
      const index = cellIndexOf(grid, cell.col, cell.row);
      if (index >= 0) bits.set(index);
    }
    if (bits.isEmpty && !moveBlockMapOn(table)) return;
    ensureMoveBlockMapOn(table).write(grid, bits);
  }

  private layTerrain(table: GameTable, plan: FunctionPaintPlan): void {
    const painted = table.children.filter((child): child is Terrain => child instanceof Terrain);
    this.takeAway(painted, plan.terrain.remove);

    for (const key of plan.terrain.add) {
      const cell = parseCellKey(key);
      if (!cell) continue;
      const terrain = layTerrainBlock(plan.terrainSpec, 1, 1);
      terrain.paintCell = encodePaintedCell(cell);
      terrain.location = { name: 'table', x: cell.col * table.gridSize, y: cell.row * table.gridSize };
      table.appendChild(terrain);
    }
  }

  private layMasks(table: GameTable, plan: FunctionPaintPlan): void {
    const painted = table.children.filter((child): child is GameTableMask => child instanceof GameTableMask);
    this.takeAway(painted, plan.mask.remove);

    for (const key of plan.mask.add) {
      const cell = parseCellKey(key);
      if (!cell) continue;
      const mask = GameTableMask.create('', 1, 1, MASK_OPACITY_FULL);
      paintMaskColor(mask, plan.maskSpec.color);
      setMaskOpacity(mask, plan.maskSpec.opacity);
      mask.paintCell = encodePaintedCell(cell);
      mask.location = { name: 'table', x: cell.col * table.gridSize, y: cell.row * table.gridSize };
      table.appendChild(mask);
    }
  }

  /** Takes away only what the editor painted onto the cells it is done with. */
  private takeAway(objects: readonly { paintCell: string; destroy(): void }[], cells: readonly string[]): void {
    const going = new Set(cells);
    for (const object of objects) {
      const cell = parsePaintedCell(object.paintCell);
      if (!cell) continue;
      if (going.has(cellKeyOf(cell.col, cell.row))) object.destroy();
    }
  }

  /** The table the editor would be reading, or nothing where none is out. */
  snapshot(): TableSnapshot | null {
    const table = this.tableSelecter.viewTable;
    if (!table) return null;
    if (table.gridSize <= 0 || table.width <= 0 || table.height <= 0) return null;

    const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    return {
      cols: grid.cols,
      rows: grid.rows,
      cellPx: table.gridSize,
      gridType: table.gridType,
      floorImageIdentifier: table.imageIdentifier,
      blockedCells: blockedCellKeysOn(table, grid),
      terrainCells: paintedCellKeysOf(table.children.filter((child): child is Terrain => child instanceof Terrain)),
      maskCells: paintedCellKeysOf(
        table.children.filter((child): child is GameTableMask => child instanceof GameTableMask)
      ),
    };
  }
}
