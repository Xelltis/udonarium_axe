import { GROUND_CHUNK_SAMPLE_COUNT, GROUND_CHUNK_SAMPLES } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { groundSurfaceOf } from '@axe/domain/tabletop/ground/ground-surface';
import { hexGroundMesh, squareGroundMesh } from '@axe/domain/tabletop/world/ground-mesh';

const GRID = 50;

/** Ground raised a cell at one sample, a half cell across and down from the board's corner. */
function hill() {
  const heights = new Int16Array(GROUND_CHUNK_SAMPLE_COUNT);
  heights[1 * GROUND_CHUNK_SAMPLES + 1] = 64;
  return groundSurfaceOf([{ cx: 0, cy: 0, heights, paint: null }]);
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

  it('colours the points over painted samples, and leaves the mesh unpainted where nothing is', () => {
    const heights = new Int16Array(GROUND_CHUNK_SAMPLE_COUNT);
    const paint = new Uint8Array(GROUND_CHUNK_SAMPLE_COUNT * 4);
    paint.set([0, 0, 15, 0], (1 * GROUND_CHUNK_SAMPLES + 1) * 4);
    const painted = groundSurfaceOf([{ cx: 0, cy: 0, heights, paint }]);

    expect(painted.isFlat).toBe(false);
    const mesh = squareGroundMesh({ x: 0, y: 0, width: 100, height: 50 }, painted, GRID);
    const rock = 1 * 5 + 1;
    expect([...mesh.paint!.subarray(rock * 4, rock * 4 + 4)].map((value) => Math.round(value * 100) / 100)).toEqual([
      0.5, 0.5, 0.5, 0.85,
    ]);
    expect(mesh.paint![3]).toBe(0);
    expect(squareGroundMesh({ x: 0, y: 0, width: 100, height: 50 }, hill(), GRID).paint).toBeNull();
  });
});
