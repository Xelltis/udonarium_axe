import { FirstPersonPose } from '@axe/domain/tabletop/first-person/first-person-lattice';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { CellGrid, CellPoint, cellPolygonOf, forEachCellInBox } from '@axe/domain/tabletop/fog/cell-grid';

export const MINIMAP_RADIUS_CELLS = 5;
const NEAR_ENOUGH_PX = 1e-6;

export type MinimapTone = 'floor' | 'wall' | 'noEntry' | 'doorShut' | 'doorOpen';

export interface MinimapCell {
  index: number;
  tone: MinimapTone;
  outline: CellPoint[];
}

export interface MinimapView {
  centre: CellPoint;
  radiusPx: number;
  yaw: number;
  cells: MinimapCell[];
}

export interface MinimapGround {
  grid: CellGrid;
  walls: CellBits;
  noEntry: CellBits | null;
  doors: ReadonlyMap<number, boolean>;
  reveal: CellBits | null;
}

export function minimapViewOf(
  ground: MinimapGround,
  pose: FirstPersonPose,
  radiusCells: number = MINIMAP_RADIUS_CELLS
): MinimapView {
  const radiusPx = Math.max(0, radiusCells) * ground.grid.sizePx;
  const reach = radiusPx + NEAR_ENOUGH_PX;
  const cells: MinimapCell[] = [];
  forEachCellInBox(ground.grid, pose.x - reach, pose.y - reach, pose.x + reach, pose.y + reach, (index, cx, cy) => {
    if (Math.hypot(cx - pose.x, cy - pose.y) > reach) return;
    if (ground.reveal && !ground.reveal.get(index)) return;
    cells.push({ index, tone: toneAt(ground, index), outline: cellPolygonOf(ground.grid, index) });
  });
  return { centre: { x: pose.x, y: pose.y }, radiusPx, yaw: pose.yaw, cells };
}

function toneAt(ground: MinimapGround, index: number): MinimapTone {
  const open = ground.doors.get(index);
  if (open !== undefined) return open ? 'doorOpen' : 'doorShut';
  if (ground.walls.get(index)) return 'wall';
  if (ground.noEntry?.get(index)) return 'noEntry';
  return 'floor';
}
