import { currentSeenFrom, flowCellsPerSecond, flowVectorOf } from '@axe/domain/tabletop/water/water-flow';
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
