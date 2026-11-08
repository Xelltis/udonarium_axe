import { GROUND_SAMPLES_PER_CELL } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { GroundSurface } from '@axe/domain/tabletop/ground/ground-surface';
import { TallSegment } from '@axe/domain/tabletop/los/segments';

/** The steps the ground is read in for sight, in cells: a rise less than this stops nothing. */
const SIGHT_STEP_CELLS = 0.25;
/**
 * How far each wall reaches past its ends, in table pixels. The squares meet under the middles of
 * the cells, so a look from one middle to another along a row runs exactly through the joints of
 * the walls across it, and walls that only met there would let it through.
 */
const JOINT_OVERLAP_PX = 0.01;

/**
 * The raised ground as walls that stop sight and light, each as high as the ground stands on its
 * higher side: the board is read in squares of half a cell, each at the height of its middle rounded
 * to a quarter of a cell, and a wall stands wherever two squares side by side differ. An eye lower
 * than a wall's top does not see past it; one higher sees over, as it sees over a block. Ground that
 * stands no higher than the board makes no wall.
 */
export function groundSightSegments(
  ground: GroundSurface,
  widthPx: number,
  depthPx: number,
  gridSize: number
): TallSegment[] {
  if (ground.isFlat || !(gridSize > 0)) return [];
  const step = gridSize / GROUND_SAMPLES_PER_CELL;
  const cols = Math.ceil(widthPx / step);
  const rows = Math.ceil(depthPx / step);
  const levels = new Float64Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const middle = ground.heightAt((col + 0.5) / GROUND_SAMPLES_PER_CELL, (row + 0.5) / GROUND_SAMPLES_PER_CELL);
      levels[row * cols + col] = Math.round(middle / SIGHT_STEP_CELLS) * SIGHT_STEP_CELLS * gridSize;
    }
  }
  const segments: TallSegment[] = [];
  const wall = (x1: number, y1: number, x2: number, y2: number, a: number, b: number) => {
    const top = Math.max(a, b);
    if (a !== b && top > 0) segments.push({ x1, y1, x2, y2, heightPx: top });
  };
  const overlap = JOINT_OVERLAP_PX;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const here = levels[row * cols + col];
      const x = col * step;
      const y = row * step;
      if (col + 1 < cols) {
        wall(x + step, y - overlap, x + step, y + step + overlap, here, levels[row * cols + col + 1]);
      }
      if (row + 1 < rows) {
        wall(x - overlap, y + step, x + step + overlap, y + step, here, levels[(row + 1) * cols + col]);
      }
    }
  }
  return segments;
}
