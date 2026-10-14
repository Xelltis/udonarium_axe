import { currentSeenFrom, flowCellsPerSecond, flowLayerOf, flowVectorOf } from '@axe/domain/tabletop/water/water-flow';
import { flowDirectionOf, flowSpeedOf } from '@axe/domain/tabletop/water/water-surface';

describe('flowing water', () => {
  it('reads nothing stored as still water running towards the top', () => {
    expect(flowSpeedOf('')).toBe(0);
    expect(flowSpeedOf('deep')).toBe(0);
    expect(flowSpeedOf(3)).toBe(1);
    expect(flowDirectionOf('')).toBe(0);
    expect(flowDirectionOf(-90)).toBe(270);
    expect(flowDirectionOf(450)).toBe(90);
  });

  it('runs the way it is set, clockwise from the top of the table', () => {
    expect(flowVectorOf(0)).toEqual({ x: 0, y: -1 });
    expect(flowVectorOf(90)).toEqual({ x: 1, y: 0 });
    expect(flowVectorOf(180)).toEqual({ x: 0, y: 1 });
  });

  it('carries nothing on still water, and faster the faster it is set', () => {
    expect(flowCellsPerSecond(0)).toBe(0);
    expect(flowCellsPerSecond(1)).toBeGreaterThan(flowCellsPerSecond(0.2));
  });

  it('covers the sheet however the pattern is turned', () => {
    const sheet = { left: 100, top: 50, width: 400, height: 200 };
    const layer = flowLayerOf(sheet, 120, 30, 1, 50);
    expect(layer.size).toBeGreaterThanOrEqual(Math.hypot(400, 200));
    expect(layer.left + layer.size / 2).toBeCloseTo(200);
    expect(layer.top + layer.size / 2).toBeCloseTo(100);
  });

  it('lays the pattern on sheets side by side so that it meets across them', () => {
    // A point of the table, read in the turned frame of each of two sheets, falls on the same spot of the pattern.
    const tile = 120;
    const direction = 30;
    const spotOf = (sheet: { left: number; top: number; width: number; height: number }, x: number, y: number) => {
      const layer = flowLayerOf(sheet, tile, direction, 1, 50);
      const [px, py] = layer.position.split(' ').map((part) => parseFloat(part));
      const turn = ((direction - 90) * Math.PI) / 180;
      // Into the layer's own frame: from the middle of the square, turned back.
      const dx = x - (sheet.left + sheet.width / 2);
      const dy = y - (sheet.top + sheet.height / 2);
      const u = dx * Math.cos(turn) + dy * Math.sin(turn) + layer.size / 2;
      const v = -dx * Math.sin(turn) + dy * Math.cos(turn) + layer.size / 2;
      const wrap = (value: number) => ((value % tile) + tile) % tile;
      return [wrap(u - px), wrap(v - py)];
    };
    const left = { left: 0, top: 0, width: 400, height: 400 };
    const right = { left: 400, top: 0, width: 400, height: 400 };
    const [ua, va] = spotOf(left, 399, 123);
    const [ub, vb] = spotOf(right, 399, 123);
    expect(ua).toBeCloseTo(ub, 2);
    expect(va).toBeCloseTo(vb, 2);
  });

  it('takes as long for one repeat to go by as the speed says', () => {
    expect(flowLayerOf({ left: 0, top: 0, width: 10, height: 10 }, 100, 0, 2, 50).seconds).toBe(1);
    expect(flowLayerOf({ left: 0, top: 0, width: 10, height: 10 }, 100, 0, 0, 50).seconds).toBe(0);
  });

  it('runs across the view or at the eye as the eye looks', () => {
    // An eye looking up the table, its right to the right of the table.
    const lookingUp = { hx: 0, hy: -1, rx: 1, ry: 0 };

    expect(currentSeenFrom(lookingUp, 90, 1)).toEqual({ across: 1, toward: 0 });
    expect(currentSeenFrom(lookingUp, 270, 1)).toEqual({ across: -1, toward: 0 });
    expect(currentSeenFrom(lookingUp, 180, 2)).toEqual({ across: 0, toward: 2 });
    expect(currentSeenFrom(lookingUp, 0, 2)).toEqual({ across: 0, toward: -2 });
    expect(currentSeenFrom(lookingUp, 90, 0)).toBeNull();
  });
});
