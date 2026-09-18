import { HexFlowerParams } from '@axe/domain/tabletop/hex-flower-geometry';
import { hexWallShadeOf } from '@axe/domain/tabletop/terrain-shade';

/** One wall of a hex terrain: the face standing on an edge of its outline. */
export interface TerrainHexWall {
  edgeLength: number;
  px: number;
  py: number;
  angle: number;
  brightness: number;
}

/** The walls of a terrain that has none, shared so a square terrain hands out no new arrays. */
export const NO_HEX_WALLS: readonly TerrainHexWall[] = [];

/**
 * The outlines already cut, by the outline they were cut from.
 *
 * A dungeon lays hundreds of terrains of a handful of sizes, and every one of them was cutting its
 * own copy of the same polygon. The outlines themselves are shared by
 * {@link calcHexFlowerParams}, so holding the strings against them shares the strings too, and
 * lets go of them when the outline itself is let go.
 */
const floorClipPaths = new WeakMap<HexFlowerParams, string>();

/** The clip path that cuts a hex terrain's floor to its outline, as a share of its bounding box. */
export function hexFloorClipPathOf(params: HexFlowerParams): string {
  const held = floorClipPaths.get(params);
  if (held != null) return held;
  const { outline, bbox } = params;
  const W = bbox.maxX - bbox.minX;
  const H = bbox.maxY - bbox.minY;
  const points = outline
    .map((v) => {
      const px = v.x - bbox.minX;
      const py = v.y - bbox.minY;
      return `${((px / W) * 100).toFixed(2)}% ${((py / H) * 100).toFixed(2)}%`;
    })
    .join(', ');
  const clipPath = `polygon(${points})`;
  floorClipPaths.set(params, clipPath);
  return clipPath;
}

/** The wall layouts already laid out, by outline and then by the box they stand in. */
const wallLayouts = new WeakMap<HexFlowerParams, Map<string, readonly TerrainHexWall[]>>();

/** How many boxes one outline keeps layouts for, so a terrain being resized cannot pile them up. */
const WALL_LAYOUT_LIMIT = 16;

/**
 * The walls that stand on the edges of a hex terrain's outline, within a container of this size.
 *
 * Terrains of the same size share one layout, so the walls are laid out once for each size a table
 * carries rather than once for each terrain.
 */
export function hexWallsOf(
  params: HexFlowerParams,
  containerW: number,
  containerH: number,
  useSurfaceShading: boolean
): readonly TerrainHexWall[] {
  let byBox = wallLayouts.get(params);
  if (!byBox) {
    byBox = new Map();
    wallLayouts.set(params, byBox);
  }
  const key = `${containerW}|${containerH}|${useSurfaceShading}`;
  const held = byBox.get(key);
  if (held) return held;
  if (byBox.size >= WALL_LAYOUT_LIMIT) byBox.clear();

  const { outline } = params;
  const walls = outline.map((v1, i) => {
    const v2 = outline[(i + 1) % outline.length];
    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    const edgeLength = Math.sqrt(dx * dx + dy * dy);
    const edgeAngle = Math.atan2(dy, dx);

    return {
      edgeLength: edgeLength + 1,
      px: containerW / 2 + v2.x,
      py: containerH / 2 + v2.y,
      angle: edgeAngle + Math.PI,
      brightness: hexWallShadeOf(edgeAngle, useSurfaceShading),
    };
  });
  byBox.set(key, walls);
  return walls;
}
