import { eyeFrameOf, FirstPersonCamera } from '@axe/domain/tabletop/first-person/first-person-clip';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellGridOf, cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { type LightBeam } from '@axe/domain/tabletop/vision-scene';
import {
  beamViewsOf,
  FirstPersonSight,
  pieceInSight,
  pointInSight,
} from '@axe/features/first-person/first-person-view/first-person-view-scene';

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
  it('sees a point ahead within reach, and nothing behind it or beyond it', () => {
    expect(pointInSight(sight(), eye, { x: 250, y: 300 })).toBe(true);
    expect(pointInSight(sight(), eye, { x: 250, y: 490 })).toBe(false);
    expect(pointInSight(sight({ reachPx: 100 }), eye, { x: 250, y: 300 })).toBe(false);
  });

  it('sees only over ground in sight where the sight is limited', () => {
    const seen = seenOnly({ x: 250, y: 300 });

    expect(pointInSight(sight({ seen }), eye, { x: 250, y: 300 })).toBe(true);
    expect(pointInSight(sight({ seen }), eye, { x: 250, y: 200 })).toBe(false);
  });

  it('sees a great piece whose middle is out of sight by a cell its footing covers', () => {
    const seen = seenOnly({ x: 225, y: 225 });
    const at = { x: 200, y: 200 };

    expect(pieceInSight(sight({ seen }), eye, at, 100, { x: 250, y: 250 })).toBe(true);
    expect(pieceInSight(sight({ seen: seenOnly({ x: 25, y: 25 }) }), eye, at, 100, { x: 250, y: 250 })).toBe(false);
  });

  it('stands only the beams hung in front of the eye and within reach', () => {
    const beam = (y: number): LightBeam =>
      ({
        origin: { x: 250, y, z: 100 },
        width: 40,
        height: 80,
        clip: 'none',
        color: 'rgba(255, 220, 160, 0.4)',
        fins: [],
      }) as unknown as LightBeam;

    const views = beamViewsOf([beam(300), beam(490)], camera, GRID, 400);

    expect(views.map((view) => view.id)).toEqual(['0:250:300']);
    expect(views[0].background).toContain('rgba(255, 220, 160, 0.4)');
  });
});
