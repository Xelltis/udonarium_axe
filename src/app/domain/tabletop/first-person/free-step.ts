import { CellPoint } from '@axe/domain/tabletop/fog/cell-grid';
import { rectangleSegments, Segment, segmentsCross } from '@axe/domain/tabletop/los/segments';
import { terrainBlocksMovement } from '@axe/domain/tabletop/move/blocked-cells';
import { Terrain } from '@axe/domain/tabletop/terrain';

export interface FreeStepGround {
  widthPx: number;
  heightPx: number;
  gridSize: number;
  terrains: readonly Terrain[];
  others: readonly CellPoint[];
}

export function freeStepClear(from: CellPoint, to: CellPoint, ground: FreeStepGround): boolean {
  if (to.x < 0 || to.y < 0 || to.x > ground.widthPx || to.y > ground.heightPx) return false;
  for (const terrain of ground.terrains) {
    if (!terrainBlocksMovement(terrain)) continue;
    const edges = rectangleSegments(
      terrain.location.x,
      terrain.location.y,
      terrain.width * ground.gridSize,
      terrain.depth * ground.gridSize,
      terrain.rotate
    );
    if (edges.some((edge) => segmentsCross(from.x, from.y, to.x, to.y, edge.x1, edge.y1, edge.x2, edge.y2))) {
      return false;
    }
    if (inside(to, edges)) return false;
  }
  const room = ground.gridSize / 2;
  return !ground.others.some((other) => Math.hypot(other.x - to.x, other.y - to.y) < room);
}

function inside(point: CellPoint, edges: readonly Segment[]): boolean {
  let sign = 0;
  for (const edge of edges) {
    const side = (edge.x2 - edge.x1) * (point.y - edge.y1) - (edge.y2 - edge.y1) * (point.x - edge.x1);
    if (side === 0) return false;
    const current = Math.sign(side);
    if (sign === 0) sign = current;
    else if (current !== sign) return false;
  }
  return sign !== 0;
}
