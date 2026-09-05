import { inject, Injectable } from '@angular/core';
import { GameObject } from '@axe/core/sync/game-object';
import { DataElement } from '@axe/domain/data/data-element';
import { CellRect, rectKey } from '@axe/domain/tabletop/cell-rectangles';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellColRow, CellGrid, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import {
  BlockPlacement,
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

function masksOn(table: GameTable): GameTableMask[] {
  return table.children.filter((child): child is GameTableMask => child instanceof GameTableMask);
}

/** Lays one block of terrain wearing everything the block carries. */
function layTerrainBlock(spec: TerrainPaintSpec, width: number, depth: number): Terrain {
  const placed = spec.placement;
  const terrain = Terrain.create(
    '',
    placed ? placed.width : width,
    placed ? placed.depth : depth,
    Math.max(0, spec.height),
    spec.images.wall,
    spec.images.floor
  );
  terrain.mode = spec.mode;
  terrain.blocksSight = spec.blocksSight;
  terrain.blocksLight = spec.blocksLight;
  terrain.isTiledTexture = spec.tiledTexture;
  terrain.isGrid = spec.showsGrid;
  terrain.isDropShadow = spec.dropShadow;
  terrain.isSurfaceShading = spec.surfaceShading;
  terrain.isLocked = spec.locked;
  terrain.doorStyle = spec.doorStyle;
  terrain.isDoorOpen = spec.doorOpen;
  terrain.doorMirrored = spec.doorMirrored;
  terrain.isSlope = spec.slope;
  terrain.slopeDirection = spec.slopeDirection;
  terrain.rotate = placed ? placed.rotate : 0;
  terrain.lightEnabled = spec.light.enabled;
  terrain.lightPreset = spec.light.preset;
  terrain.lightBrightRadius = spec.light.brightRadius;
  terrain.lightDimRadius = spec.light.dimRadius;
  terrain.lightColor = spec.light.color;
  terrain.lightAngle = spec.light.angle;
  terrain.lightDirection = spec.light.direction;
  terrain.lightPitch = spec.light.pitch;
  terrain.lightAnimation = spec.light.animation;
  for (const face of TERRAIN_FACES) {
    const held = spec.images[face];
    if (held.length > 0) terrain.setFaceImage(face, held);
  }
  return terrain;
}

/** Where a block goes: exactly where it was, or the corner of the cell the brush painted. */
function blockOrigin(spec: { placement: BlockPlacement | null }, rect: CellRect, gridSize: number) {
  const placed = spec.placement;
  return placed
    ? { name: 'table', x: placed.x, y: placed.y }
    : { name: 'table', x: rect.col * gridSize, y: rect.row * gridSize };
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

/**
 * Everything one terrain is, read off the terrain itself.
 *
 * All of it, so that laying the block back down returns what was there rather than an
 * upright rectangle wearing its colours.
 */
export function terrainSpecOf(terrain: Terrain, placement: BlockPlacement | null): TerrainPaintSpec {
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
    locked: terrain.isLocked,
    doorStyle: terrain.doorStyle,
    doorOpen: terrain.isDoorOpen,
    doorMirrored: terrain.doorMirrored,
    slope: terrain.isSlope,
    slopeDirection: terrain.slopeDirection,
    light: {
      enabled: terrain.lightEnabled,
      preset: terrain.lightPreset,
      brightRadius: terrain.lightBrightRadius,
      dimRadius: terrain.lightDimRadius,
      color: terrain.lightColor,
      angle: terrain.lightAngle,
      direction: terrain.lightDirection,
      pitch: terrain.lightPitch,
      animation: terrain.lightAnimation,
    },
    images,
    placement,
  };
}

export function maskSpecOf(mask: GameTableMask, placement: BlockPlacement | null): MaskPaintSpec {
  return {
    color: mask.color,
    opacity: mask.opacity,
    locked: mask.isLock,
    owner: mask.owner,
    scratchedGrids: mask.scratchedGrids,
    placement,
  };
}

/**
 * The cells a block stands over, and whether it stands over them squarely.
 *
 * Everything on the table is read in. One that sits square on the grid needs nothing said
 * about it beyond its cells; one that was turned, or that stands between them, or that is
 * two and a half cells wide, keeps its exact placement alongside so that laying it back
 * down returns it as it was.
 */
export function blockFootprintOf(
  object: { location: { x: number; y: number }; rotate?: number },
  width: number,
  depth: number,
  gridSize: number
): { rect: CellRect; placement: BlockPlacement | null } | null {
  if (gridSize <= 0) return null;
  const rotate = object.rotate ?? 0;
  const exactCol = object.location.x / gridSize;
  const exactRow = object.location.y / gridSize;
  if (!Number.isFinite(exactCol) || !Number.isFinite(exactRow)) return null;

  const col = Math.max(0, Math.floor(exactCol));
  const row = Math.max(0, Math.floor(exactRow));
  const cellWidth = Math.max(1, Math.ceil(width));
  const cellDepth = Math.max(1, Math.ceil(depth));

  const square =
    rotate % 360 === 0 &&
    Number.isInteger(exactCol) &&
    Number.isInteger(exactRow) &&
    exactCol >= 0 &&
    exactRow >= 0 &&
    Number.isInteger(width) &&
    Number.isInteger(depth);

  return {
    rect: { col, row, width: cellWidth, height: cellDepth },
    placement: square ? null : { x: object.location.x, y: object.location.y, width, depth, rotate },
  };
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
        rect: blockFootprintOf(held, held.width, held.depth, table.gridSize)?.rect ?? null,
      })),
      plan.terrain.remove
    );

    for (const block of plan.terrain.add) {
      const terrain = layTerrainBlock(block.spec, block.width, block.height);
      terrain.paintCell = encodePaintedCell(block);
      terrain.location = blockOrigin(block.spec, block, table.gridSize);
      table.appendChild(terrain);
    }
  }

  private layMasks(table: GameTable, plan: FunctionPaintPlan): void {
    this.takeAway(
      masksOn(table).map((held) => ({
        object: held,
        rect: blockFootprintOf(held, held.width, held.height, table.gridSize)?.rect ?? null,
      })),
      plan.mask.remove
    );

    for (const block of plan.mask.add) {
      const placed = block.spec.placement;
      const mask = GameTableMask.create(
        '',
        placed ? placed.width : block.width,
        placed ? placed.depth : block.height,
        MASK_OPACITY_FULL
      );
      paintMaskColor(mask, block.spec.color);
      setMaskOpacity(mask, block.spec.opacity);
      mask.isLock = block.spec.locked;
      mask.owner = block.spec.owner;
      mask.scratchedGrids = block.spec.scratchedGrids;
      mask.paintCell = encodePaintedCell(block);
      mask.location = blockOrigin(block.spec, block, table.gridSize);
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
          const stood = blockFootprintOf(held, held.width, held.depth, table.gridSize);
          return stood ? { ...stood.rect, spec: terrainSpecOf(held, stood.placement) } : null;
        })
        .filter((block): block is TerrainBlock => block !== null),
      maskBlocks: masksOn(table)
        .map((held) => {
          const stood = blockFootprintOf(held, held.width, held.height, table.gridSize);
          return stood ? { ...stood.rect, spec: maskSpecOf(held, stood.placement) } : null;
        })
        .filter((block): block is MaskBlock => block !== null),
    };
  }
}
