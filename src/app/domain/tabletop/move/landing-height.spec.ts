import { hopHeightAt, hopLiftFor, landingHeightAt } from '@axe/domain/tabletop/move/landing-height';
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
