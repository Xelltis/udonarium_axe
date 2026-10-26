import { GameCharacter } from '@axe/domain/character/game-character';
import { allianceOf } from '@axe/domain/party/party-alliance';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { moveGridOf } from '@axe/domain/tabletop/move/move-grid';
import { buildReach, ReachInputs } from '@axe/domain/tabletop/move/reach-build';
import { resolveRoomRules } from '@axe/domain/tabletop/room-rules';

const GRID_PX = 50;

describe('building a reach from what was read of the board', () => {
  let table: GameTable;
  let piece: GameCharacter;

  beforeEach(() => {
    table = new GameTable('reach-build-table');
    table.width = 10;
    table.height = 10;
    table.gridSize = GRID_PX;
    table.initialize();
    piece = GameCharacter.create('walker', 1, '');
    piece.location.x = 0;
    piece.location.y = 0;
  });

  afterEach(() => {
    piece.destroy();
    table.destroy();
  });

  function inputs(more: Partial<ReachInputs> = {}): ReachInputs {
    const grid = moveGridOf(table);
    const total = cellCount(grid);
    return {
      character: piece,
      table,
      rules: resolveRoomRules(null, table),
      grid,
      start: cellIndexAt(grid, GRID_PX / 2, GRID_PX / 2),
      walk: 2,
      zones: null,
      closed: { blocked: new CellBits(total), leapt: new CellBits(total) },
      heights: new Float64Array(total),
      standingPx: 0,
      standing: [piece],
      inTheWay: [],
      allied: allianceOf([]),
      dearGround: () => null,
      ...more,
    };
  }

  const at = (col: number, row: number) => cellIndexAt(moveGridOf(table), (col + 0.5) * GRID_PX, (row + 0.5) * GRID_PX);

  it('reaches as far as the walk across open ground, and no further', () => {
    const reach = buildReach(inputs());

    expect(reach.view.cells.get(at(2, 0))).toBe(true);
    expect(reach.view.cells.get(at(3, 0))).toBe(false);
    expect(reach.start).toBe(at(0, 0));
  });

  it('keeps out of a cell the terrain closes', () => {
    const shut = inputs();
    shut.closed.blocked.set(at(1, 0));
    shut.closed.leapt.set(at(1, 0));

    expect(buildReach(shut).view.cells.get(at(1, 0))).toBe(false);
  });

  it('asks what the ground charges only of a piece that pays for the ground', () => {
    const dearGround = vi.fn(() => null);
    piece.moveMode = 'fly';

    buildReach(inputs({ dearGround }));

    expect(dearGround).not.toHaveBeenCalled();
  });
});
