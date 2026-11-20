import { cellAt, DungeonCell, DungeonLayout, DungeonPoint, setCell } from '@axe/domain/tabletop/dungeon/dungeon-layout';

interface Way {
  from: DungeonPoint;
  dx: number;
  dy: number;
  steps: number;
  cost: number;
}

/** The four ways out of a cell, in the order a mouth is sought in. */
const WAYS_OUT = [
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
] as const;

/** How far a cell lies from the edge of the place each way. */
function waysOut(layout: DungeonLayout, x: number, y: number): { dx: number; dy: number; steps: number }[] {
  return WAYS_OUT.map(({ dx, dy }) => ({ dx, dy, steps: stepsToEdge(layout, x, y, dx, dy) }));
}

/**
 * How many cells lie between a cell and the edge of the place one way, the last of them on the edge:
 * the edge of the board, or of the round of a round place, past which there is nothing.
 */
function stepsToEdge(layout: DungeonLayout, x: number, y: number, dx: number, dy: number): number {
  let steps = 0;
  for (;;) {
    const nx = x + dx * (steps + 1);
    const ny = y + dy * (steps + 1);
    if (nx < 0 || ny < 0 || nx >= layout.width || ny >= layout.height) return steps;
    if (layout.outside?.[ny * layout.width + nx]) return steps;
    steps++;
  }
}

/** Whether every cell between here and the edge is still solid stone. */
function runIsSolid(layout: DungeonLayout, from: DungeonPoint, dx: number, dy: number, steps: number): boolean {
  for (let step = 1; step <= steps; step++) {
    if (cellAt(layout, from.x + dx * step, from.y + dy * step) !== DungeonCell.Rock) return false;
  }
  return true;
}

/**
 * Break the outer wall and run a tunnel in to meet the dungeon: the wall at the edge of the board, or
 * the wall round a round place, whose mouth opens onto the nothing round it.
 *
 * A dungeon reached by a stair is one with more of itself above; a mouth in the hillside is
 * how the first floor of one is reached, and how a cave is reached at all.
 *
 * The tunnel starts where the dungeon already comes closest to the edge rather than driving
 * out from the middle: a maze fills the rock between, so a long bore from the heart of the
 * place would run along other passages the whole way and join them all by accident.
 */
export function openTunnelMouth(layout: DungeonLayout): DungeonPoint | null {
  const room = layout.rooms[0];
  const anchor: DungeonPoint = room
    ? { x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) }
    : { x: Math.floor(layout.width / 2), y: Math.floor(layout.height / 2) };

  let best: Way | null = null;
  for (let y = 1; y < layout.height - 1; y++) {
    for (let x = 1; x < layout.width - 1; x++) {
      if (cellAt(layout, x, y) === DungeonCell.Rock) continue;
      for (const way of waysOut(layout, x, y)) {
        if (way.steps < 1) continue;
        if (!runIsSolid(layout, { x, y }, way.dx, way.dy, way.steps)) continue;
        // A short bore near the way in, rather than the shortest bore anywhere on the board.
        const cost = way.steps * 6 + Math.abs(x - anchor.x) + Math.abs(y - anchor.y);
        if (best === null || cost < best.cost) best = { from: { x, y }, ...way, cost };
      }
    }
  }

  if (best === null) return null;

  for (let step = 1; step <= best.steps; step++) {
    setCell(layout, best.from.x + best.dx * step, best.from.y + best.dy * step, DungeonCell.Corridor);
  }
  layout.mouth = { x: best.from.x + best.dx * best.steps, y: best.from.y + best.dy * best.steps };
  return layout.mouth;
}
