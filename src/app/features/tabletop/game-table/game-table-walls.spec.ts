import { GameTable } from '@axe/domain/tabletop/game-table';
import { WALL_SIDES } from '@axe/features/tabletop/game-table/game-table-walls';

describe('game table walls', () => {
  it('lists the four walls north, south, west, east, with their labels', () => {
    expect(WALL_SIDES.map((side) => side.surface)).toEqual(['north-wall', 'south-wall', 'west-wall', 'east-wall']);
    expect(WALL_SIDES.map((side) => side.labelPrefix)).toEqual(['N', 'S', 'W', 'E']);
    expect(WALL_SIDES.map((side) => side.along)).toEqual(['width', 'width', 'depth', 'depth']);
  });

  it('reads which walls a table shows', () => {
    const table = {
      showNorthWall: true,
      showSouthWall: false,
      showWestWall: true,
      showEastWall: false,
    } as GameTable;
    expect(WALL_SIDES.map((side) => side.shown(table))).toEqual([true, false, true, false]);
  });
});
