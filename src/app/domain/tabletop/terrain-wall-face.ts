import { WallFace } from '@axe/domain/tabletop/vision-scene';

export type WallSide = 'north' | 'south' | 'west' | 'east';

export interface TerrainFootprint {
  /** The top left on the board, in pixels, before any turn. */
  x: number;
  y: number;
  widthPx: number;
  depthPx: number;
  heightPx: number;
  rotateDeg: number;
}

interface Corner {
  x: number;
  y: number;
}

/**
 * One wall of a piece of terrain, in board coordinates.
 *
 * Built as an axis-aligned box, turned terrain would have no face, and without one no
 * light or shadow reaches it. The corners and the normal are turned together.
 */
export function terrainWallFace(side: WallSide, footprint: TerrainFootprint): WallFace {
  const { x, y, widthPx, depthPx, heightPx, rotateDeg } = footprint;
  const centerX = x + widthPx / 2;
  const centerY = y + depthPx / 2;
  const radian = (rotateDeg * Math.PI) / 180;
  const cos = Math.cos(radian);
  const sin = Math.sin(radian);
  const halfWidth = widthPx / 2;
  const halfDepth = depthPx / 2;

  const corner = (localX: number, localY: number): Corner => ({
    x: centerX + localX * cos - localY * sin,
    y: centerY + localX * sin + localY * cos,
  });
  const normal = (nx: number, ny: number): Corner => ({ x: nx * cos - ny * sin, y: nx * sin + ny * cos });

  // Building all four and picking one would throw three away for every piece of terrain.
  const edge = ((): { a: Corner; b: Corner; n: Corner } => {
    switch (side) {
      case 'north':
        return { a: corner(-halfWidth, -halfDepth), b: corner(halfWidth, -halfDepth), n: normal(0, -1) };
      case 'south':
        return { a: corner(-halfWidth, halfDepth), b: corner(halfWidth, halfDepth), n: normal(0, 1) };
      case 'west':
        return { a: corner(-halfWidth, -halfDepth), b: corner(-halfWidth, halfDepth), n: normal(-1, 0) };
      default:
        return { a: corner(halfWidth, -halfDepth), b: corner(halfWidth, halfDepth), n: normal(1, 0) };
    }
  })();

  return {
    ax: edge.a.x,
    ay: edge.a.y,
    bx: edge.b.x,
    by: edge.b.y,
    nx: edge.n.x,
    ny: edge.n.y,
    heightPx,
  };
}
