import { depthOf, eyeFrameOf, viewDepthOf } from '@axe/domain/tabletop/first-person/first-person-clip';
import { eyePoseAt, FirstPersonPose } from '@axe/domain/tabletop/first-person/first-person-lattice';
import { firstPersonRoofOf } from '@axe/domain/tabletop/first-person/first-person-roof';
import {
  FirstPersonPlaneQuad,
  FirstPersonQuad,
  firstPersonScene,
  FirstPersonWallQuad,
} from '@axe/domain/tabletop/first-person/first-person-scene';
import { firstPersonWorldOf } from '@axe/domain/tabletop/first-person/first-person-world';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCenterOf, CellGrid, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { describe, expect, it } from 'vitest';

const GRID = 50;
const NEAR = 2;
const DEPTH = 6 * GRID;

function block(col: number, row: number, width: number, depth: number, height = 1): Terrain {
  const terrain = Terrain.create('壁', width, depth, height, 'stone', 'slab');
  terrain.location = { name: 'table', x: col * GRID, y: row * GRID };
  return terrain;
}

function tableOf(gridType: GridType) {
  return { width: 10, height: 10, gridSize: GRID, gridType, imageIdentifier: 'floor-picture' };
}

function sceneOf(
  gridType: GridType,
  terrains: Terrain[],
  pose: FirstPersonPose,
  seen: CellBits | null = null
): { quads: FirstPersonQuad[]; grid: CellGrid } {
  const grid = cellGridOf(10, 10, GRID, gridType);
  const world = firstPersonWorldOf(tableOf(gridType), terrains);
  return { quads: firstPersonScene({ world, grid, pose, seen, depthPx: DEPTH, nearPx: NEAR }), grid };
}

function walls(quads: FirstPersonQuad[]): FirstPersonWallQuad[] {
  return quads.filter((quad): quad is FirstPersonWallQuad => quad.kind === 'wall');
}

function planes(quads: FirstPersonQuad[], kind: FirstPersonPlaneQuad['kind']): FirstPersonPlaneQuad[] {
  return quads.filter((quad): quad is FirstPersonPlaneQuad => quad.kind === kind);
}

describe('firstPersonScene on squares', () => {
  const eye = eyePoseAt({ x: 4.5 * GRID, y: 7.5 * GRID }, 0, 25, GRID);

  function corridor(): { left: Terrain; right: Terrain } {
    return { left: block(3, 1, 1, 8), right: block(5, 1, 1, 8) };
  }

  it('draws the sides of a corridor that face the eye, and not their backs', () => {
    const { left, right } = corridor();

    const ids = walls(sceneOf(GridType.SQUARE, [left, right], eye).quads).map((wall) => wall.id);

    expect(ids).toContain(`${left.identifier}:east`);
    expect(ids).toContain(`${right.identifier}:west`);
    expect(ids).not.toContain(`${left.identifier}:west`);
    expect(ids).not.toContain(`${right.identifier}:east`);
    expect(ids).not.toContain(`${left.identifier}:north`);
  });

  it('cuts a wall that runs on past the eye at the eye, and keeps the picture where it was', () => {
    const { left, right } = corridor();

    const side = walls(sceneOf(GridType.SQUARE, [left, right], eye).quads).find(
      (wall) => wall.id === `${left.identifier}:east`
    )!;

    expect(side.fullLength).toBeCloseTo(8 * GRID);
    expect(side.length).toBeLessThan(side.fullLength);
    expect(side.uStart).toBeGreaterThan(0);
    expect(side.uStart + side.length).toBeCloseTo(side.fullLength);
    expect(depthOf(eyeFrameOf(eye), { x: side.x, y: side.y })).toBeCloseTo(NEAR);
  });

  it('tells each face which cell of ground it is looked at across', () => {
    const { left, right } = corridor();

    const { quads, grid } = sceneOf(GridType.SQUARE, [left, right], eye);

    for (const floor of planes(quads, 'floor')) expect(floor.id).toBe(`floor:${floor.cell}`);
    const side = walls(quads).find((wall) => wall.id === `${left.identifier}:east`)!;
    expect(side.cell % grid.cols).toBe(4);
  });

  it('leaves out what stands behind the eye', () => {
    const behind = block(3, 9, 3, 1);

    expect(walls(sceneOf(GridType.SQUARE, [behind], eye).quads)).toHaveLength(0);
  });

  it('never keeps a corner of anything behind the near plane', () => {
    const { left, right } = corridor();
    const frame = eyeFrameOf(eye);

    const { quads } = sceneOf(GridType.SQUARE, [left, right, block(4, 3, 1, 1, 0.3)], eye);

    for (const quad of quads) {
      if (quad.kind === 'wall') {
        expect(depthOf(frame, { x: quad.x, y: quad.y })).toBeGreaterThanOrEqual(NEAR - 1e-9);
      } else {
        for (const point of quad.polygon) expect(depthOf(frame, point)).toBeGreaterThanOrEqual(NEAR - 1e-9);
      }
    }
  });

  describe('a camera tipped up or down', () => {
    /** The view of a 1280 by 800 screen opens about 32° above and below its middle. */
    const HALF_HEIGHT_TAN = 400 / 640;

    function cornersOf(quad: FirstPersonQuad): { x: number; y: number; z: number }[] {
      if (quad.kind !== 'wall') return quad.polygon.map((point) => ({ ...point, z: quad.zPx }));
      const turn = (quad.angle * Math.PI) / 180;
      const along = (u: number) => ({ x: quad.x + Math.cos(turn) * u, y: quad.y + Math.sin(turn) * u });
      if (quad.cut?.outline) return quad.cut.outline.map((point) => ({ ...along(point.u), z: point.z }));
      const low = quad.cut?.basePx ?? quad.basePx;
      const high = quad.cut?.topPx ?? quad.basePx + quad.heightPx;
      return [0, quad.length].flatMap((u) => [
        { ...along(u), z: low },
        { ...along(u), z: high },
      ]);
    }

    function tippedScene(gridType: GridType, terrains: Terrain[], pitch: number): FirstPersonQuad[] {
      const grid = cellGridOf(10, 10, GRID, gridType);
      const world = firstPersonWorldOf(tableOf(gridType), terrains);
      return firstPersonScene({
        world,
        grid,
        pose: { ...eye, pitch },
        seen: null,
        depthPx: DEPTH,
        nearPx: NEAR,
        halfHeightTan: HALF_HEIGHT_TAN,
      });
    }

    for (const gridType of [GridType.SQUARE, GridType.HEX_VERTICAL, GridType.NONE]) {
      for (const pitch of [60, -60]) {
        it(`never keeps a corner behind the camera on a ${GridType[gridType]} table tipped ${pitch}°`, () => {
          const tall = [block(3, 5, 1, 4, 3), block(5, 5, 1, 4, 3), block(4, 3, 1, 1, 0.3)];
          const frame = eyeFrameOf({ ...eye, pitch });

          const quads = tippedScene(gridType, tall, pitch);

          expect(quads.length).toBeGreaterThan(0);
          for (const quad of quads) {
            for (const corner of cornersOf(quad)) {
              expect(viewDepthOf(frame, corner, corner.z)).toBeGreaterThanOrEqual(NEAR - 1e-6);
            }
          }
        });
      }
    }

    it('cuts a wall the eye stands beside on a slant as it looks up', () => {
      const tall = [block(3, 5, 1, 4, 3), block(5, 5, 1, 4, 3)];

      const cut = walls(tippedScene(GridType.SQUARE, tall, 60)).filter((wall) => wall.cut?.outline);

      expect(cut.length).toBeGreaterThan(0);
    });

    it('keeps the floor behind the feet in view while it looks nearly straight down, which a level camera leaves out', () => {
      const grid = cellGridOf(10, 10, GRID, GridType.SQUARE);
      const behind = `floor:${cellIndexOf(grid, 4, 8)}`;

      expect(planes(sceneOf(GridType.SQUARE, [], eye).quads, 'floor').map((floor) => floor.id)).not.toContain(behind);
      expect(planes(tippedScene(GridType.SQUARE, [], -85), 'floor').map((floor) => floor.id)).toContain(behind);
    });
  });

  it('draws only what the eye can see', () => {
    const { left, right } = corridor();
    const grid = cellGridOf(10, 10, GRID, GridType.SQUARE);
    const seen = new CellBits(100);
    for (let row = 1; row <= 7; row++) seen.set(cellIndexOf(grid, 4, row));

    const { quads } = sceneOf(GridType.SQUARE, [left, right], eye, seen);

    expect(
      walls(quads)
        .map((wall) => wall.id)
        .sort()
    ).toEqual([`${left.identifier}:east`, `${right.identifier}:west`].sort());
    expect(
      planes(quads, 'floor')
        .map((floor) => floor.id)
        .sort()
    ).toEqual([1, 2, 3, 4, 5, 6, 7].map((row) => `floor:${cellIndexOf(grid, 4, row)}`).sort());
  });

  it('draws nothing where nothing is seen', () => {
    const { left, right } = corridor();

    expect(sceneOf(GridType.SQUARE, [left, right], eye, new CellBits(100)).quads).toHaveLength(0);
  });

  it('shows the lid of a block the eye looks down on, and not of one it looks up at', () => {
    const low = block(4, 3, 1, 1, 0.3);
    const tall = block(4, 2, 1, 1, 1);

    const ids = planes(sceneOf(GridType.SQUARE, [low, tall], eye).quads, 'cap').map((cap) => cap.id);

    expect(ids).toContain(`${low.identifier}:top`);
    expect(ids).not.toContain(`${tall.identifier}:top`);
  });

  it('roofs the ground walls shut in at the height of the roof, and leaves the sky open over the rest', () => {
    const room = [block(2, 2, 5, 1), block(2, 8, 5, 1), block(2, 3, 1, 5), block(6, 3, 1, 5)];
    const inside = eyePoseAt({ x: 4.5 * GRID, y: 7.5 * GRID }, 0, 25, GRID);
    const grid = cellGridOf(10, 10, GRID, GridType.SQUARE);
    const world = firstPersonWorldOf(tableOf(GridType.SQUARE), room);
    const roof = firstPersonRoofOf(grid, room, world);

    const quads = firstPersonScene({ world, grid, pose: inside, seen: null, depthPx: DEPTH, nearPx: NEAR, roof });
    const roofed = planes(quads, 'ceiling');

    expect(roofed.length).toBeGreaterThan(0);
    expect(roofed.every((ceiling) => ceiling.zPx === GRID && ceiling.facing === 'down')).toBe(true);
    expect(roofed.every((ceiling) => roof!.cells.get(ceiling.cell))).toBe(true);
    expect(planes(sceneOf(GridType.SQUARE, [], eye).quads, 'ceiling')).toHaveLength(0);
  });

  it('lays the floor picture over the floor', () => {
    const floor = planes(sceneOf(GridType.SQUARE, [], eye).quads, 'floor')[0];

    expect(floor.image).toBe('floor-picture');
    expect(floor.frame).toEqual({ x: 0, y: 0, width: 10 * GRID, height: 10 * GRID, image: 'floor-picture' });
  });

  it('names what it draws the same way each time', () => {
    const { left, right } = corridor();

    const first = sceneOf(GridType.SQUARE, [left, right], eye).quads.map((quad) => quad.id);
    const again = sceneOf(GridType.SQUARE, [left, right], eye).quads.map((quad) => quad.id);

    expect(again).toEqual(first);
  });
});

describe('firstPersonScene on hexes', () => {
  it('shows the faces of a hex block ahead that turn towards the eye', () => {
    const grid = cellGridOf(10, 10, GRID, GridType.HEX_VERTICAL);
    const centre = cellCenterOf(grid, cellIndexOf(grid, 4, 2));
    const hex = Terrain.create('柱', 1, 1, 1, 'stone', 'slab');
    hex.location = { name: 'table', x: centre.x - GRID / 2, y: centre.y - GRID / 2 };
    const standing = cellCenterOf(grid, cellIndexOf(grid, 4, 6));
    const eye = eyePoseAt(standing, 0, 25, GRID);

    const shown = walls(sceneOf(GridType.HEX_VERTICAL, [hex], eye).quads).filter(
      (wall) => wall.terrain === hex.identifier
    );

    expect(shown).toHaveLength(3);
  });
});
