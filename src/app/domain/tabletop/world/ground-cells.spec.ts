import { GridType } from '@axe/domain/tabletop/grid-type';
import { GROUND_CHUNK_SAMPLE_COUNT, GROUND_CHUNK_SAMPLES } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { groundSurfaceOf } from '@axe/domain/tabletop/ground/ground-surface';
import { type FloorMesh, GroundCells } from '@axe/domain/tabletop/world/ground-cells';
import { hexGroundMesh, squareGroundMesh } from '@axe/domain/tabletop/world/ground-mesh';
import { boardShapeOf } from '@axe/domain/tabletop/world/table-world';

const GRID = 50;

/** Ground raised a cell at one sample, a half cell across and down from the board's corner. */
function hill() {
  const heights = new Int16Array(GROUND_CHUNK_SAMPLE_COUNT);
  heights[1 * GROUND_CHUNK_SAMPLES + 1] = 64;
  return groundSurfaceOf([{ cx: 0, cy: 0, heights, paint: null }]);
}

/** Ground rising and falling all over the first chunk, steeply. */
function hills() {
  const heights = new Int16Array(GROUND_CHUNK_SAMPLE_COUNT);
  for (let at = 0; at < heights.length; at++) heights[at] = (at * 37) % 200;
  return groundSurfaceOf([{ cx: 0, cy: 0, heights, paint: null }]);
}

/** How much of the floor a mesh's triangles cover together, seen from above, each counted every time it is covered. */
function coveredArea(mesh: FloorMesh): number {
  let area = 0;
  for (let at = 0; at < mesh.triangles.length; at += 3) {
    const [a, b, c] = [mesh.triangles[at], mesh.triangles[at + 1], mesh.triangles[at + 2]].map((point) => [
      mesh.points[point * 3],
      mesh.points[point * 3 + 1],
    ]);
    area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
  }
  return area;
}

/** The points of a mesh its triangles use, across, down and up. */
function usedPoints(mesh: FloorMesh): [number, number, number][] {
  return [...new Set(mesh.triangles)].map((at) => [
    mesh.points[at * 3],
    mesh.points[at * 3 + 1],
    mesh.points[at * 3 + 2],
  ]);
}

/** Whether a point lies in a box. */
function liesIn([x, y]: [number, number, number], box: { x: number; y: number; width: number; height: number }) {
  const slack = 1e-6;
  return x >= box.x - slack && x <= box.x + box.width + slack && y >= box.y - slack && y <= box.y + box.height + slack;
}

/** The heights of the triangles of a mesh over a point that lie over it, at the point. */
function heightsOver(mesh: FloorMesh, x: number, y: number): number[] {
  const heights: number[] = [];
  for (let at = 0; at < mesh.triangles.length; at += 3) {
    const [a, b, c] = [mesh.triangles[at], mesh.triangles[at + 1], mesh.triangles[at + 2]].map((point) => [
      mesh.points[point * 3],
      mesh.points[point * 3 + 1],
      mesh.points[point * 3 + 2],
    ]);
    const twice = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(twice) < 1e-9) continue;
    const u = ((x - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1])) / twice;
    const v = ((b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1])) / twice;
    if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
    heights.push(a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]));
  }
  return heights;
}

describe('the ground cell by cell, as a sheet lying over it is laid on', () => {
  it('covers a box reaching off a square board once, on the ground and flat off it', () => {
    const ground = hill();
    const box = { x: -30, y: 10, width: 80, height: 40 };

    const mesh = new GroundCells(ground, GRID, GridType.SQUARE).meshOver(box);

    expect(coveredArea(mesh)).toBeCloseTo(box.width * box.height, 6);
    for (const point of usedPoints(mesh)) {
      expect(liesIn(point, box)).toBe(true);
      expect(point[2]).toBeCloseTo(ground.heightAt(point[0] / GRID, point[1] / GRID) * GRID, 3);
    }
    expect(Math.max(...usedPoints(mesh).map((point) => point[2]))).toBeCloseTo(GRID);
  });

  it('lays the same points as the board’s ground where a box lies on a square board', () => {
    const ground = hills();
    const board = squareGroundMesh({ x: 0, y: 0, width: 300, height: 300 }, ground, GRID);
    const onBoard = new Set<string>();
    for (let at = 0; at < board.points.length; at += 3) {
      onBoard.add([board.points[at], board.points[at + 1], board.points[at + 2]].join());
    }

    const mesh = new GroundCells(ground, GRID, GridType.SQUARE).meshOver({ x: 50, y: 0, width: 150, height: 100 });

    for (const point of usedPoints(mesh)) expect(onBoard.has(point.join())).toBe(true);
  });

  it.each([
    ['flat-topped', GridType.HEX_VERTICAL],
    ['pointy-topped', GridType.HEX_HORIZONTAL],
  ])('covers a box reaching off a %s hex board once, no cell lying over another', (_name, gridType) => {
    const box = { x: -40, y: -20, width: 120, height: 90 };

    const mesh = new GroundCells(hill(), GRID, gridType).meshOver(box);

    expect(coveredArea(mesh)).toBeCloseTo(box.width * box.height, 3);
    for (const point of usedPoints(mesh)) expect(liesIn(point, box)).toBe(true);
  });

  it.each([
    ['flat-topped', GridType.HEX_VERTICAL],
    ['pointy-topped', GridType.HEX_HORIZONTAL],
  ])('lies on the ground a %s hex board is drawn over, however steep', (_name, gridType) => {
    const ground = hills();
    const shape = boardShapeOf(6, 6, GRID, gridType);
    const board = hexGroundMesh(shape.hexes!, shape.box, ground, GRID);

    const mesh = new GroundCells(ground, GRID, gridType).meshOver({ x: 40, y: 40, width: 150, height: 120 });

    for (const [x, y, z] of usedPoints(mesh)) {
      expect(heightsOver(board, x, y).some((height) => Math.abs(height - z) < 1e-3)).toBe(true);
    }
  });

  it('reads the ground for a cell once, laying a sheet moved over it again without reading it', () => {
    const ground = hills();
    const read = vi.spyOn(ground, 'heightAt');
    const cells = new GroundCells(ground, GRID, GridType.HEX_VERTICAL);

    cells.meshOver({ x: 40, y: 40, width: 150, height: 120 });
    const first = read.mock.calls.length;
    cells.settle();
    cells.meshOver({ x: 43, y: 41, width: 150, height: 120 });
    const moved = read.mock.calls.length - first;
    cells.settle();
    cells.meshOver({ x: 43, y: 41, width: 150, height: 120 });

    expect(first).toBeGreaterThan(0);
    expect(moved).toBeLessThan(first / 4);
    expect(read.mock.calls.length - first - moved).toBe(0);
  });

  it('lets go of the cells used longest ago past a few more than those laid over since the last settling', () => {
    const ground = hill();
    const read = vi.spyOn(ground, 'heightAt');
    const cells = new GroundCells(ground, GRID, GridType.SQUARE);
    const near = { x: 0, y: 0, width: 30 * GRID, height: 30 * GRID };

    cells.meshOver(near);
    cells.settle();
    cells.meshOver({ x: 100 * GRID, y: 0, width: 10 * GRID, height: 10 * GRID });
    cells.settle();
    const before = read.mock.calls.length;
    cells.meshOver(near);

    expect(read.mock.calls.length).toBeGreaterThan(before);
  });
});
