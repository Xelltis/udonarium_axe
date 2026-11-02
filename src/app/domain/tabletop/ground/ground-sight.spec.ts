import { GROUND_CHUNK_SAMPLE_COUNT, GROUND_CHUNK_SAMPLES } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { groundSightSegments } from '@axe/domain/tabletop/ground/ground-sight';
import { FLAT_GROUND, groundSurfaceOf } from '@axe/domain/tabletop/ground/ground-surface';
import { segmentClearBetween } from '@axe/domain/tabletop/los/segments';

const GRID = 50;

/** Ground raised two cells over a square of samples, from one sample to another across and down. */
function plateau(from: number, to: number) {
  const heights = new Int16Array(GROUND_CHUNK_SAMPLE_COUNT);
  for (let j = from; j <= to; j++) {
    for (let i = from; i <= to; i++) heights[j * GROUND_CHUNK_SAMPLES + i] = 128;
  }
  return groundSurfaceOf([{ cx: 0, cy: 0, heights, paint: null }]);
}

describe('the raised ground as walls that stop sight and light', () => {
  it('stands none on flat ground', () => {
    expect(groundSightSegments(FLAT_GROUND, 500, 500, GRID)).toEqual([]);
  });

  it('stands walls round a plateau, as high as the plateau, and none across its top', () => {
    const walls = groundSightSegments(plateau(4, 12), 500, 500, GRID);

    expect(walls.length).toBeGreaterThan(0);
    expect(Math.max(...walls.map((wall) => wall.heightPx!))).toBe(2 * GRID);
    const acrossTop = walls.filter(
      (wall) => wall.x1 > 7 * 25 && wall.x1 < 9 * 25 && wall.y1 > 7 * 25 && wall.y1 < 9 * 25
    );
    expect(acrossTop).toEqual([]);
  });

  it('stops a look from the middle of one cell to another along a row, which runs through the joints of the walls', () => {
    const walls = groundSightSegments(plateau(4, 12), 500, 500, GRID);

    expect(segmentClearBetween(25, 175, 25, 375, 175, 25, walls)).toBe(false);
    expect(segmentClearBetween(25, 25, 25, 375, 25, 25, walls)).toBe(true);
  });
});
