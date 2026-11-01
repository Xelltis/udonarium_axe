import { GridType } from '@axe/domain/tabletop/game-table';
import { boardShapeOf } from '@axe/domain/tabletop/world/table-world';
import { boardGeometry, capGeometry, wallGeometry } from '@axe/infrastructure/table-3d/face-geometry';

/** The heights (the scene's y) of a geometry's corners, at each place along the floor they stand. */
function heightsByPlace(positions: ArrayLike<number>): Map<string, number[]> {
  const byPlace = new Map<string, number[]>();
  for (let i = 0; i < positions.length; i += 3) {
    const place = `${Math.round(positions[i])},${Math.round(positions[i + 2])}`;
    byPlace.set(place, [...(byPlace.get(place) ?? []), positions[i + 1]]);
  }
  return byPlace;
}

const face = { id: 'face', pictureUrl: '', tilePx: 0, glass: false };

describe('the shapes of the faces drawn on the canvas', () => {
  it('stands a side up to the heights a slope over it runs through', () => {
    const wall = wallGeometry({
      ...face,
      ax: 200,
      ay: 50,
      bx: 100,
      by: 50,
      basePx: 0,
      topPx: 100,
      profile: [
        { at: 0, heightPx: 0 },
        { at: 1, heightPx: 100 },
      ],
    });

    const heights = heightsByPlace(wall.getAttribute('position').array);
    expect(Math.max(...heights.get('200,50')!)).toBe(0);
    expect(Math.max(...heights.get('100,50')!)).toBe(100);
  });

  it('stands a side without a slope over it as high as its top all along', () => {
    const wall = wallGeometry({ ...face, ax: 0, ay: 0, bx: 50, by: 0, basePx: 10, topPx: 60 });
    const heights = heightsByPlace(wall.getAttribute('position').array);
    expect([...heights.values()].map((at) => [Math.min(...at), Math.max(...at)])).toEqual([
      [10, 60],
      [10, 60],
    ]);
  });

  it('puts each corner of a piece of a slope at its own height', () => {
    const cap = capGeometry({
      ...face,
      outline: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 0, y: 50 },
      ],
      zPx: 100,
      heights: [100, 0, 0, 100],
      facing: 'up',
    });

    const heights = heightsByPlace(cap.getAttribute('position').array);
    expect(heights.get('0,0')!.every((height) => height === 100)).toBe(true);
    expect(heights.get('100,50')!.every((height) => height === 0)).toBe(true);
  });

  it('cuts a hex board into its cells, four triangles to a cell', () => {
    const shape = boardShapeOf(3, 2, 50, GridType.HEX_VERTICAL);
    const board = boardGeometry({
      widthPx: 150,
      depthPx: 100,
      gridSize: 50,
      gridType: GridType.HEX_VERTICAL,
      shape,
      pictureUrl: '',
      veiled: true,
    });

    expect(board.getAttribute('position').count).toBe(6 * 4 * 3);
  });
});
