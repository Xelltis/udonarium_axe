import { BlockSide } from '@axe/domain/tabletop/terrain-shade';

/** One upright face of a block on a square board, as the walls drawn together see it. */
export interface SquareFace {
  readonly identifier: string;
  readonly side: BlockSide;
  /** Where the face starts on the table, at the end its picture is laid from: west along the north and south, south along the west and east. */
  readonly startX: number;
  readonly startY: number;
  readonly lengthPx: number;
  readonly heightPx: number;
  /** What the face is drawn with; faces drawn with different pictures are never one piece. */
  readonly look: string;
}

/** One face within a run, measured along the run from its start. */
export interface RunFace {
  readonly identifier: string;
  readonly offsetPx: number;
  readonly lengthPx: number;
}

/** Faces of one side, height and picture lying end to end along one line, drawn as one piece. */
export interface WallRun {
  readonly key: string;
  readonly side: BlockSide;
  readonly startX: number;
  readonly startY: number;
  readonly lengthPx: number;
  readonly heightPx: number;
  readonly look: string;
  /** A block whose face the run wears, which is the face of every block in it. */
  readonly wearer: string;
  /** The faces in the run, from its start. */
  readonly faces: readonly RunFace[];
}

/** How far two positions may differ and still be read as the same, in pixels. */
const TOLERANCE = 1e-6;

/** How far along its line a face starts, counted the way its picture is laid. */
function along(face: SquareFace): number {
  return face.side === 'north' || face.side === 'south' ? face.startX : -face.startY;
}

/** Which line a face lies on, as the position across it. */
function across(face: SquareFace): number {
  return face.side === 'north' || face.side === 'south' ? face.startY : face.startX;
}

/**
 * Joins faces lying end to end into runs.
 *
 * Faces join when they turn the same way, stand on the same line, reach the same height, wear the
 * same picture and meet without a gap. A run is one surface for the browser to keep however many
 * faces it is made of, and it remembers where each of them lies, so each can still be lit and
 * picked out on its own.
 */
export function wallRunsOf(faces: readonly SquareFace[]): WallRun[] {
  const lines = new Map<string, SquareFace[]>();
  for (const face of faces) {
    const key = `${face.side}|${Math.round(across(face) * 1000)}|${face.heightPx}|${face.look}`;
    const line = lines.get(key);
    if (line) line.push(face);
    else lines.set(key, [face]);
  }

  const runs: WallRun[] = [];
  for (const line of lines.values()) {
    line.sort((a, b) => along(a) - along(b));
    let current: SquareFace[] = [];
    const close = () => {
      if (current.length === 0) return;
      const first = current[0];
      const start = along(first);
      runs.push({
        key: `${first.side}:${first.startX},${first.startY}:${first.heightPx}`,
        side: first.side,
        startX: first.startX,
        startY: first.startY,
        lengthPx: along(current[current.length - 1]) + current[current.length - 1].lengthPx - start,
        heightPx: first.heightPx,
        look: first.look,
        wearer: first.identifier,
        faces: current.map((face) => ({
          identifier: face.identifier,
          offsetPx: along(face) - start,
          lengthPx: face.lengthPx,
        })),
      });
      current = [];
    };
    for (const face of line) {
      const last = current[current.length - 1];
      if (last && Math.abs(along(last) + last.lengthPx - along(face)) > TOLERANCE) close();
      current.push(face);
    }
    close();
  }
  return runs;
}

/** The face under a point along a run, measured from the run's start; null past either end. */
export function runFaceAt(run: WallRun, offsetPx: number): RunFace | null {
  for (const face of run.faces) {
    if (offsetPx >= face.offsetPx && offsetPx < face.offsetPx + face.lengthPx) return face;
  }
  return null;
}
