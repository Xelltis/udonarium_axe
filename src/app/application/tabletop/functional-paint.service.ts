import { inject, Injectable } from '@angular/core';
import { GameObject } from '@axe/core/sync/game-object';
import { DataElement } from '@axe/domain/data/data-element';
import { CellRect, rectKey } from '@axe/domain/tabletop/cell-rectangles';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellColRow, CellGrid, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import {
  FunctionPaintPlan,
  MaskBlock,
  MaskPaintSpec,
  NO_FACE_IMAGES,
  TERRAIN_FACE_KEYS,
  TerrainBlock,
  TerrainPaintSpec,
} from '@axe/domain/tabletop/function-paint';
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

function terrainsOn(table: GameTable): Terrain[] {
  return table.children.filter((child): child is Terrain => child instanceof Terrain);
}

/**
 * Whether the brush could have painted this wall, and so may unpaint it.
 *
 * A door or a ramp is more than a block and no painting puts one back, so both are left
 * where hands put them however the cells around them are painted over.
 */
function isPaintableTerrain(terrain: Terrain): boolean {
  return !terrain.isDoor && !terrain.isSlope;
}

function masksOn(table: GameTable): GameTableMask[] {
  return table.children.filter((child): child is GameTableMask => child instanceof GameTableMask);
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

/** The look one terrain wears, read off the terrain itself. */
export function terrainSpecOf(terrain: Terrain): TerrainPaintSpec {
  const images = { ...NO_FACE_IMAGES };
  for (const face of TERRAIN_FACE_KEYS) images[face] = terrain.faceImageIdentifier(face);
  return {
    height: terrain.height,
    mode: terrain.mode,
    blocksSight: terrain.blocksSight,
    blocksLight: terrain.blocksLight,
    tiledTexture: terrain.isTiledTexture,
    showsGrid: terrain.isGrid,
    dropShadow: terrain.isDropShadow,
    surfaceShading: terrain.isSurfaceShading,
    images,
  };
}

export function maskSpecOf(mask: GameTableMask): MaskPaintSpec {
  return { color: mask.color, opacity: mask.opacity };
}

/**
 * Where a block stands, or nothing where it stands somewhere the editor cannot paint.
 *
 * A block has to sit square on the grid to be painted: anything turned, or standing between
 * cells, is a thing hands made and hands must keep.
 */
export function blockRectOf(
  object: { location: { x: number; y: number }; rotate?: number },
  width: number,
  depth: number,
  gridSize: number
): CellRect | null {
  if (gridSize <= 0) return null;
  if ((object.rotate ?? 0) % 360 !== 0) return null;
  const col = object.location.x / gridSize;
  const row = object.location.y / gridSize;
  if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0) return null;
  if (!Number.isInteger(width) || !Number.isInteger(depth) || width < 1 || depth < 1) return null;
  return { col, row, width, height: depth };
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
    this.takeAway(
      terrainsOn(table).map((held) => ({
        object: held,
        rect: isPaintableTerrain(held) ? blockRectOf(held, held.width, held.depth, table.gridSize) : null,
      })),
      plan.terrain.remove
    );

    for (const block of plan.terrain.add) {
      const terrain = layTerrainBlock(block.spec, block.width, block.height);
      terrain.paintCell = encodePaintedCell(block);
      terrain.location = { name: 'table', x: block.col * table.gridSize, y: block.row * table.gridSize };
      table.appendChild(terrain);
    }
  }

  private layMasks(table: GameTable, plan: FunctionPaintPlan): void {
    this.takeAway(
      masksOn(table).map((held) => ({
        object: held,
        rect: blockRectOf(held, held.width, held.height, table.gridSize),
      })),
      plan.mask.remove
    );

    for (const block of plan.mask.add) {
      const mask = GameTableMask.create('', block.width, block.height, MASK_OPACITY_FULL);
      paintMaskColor(mask, block.spec.color);
      setMaskOpacity(mask, block.spec.opacity);
      mask.paintCell = encodePaintedCell(block);
      mask.location = { name: 'table', x: block.col * table.gridSize, y: block.row * table.gridSize };
      table.appendChild(mask);
    }
  }

  /** Takes away the blocks that are going, wherever the editor is the one holding them. */
  private takeAway(
    held: readonly { object: { destroy(): void }; rect: CellRect | null }[],
    going: readonly CellRect[]
  ): void {
    const keys = new Set(going.map(rectKey));
    for (const entry of held) {
      if (entry.rect && keys.has(rectKey(entry.rect))) entry.object.destroy();
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
      terrainBlocks: terrainsOn(table)
        .map((held) => {
          // A door or a ramp is more than a block, and the brush has no way of painting one
          // back. They stay where hands put them, out of the editor's sight and its reach.
          if (!isPaintableTerrain(held)) return null;
          const rect = blockRectOf(held, held.width, held.depth, table.gridSize);
          return rect ? { ...rect, spec: terrainSpecOf(held) } : null;
        })
        .filter((block): block is TerrainBlock => block !== null),
      maskBlocks: masksOn(table)
        .map((held) => {
          const rect = blockRectOf(held, held.width, held.height, table.gridSize);
          return rect ? { ...rect, spec: maskSpecOf(held) } : null;
        })
        .filter((block): block is MaskBlock => block !== null),
    };
  }
}
