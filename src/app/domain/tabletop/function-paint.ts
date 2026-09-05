import { CellRect, rectCells } from '@axe/domain/tabletop/cell-rectangles';

/**
 * What a painted cell does, and what it lays on the table.
 *
 * The map editor paints these, but what they mean belongs to the table rather than to the
 * editor: a cell closed to walking is closed however it came to be.
 */

export const MAP_FUNCTION_ROLES = ['moveBlock', 'terrain', 'mask'] as const;

export type MapFunctionRole = (typeof MAP_FUNCTION_ROLES)[number];

export const DEFAULT_FUNCTION_ROLE: MapFunctionRole = 'moveBlock';

export function asFunctionRole(value: unknown): MapFunctionRole {
  return typeof value === 'string' && (MAP_FUNCTION_ROLES as readonly string[]).includes(value)
    ? (value as MapFunctionRole)
    : DEFAULT_FUNCTION_ROLE;
}

/** The pictures a painted wall wears. Empty is glass: the wall stands but is not seen. */
export interface TerrainFaceImages {
  /** What every upright face wears unless it says otherwise. */
  wall: string;
  /** What the top and the underside wear unless they say otherwise. */
  floor: string;
  top: string;
  bottom: string;
  north: string;
  south: string;
  east: string;
  west: string;
}

/**
 * Where a block really sits, when that is not simply the corner of its cell.
 *
 * A wall that was turned, or that stands between cells, or that is two and a half cells
 * wide, cannot be said in cells alone. It is said here instead, so that reading it in and
 * laying it back down returns exactly what was there.
 */
export interface BlockPlacement {
  x: number;
  y: number;
  width: number;
  depth: number;
  rotate: number;
}

/** Everything a painted wall is, which is everything a terrain of one block can be. */
export interface TerrainPaintSpec {
  name: string;
  /** The picture the piece itself is known by, which is not one of its faces. */
  imageIdentifier: string;
  altitude: number;
  showsAltitude: boolean;
  /** How tall it stands, in cells. Nought is a floor with no wall over it. */
  height: number;
  /** Whether it is a floor, a wall, or both. One of TerrainViewState. */
  mode: number;
  blocksSight: boolean;
  blocksLight: boolean;
  /** Whether the picture repeats across the block rather than being stretched over it. */
  tiledTexture: boolean;
  showsGrid: boolean;
  dropShadow: boolean;
  surfaceShading: boolean;
  locked: boolean;
  doorStyle: string;
  doorOpen: boolean;
  doorMirrored: boolean;
  slope: boolean;
  slopeDirection: number;
  light: TerrainLightSpec;
  images: TerrainFaceImages;
  /** Null where the block sits square on its cells, which is where the brush put it. */
  placement: BlockPlacement | null;
}

export interface TerrainLightSpec {
  enabled: boolean;
  preset: string;
  brightRadius: number;
  dimRadius: number;
  color: string;
  angle: number;
  direction: number;
  pitch: number;
  animation: string;
}

export interface MaskPaintSpec {
  name: string;
  color: string;
  opacity: number;
  altitude: number;
  locked: boolean;
  showsLockMark: boolean;
  owner: string;
  /** How far it has been scratched away, and how far a scratch in hand has got. */
  scratchedGrids: string;
  scratchingGrids: string;
  preview: boolean;
  placement: BlockPlacement | null;
}

/** What a role lays on the table, the same for every cell the layer holds. */
export interface FunctionSpec {
  terrain: TerrainPaintSpec;
  mask: MaskPaintSpec;
}

export const NO_FACE_IMAGES: TerrainFaceImages = {
  wall: '',
  floor: '',
  top: '',
  bottom: '',
  north: '',
  south: '',
  east: '',
  west: '',
};

export const TERRAIN_FACE_KEYS: readonly (keyof TerrainFaceImages)[] = [
  'wall',
  'floor',
  'top',
  'bottom',
  'north',
  'south',
  'east',
  'west',
];

export const DEFAULT_FUNCTION_SPEC: FunctionSpec = {
  terrain: {
    name: '',
    imageIdentifier: '',
    altitude: 0,
    showsAltitude: false,
    height: 1,
    mode: 3,
    blocksSight: true,
    blocksLight: true,
    tiledTexture: false,
    showsGrid: false,
    dropShadow: true,
    surfaceShading: true,
    locked: false,
    doorStyle: 'none',
    doorOpen: false,
    doorMirrored: false,
    slope: false,
    slopeDirection: 0,
    light: {
      enabled: false,
      preset: 'custom',
      brightRadius: 0,
      dimRadius: 0,
      color: '#ffd9a0',
      angle: 360,
      direction: 0,
      pitch: 0,
      animation: 'none',
    },
    images: { ...NO_FACE_IMAGES },
    placement: null,
  },
  mask: {
    name: '',
    color: '#555555',
    opacity: 0.6,
    altitude: 0,
    locked: false,
    showsLockMark: true,
    owner: '',
    scratchedGrids: '',
    scratchingGrids: '',
    preview: false,
    placement: null,
  },
};

function sanitizePlacement(value: unknown): BlockPlacement | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const held = value as Record<string, unknown>;
  const number = (key: string): number => {
    const amount = Number(held[key]);
    return Number.isFinite(amount) ? amount : 0;
  };
  return {
    x: number('x'),
    y: number('y'),
    width: Math.max(0, number('width')),
    depth: Math.max(0, number('depth')),
    rotate: number('rotate'),
  };
}

function countIn(held: Record<string, unknown>, key: string, fallback: number, least: number, most: number): number {
  const amount = Number(held[key]);
  if (!Number.isFinite(amount)) return fallback;
  return Math.min(most, Math.max(least, amount));
}

function flagIn(held: Record<string, unknown>, key: string, fallback: boolean): boolean {
  return typeof held[key] === 'boolean' ? (held[key] as boolean) : fallback;
}

function textIn(held: Record<string, unknown>, key: string, fallback: string): string {
  return typeof held[key] === 'string' ? (held[key] as string) : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function sanitizeFaceImages(value: unknown): TerrainFaceImages {
  const held = asRecord(value);
  const images = { ...NO_FACE_IMAGES };
  for (const face of TERRAIN_FACE_KEYS) images[face] = textIn(held, face, '');
  return images;
}

function sanitizeLight(value: unknown): TerrainLightSpec {
  const held = asRecord(value);
  const fallback = DEFAULT_FUNCTION_SPEC.terrain.light;
  const number = (key: string, miss: number): number => {
    const amount = Number(held[key]);
    return Number.isFinite(amount) ? amount : miss;
  };
  return {
    enabled: flagIn(held, 'enabled', fallback.enabled),
    preset: textIn(held, 'preset', fallback.preset),
    brightRadius: number('brightRadius', fallback.brightRadius),
    dimRadius: number('dimRadius', fallback.dimRadius),
    color: textIn(held, 'color', fallback.color),
    angle: number('angle', fallback.angle),
    direction: number('direction', fallback.direction),
    pitch: number('pitch', fallback.pitch),
    animation: textIn(held, 'animation', fallback.animation),
  };
}

export function sanitizeFunctionSpec(value: unknown): FunctionSpec {
  const held = asRecord(value);
  const terrain = asRecord(held['terrain']);
  const mask = asRecord(held['mask']);
  const fallback = DEFAULT_FUNCTION_SPEC;

  return {
    terrain: {
      name: textIn(terrain, 'name', fallback.terrain.name),
      imageIdentifier: textIn(terrain, 'imageIdentifier', fallback.terrain.imageIdentifier),
      altitude: countIn(terrain, 'altitude', fallback.terrain.altitude, -999, 999),
      showsAltitude: flagIn(terrain, 'showsAltitude', fallback.terrain.showsAltitude),
      height: countIn(terrain, 'height', fallback.terrain.height, 0, 99),
      mode: countIn(terrain, 'mode', fallback.terrain.mode, 0, 3),
      blocksSight: flagIn(terrain, 'blocksSight', fallback.terrain.blocksSight),
      blocksLight: flagIn(terrain, 'blocksLight', fallback.terrain.blocksLight),
      tiledTexture: flagIn(terrain, 'tiledTexture', fallback.terrain.tiledTexture),
      showsGrid: flagIn(terrain, 'showsGrid', fallback.terrain.showsGrid),
      dropShadow: flagIn(terrain, 'dropShadow', fallback.terrain.dropShadow),
      surfaceShading: flagIn(terrain, 'surfaceShading', fallback.terrain.surfaceShading),
      locked: flagIn(terrain, 'locked', fallback.terrain.locked),
      doorStyle: textIn(terrain, 'doorStyle', fallback.terrain.doorStyle),
      doorOpen: flagIn(terrain, 'doorOpen', fallback.terrain.doorOpen),
      doorMirrored: flagIn(terrain, 'doorMirrored', fallback.terrain.doorMirrored),
      slope: flagIn(terrain, 'slope', fallback.terrain.slope),
      slopeDirection: countIn(terrain, 'slopeDirection', fallback.terrain.slopeDirection, 0, 4),
      light: sanitizeLight(terrain['light']),
      images: sanitizeFaceImages(terrain['images']),
      placement: sanitizePlacement(terrain['placement']),
    },
    mask: {
      name: textIn(mask, 'name', fallback.mask.name),
      color: textIn(mask, 'color', fallback.mask.color),
      opacity: countIn(mask, 'opacity', fallback.mask.opacity, 0, 1),
      altitude: countIn(mask, 'altitude', fallback.mask.altitude, -999, 999),
      locked: flagIn(mask, 'locked', fallback.mask.locked),
      showsLockMark: flagIn(mask, 'showsLockMark', fallback.mask.showsLockMark),
      owner: textIn(mask, 'owner', fallback.mask.owner),
      scratchedGrids: textIn(mask, 'scratchedGrids', fallback.mask.scratchedGrids),
      scratchingGrids: textIn(mask, 'scratchingGrids', fallback.mask.scratchingGrids),
      preview: flagIn(mask, 'preview', fallback.mask.preview),
      placement: sanitizePlacement(mask['placement']),
    },
  };
}

/** Whether a painted wall wears any picture at all. Wearing none makes it glass. */
export function wearsAnyImage(images: TerrainFaceImages): boolean {
  return TERRAIN_FACE_KEYS.some((face) => images[face].length > 0);
}

/** A block of wall, and the look it wears. Every block carries its own. */
export interface TerrainBlock extends CellRect {
  spec: TerrainPaintSpec;
}

export interface MaskBlock extends CellRect {
  spec: MaskPaintSpec;
}

/**
 * How high each block stands, counted in the cells of the blocks beneath it.
 *
 * Blocks are walked from the ground up, so a wall laid over a wall is told that it starts
 * where the one below leaves off. A block spanning cells of unequal standing takes the
 * highest of them, since a wall cannot begin at two heights at once.
 */
type StandingBlock = CellRect & { spec: { altitude: number; height: number } };

export function terrainStackLevels(blocks: readonly StandingBlock[]): number[] {
  const order = blocks
    .map((_, index) => index)
    .sort((a, b) => blocks[a].spec.altitude - blocks[b].spec.altitude || a - b);
  const standing = new Map<string, number>();
  const levels = new Array<number>(blocks.length).fill(0);
  for (const index of order) {
    const block = blocks[index];
    const cells = rectCells(block);
    let level = 0;
    for (const key of cells) level = Math.max(level, standing.get(key) ?? 0);
    levels[index] = level;
    const tall = Math.max(0, Math.round(block.spec.height));
    for (const key of cells) standing.set(key, level + tall);
  }
  return levels;
}

/** The look a spec stands for, so that two alike share one layer. */
export function lookKey(spec: unknown): string {
  return JSON.stringify(spec);
}

/** What one block is known by, which is where it stands and what it looks like. */
export function blockKey(block: CellRect, spec: unknown): string {
  return `${block.col},${block.row},${block.width},${block.height}|${lookKey(spec)}`;
}

export interface BlockChange<T extends CellRect> {
  add: T[];
  remove: CellRect[];
}

/** What has to change on the table for it to match what was painted. */
export interface FunctionPaintPlan {
  /** Every cell the table should be closed on, which replaces whatever it held before. */
  blocked: string[];
  terrain: BlockChange<TerrainBlock>;
  mask: BlockChange<MaskBlock>;
}

/**
 * What has to be built and pulled down for one set of blocks to become another.
 *
 * A block whose look changed is pulled down and built again rather than dressed in place:
 * one rule covers both, and the table ends up with exactly what was painted either way.
 */
export function blockChange<T extends CellRect & { spec: unknown }>(
  wanted: readonly T[],
  held: readonly T[]
): BlockChange<T> {
  const wantedKeys = new Set(wanted.map((block) => blockKey(block, block.spec)));
  const heldKeys = new Set(held.map((block) => blockKey(block, block.spec)));
  return {
    add: wanted.filter((block) => !heldKeys.has(blockKey(block, block.spec))),
    remove: held.filter((block) => !wantedKeys.has(blockKey(block, block.spec))),
  };
}
