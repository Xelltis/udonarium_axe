import { GridType } from '@axe/domain/tabletop/game-table';
import { boardShapeOf } from '@axe/domain/tabletop/world/table-world';
import {
  boardGeometry,
  capGeometry,
  griddedTops,
  mergedFaces,
  wallGeometry,
} from '@axe/infrastructure/table-3d/face-geometry';

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

  it('joins faces built apart into one shape, one after another', () => {
    const first = wallGeometry({ ...face, ax: 0, ay: 0, bx: 50, by: 0, basePx: 0, topPx: 50 });
    const second = wallGeometry({ ...face, ax: 50, ay: 0, bx: 50, by: 50, basePx: 0, topPx: 50 });

    const joined = mergedFaces([first, second]);

    expect(joined.getAttribute('position').count).toBe(first.getAttribute('position').count * 2);
    expect(Array.from(joined.getAttribute('position').array).slice(-18)).toEqual(
      Array.from(second.getAttribute('position').array)
    );
    expect(joined.getAttribute('uv').count).toBe(joined.getAttribute('position').count);
  });

  it('reads the table’s grid off at each point of the board for a top that wears it, a hair above it', () => {
    const top = {
      ...face,
      outline: [
        { x: 100, y: 50 },
        { x: 200, y: 50 },
        { x: 200, y: 100 },
        { x: 100, y: 100 },
      ],
      zPx: 50,
      facing: 'up' as const,
    };

    const grid = griddedTops([top], { x: 0, y: 0, width: 1000, height: 500 }, 0.5);

    const positions = Array.from(grid.getAttribute('position').array);
    const uvs = Array.from(grid.getAttribute('uv').array);
    const first = positions.slice(0, 3);
    expect(first[1]).toBe(50.5);
    const corner = positions.findIndex((_, i) => i % 3 === 0 && positions[i] === 200 && positions[i + 2] === 100) / 3;
    expect(uvs[corner * 2]).toBeCloseTo(0.2, 6);
    expect(uvs[corner * 2 + 1]).toBeCloseTo(0.8, 6);
  });
});
