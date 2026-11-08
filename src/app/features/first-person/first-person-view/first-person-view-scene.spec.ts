import { eyeFrameOf, FirstPersonCamera } from '@axe/domain/tabletop/first-person/first-person-clip';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellGridOf, cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { FirstPersonSight, pieceInSight } from '@axe/features/first-person/first-person-view/first-person-view-scene';

const GRID = 50;
const grid = cellGridOf(10, 10, GRID, GridType.SQUARE);
/** An eye standing near the south edge of the board, looking north. */
const camera = { x: 250, y: 475, z: 25, yaw: 0 } as FirstPersonCamera;
const eye = eyeFrameOf(camera);

function sight(more: Partial<FirstPersonSight> = {}): FirstPersonSight {
  return { grid, seen: null, gridSize: GRID, reachPx: 400, ...more };
}

function seenOnly(...points: { x: number; y: number }[]): CellBits {
  const bits = new CellBits(grid.cols * grid.rows);
  for (const point of points) bits.set(cellIndexAt(grid, point.x, point.y));
  return bits;
}

describe('what the eye of a piece can see', () => {
  it('sees a great piece whose middle is out of sight by a cell its footing covers', () => {
    const seen = seenOnly({ x: 225, y: 225 });
    const at = { x: 200, y: 200 };

    expect(pieceInSight(sight({ seen }), eye, at, 100, { x: 250, y: 250 })).toBe(true);
    expect(pieceInSight(sight({ seen: seenOnly({ x: 25, y: 25 }) }), eye, at, 100, { x: 250, y: 250 })).toBe(false);
  });
});
