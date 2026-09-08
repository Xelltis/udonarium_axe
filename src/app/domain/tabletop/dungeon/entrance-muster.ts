import {
  cellAt,
  DungeonCell,
  DungeonLayout,
  DungeonPoint,
  inBounds,
} from '@axe/domain/tabletop/dungeon/dungeon-layout';

const STEPS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Where a party stands when it has just walked in.
 *
 * The nearest ground to the way in, a piece to a cell, taken outwards from the entrance so the
 * party ends up together rather than strung along a passage. A doorway is passed over: a piece
 * standing in one bars the door it stands in, which is nobody's idea of arriving.
 *
 * Ground is counted by the walk rather than by the crow, so a party never lands on the far side
 * of a wall from the door it came through.
 */
export function musterCells(layout: DungeonLayout, at: DungeonPoint, count: number): DungeonPoint[] {
  if (count < 1) return [];
  const standable = (x: number, y: number) => {
    if (!inBounds(layout, x, y)) return false;
    const cell = cellAt(layout, x, y);
    return cell === DungeonCell.Room || cell === DungeonCell.Corridor;
  };

  const seen = new Set<number>([at.y * layout.width + at.x]);
  const queue: DungeonPoint[] = [at];
  const standing: DungeonPoint[] = [];

  for (let head = 0; head < queue.length && standing.length < count; head++) {
    const here = queue[head];
    if (standable(here.x, here.y)) standing.push(here);
    for (const [dx, dy] of STEPS) {
      const next = { x: here.x + dx, y: here.y + dy };
      if (!inBounds(layout, next.x, next.y)) continue;
      const index = next.y * layout.width + next.x;
      if (seen.has(index)) continue;
      // A door is stepped through to reach what lies beyond it, never stood in.
      if (cellAt(layout, next.x, next.y) === DungeonCell.Rock) continue;
      seen.add(index);
      queue.push(next);
    }
  }

  return standing;
}
