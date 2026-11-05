import { SurfaceDims, surfaceFrame, Vec3 } from '@axe/domain/tabletop/surface-space';
import { isTableWall } from '@axe/domain/tabletop/table-walls';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { Terrain, TerrainImageSlot } from '@axe/domain/tabletop/terrain';
import type { TableWorldCap, TableWorldPoint, TableWorldWall } from '@axe/domain/tabletop/world/table-world';

/** A corner of a beam, in its wall's own axes: along the wall, down it, and out from it, each 0 or 1. */
type BeamCorner = readonly [0 | 1, 0 | 1, 0 | 1];

/**
 * A face of a beam, by the corners of the box its picture's top left, top right and bottom left
 * corners lie on, and how wide and high the picture is laid across it, in the beam's sizes.
 */
interface BeamFace {
  readonly slot: TerrainImageSlot;
  readonly fallback: TerrainImageSlot;
  readonly topLeft: BeamCorner;
  readonly topRight: BeamCorner;
  readonly bottomLeft: BeamCorner;
  readonly across: 'width' | 'depth';
  readonly down: 'depth' | 'height';
}

/**
 * The faces of a beam as the page's own table lays them, in the wall's own axes: the box is turned
 * about to stand out from the wall, so its pictures run back along the wall, and down from the room
 * towards the wall. The face against the wall is left out, as the wall hides it.
 */
const BEAM_FACES: readonly BeamFace[] = [
  {
    slot: 'top',
    fallback: 'floor',
    topLeft: [1, 0, 1],
    topRight: [0, 0, 1],
    bottomLeft: [1, 1, 1],
    across: 'width',
    down: 'depth',
  },
  {
    slot: 'north',
    fallback: 'wall',
    topLeft: [1, 0, 1],
    topRight: [0, 0, 1],
    bottomLeft: [1, 0, 0],
    across: 'width',
    down: 'height',
  },
  {
    slot: 'south',
    fallback: 'wall',
    topLeft: [1, 1, 1],
    topRight: [0, 1, 1],
    bottomLeft: [1, 1, 0],
    across: 'width',
    down: 'height',
  },
  {
    slot: 'west',
    fallback: 'wall',
    topLeft: [1, 1, 1],
    topRight: [1, 0, 1],
    bottomLeft: [1, 1, 0],
    across: 'depth',
    down: 'height',
  },
  {
    slot: 'east',
    fallback: 'wall',
    topLeft: [0, 1, 1],
    topRight: [0, 0, 1],
    bottomLeft: [0, 1, 0],
    across: 'depth',
    down: 'height',
  },
];

/** How near two heights may be and still count as one, in table pixels. */
const SAME_PX = 1e-6;

/**
 * The faces of the blocks put on the walls of the table, beams standing out from a wall into the
 * room: each the box the block fills, its faces wearing their pictures as the page's own table draws
 * them, read the same way. The faces running along the wall's height stand upright and the faces
 * across it lie flat, the one above with the table's grid over it where the block asks for one. Only
 * blocks on the walls the table draws are drawn.
 */
export function beamFacesOf(
  terrains: readonly Terrain[],
  gridSize: number,
  dims: SurfaceDims,
  drawsWall: (surface: string) => boolean,
  pictureOf: (identifier: string) => string
): { walls: TableWorldWall[]; caps: TableWorldCap[] } {
  const walls: TableWorldWall[] = [];
  const caps: TableWorldCap[] = [];
  for (const terrain of terrains) {
    const surface = surfaceOf(terrain);
    if (!isTableWall(surface) || !drawsWall(surface)) continue;
    const frame = surfaceFrame(surface, dims);
    const size = {
      width: terrain.width * gridSize,
      depth: terrain.depth * gridSize,
      height: terrain.height * gridSize,
    };
    if (size.width <= 0 || size.depth <= 0 || size.height <= 0) continue;
    const base = terrain.altitude * gridSize + terrain.posZ;
    const corner = ([along, down, out]: BeamCorner): Vec3 => {
      const x = terrain.location.x + along * size.width;
      const y = terrain.location.y + down * size.depth;
      const n = base + out * size.height;
      return {
        x: frame.origin.x + frame.u.x * x + frame.v.x * y + frame.normal.x * n,
        y: frame.origin.y + frame.u.y * x + frame.v.y * y + frame.normal.y * n,
        z: frame.origin.z + frame.u.z * x + frame.v.z * y + frame.normal.z * n,
      };
    };
    const highest = Math.max(corner([0, 0, 0]).z, corner([0, 1, 0]).z, corner([0, 0, 1]).z, corner([0, 1, 1]).z);
    const tilePx = terrain.isTiledTexture ? gridSize : 0;
    const look = { tilePx, glass: !terrain.hasFaceImage };
    const picture = (slot: TerrainImageSlot, fallback: TerrainImageSlot) => {
      const identifier = terrain.faceImageIdentifier(slot) || terrain.faceImageIdentifier(fallback);
      return identifier ? pictureOf(identifier) : '';
    };
    for (const face of BEAM_FACES) {
      const shown = face.slot === 'top' ? terrain.hasFloor || terrain.hasWall : terrain.hasWall;
      if (!shown) continue;
      const topLeft = corner(face.topLeft);
      const topRight = corner(face.topRight);
      const bottomLeft = corner(face.bottomLeft);
      const bottomRight = {
        x: topRight.x + bottomLeft.x - topLeft.x,
        y: topRight.y + bottomLeft.y - topLeft.y,
        z: topRight.z + bottomLeft.z - topLeft.z,
      };
      const across = size[face.across];
      const down = size[face.down];
      const uvOf = (s: number, t: number): TableWorldPoint =>
        tilePx > 0 ? { x: (s * across) / tilePx, y: 1 - (t * down) / tilePx } : { x: s, y: 1 - t };
      const laid = [
        { at: topLeft, uv: uvOf(0, 0) },
        { at: topRight, uv: uvOf(1, 0) },
        { at: bottomRight, uv: uvOf(1, 1) },
        { at: bottomLeft, uv: uvOf(0, 1) },
      ];
      const id = `${terrain.identifier}:beam-${face.slot}`;
      const url = picture(face.slot, face.fallback);
      const flat = laid.every((point) => Math.abs(point.at.z - topLeft.z) < SAME_PX);
      if (flat) {
        const facing = Math.abs(topLeft.z - highest) < SAME_PX ? 'up' : 'down';
        caps.push({
          id,
          outline: laid.map((point) => ({ x: point.at.x, y: point.at.y })),
          zPx: topLeft.z,
          uvs: laid.map((point) => point.uv),
          facing,
          pictureUrl: url,
          ...look,
          ...(facing === 'up' && terrain.isGrid ? { gridded: true } : {}),
        });
        continue;
      }
      const upright = uprightOf(id, laid, url, look);
      walls.push(face.slot === 'top' ? { ...upright, gridUvs: gridUvsOf(upright, corner) } : upright);
    }
  }
  return { walls, caps };
}

/**
 * Where the corners of a beam's front stand on the grid of its wall laid over it, as the page lays
 * the wall's grid there: across along the wall and down it, from the beam's corner nearest the
 * wall's own, rather than the way the beam's picture runs.
 */
function gridUvsOf(
  upright: TableWorldWall,
  corner: (at: BeamCorner) => Vec3
): [TableWorldPoint, TableWorldPoint, TableWorldPoint, TableWorldPoint] {
  const first = corner([0, 0, 1]);
  const across = corner([1, 0, 1]);
  const down = corner([0, 1, 1]);
  const along = { x: across.x - first.x, y: across.y - first.y, z: across.z - first.z };
  const downward = { x: down.x - first.x, y: down.y - first.y, z: down.z - first.z };
  const share = (point: Vec3, axis: Vec3) =>
    ((point.x - first.x) * axis.x + (point.y - first.y) * axis.y + (point.z - first.z) * axis.z) /
    (axis.x * axis.x + axis.y * axis.y + axis.z * axis.z);
  const uvOf = (x: number, y: number, z: number): TableWorldPoint => {
    const point = { x, y, z };
    return { x: share(point, along), y: 1 - share(point, downward) };
  };
  return [
    uvOf(upright.ax, upright.ay, upright.basePx),
    uvOf(upright.bx, upright.by, upright.basePx),
    uvOf(upright.bx, upright.by, upright.topPx),
    uvOf(upright.ax, upright.ay, upright.topPx),
  ];
}

/** An upright face from its four corners: the two lower and the two upper, each with the place on its picture it wears. */
function uprightOf(
  id: string,
  laid: readonly { readonly at: Vec3; readonly uv: TableWorldPoint }[],
  pictureUrl: string,
  look: { readonly tilePx: number; readonly glass: boolean }
): TableWorldWall {
  const lowest = Math.min(...laid.map((point) => point.at.z));
  const lower = laid.filter((point) => Math.abs(point.at.z - lowest) < SAME_PX);
  const upper = laid.filter((point) => Math.abs(point.at.z - lowest) >= SAME_PX);
  const [a, b] = lower;
  const above = (foot: (typeof laid)[number]) =>
    upper.find((point) => Math.abs(point.at.x - foot.at.x) < SAME_PX && Math.abs(point.at.y - foot.at.y) < SAME_PX)!;
  return {
    id,
    ax: a.at.x,
    ay: a.at.y,
    bx: b.at.x,
    by: b.at.y,
    basePx: lowest,
    topPx: upper[0].at.z,
    pictureUrl,
    ...look,
    uvs: [a.uv, b.uv, above(b).uv, above(a).uv],
  };
}
