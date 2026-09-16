import { CAP_BLEED, CapCell, SquareCap } from '@axe/domain/tabletop/terrain-batch/square-caps';
import { RunFace, WallRun } from '@axe/domain/tabletop/terrain-batch/wall-runs';

/** A brightness at a point across a surface, in pixels from its start. */
export interface ShadeStop {
  readonly at: number;
  readonly value: number;
}

/** How far two readings may differ and still be one shade. */
const SAME_SHADE = 0.0005;

/**
 * One block's readings over the stretch of a surface it covers, one reading a cell.
 *
 * Within a block the shade runs smoothly from the middle of one cell to the middle of the next, and
 * holds from the middle of the first and last cells out to the block's ends, which is how a block
 * drawn alone is shaded. Where one block meets the next the shade changes at once.
 */
function stretchStops(values: readonly number[], startPx: number, cellPx: number, into: ShadeStop[]): void {
  if (values.length === 0) return;
  into.push({ at: startPx, value: values[0] });
  values.forEach((value, index) => into.push({ at: startPx + (index + 0.5) * cellPx, value }));
  into.push({ at: startPx + values.length * cellPx, value: values[values.length - 1] });
}

/** The stops that change nothing dropped: a stop between two of the same shade, and a repeat at one point. */
function simplified(stops: readonly ShadeStop[]): ShadeStop[] {
  const out: ShadeStop[] = [];
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const before = out[out.length - 1];
    const after = stops[i + 1];
    if (before && Math.abs(before.value - stop.value) <= SAME_SHADE) {
      if (before.at === stop.at) continue;
      if (!after || Math.abs(after.value - stop.value) <= SAME_SHADE) continue;
    }
    out.push(stop);
  }
  return out;
}

/**
 * The shade across each row of a cap, row by row, measured from the corner of its box.
 *
 * @param valueOf how brightly one cell of a block is lit.
 */
export function capShadeRows(cap: SquareCap, gridSize: number, valueOf: (cell: CapCell) => number): ShadeStop[][] {
  const rows: ShadeStop[][] = [];
  for (let row = 0; row < cap.rows; row++) {
    const stops: ShadeStop[] = [];
    let col = 0;
    while (col < cap.cols) {
      const first = cap.cells[row * cap.cols + col];
      const values = [first ? valueOf(first) : 1];
      let end = col;
      while (first && end + 1 < cap.cols) {
        const next = cap.cells[row * cap.cols + end + 1];
        if (!next || next.identifier !== first.identifier) break;
        values.push(valueOf(next));
        end++;
      }
      stretchStops(values, CAP_BLEED + col * gridSize, gridSize, stops);
      col = end + 1;
    }
    rows.push(simplified(stops));
  }
  return rows;
}

/**
 * The shade along a run of wall, measured from its start.
 *
 * @param valuesOf how brightly each cell along one face is lit, from the end the run starts at.
 */
export function runShade(run: WallRun, valuesOf: (face: RunFace) => readonly number[]): ShadeStop[] {
  const stops: ShadeStop[] = [];
  for (const face of run.faces) {
    const values = valuesOf(face);
    stretchStops(values, face.offsetPx, face.lengthPx / Math.max(1, values.length), stops);
  }
  return simplified(stops);
}
