import { CellRect } from '@axe/domain/tabletop/cell-rectangles';

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

/** Everything a painted wall is, which is everything a terrain of one block can be. */
export interface TerrainPaintSpec {
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
  images: TerrainFaceImages;
}

export interface MaskPaintSpec {
  color: string;
  opacity: number;
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
    height: 1,
    mode: 3,
    blocksSight: true,
    blocksLight: true,
    tiledTexture: false,
    showsGrid: false,
    dropShadow: true,
    surfaceShading: true,
    images: { ...NO_FACE_IMAGES },
  },
  mask: {
    color: '#555555',
    opacity: 0.6,
  },
};

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

export function sanitizeFunctionSpec(value: unknown): FunctionSpec {
  const held = asRecord(value);
  const terrain = asRecord(held['terrain']);
  const mask = asRecord(held['mask']);
  const fallback = DEFAULT_FUNCTION_SPEC;

  return {
    terrain: {
      height: countIn(terrain, 'height', fallback.terrain.height, 0, 99),
      mode: countIn(terrain, 'mode', fallback.terrain.mode, 0, 3),
      blocksSight: flagIn(terrain, 'blocksSight', fallback.terrain.blocksSight),
      blocksLight: flagIn(terrain, 'blocksLight', fallback.terrain.blocksLight),
      tiledTexture: flagIn(terrain, 'tiledTexture', fallback.terrain.tiledTexture),
      showsGrid: flagIn(terrain, 'showsGrid', fallback.terrain.showsGrid),
      dropShadow: flagIn(terrain, 'dropShadow', fallback.terrain.dropShadow),
      surfaceShading: flagIn(terrain, 'surfaceShading', fallback.terrain.surfaceShading),
      images: sanitizeFaceImages(terrain['images']),
    },
    mask: {
      color: textIn(mask, 'color', fallback.mask.color),
      opacity: countIn(mask, 'opacity', fallback.mask.opacity, 0, 1),
    },
  };
}

/** Whether a painted wall wears any picture at all. Wearing none makes it glass. */
export function wearsAnyImage(images: TerrainFaceImages): boolean {
  return TERRAIN_FACE_KEYS.some((face) => images[face].length > 0);
}

export interface CellChange {
  add: CellRect[];
  remove: CellRect[];
}

/** What has to change on the table for it to match what was painted. */
export interface FunctionPaintPlan {
  /** Every cell the table should be closed on, which replaces whatever it held before. */
  blocked: string[];
  terrain: CellChange;
  mask: CellChange;
  /** The settings each role's own layer carries, which the newly laid objects take. */
  terrainSpec: TerrainPaintSpec;
  maskSpec: MaskPaintSpec;
}
