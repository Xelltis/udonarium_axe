import { TabletopOverlapRegistryEntry } from '@axe/application/ui/tabletop-overlap.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { GridType } from '@axe/domain/tabletop/game-table';
import { DoorStyle, Terrain } from '@axe/domain/tabletop/terrain';
import {
  buildClimbBlocks,
  buildContactProbe,
  climbSpread,
  contactRiderOf,
  slopeTopReader,
} from '@axe/ui/directives/piece-contact-probe';

const GRID = 50;
const TABLE = { gridSize: GRID, gridType: GridType.SQUARE };

function block(opts: {
  identifier: string;
  x?: number;
  y?: number;
  w?: number;
  d?: number;
  h?: number;
  altitude?: number;
  blocksClimb?: boolean;
}): Terrain {
  const terrain = Terrain.create('block', opts.w ?? 2, opts.d ?? 2, opts.h ?? 1, '', '', opts.identifier);
  terrain.location.x = opts.x ?? 0;
  terrain.location.y = opts.y ?? 0;
  terrain.altitude = opts.altitude ?? 0;
  terrain.blocksClimb = opts.blocksClimb ?? false;
  return terrain;
}

function entry(object: Terrain | GameCharacter, widthPx = GRID, heightPx = GRID): TabletopOverlapRegistryEntry {
  return { object, element: null, footprint: () => ({ width: widthPx, height: heightPx }) };
}

describe('buildContactProbe()', () => {
  it('takes the footprint of every other piece on the same face, with how high it stands', () => {
    const self = GameCharacter.create('walker', 1, '');
    const rock = block({ identifier: 'rock', x: 100, y: 200, altitude: 3 });
    const onWall = block({ identifier: 'beam' });
    onWall.location.surface = 'north-wall';

    const probe = buildContactProbe(self, [entry(self), entry(rock), entry(onWall)], TABLE, false);

    expect(probe).toHaveLength(1);
    expect(probe[0]).toMatchObject({
      left: 100,
      top: 200,
      right: 200,
      bottom: 300,
      bottomZ: 3 * GRID,
      topZ: 4 * GRID,
      climbable: true,
      identifier: 'rock',
    });
  });

  it('marks a block that blocks climbing as something to stand beside only for a sheer walker', () => {
    const self = GameCharacter.create('walker', 1, '');
    const cliff = block({ identifier: 'cliff', blocksClimb: true });

    expect(buildContactProbe(self, [entry(cliff)], TABLE, true)[0].climbable).toBe(false);
    expect(buildContactProbe(self, [entry(cliff)], TABLE, false)[0].climbable).toBe(true);
  });
});

describe('slopeTopReader()', () => {
  it('reads nothing for a level block, or for anything off the floor', () => {
    const level = block({ identifier: 'level' });
    expect(slopeTopReader(level, 'floor', TABLE)).toBeUndefined();
    expect(slopeTopReader(level, 'north-wall', TABLE)).toBeUndefined();
  });
});

describe('contactRiderOf()', () => {
  it('carries a character at its altitude, riding up onto what it meets', () => {
    const walker = GameCharacter.create('walker', 1, '');
    walker.altitude = 2;

    expect(contactRiderOf(walker, GRID, { posZ: 10, reachZ: null, restingOn: undefined })).toEqual({
      altitudePx: 2 * GRID,
      thicknessPx: 0,
      ridesUp: true,
      restingZ: 10,
      restingOn: undefined,
    });
  });

  it('carries a block at its thickness, resting where the drag last found it', () => {
    const slab = block({ identifier: 'slab', h: 2, altitude: 1 });

    expect(contactRiderOf(slab, GRID, { posZ: 5, reachZ: null, restingOn: undefined })).toMatchObject({
      altitudePx: GRID,
      thicknessPx: 2 * GRID,
      ridesUp: false,
      restingZ: GRID + 5,
    });
    expect(contactRiderOf(slab, GRID, { posZ: 5, reachZ: 300, restingOn: 'rock' })).toMatchObject({
      restingZ: 300,
      restingOn: 'rock',
    });
  });
});

describe('climbSpread()', () => {
  it('asks nothing of the ground beside a piece of one cell, and half the overhang of a wider one', () => {
    expect(climbSpread(GRID, GRID, GRID)).toEqual({ x: 0, y: 0 });
    expect(climbSpread(3 * GRID, GRID, GRID)).toEqual({ x: GRID, y: 0 });
    expect(climbSpread(10, 10, GRID)).toEqual({ x: 0, y: 0 });
  });
});

describe('buildClimbBlocks()', () => {
  it('takes every closed block on the same face that blocks climbing, grown by the spread', () => {
    const self = GameCharacter.create('walker', 1, '');
    const cliff = block({ identifier: 'cliff', x: 100, y: 100, w: 2, d: 1, blocksClimb: true });
    const open = block({ identifier: 'open', blocksClimb: true });
    open.isDoorOpen = true;
    open.doorStyle = DoorStyle.SWING;
    const passable = block({ identifier: 'passable' });
    const elsewhere = block({ identifier: 'elsewhere', blocksClimb: true });
    elsewhere.location.surface = 'north-wall';

    const blocks = buildClimbBlocks(
      self,
      [entry(self), entry(cliff), entry(open), entry(passable), entry(elsewhere)],
      GRID,
      { x: 10, y: 0 }
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ minX: 90, minY: 100, maxX: 210, maxY: 150 });
  });
});
