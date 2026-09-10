import { terrainBlocksMovement } from '@axe/domain/tabletop/move/blocked-cells';
import { DoorStyle, Terrain, TerrainViewState } from '@axe/domain/tabletop/terrain';

function block(): Terrain {
  return Terrain.create('block', 1, 1, 1, '', '');
}

describe('terrainBlocksMovement', () => {
  it('stops a piece at a wall', () => {
    const wall = block();
    wall.mode = TerrainViewState.ALL;

    expect(terrainBlocksMovement(wall)).toBe(true);
  });

  it('lets a piece over a floor laid flat', () => {
    const floor = block();
    floor.mode = TerrainViewState.FLOOR;

    expect(terrainBlocksMovement(floor)).toBe(false);
  });

  it('stops a piece at a flat block too sheer to get up', () => {
    const cliff = block();
    cliff.mode = TerrainViewState.FLOOR;
    cliff.blocksClimb = true;

    expect(terrainBlocksMovement(cliff)).toBe(true);
  });

  it('lets a piece through a door standing open, sheer or not', () => {
    const door = block();
    door.mode = TerrainViewState.ALL;
    door.blocksClimb = true;
    door.doorStyle = DoorStyle.SWING;
    door.isDoorOpen = true;

    expect(terrainBlocksMovement(door)).toBe(false);
  });

  it('lets a piece past anything hung on a wall of the table', () => {
    const shelf = block();
    shelf.blocksClimb = true;
    shelf.location.surface = 'north-wall';

    expect(terrainBlocksMovement(shelf)).toBe(false);
  });
});
