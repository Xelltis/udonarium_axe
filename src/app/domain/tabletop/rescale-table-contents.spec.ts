import { GameCharacter } from '@axe/domain/character/game-character';
import { GameTable } from '@axe/domain/tabletop/game-table';
import {
  clampCellPx,
  MAX_CELL_PX,
  MIN_CELL_PX,
  rescaleTableContents,
} from '@axe/domain/tabletop/rescale-table-contents';
import { Terrain } from '@axe/domain/tabletop/terrain';

describe('moving what is on a table when its cells change size', () => {
  let table: GameTable;
  let terrain: Terrain;
  let onTable: GameCharacter;
  let putAway: GameCharacter;

  beforeEach(() => {
    table = new GameTable();
    table.gridSize = 50;
    table.initialize();
    terrain = Terrain.create('壁', 2, 1, 3, '', '');
    terrain.location = { ...terrain.location, x: 100, y: 150 };
    terrain.posZ = 50;
    table.appendChild(terrain);
    onTable = GameCharacter.create('ゴブリン', 1, '');
    onTable.location = { ...onTable.location, name: 'table', x: 250, y: 50 };
    putAway = GameCharacter.create('控え', 1, '');
    putAway.location = { ...putAway.location, name: 'graveyard', x: 250, y: 50 };
  });

  afterEach(() => {
    for (const object of [terrain, onTable, putAway, table]) object.destroy();
  });

  it('keeps the table’s own pieces and the shared ones on the table to their cells', () => {
    rescaleTableContents(table, 50, 100, [onTable]);

    expect([terrain.location.x, terrain.location.y, terrain.posZ]).toEqual([200, 300, 100]);
    expect([onTable.location.x, onTable.location.y]).toEqual([500, 100]);
  });

  it('leaves sizes kept in cells as they were', () => {
    rescaleTableContents(table, 50, 100, []);

    expect([terrain.width, terrain.depth, terrain.height]).toEqual([2, 1, 3]);
  });

  it('leaves a piece that is not out on the table where it is', () => {
    rescaleTableContents(table, 50, 100, [putAway]);

    expect([putAway.location.x, putAway.location.y]).toEqual([250, 50]);
  });

  it('moves a piece listed twice once', () => {
    rescaleTableContents(table, 50, 25, [onTable, onTable]);

    expect([onTable.location.x, onTable.location.y]).toEqual([125, 25]);
  });

  it('does nothing for a size that is not a size', () => {
    rescaleTableContents(table, 0, 100, [onTable]);
    rescaleTableContents(table, 50, Number.NaN, [onTable]);

    expect([onTable.location.x, onTable.location.y]).toEqual([250, 50]);
  });
});

describe('the cell sizes a table may take', () => {
  it('rounds to whole px within the bounds', () => {
    expect(clampCellPx(70.4)).toBe(70);
    expect(clampCellPx(4)).toBe(MIN_CELL_PX);
    expect(clampCellPx(9999)).toBe(MAX_CELL_PX);
    expect(clampCellPx(Number.NaN)).toBe(MIN_CELL_PX);
  });
});
