import { DataElement, DataElementAttribute, DataElementFieldType } from '@axe/domain/data/data-element';

export interface SkillJudgementCandidate {
  cell: DataElement;
  rowName: string;
  colName: string;
  colLabel: string;
  cellLabel: string;
  distance: number;
}

export interface JudgementOptions {
  /** Gap cost added when crossing column i↔i+1; length = techColumns.length - 1. */
  gapCostsBetweenCols?: number[];
  loopHorizontal?: boolean;
  loopVertical?: boolean;
}

/**
 * The ticked (learned) skills in a skill table nearest to a target cell, closest first.
 *
 * The table view's judgement mode calls it when a cell is clicked, and lists the result with each
 * distance in a dialog from which a candidate can be sent to chat.
 *
 * Distance is the number of rows plus the number of columns between two cells, with each gap
 * crossed between columns adding its cost. With looping on, a table wraps around at its edges and
 * the shorter way counts. Only check cells in the given columns are considered, and at most
 * `maxCandidates` are returned.
 */
export function findJudgementCandidates(
  rows: DataElement[],
  columns: { name: string; label: string }[],
  targetRowIndex: number,
  targetColIndex: number,
  isChecked: (cell: DataElement) => boolean,
  maxCandidates = 5,
  options: JudgementOptions = {}
): SkillJudgementCandidate[] {
  const { gapCostsBetweenCols = [], loopHorizontal = false, loopVertical = false } = options;
  const candidates: SkillJudgementCandidate[] = [];

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    for (let ci = 0; ci < columns.length; ci++) {
      const { name: colName, label: colLabel } = columns[ci];
      const cell = row.children.find(
        (child) => child.name === colName && child.fieldType === DataElementFieldType.CHECK
      );
      if (!cell || !isChecked(cell)) continue;

      const rowDist = calcRowDistance(ri, targetRowIndex, rows.length, loopVertical);
      const colDist = calcColDistance(ci, targetColIndex, columns.length, gapCostsBetweenCols, loopHorizontal);
      const distance = rowDist + colDist;
      const cellLabel = cell.getAttribute(DataElementAttribute.CELL_TEXT).trim();

      candidates.push({ cell, rowName: row.name, colName, colLabel, cellLabel, distance });
    }
  }

  return candidates.sort((a, b) => a.distance - b.distance).slice(0, maxCandidates);
}

function calcRowDistance(fromIdx: number, toIdx: number, rowCount: number, loop: boolean): number {
  const diff = Math.abs(fromIdx - toIdx);
  if (!loop || rowCount <= 1) return diff;
  return Math.min(diff, rowCount - diff);
}

function calcColDistance(
  fromIdx: number,
  toIdx: number,
  colCount: number,
  gapCostsBetweenCols: number[],
  loop: boolean
): number {
  const minIdx = Math.min(fromIdx, toIdx);
  const maxIdx = Math.max(fromIdx, toIdx);

  let forwardDist = maxIdx - minIdx;
  for (let i = minIdx; i < maxIdx; i++) {
    forwardDist += gapCostsBetweenCols[i] ?? 0;
  }

  if (!loop || colCount <= 1) return forwardDist;

  let backwardDist = colCount - (maxIdx - minIdx);
  for (let i = 0; i < minIdx; i++) {
    backwardDist += gapCostsBetweenCols[i] ?? 0;
  }
  for (let i = maxIdx; i < colCount - 1; i++) {
    backwardDist += gapCostsBetweenCols[i] ?? 0;
  }

  return Math.min(forwardDist, backwardDist);
}
