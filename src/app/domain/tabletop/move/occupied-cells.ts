import { GameCharacter } from '@axe/domain/character/game-character';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, CellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import { cellPxOf, forEachCellCovered } from '@axe/domain/tabletop/move/move-grid';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';

/**
 * The ground the pieces already standing on the table take up.
 *
 * A piece covers as many cells as it is wide, so a golem standing three across leaves no
 * room beside itself. The piece being moved is left out: the cell it is on is where it
 * started from. On a grid of squares, a piece takes up every square it covers a cell of.
 */
export function occupiedCells(
  grid: CellGrid,
  characters: readonly GameCharacter[],
  exceptIdentifier: string
): CellBits {
  const bits = new CellBits(cellCount(grid));
  if (grid.sizePx <= 0) return bits;

  for (const character of characters) {
    if (character.identifier === exceptIdentifier) continue;
    if (!character.isVisibleOnTable || surfaceOf(character) !== 'floor') continue;
    const span = Math.max(1, character.size) * cellPxOf(grid);
    const { x, y } = character.location;
    forEachCellCovered(grid, x, y, x + span - 1, y + span - 1, (cell) => bits.set(cell));
  }
  return bits;
}
