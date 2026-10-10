import { segmentBlocks, segmentsAbove, TallSegment } from '@axe/domain/tabletop/los/segments';

const MAX_BUCKETS = 1 << 20;
const MAX_WALK_STEPS = 4096;

export class SegmentIndex {
  private readonly cols: number = 0;
  private readonly rows: number = 0;
  private readonly minX: number = 0;
  private readonly minY: number = 0;
  private readonly maxX: number = 0;
  private readonly maxY: number = 0;
  private readonly size: number = 1;
  private readonly buckets: readonly number[][] = [];
  private readonly seen: Int32Array = new Int32Array(0);
  private epoch = 0;

  constructor(
    readonly segments: readonly TallSegment[],
    cellSize: number
  ) {
    if (segments.length === 0) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const seg of segments) {
      minX = Math.min(minX, seg.x1, seg.x2);
      minY = Math.min(minY, seg.y1, seg.y2);
      maxX = Math.max(maxX, seg.x1, seg.x2);
      maxY = Math.max(maxY, seg.y1, seg.y2);
    }

    let size = Math.max(1, cellSize);
    let cols = Math.max(1, Math.ceil((maxX - minX) / size) + 1);
    let rows = Math.max(1, Math.ceil((maxY - minY) / size) + 1);
    while (cols * rows > MAX_BUCKETS) {
      size *= 2;
      cols = Math.max(1, Math.ceil((maxX - minX) / size) + 1);
      rows = Math.max(1, Math.ceil((maxY - minY) / size) + 1);
    }

    const buckets: number[][] = Array.from({ length: cols * rows }, () => []);
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const fromCol = Math.max(0, Math.floor((Math.min(seg.x1, seg.x2) - minX) / size));
      const toCol = Math.min(cols - 1, Math.floor((Math.max(seg.x1, seg.x2) - minX) / size));
      const fromRow = Math.max(0, Math.floor((Math.min(seg.y1, seg.y2) - minY) / size));
      const toRow = Math.min(rows - 1, Math.floor((Math.max(seg.y1, seg.y2) - minY) / size));
      for (let row = fromRow; row <= toRow; row++) {
        for (let col = fromCol; col <= toCol; col++) buckets[row * cols + col].push(i);
      }
    }

    this.minX = minX;
    this.minY = minY;
    this.maxX = maxX;
    this.maxY = maxY;
    this.size = size;
    this.cols = cols;
    this.rows = rows;
    this.buckets = buckets;
    this.seen = new Int32Array(segments.length);
  }

  /**
   * Whether a line of sight from one point and height to another passes every segment in the index.
   *
   * Only the buckets the line crosses are looked in, and each segment is tested at most once per
   * call.
   */
  clearBetween(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    if (this.segments.length === 0) return true;
    const epoch = ++this.epoch;
    let clear = true;
    this.walk(ax, ay, bx, by, (bucket) => {
      for (const i of bucket) {
        if (this.seen[i] === epoch) continue;
        this.seen[i] = epoch;
        if (!segmentBlocks(ax, ay, az, bx, by, bz, this.segments[i])) continue;
        clear = false;
        return false;
      }
      return true;
    });
    return clear;
  }

  private walk(ax: number, ay: number, bx: number, by: number, visit: (bucket: readonly number[]) => boolean): void {
    const dx = bx - ax;
    const dy = by - ay;
    const span = this.clip(ax, ay, dx, dy);
    if (!span) return;

    const startX = ax + dx * span.t0;
    const startY = ay + dy * span.t0;
    const length = span.t1 - span.t0;
    const runX = dx * length;
    const runY = dy * length;

    let col = this.clampCol(Math.floor((startX - this.minX) / this.size));
    let row = this.clampRow(Math.floor((startY - this.minY) / this.size));
    const stepCol = runX > 0 ? 1 : runX < 0 ? -1 : 0;
    const stepRow = runY > 0 ? 1 : runY < 0 ? -1 : 0;
    const deltaCol = stepCol === 0 ? Infinity : Math.abs(this.size / runX);
    const deltaRow = stepRow === 0 ? Infinity : Math.abs(this.size / runY);
    let nextCol = boundaryT(startX, runX, this.minX + col * this.size, this.size);
    let nextRow = boundaryT(startY, runY, this.minY + row * this.size, this.size);

    for (let step = 0; step < MAX_WALK_STEPS; step++) {
      if (!visit(this.buckets[row * this.cols + col])) return;
      if (nextCol < nextRow) {
        if (nextCol > 1) return;
        col += stepCol;
        nextCol += deltaCol;
      } else {
        if (nextRow > 1) return;
        row += stepRow;
        nextRow += deltaRow;
      }
      if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
    }
  }

  private clip(ax: number, ay: number, dx: number, dy: number): { t0: number; t1: number } | null {
    let t0 = 0;
    let t1 = 1;
    const edges: [number, number][] = [
      [-dx, ax - this.minX],
      [dx, this.maxX - ax],
      [-dy, ay - this.minY],
      [dy, this.maxY - ay],
    ];
    for (const [p, q] of edges) {
      if (p === 0) {
        if (q < 0) return null;
        continue;
      }
      const r = q / p;
      if (p < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
    return { t0, t1 };
  }

  private clampCol(col: number): number {
    return col < 0 ? 0 : col >= this.cols ? this.cols - 1 : col;
  }

  private clampRow(row: number): number {
    return row < 0 ? 0 : row >= this.rows ? this.rows - 1 : row;
  }
}

function boundaryT(start: number, run: number, cellStart: number, size: number): number {
  if (run === 0) return Infinity;
  return run > 0 ? (cellStart + size - start) / run : (cellStart - start) / run;
}

const HEIGHT_MEMO_LIMIT = 64;

/**
 * One index per eye height, since an eye above a wall has that wall taken out of its way.
 *
 * A table holds a handful of heights at most, and the walls only change when something that
 * stands still is moved, so the indexes outlive every repaint in between.
 */
export class SegmentIndexes {
  private readonly byHeight = new Map<number, SegmentIndex>();

  constructor(
    private readonly segments: readonly TallSegment[],
    private readonly cellSize: number
  ) {}

  /**
   * The index of the segments that still stand in the way of an eye at this height, built the first
   * time it is asked for and kept after.
   */
  above(eyeZ: number): SegmentIndex {
    const held = this.byHeight.get(eyeZ);
    if (held) return held;
    const built = new SegmentIndex(segmentsAbove(this.segments, eyeZ), this.cellSize);
    if (this.byHeight.size >= HEIGHT_MEMO_LIMIT) this.byHeight.clear();
    this.byHeight.set(eyeZ, built);
    return built;
  }
}
