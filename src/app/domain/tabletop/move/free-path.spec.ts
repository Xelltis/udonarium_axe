import { GROUND_CHUNK_SAMPLE_COUNT, GROUND_CHUNK_SAMPLES } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { groundSurfaceOf } from '@axe/domain/tabletop/ground/ground-surface';
import { entryAlong, exitAlong, LegLimits, pathLength, stepsAlong, walkLeg } from '@axe/domain/tabletop/move/free-path';
import { zoneCovers, ZoneShape } from '@axe/domain/tabletop/zone/zone-geometry';

const OPEN: LegLimits = { budgetPx: 1000, blocks: [], gapPx: 0, shut: [], stops: [], escapes: [] };

const circle = (x: number, y: number, reach: number): ZoneShape => ({ centre: { x, y }, square: false, reach });
const square = (x: number, y: number, reach: number): ZoneShape => ({ centre: { x, y }, square: true, reach });

describe('free paths', () => {
  it('measures a way of straight legs', () => {
    expect(
      pathLength([
        { x: 0, y: 0 },
        { x: 30, y: 40 },
        { x: 30, y: 0 },
      ])
    ).toBe(90);
    expect(pathLength([{ x: 5, y: 5 }])).toBe(0);
  });

  it('lands a step at every interval along the way, round the corners, and on its end', () => {
    const steps = stepsAlong(
      [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 25 },
      ],
      20
    );

    expect(steps).toEqual([
      { x: 20, y: 0 },
      { x: 30, y: 10 },
      { x: 30, y: 25 },
    ]);
  });

  describe('crossing a zone', () => {
    it('finds where a leg walks into a circle, and nothing for one that sets out inside it', () => {
      const zone = circle(100, 0, 20);

      expect(entryAlong({ x: 0, y: 0 }, { x: 200, y: 0 }, zone)).toBeCloseTo(0.4);
      expect(entryAlong({ x: 0, y: 50 }, { x: 200, y: 50 }, zone)).toBeNull();
      expect(entryAlong({ x: 100, y: 0 }, { x: 200, y: 0 }, zone)).toBeNull();
      expect(entryAlong({ x: 0, y: 0 }, { x: 50, y: 0 }, zone)).toBeNull();
    });

    it('finds where a leg walks out of a square it set out in', () => {
      const zone = square(0, 0, 20);

      expect(exitAlong({ x: 0, y: 0 }, { x: 0, y: 100 }, zone)).toBeCloseTo(0.2);
      expect(exitAlong({ x: 0, y: 0 }, { x: 10, y: 10 }, zone)).toBeNull();
      expect(exitAlong({ x: 50, y: 0 }, { x: 100, y: 0 }, zone)).toBeNull();
    });

    it('takes the edge of a square as the place it is entered', () => {
      expect(entryAlong({ x: -100, y: 5 }, { x: 100, y: 5 }, square(0, 0, 20))).toBeCloseTo(0.4);
    });
  });

  describe('walking a leg', () => {
    it('goes all the way where nothing stands in it', () => {
      expect(walkLeg({ x: 0, y: 0 }, { x: 30, y: 40 }, OPEN)).toEqual({
        end: { x: 30, y: 40 },
        length: 50,
        stopped: false,
      });
    });

    it('goes no further than the move has left', () => {
      const leg = walkLeg({ x: 0, y: 0 }, { x: 100, y: 0 }, { ...OPEN, budgetPx: 40 });

      expect(leg.end).toEqual({ x: 40, y: 0 });
      expect(leg.stopped).toBe(false);
    });

    it('stops short of a block', () => {
      const leg = walkLeg(
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        {
          ...OPEN,
          blocks: [{ minX: 50, minY: -10, maxX: 60, maxY: 10 }],
          gapPx: 1,
        }
      );

      expect(leg.end.x).toBeCloseTo(49);
    });

    it('stops short of a zone shut to it, without ending the move', () => {
      const leg = walkLeg({ x: 0, y: 0 }, { x: 200, y: 0 }, { ...OPEN, shut: [circle(100, 0, 20)], gapPx: 1 });

      expect(leg.end.x).toBeCloseTo(79);
      expect(leg.stopped).toBe(false);
    });

    it('ends the move just inside a zone that stops it', () => {
      const zone = circle(100, 0, 20);
      const leg = walkLeg({ x: 0, y: 0 }, { x: 200, y: 0 }, { ...OPEN, stops: [zone] });

      expect(leg.stopped).toBe(true);
      expect(leg.end.x).toBeCloseTo(80.5);
      expect(zoneCovers(zone, leg.end)).toBe(true);
    });

    it('ends the move just outside a zone it was standing in', () => {
      const zone = circle(0, 0, 20);
      const leg = walkLeg({ x: 0, y: 0 }, { x: 100, y: 0 }, { ...OPEN, escapes: [zone] });

      expect(leg.stopped).toBe(true);
      expect(zoneCovers(zone, leg.end)).toBe(false);
    });

    it('is not stopped by a zone it runs out of moves before reaching', () => {
      const leg = walkLeg({ x: 0, y: 0 }, { x: 200, y: 0 }, { ...OPEN, budgetPx: 50, stops: [circle(100, 0, 20)] });

      expect(leg.end).toEqual({ x: 50, y: 0 });
      expect(leg.stopped).toBe(false);
    });
  });

  describe('walking a leg over raised ground', () => {
    const GRID = 50;

    /** Ground raised by a number of cells from three cells across on, all at once or over a few cells. */
    function raisedFrom3(cells: number, overCells = 0) {
      const heights = new Int16Array(GROUND_CHUNK_SAMPLE_COUNT);
      for (let j = 0; j < GROUND_CHUNK_SAMPLES; j++) {
        for (let i = 0; i < GROUND_CHUNK_SAMPLES; i++) {
          const up = overCells > 0 ? Math.min(1, Math.max(0, (i / 2 - 3) / overCells)) : i >= 6 ? 1 : 0;
          heights[j * GROUND_CHUNK_SAMPLES + i] = Math.round(up * cells * 64);
        }
      }
      return { surface: groundSurfaceOf([{ cx: 0, cy: 0, heights, paint: null }]), gridSize: GRID };
    }

    it('stops at the foot of a cliff higher than a cell', () => {
      const leg = walkLeg({ x: 0, y: 25 }, { x: 300, y: 25 }, { ...OPEN, ground: raisedFrom3(2) });

      expect(leg.end.x).toBeGreaterThan(100);
      expect(leg.end.x).toBeLessThan(150);
    });

    it('walks up a rise of a cell, and up a slope that climbs less than a cell a cell', () => {
      expect(walkLeg({ x: 0, y: 25 }, { x: 300, y: 25 }, { ...OPEN, ground: raisedFrom3(1) }).end.x).toBe(300);
      expect(walkLeg({ x: 0, y: 25 }, { x: 400, y: 25 }, { ...OPEN, ground: raisedFrom3(3, 4) }).end.x).toBe(400);
    });

    it('stops partway down a slope that drops more than a cell a cell', () => {
      const leg = walkLeg({ x: 400, y: 25 }, { x: 0, y: 25 }, { ...OPEN, ground: raisedFrom3(4, 2) });

      expect(leg.end.x).toBeGreaterThan(150);
      expect(leg.end.x).toBeLessThan(250);
    });
  });
});
