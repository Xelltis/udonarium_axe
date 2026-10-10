import { cellCenterOf, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import {
  hopHeightAt,
  hopLiftFor,
  isLevelWith,
  isWalkableStep,
  landingHeightAt,
  landingHeightsOn,
  landingLeanAt,
} from '@axe/domain/tabletop/move/landing-height';
import { DoorStyle, Terrain } from '@axe/domain/tabletop/terrain';

function block(opts: { x: number; y: number; h: number; altitude?: number; identifier?: string }): Terrain {
  const terrain = Terrain.create('block', 2, 2, opts.h, '', '', opts.identifier ?? `t_${opts.x}_${opts.y}`);
  terrain.location.x = opts.x;
  terrain.location.y = opts.y;
  terrain.altitude = opts.altitude ?? 0;
  return terrain;
}

describe('landingHeightAt', () => {
  it('is the floor where nothing is standing', () => {
    expect(landingHeightAt([block({ x: 500, y: 500, h: 1 })], 50, 50, 50)).toBe(0);
    expect(landingHeightAt([], 50, 50, 50)).toBe(0);
  });

  it('is the top of what is standing there', () => {
    expect(landingHeightAt([block({ x: 0, y: 0, h: 2 })], 50, 50, 50)).toBe(100);
  });

  it('takes the highest of what is stacked there', () => {
    const low = block({ x: 0, y: 0, h: 1, identifier: 'low' });
    const high = block({ x: 0, y: 0, h: 1, altitude: 3, identifier: 'high' });

    expect(landingHeightAt([low, high], 50, 50, 50)).toBe(200);
  });

  it('is the floor over a face too sheer to be stood on', () => {
    const cliff = block({ x: 0, y: 0, h: 2 });
    cliff.blocksClimb = true;

    expect(landingHeightAt([cliff], 50, 50, 50)).toBe(0);
  });

  it('is the floor under a door standing open', () => {
    const door = block({ x: 0, y: 0, h: 2 });
    door.doorStyle = DoorStyle.SWING;
    door.isDoorOpen = true;

    expect(landingHeightAt([door], 50, 50, 50)).toBe(0);
  });

  it('passes over anything hung on a wall of the table', () => {
    const shelf = block({ x: 0, y: 0, h: 2 });
    shelf.location.surface = 'north-wall';

    expect(landingHeightAt([shelf], 50, 50, 50)).toBe(0);
  });
});

describe('landingHeightsOn', () => {
  const grid = cellGridOf(6, 6, 50, GridType.SQUARE);

  it('gives the floor everywhere nothing is standing', () => {
    const heights = landingHeightsOn(grid, []);

    expect(heights.length).toBe(36);
    expect([...heights].every((height) => height === 0)).toBe(true);
  });

  it('answers each cell with the height of what is standing in it', () => {
    const heights = landingHeightsOn(grid, [block({ x: 0, y: 0, h: 2 })]);

    expect(heights[cellIndexOf(grid, 0, 0)]).toBe(100);
    expect(heights[cellIndexOf(grid, 1, 1)]).toBe(100);
    expect(heights[cellIndexOf(grid, 2, 0)]).toBe(0);
  });

  it('agrees with what a piece put down on the cell would be standing on', () => {
    const terrains = [block({ x: 0, y: 0, h: 2 }), block({ x: 100, y: 0, h: 1, identifier: 'low' })];
    const heights = landingHeightsOn(grid, terrains);

    for (const [col, row] of [
      [0, 0],
      [2, 1],
      [4, 4],
    ]) {
      const centre = cellCenterOf(grid, cellIndexOf(grid, col, row));
      expect(heights[cellIndexOf(grid, col, row)]).toBe(landingHeightAt(terrains, 50, centre.x, centre.y));
    }
  });

  it('leaves out a face too sheer to be stood on', () => {
    const cliff = block({ x: 0, y: 0, h: 2 });
    cliff.blocksClimb = true;

    expect(landingHeightsOn(grid, [cliff])[cellIndexOf(grid, 0, 0)]).toBe(0);
  });
});

describe('isWalkableStep', () => {
  it('steps up and down a cell, and anything under one', () => {
    expect(isWalkableStep(50, 0, 50)).toBe(true);
    expect(isWalkableStep(25, 0, 50)).toBe(true);
    expect(isWalkableStep(0, 50, 50)).toBe(true);
    expect(isWalkableStep(100, 100, 50)).toBe(true);
  });

  it('makes nothing of a step it is already standing level with', () => {
    expect(isWalkableStep(100.2, 100, 50)).toBe(true);
  });

  it('is stopped by more than a cell, up or down', () => {
    expect(isWalkableStep(100, 0, 50)).toBe(false);
    expect(isWalkableStep(0, 100, 50)).toBe(false);
  });
});

describe('isLevelWith', () => {
  it('counts two blocks built to the same height as one and the same ground', () => {
    expect(isLevelWith(100, 100)).toBe(true);
    expect(isLevelWith(100, 100.2)).toBe(true);
  });

  it('counts a step up or down as ground of its own', () => {
    expect(isLevelWith(100, 150)).toBe(false);
    expect(isLevelWith(100, 0)).toBe(false);
  });
});

describe('walking on a slope', () => {
  function ramp(): Terrain {
    const terrain = block({ x: 0, y: 0, h: 2, identifier: 'ramp' });
    terrain.slopeSides = ['s'];
    return terrain;
  }

  it('climbs along the slope rather than stepping onto its high end', () => {
    const terrain = ramp();

    expect(landingHeightAt([terrain], 50, 50, 100)).toBeCloseTo(0);
    expect(landingHeightAt([terrain], 50, 50, 50)).toBeCloseTo(50);
    expect(landingHeightAt([terrain], 50, 50, 0)).toBeCloseTo(100);
  });

  it('leans with the ground a piece is standing on', () => {
    const terrain = ramp();

    expect(landingLeanAt([terrain], 50, 50, 50)).toEqual({
      eastward: expect.closeTo(0, 6),
      southward: expect.closeTo(-1, 6),
    });
  });

  it('leans nowhere on level ground, or where there is none', () => {
    expect(landingLeanAt([block({ x: 0, y: 0, h: 2 })], 50, 50, 50)).toBeNull();
    expect(landingLeanAt([], 50, 50, 50)).toBeNull();
  });

  it('takes the lean of the highest thing at the point', () => {
    const under = ramp();
    const over = block({ x: 0, y: 0, h: 1, altitude: 4, identifier: 'over' });

    expect(landingLeanAt([under, over], 50, 50, 50)).toBeNull();
  });
});

describe('hopHeightAt', () => {
  it('begins where the piece stood and ends where it lands', () => {
    expect(hopHeightAt(0, 0, 100, 20)).toBe(0);
    expect(hopHeightAt(1, 0, 100, 20)).toBe(100);
  });

  it('arches over the way across, highest in the middle', () => {
    expect(hopHeightAt(0.5, 0, 100, 20)).toBe(70);
    expect(hopHeightAt(0.25, 0, 0, 20)).toBe(15);
    expect(hopHeightAt(0.5, 0, 0, 20)).toBe(20);
  });

  it('clears the height it is getting onto before it is half way across', () => {
    const lift = hopLiftFor(0, 100, 50);

    expect(hopHeightAt(0.4, 0, 100, lift)).toBeGreaterThan(100);
    expect(hopHeightAt(0.5, 0, 100, lift)).toBeGreaterThan(100);
  });

  it('keeps to the ends of the way when asked for somewhere off it', () => {
    expect(hopHeightAt(-1, 0, 100, 20)).toBe(0);
    expect(hopHeightAt(2, 0, 100, 20)).toBe(100);
  });
});

describe('hopLiftFor', () => {
  it('throws a piece the best part of a cell over level ground', () => {
    expect(hopLiftFor(0, 0, 50)).toBe(15);
  });

  it('throws it higher the further it has to rise', () => {
    expect(hopLiftFor(0, 400, 50)).toBe(320);
  });

  it('asks for no throw at all on the way down, which is a step off a ledge', () => {
    expect(hopLiftFor(400, 0, 50)).toBe(15);
  });
});
