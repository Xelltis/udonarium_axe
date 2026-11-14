import { GridType } from '@axe/domain/tabletop/game-table';
import { GROUND_CHUNK_SAMPLE_COUNT } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { FLAT_GROUND, groundSurfaceOf } from '@axe/domain/tabletop/ground/ground-surface';
import { squareGroundMesh } from '@axe/domain/tabletop/world/ground-mesh';
import { boardShapeOf } from '@axe/domain/tabletop/world/table-world';
import {
  boardGeometry,
  boxOverGround,
  capGeometry,
  griddedTops,
  gridOverBoard,
  groundGeometry,
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

/** The way each triangle of a shape faces from its front, in the scene's axes: east, up and south. */
function frontsOf(positions: ArrayLike<number>): { x: number; y: number; z: number }[] {
  const fronts: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < positions.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = Array.from({ length: 9 }, (_, at) => positions[i + at]);
    const [ux, uy, uz, vx, vy, vz] = [bx - ax, by - ay, bz - az, cx - ax, cy - ay, cz - az];
    fronts.push({ x: uy * vz - uz * vy, y: uz * vx - ux * vz, z: ux * vy - uy * vx });
  }
  return fronts;
}

describe('the side of a face its front is, which a sheet is drawn from', () => {
  it('faces each side of a block out from it, sloped or not', () => {
    // The sides of a block from (100, 50) to (200, 100), left to right as they are seen from outside.
    const sides = [
      { ax: 200, ay: 50, bx: 100, by: 50, out: { x: 0, z: -1 } },
      { ax: 200, ay: 100, bx: 200, by: 50, out: { x: 1, z: 0 } },
      { ax: 100, ay: 100, bx: 200, by: 100, out: { x: 0, z: 1 } },
      { ax: 100, ay: 50, bx: 100, by: 100, out: { x: -1, z: 0 } },
    ];
    const profile = [
      { at: 0, heightPx: 40 },
      { at: 0.5, heightPx: 100 },
      { at: 1, heightPx: 60 },
    ];

    for (const { out, ...side } of sides) {
      for (const sloped of [false, true]) {
        const wall = wallGeometry({ ...face, ...side, basePx: 0, topPx: 100, ...(sloped ? { profile } : {}) });
        const fronts = frontsOf(wall.getAttribute('position').array);
        expect(fronts.length).toBe(sloped ? 4 : 2);
        for (const front of fronts) {
          const length = Math.hypot(front.x, front.y, front.z);
          expect(front.x / length).toBeCloseTo(out.x, 6);
          expect(front.y / length).toBeCloseTo(0, 6);
          expect(front.z / length).toBeCloseTo(out.z, 6);
        }
      }
    }
  });

  it('faces a flat face down whichever way its outline runs round, so a top is seen from its back', () => {
    const outline = [
      { x: 100, y: 50 },
      { x: 200, y: 50 },
      { x: 200, y: 100 },
      { x: 100, y: 100 },
    ];
    const hex = Array.from({ length: 6 }, (_, corner) => ({
      x: 300 + 50 * Math.cos((corner * Math.PI) / 3),
      y: 300 + 50 * Math.sin((corner * Math.PI) / 3),
    }));

    for (const round of [outline, [...outline].reverse(), hex, [...hex].reverse()]) {
      for (const facing of ['up', 'down'] as const) {
        const cap = capGeometry({ ...face, outline: round, zPx: 30, facing });
        const fronts = frontsOf(cap.getAttribute('position').array);
        expect(fronts.length).toBe(round.length - 2);
        for (const front of fronts) expect(front.y).toBeLessThan(0);
      }
    }
  });
});

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

  it('wears its picture turned on it where the places of its corners are given', () => {
    const wall = wallGeometry({
      ...face,
      ax: 0,
      ay: 0,
      bx: 50,
      by: 0,
      basePx: 10,
      topPx: 60,
      uvs: [
        { x: 0, y: 1 },
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
    });

    const positions = wall.getAttribute('position').array;
    const uvs = wall.getAttribute('uv').array;
    const placeOf = (x: number, height: number) => {
      for (let i = 0; i < positions.length / 3; i++) {
        if (positions[i * 3] === x && positions[i * 3 + 1] === height) return [uvs[i * 2], uvs[i * 2 + 1]];
      }
      return null;
    };
    expect(placeOf(0, 10)).toEqual([0, 1]);
    expect(placeOf(50, 10)).toEqual([0, 0]);
    expect(placeOf(50, 60)).toEqual([1, 0]);
    expect(placeOf(0, 60)).toEqual([1, 1]);
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
      ground: null,
      floorGround: null,
      floorSurface: FLAT_GROUND,
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

  it('cuts the grid over a hex board to the board’s cells, and lays it over the whole box of a square one', () => {
    const shape = boardShapeOf(3, 2, 50, GridType.HEX_VERTICAL);
    const box = { x: -10, y: -20, width: 200, height: 150 };

    const hex = gridOverBoard(shape.hexes, box, 0.15);
    const square = gridOverBoard(null, box, 0.15);

    expect(hex.getAttribute('position').count).toBe(6 * 4 * 3);
    expect(
      Array.from(hex.getAttribute('position').array)
        .filter((_, i) => i % 3 === 1)
        .every((y) => Math.abs(y - 0.15) < 1e-6)
    ).toBe(true);
    expect(square.getAttribute('position').count).toBe(4);
  });

  it('carries how much of each kind of ground covers each point of painted ground, and nothing on ground that is not', () => {
    const heights = new Int16Array(GROUND_CHUNK_SAMPLE_COUNT);
    const paint = new Uint8Array(GROUND_CHUNK_SAMPLE_COUNT * 4);
    paint.set([0, 15, 0, 0], 0);
    const box = { x: 0, y: 0, width: 100, height: 50 };

    const painted = groundGeometry(squareGroundMesh(box, groundSurfaceOf([{ cx: 0, cy: 0, heights, paint }]), 50));
    const bare = groundGeometry(squareGroundMesh(box, groundSurfaceOf([{ cx: 0, cy: 0, heights, paint: null }]), 50));

    expect(Array.from(painted.getAttribute('paint').array.slice(0, 4))).toEqual([0, 1, 0, 0]);
    expect(bare.getAttribute('paint')).toBeUndefined();
  });

  it('lifts a part of the floor’s mesh off the ground by as much, wearing a picture over a box', () => {
    const mesh = {
      points: new Float32Array([60, 0, 10, 90, 0, 20, 60, 50, 30]),
      triangles: new Uint32Array([0, 1, 2]),
    };

    const geometry = boxOverGround(mesh, { x: 60, y: 0, width: 30, height: 50 }, 2);

    const positions = geometry.getAttribute('position');
    expect([positions.getX(1), positions.getY(1), positions.getZ(1)]).toEqual([90, 22, 0]);
    const uvs = geometry.getAttribute('uv');
    expect([uvs.getX(1), uvs.getY(1)]).toEqual([1, 1]);
    expect([uvs.getX(2), uvs.getY(2)]).toEqual([0, 0]);
    expect(Array.from(geometry.index!.array)).toEqual([0, 1, 2]);
  });
});
