import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement, DataElementAttribute } from '@axe/domain/data/data-element';
import { convertMoveLength, isLengthUnit, MoveUnit, parseMoveUnit } from '@axe/domain/tabletop/move/move-units';

export const DEFAULT_MOVE_RANGE_ELEMENT_NAMES = '移動,移動力,Speed,速度';
export const DEFAULT_CELL_DISTANCE = 1;
export const DEFAULT_CELL_DISTANCE_UNIT: MoveUnit = 'cell';

/** Splits the comma-separated names of the sheet fields that hold a piece's movement, trimming and dropping blanks. */
export function parseMoveRangeElementNames(names: string): string[] {
  return names
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

function amountOf(element: DataElement): number | null {
  const raw = element.isNumberResource ? element.currentValue : element.value;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const text = `${raw}`.trim();
  if (text.length === 0) return null;
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : null;
}

/**
 * How many cells a piece walks, from what its sheet says and what the table counts in.
 *
 * What the sheet says is measured against what one cell of the table stands for, and where
 * the two are written in different lengths - thirty feet on the sheet, a table ruled in
 * metres - the sheet is turned into the table's unit first. A table counted in cells is
 * measured the same way: a cell standing for half a cell makes three cells on the sheet six
 * on the table. A sheet with no unit anybody knows is taken to be in the table's own.
 *
 * A sheet written in cells on a table ruled in a length is read as cells, there being no
 * length to turn a cell into.
 */
export function moveCellsOf(
  character: GameCharacter,
  names: string,
  cellDistance: number,
  tableUnit: string = DEFAULT_CELL_DISTANCE_UNIT
): number | null {
  const root = character.rootDataElement;
  if (!root) return null;

  for (const name of parseMoveRangeElementNames(names)) {
    const element = DataElement.findElementByReference(root, name);
    if (!element) continue;
    const amount = amountOf(element);
    // A field that holds a dash where a number was meant is not an answer, so the next name
    // the table was given is asked instead of the whole question being given up on.
    if (amount === null) continue;
    return cellsFrom(amount, parseMoveUnit(element.getAttribute(DataElementAttribute.UNIT)), tableUnit, cellDistance);
  }
  return null;
}

/**
 * Added to a count before it is rounded down.
 *
 * A distance a binary fraction cannot hold exactly - three tenths walked in cells of a tenth -
 * divides out a hair under the whole number it is, and would be read as a cell short.
 */
const ROUNDING_ALLOWANCE = 1e-9;

function cellsFrom(amount: number, sheetUnit: MoveUnit | null, tableUnit: string, cellDistance: number): number {
  const ruledIn = parseMoveUnit(tableUnit);
  if (sheetUnit === 'cell' && isLengthUnit(ruledIn)) return Math.floor(amount);

  const measured =
    isLengthUnit(sheetUnit) && isLengthUnit(ruledIn) ? convertMoveLength(amount, sheetUnit, ruledIn) : amount;
  return cellDistance > 0 ? Math.floor(measured / cellDistance + ROUNDING_ALLOWANCE) : Math.floor(measured);
}
