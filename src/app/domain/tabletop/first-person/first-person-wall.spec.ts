import { wallPlacementOf, wallYawOf } from '@axe/domain/tabletop/first-person/first-person-wall';
import { describe, expect, it } from 'vitest';

const DIMS = { widthPx: 600, depthPx: 400, wallHeightPx: 200 };

describe('wallYawOf', () => {
  it('turns each wall to face into the room', () => {
    expect(wallYawOf('north-wall')).toBe(0);
    expect(wallYawOf('east-wall')).toBe(90);
    expect(wallYawOf('south-wall')).toBe(180);
    expect(wallYawOf('west-wall')).toBe(270);
  });
});

describe('wallPlacementOf', () => {
  it('stands a thing on the north wall where it hangs, measured down from the top', () => {
    expect(wallPlacementOf('north-wall', 100, 30, 50, 50, DIMS)).toEqual({ x: 125, y: 0, z: 120, rotate: 0 });
  });

  it('hangs the same thing along the east wall instead', () => {
    expect(wallPlacementOf('east-wall', 100, 30, 50, 50, DIMS)).toEqual({ x: 600, y: 125, z: 120, rotate: 90 });
  });

  it('runs the south and west walls the other way round the room', () => {
    expect(wallPlacementOf('south-wall', 0, 0, 100, 100, DIMS)).toMatchObject({ x: 550, y: 400, rotate: 180 });
    expect(wallPlacementOf('west-wall', 0, 0, 100, 100, DIMS)).toMatchObject({ x: 0, y: 350, rotate: 270 });
  });
});
