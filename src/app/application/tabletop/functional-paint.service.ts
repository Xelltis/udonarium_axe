import { inject, Injectable } from '@angular/core';
import { GameObject } from '@axe/core/sync/game-object';
import { DataElement } from '@axe/domain/data/data-element';
import { parseCellKey } from '@axe/domain/tabletop/cell-key';
import { cellKeyOf, CellRect } from '@axe/domain/tabletop/cell-rectangles';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellColRow, CellGrid, cellGridOf, cellIndexAt, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import {
  blockKey,
  BlockPlacement,
  FunctionPaintPlan,
  MaskBlock,
  MaskPaintSpec,
  NO_FACE_IMAGES,
  TERRAIN_FACE_KEYS,
  TerrainBlock,
  TerrainPaintSpec,
  TriggerPaintSpec,
} from '@axe/domain/tabletop/function-paint';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { blockOrigin as gridBlockOrigin, cellCentre } from '@axe/domain/tabletop/map-grid';
import { ensureMoveBlockMapOn, moveBlockMapOn } from '@axe/domain/tabletop/move/move-block-map';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TableSnapshot } from '@axe/domain/tabletop/table-snapshot';
import { TableTrigger, triggersOn } from '@axe/domain/tabletop/table-trigger';
import { Terrain, TERRAIN_FACES } from '@axe/domain/tabletop/terrain';

function terrainsOn(table: GameTable): Terrain[] {
  return table.children.filter((child): child is Terrain => child instanceof Terrain);
}

function masksOn(table: GameTable): GameTableMask[] {
  return table.children.filter((child): child is GameTableMask => child instanceof GameTableMask);
}

/** Lays one block of terrain wearing everything the block carries. */
function layTerrainBlock(
  spec: TerrainPaintSpec,
  width: number,
  depth: number,
  placed: BlockPlacement | null,
  gridSize: number
): Terrain {
  const terrain = Terrain.create(
    spec.name,
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
  // The height a block was built at is its altitude; posZ is whatever it later came to rest
  // on, which gravity writes and would overwrite a height kept there.
  terrain.altitude = gridSize > 0 ? spec.altitude / gridSize : 0;
  terrain.isAltitudeIndicate = spec.showsAltitude;
  if (spec.imageIdentifier.length > 0) terrain.setFaceImage('imageIdentifier', spec.imageIdentifier);
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

/**
 * The exact placement a block is to wear, where this is the very cell it was read from.
 *
 * A placement belongs to one block standing on one cell, but it is carried on the spec, and a
 * spec is what tells one painted layer from another. Painting more cells into the layer an
 * imported wall made handed every one of them that wall's own position, so the new cells came
 * out stacked on top of it and nothing at all stood where the brush had been.
 */
function placementFor(
  spec: { placement: BlockPlacement | null },
  rect: CellRect,
  grid: CellGrid
): BlockPlacement | null {
  const placed = spec.placement;
  if (!placed) return null;
  const stood = blockFootprintOf(
    { location: { x: placed.x, y: placed.y }, rotate: placed.rotate },
    placed.width,
    placed.depth,
    grid
  );
  if (!stood) return null;
  return stood.rect.col === rect.col && stood.rect.row === rect.row ? placed : null;
}

/** Where a block goes: exactly where it was, or the corner of the cell the brush painted. */
function blockOrigin(placed: BlockPlacement | null, rect: CellRect, grid: CellGrid) {
  if (placed) return { name: 'table', x: placed.x, y: placed.y };
  const corner = gridBlockOrigin({ x: rect.col, y: rect.row, w: rect.width, h: rect.height }, grid);
  return { name: 'table', x: corner.x, y: corner.y };
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
  const held = common.getFirstElementByName('color');
  if (held) {
    held.value = color;
    held.currentValue = color;
    return;
  }
  common.appendChild(
    DataElement.create('color', color, { type: 'colors', currentValue: color }, `color_${mask.identifier}`)
  );
}

function setMaskOpacity(mask: GameTableMask, fraction: number): void {
  const element = mask.commonDataElement?.getFirstElementByName('opacity');
  if (!element) return;
  element.currentValue = Math.round(Math.min(1, Math.max(0, fraction)) * MASK_OPACITY_FULL);
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
export function terrainSpecOf(terrain: Terrain, placement: BlockPlacement | null, gridSize: number): TerrainPaintSpec {
  const images = { ...NO_FACE_IMAGES };
  for (const face of TERRAIN_FACE_KEYS) images[face] = terrain.faceImageIdentifier(face);
  return {
    name: terrain.name,
    imageIdentifier: terrain.faceImageIdentifier('imageIdentifier'),
    altitude: terrain.altitude * gridSize + terrain.posZ,
    showsAltitude: terrain.isAltitudeIndicate,
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
    name: mask.name,
    // What the mask is filled with, which is what a reader would call its colour.
    color: mask.bgcolor,
    opacity: mask.opacity,
    altitude: mask.posZ,
    locked: mask.isLock,
    showsLockMark: mask.dispLockMark,
    owner: mask.owner,
    scratchedGrids: mask.scratchedGrids,
    scratchingGrids: mask.scratchingGrids,
    preview: mask.isPreview,
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
  grid: CellGrid
): { rect: CellRect; placement: BlockPlacement | null } | null {
  const gridSize = grid.sizePx;
  if (gridSize <= 0) return null;
  const rotate = object.rotate ?? 0;
  if (isHexGrid(grid.type)) return hexFootprintOf(object, width, depth, grid, rotate);
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

/**
 * The cell a block stands on, on a board of hexes.
 *
 * A hex board has no corner to divide by: a block sits in the middle of its cell, and every
 * other column is dropped half a row. One that is not a single cell standing squarely in the
 * middle of one keeps its exact placement, as a turned or half-placed block does on squares.
 */
function hexFootprintOf(
  object: { location: { x: number; y: number } },
  width: number,
  depth: number,
  grid: CellGrid,
  rotate: number
): { rect: CellRect; placement: BlockPlacement | null } | null {
  const half = grid.sizePx / 2;
  const centreX = object.location.x + half;
  const centreY = object.location.y + half;
  const index = cellIndexAt(grid, centreX, centreY);
  if (index < 0) return null;
  const { col, row } = cellColRow(grid, index);
  const middle = cellCentre({ x: col, y: row }, grid);
  const square =
    rotate % 360 === 0 &&
    width === 1 &&
    depth === 1 &&
    Math.abs(middle.x - centreX) < 0.5 &&
    Math.abs(middle.y - centreY) < 0.5;
  return {
    rect: { col, row, width: 1, height: 1 },
    placement: square ? null : { x: object.location.x, y: object.location.y, width, depth, rotate },
  };
}

/** What one piece of trigger ground looks like to the editor, which is everything but its state. */
function triggerSpecOf(trigger: TableTrigger): TriggerPaintSpec {
  return {
    name: trigger.name,
    moment: trigger.firesOn,
    targets: trigger.catches,
    once: trigger.once,
    open: trigger.open,
    reveals: trigger.reveals,
    color: trigger.color,
    element: trigger.element,
    amount: trigger.amount,
    effect: trigger.effect,
  };
}

@Injectable({ providedIn: 'root' })
export class FunctionalPaintService {
  private readonly tableSelecter = inject(TableSelecter);

  /** Lays what was painted on the table, making and unmaking only the blocks the plan names. */
  apply(plan: FunctionPaintPlan): boolean {
    const table = this.tableSelecter.viewTable;
    if (!table) return false;
    if (table.gridSize <= 0 || table.width <= 0 || table.height <= 0) return false;
    const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);

    GameObject.batch(() => {
      this.closeCells(table, grid, plan.blocked);
      this.layTerrain(table, grid, plan);
      this.layMasks(table, grid, plan);
      this.layTriggers(table, plan);
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

  private layTerrain(table: GameTable, grid: CellGrid, plan: FunctionPaintPlan): void {
    this.takeAway(
      terrainsOn(table).map((held) => {
        const stood = blockFootprintOf(held, held.width, held.depth, grid);
        return {
          object: held,
          key: stood ? blockKey(stood.rect, terrainSpecOf(held, stood.placement, table.gridSize)) : null,
        };
      }),
      plan.terrain.remove
    );

    for (const block of plan.terrain.add) {
      const placed = placementFor(block.spec, block, grid);
      const terrain = layTerrainBlock(block.spec, block.width, block.height, placed, table.gridSize);
      terrain.location = blockOrigin(placed, block, grid);
      table.appendChild(terrain);
    }
  }

  private layMasks(table: GameTable, grid: CellGrid, plan: FunctionPaintPlan): void {
    this.takeAway(
      masksOn(table).map((held) => {
        const stood = blockFootprintOf(held, held.width, held.height, grid);
        return { object: held, key: stood ? blockKey(stood.rect, maskSpecOf(held, stood.placement)) : null };
      }),
      plan.mask.remove
    );

    for (const block of plan.mask.add) {
      const placed = placementFor(block.spec, block, grid);
      const mask = GameTableMask.create(
        block.spec.name,
        placed ? placed.width : block.width,
        placed ? placed.depth : block.height,
        MASK_OPACITY_FULL
      );
      paintMaskColor(mask, block.spec.color);
      setMaskOpacity(mask, block.spec.opacity);
      mask.isLock = block.spec.locked;
      mask.dispLockMark = block.spec.showsLockMark;
      mask.owner = block.spec.owner;
      mask.scratchedGrids = block.spec.scratchedGrids;
      mask.scratchingGrids = block.spec.scratchingGrids;
      mask.isPreview = block.spec.preview;
      mask.posZ = block.spec.altitude;
      mask.location = blockOrigin(placed, block, grid);
      table.appendChild(mask);
    }
  }

  /**
   * Takes away what the plan is clearing, by where it stands and by what it looks like.
   *
   * Where alone would take down the whole pile: a floor with a wall on it shares a
   * footprint with it, and only one of the two is being cleared.
   */
  private takeAway(
    held: readonly { object: { destroy(): void }; key: string | null }[],
    going: readonly (CellRect & { spec: unknown })[]
  ): void {
    const keys = new Set(going.map((block) => blockKey(block, block.spec)));
    for (const entry of held) {
      if (entry.key && keys.has(entry.key)) entry.object.destroy();
    }
  }

  /**
   * Lays the ground that goes off under a piece, which is the table's rather than the drawing's.
   *
   * A trigger already sprung stays sprung when it is painted over with the same look: the
   * blocks are told apart by where they are and what they do, and being spent is neither.
   */
  private layTriggers(table: GameTable, plan: FunctionPaintPlan): void {
    this.takeAway(
      triggersOn(table).map((held) => ({ object: held, key: blockKey(held.rect, triggerSpecOf(held)) })),
      plan.trigger.remove
    );

    for (const block of plan.trigger.add) {
      const trigger = new TableTrigger();
      trigger.col = block.col;
      trigger.row = block.row;
      trigger.width = block.width;
      trigger.height = block.height;
      trigger.name = block.spec.name;
      trigger.moment = block.spec.moment;
      trigger.targets = block.spec.targets;
      trigger.once = block.spec.once;
      trigger.open = block.spec.open;
      trigger.reveals = block.spec.reveals;
      trigger.color = block.spec.color;
      trigger.element = block.spec.element;
      trigger.amount = block.spec.amount;
      trigger.effect = block.spec.effect;
      trigger.initialize();
      table.appendChild(trigger);
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
          const stood = blockFootprintOf(held, held.width, held.depth, grid);
          return stood ? { ...stood.rect, spec: terrainSpecOf(held, stood.placement, table.gridSize) } : null;
        })
        .filter((block): block is TerrainBlock => block !== null),
      maskBlocks: masksOn(table)
        .map((held) => {
          const stood = blockFootprintOf(held, held.width, held.height, grid);
          return stood ? { ...stood.rect, spec: maskSpecOf(held, stood.placement) } : null;
        })
        .filter((block): block is MaskBlock => block !== null),
      triggerBlocks: triggersOn(table).map((held) => ({ ...held.rect, spec: triggerSpecOf(held) })),
    };
  }
}
