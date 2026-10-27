import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, cellGridOf, cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { brightestCleared, CoverLighting, terrainCoverOf } from '@axe/domain/tabletop/terrain-cover';
import { SceneViewer } from '@axe/domain/tabletop/vision-scene';

const GRID = cellGridOf(10, 10, 50, GridType.SQUARE);

/** No scene at all: every cell comes out as bright as the bare table, which is full brightness. */
const UNLIT: CoverLighting = {
  scene: null,
  seenScene: () => null,
  viewer: { userId: 'u', isGameMaster: false, visionOwnerIds: [], partyIds: [] } as SceneViewer,
  blocking: null,
  visible: null,
  litExplored: null,
};

describe('the cover of a terrain', () => {
  it('tells the cells the party has reached from the rest', () => {
    const explored = new CellBits(cellCount(GRID));
    explored.set(cellIndexAt(GRID, 125, 125));

    const cover = terrainCoverOf(UNLIT, GRID, explored, { x: 100, y: 100, rotate: 0, cols: 2, rows: 1 });

    expect(cover).toEqual(expect.objectContaining({ cols: 2, rows: 1, cleared: [true, false], brightness: [1, 1] }));
  });

  it('counts every cell as reached where there is no record of what was', () => {
    const cover = terrainCoverOf(UNLIT, GRID, null, { x: 100, y: 100, rotate: 0, cols: 2, rows: 2 });

    expect(cover.cleared).toEqual([true, true, true, true]);
  });

  it('counts the part of a block hanging over the edge of the table as reached', () => {
    const explored = new CellBits(cellCount(GRID));

    const cover = terrainCoverOf(UNLIT, GRID, explored, { x: 450, y: 100, rotate: 0, cols: 2, rows: 1 });

    expect(cover.cleared).toEqual([false, true]);
  });

  it('is as bright as the brightest cell the party has reached', () => {
    expect(brightestCleared({ cols: 3, rows: 1, cleared: [true, false, true], brightness: [0.2, 0.9, 0.5] })).toBe(0.5);
    expect(brightestCleared({ cols: 1, rows: 1, cleared: [false], brightness: [0.9] })).toBe(0);
  });
});
