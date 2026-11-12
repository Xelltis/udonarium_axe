import { GridType } from '@axe/domain/tabletop/grid-type';
import { GROUND_CHUNK_SAMPLE_COUNT, GROUND_CHUNK_SAMPLES } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { groundSurfaceOf } from '@axe/domain/tabletop/ground/ground-surface';
import {
  type GroundMesh,
  groundMeshOver,
  hexGroundMesh,
  squareGroundMesh,
} from '@axe/domain/tabletop/world/ground-mesh';

const GRID = 50;

/** Ground raised a cell at one sample, a half cell across and down from the board's corner. */
function hill() {
  const heights = new Int16Array(GROUND_CHUNK_SAMPLE_COUNT);
  heights[1 * GROUND_CHUNK_SAMPLES + 1] = 64;
  return groundSurfaceOf([{ cx: 0, cy: 0, heights, paint: null }]);
}

/** How much of the floor a mesh's triangles cover together, seen from above, each counted every time it is covered. */
function coveredArea(mesh: GroundMesh): number {
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

/** Whether every point of a mesh lies in a box. */
function liesIn(mesh: GroundMesh, box: { x: number; y: number; width: number; height: number }): boolean {
  for (let at = 0; at < mesh.points.length; at += 3) {
    const [x, y] = [mesh.points[at], mesh.points[at + 1]];
    if (x < box.x - 1e-6 || x > box.x + box.width + 1e-6 || y < box.y - 1e-6 || y > box.y + box.height + 1e-6) {
      return false;
    }
  }
  return true;
}

describe('the board laid over raised ground', () => {
  it('puts a point on every sample of the ground in the board and along its edges, at the ground’s height', () => {
    const mesh = squareGroundMesh({ x: 0, y: 0, width: 100, height: 50 }, hill(), GRID);

    expect(mesh.points.length / 3).toBe(5 * 3);
    const raised = 1 * 5 + 1;
    expect([...mesh.points.subarray(raised * 3, raised * 3 + 3)]).toEqual([25, 25, GRID]);
    expect([...mesh.uvs.subarray(raised * 2, raised * 2 + 2)]).toEqual([0.25, 0.5]);
  });

  it('splits each square of four points from its top left to its bottom right, as the ground is read', () => {
    const mesh = squareGroundMesh({ x: 0, y: 0, width: 50, height: 50 }, hill(), GRID);

    expect([...mesh.triangles.subarray(0, 6)]).toEqual([0, 1, 4, 0, 4, 3]);
  });

  it('keeps a hex board’s cells, each point on the ground under it', () => {
    const hexes = [
      [
        { x: 25, y: 0 },
        { x: 50, y: 12.5 },
        { x: 50, y: 37.5 },
        { x: 25, y: 50 },
        { x: 0, y: 37.5 },
        { x: 0, y: 12.5 },
      ],
    ];
    const ground = hill();
    const mesh = hexGroundMesh(hexes, { x: 0, y: 0, width: 50, height: 50 }, ground, GRID);

    expect(mesh.triangles.length / 3).toBe(4 * 16);
    for (let i = 0; i < mesh.points.length; i += 3) {
      const [x, y, z] = [mesh.points[i], mesh.points[i + 1], mesh.points[i + 2]];
      expect(z).toBeCloseTo(ground.heightAt(x / GRID, y / GRID) * GRID, 3);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(50);
    }
  });

  it('says how much of each kind of ground covers the points over painted samples, and leaves the mesh unpainted where nothing is', () => {
    const heights = new Int16Array(GROUND_CHUNK_SAMPLE_COUNT);
    const paint = new Uint8Array(GROUND_CHUNK_SAMPLE_COUNT * 4);
    paint.set([0, 0, 15, 0], (1 * GROUND_CHUNK_SAMPLES + 1) * 4);
    paint.set([5, 0, 0, 5], (1 * GROUND_CHUNK_SAMPLES + 2) * 4);
    const painted = groundSurfaceOf([{ cx: 0, cy: 0, heights, paint }]);

    expect(painted.isFlat).toBe(false);
    const mesh = squareGroundMesh({ x: 0, y: 0, width: 100, height: 50 }, painted, GRID);
    const shares = (point: number) =>
      [...mesh.paint!.subarray(point * 4, point * 4 + 4)].map((value) => Math.round(value * 100) / 100);
    expect(shares(1 * 5 + 1)).toEqual([0, 0, 1, 0]);
    expect(shares(1 * 5 + 2)).toEqual([0.33, 0, 0, 0.33]);
    expect(shares(0)).toEqual([0, 0, 0, 0]);
    expect(squareGroundMesh({ x: 0, y: 0, width: 100, height: 50 }, hill(), GRID).paint).toBeNull();
  });

  it('reads a sample painted past full as full, in the same proportions', () => {
    const heights = new Int16Array(GROUND_CHUNK_SAMPLE_COUNT);
    const paint = new Uint8Array(GROUND_CHUNK_SAMPLE_COUNT * 4);
    paint.set([30, 10, 0, 0], 0);

    const mesh = squareGroundMesh(
      { x: 0, y: 0, width: 100, height: 50 },
      groundSurfaceOf([{ cx: 0, cy: 0, heights, paint }]),
      GRID
    );

    expect([...mesh.paint!.subarray(0, 4)]).toEqual([0.75, 0.25, 0, 0]);
  });

  it('covers a box reaching off a square board once, on the ground the board is drawn over and flat off it', () => {
    const ground = hill();
    const box = { x: -30, y: 10, width: 80, height: 40 };

    const mesh = groundMeshOver(box, ground, GRID, GridType.SQUARE);

    expect(coveredArea(mesh)).toBeCloseTo(box.width * box.height, 6);
    expect(liesIn(mesh, box)).toBe(true);
    for (let at = 0; at < mesh.points.length; at += 3) {
      const [x, y, z] = [mesh.points[at], mesh.points[at + 1], mesh.points[at + 2]];
      expect(z).toBeCloseTo(ground.heightAt(x / GRID, y / GRID) * GRID, 3);
    }
    expect(Math.max(...mesh.points.filter((_, at) => at % 3 === 2))).toBeCloseTo(GRID);
    expect(mesh.uvs[0]).toBeGreaterThanOrEqual(0);
    expect(mesh.uvs[0]).toBeLessThanOrEqual(1);
  });

  it('lays the same points as the board’s ground where a box lies on a square board', () => {
    const ground = hill();
    const board = squareGroundMesh({ x: 0, y: 0, width: 100, height: 100 }, ground, GRID);
    const onBoard = new Set<string>();
    for (let at = 0; at < board.points.length; at += 3) {
      onBoard.add([board.points[at], board.points[at + 1], board.points[at + 2]].join());
    }

    const mesh = groundMeshOver({ x: 0, y: 0, width: 50, height: 50 }, ground, GRID, GridType.SQUARE);

    for (let at = 0; at < mesh.points.length; at += 3) {
      expect(onBoard.has([mesh.points[at], mesh.points[at + 1], mesh.points[at + 2]].join())).toBe(true);
    }
  });

  it.each([
    ['flat-topped', GridType.HEX_VERTICAL],
    ['pointy-topped', GridType.HEX_HORIZONTAL],
  ])('covers a box reaching off a %s hex board once, its cells not lying over each other', (_name, gridType) => {
    const box = { x: -40, y: -20, width: 120, height: 90 };

    const mesh = groundMeshOver(box, hill(), GRID, gridType);

    expect(coveredArea(mesh)).toBeCloseTo(box.width * box.height, 3);
    expect(liesIn(mesh, box)).toBe(true);
  });
});
