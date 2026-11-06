import { hexSideStepsAt } from '@axe/domain/tabletop/cell-steps';
import { settlementBlocks } from '@axe/domain/tabletop/field/settlement-blocks';
import {
  laySettlement,
  SETTLEMENT_KINDS,
  SETTLEMENT_WALL_KINDS,
  SETTLEMENT_ZONES,
  type SettlementKind,
  type SettlementLayout,
  SLOWING_CROPS,
} from '@axe/domain/tabletop/field/settlement-layout';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { isFlatTopGrid } from '@axe/domain/tabletop/hex-geometry';

const W = 40;
const H = 30;

const SQUARE_STEPS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/**
 * The cells reached walking in from every cell on the edge of the board that is not built on, past
 * walls, and past doors only where they are open: on squares to any of the eight round a cell, corner
 * to corner as well, and on hexes to any of the six.
 */
function reached(layout: SettlementLayout, doorsOpen: boolean, gridType = GridType.SQUARE): Uint8Array {
  const blocked = new Uint8Array(W * H);
  for (let cell = 0; cell < blocked.length; cell++) if (layout.walls[cell]) blocked[cell] = 1;
  for (const door of layout.doors) blocked[door.y * W + door.x] = doorsOpen ? 0 : 1;
  const seen = new Uint8Array(W * H);
  const queue: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && !blocked[y * W + x]) {
        seen[y * W + x] = 1;
        queue.push(y * W + x);
      }
    }
  }
  const hex = gridType !== GridType.SQUARE;
  while (queue.length > 0) {
    const cell = queue.pop()!;
    const x = cell % W;
    const y = Math.floor(cell / W);
    for (const [dx, dy] of hex ? hexSideStepsAt(isFlatTopGrid(gridType), x, y) : SQUARE_STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const next = ny * W + nx;
      if (seen[next] || blocked[next]) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return seen;
}

/** The cells of a zone a piece may stand on: under no wall or door. */
function cellsOf(layout: SettlementLayout, zone: number): number[] {
  const built = new Set<number>(layout.doors.map((door) => door.y * W + door.x));
  return [...layout.zones].flatMap((value, cell) =>
    value === zone && !layout.walls[cell] && !built.has(cell) ? [cell] : []
  );
}

describe('laySettlement()', () => {
  it('lays out the same settlement from the same seed, and another from another', () => {
    for (const kind of SETTLEMENT_KINDS) {
      expect(laySettlement(kind, W, H, 7)).toEqual(laySettlement(kind, W, H, 7));
      expect(laySettlement(kind, W, H, 8)).not.toEqual(laySettlement(kind, W, H, 7));
    }
  });

  describe.each(['barbarianFort', 'stoneFort'] as const)('a %s', (kind: SettlementKind) => {
    const seeds = [1, 7, 42, 1234, 20261106];

    it('keeps out whoever walks up to it while its gates are shut, corner to corner as well, and lets them in once open', () => {
      for (const seed of seeds) {
        const fort = laySettlement(kind, W, H, seed);
        const yard = cellsOf(fort, SETTLEMENT_ZONES.yard);
        expect(yard.length).toBeGreaterThan(20);

        const shut = reached(fort, false);
        expect(yard.filter((cell) => shut[cell])).toEqual([]);
        const open = reached(fort, true);
        expect(yard.filter((cell) => !open[cell])).toEqual([]);
        expect(fort.doors.filter((door) => door.kind === 'gate')).toHaveLength(2);
      }
    });

    it('keeps them out on hexes too, either way the hexes stand', () => {
      for (const gridType of [GridType.HEX_HORIZONTAL, GridType.HEX_VERTICAL]) {
        const fort = laySettlement(kind, W, H, 7);
        const shut = reached(fort, false, gridType);
        expect(cellsOf(fort, SETTLEMENT_ZONES.yard).filter((cell) => shut[cell])).toEqual([]);
      }
    });
  });

  it('builds every house and keep with no room shut off, every room reached through its doors from outside', () => {
    for (const kind of SETTLEMENT_KINDS) {
      for (const seed of [1, 7, 42, 1234]) {
        const place = laySettlement(kind, W, H, seed);
        const floors = cellsOf(place, SETTLEMENT_ZONES.floor);
        expect(floors.length, `${kind} ${seed}`).toBeGreaterThan(0);
        const open = reached(place, true);
        expect(
          floors.filter((cell) => !open[cell]),
          `${kind} ${seed}`
        ).toEqual([]);
        expect(place.doors.filter((door) => door.kind === 'door').length).toBeGreaterThan(0);
      }
    }
  });

  it('shuts nobody out of any cell once the doors are open, the barns, tents, barracks and stables walked into as the houses are', () => {
    for (const kind of SETTLEMENT_KINDS) {
      for (const seed of [1, 7, 42, 1234, 20261106]) {
        const place = laySettlement(kind, W, H, seed);
        const open = reached(place, true);
        const shut = [...place.walls].flatMap((wall, cell) => (wall === 0 && !open[cell] ? [cell] : []));
        expect(shut, `${kind} ${seed}`).toEqual([]);
      }
    }
  });

  it('builds barns of boards with a door, tents of hides with a way in left open, and barracks and stables of stone', () => {
    const count = (kind: 'village' | 'barbarianFort' | 'stoneFort', wall: string) =>
      [1, 2, 3, 4, 5, 6]
        .map((seed) => laySettlement(kind, W, H, seed))
        .filter((place) => [...place.walls].some((mark) => SETTLEMENT_WALL_KINDS[mark - 1] === wall));
    const barns = count('village', 'boardWall');
    expect(barns.length).toBeGreaterThan(0);
    expect(barns.every((place) => place.doors.some((door) => door.wall === 'boardWall'))).toBe(true);
    const camps = count('barbarianFort', 'hideWall');
    expect(camps).toHaveLength(6);
    expect(camps.some((place) => place.doors.some((door) => door.wall === 'hideWall'))).toBe(false);
    const fort = laySettlement('stoneFort', W, H, 3);
    expect(fort.doors.filter((door) => door.kind === 'door' && door.wall === 'stoneRoomWall').length).toBeGreaterThan(
      4
    );
  });

  it('stands nothing on a wall or on anything else', () => {
    for (const kind of SETTLEMENT_KINDS) {
      const place = laySettlement(kind, W, H, 42);
      const used = new Map<number, string>();
      const claim = (x: number, y: number, what: string) => {
        const cell = y * W + x;
        expect(used.get(cell), `${kind}: ${what} at ${x},${y}`).toBeUndefined();
        used.set(cell, what);
      };
      for (let cell = 0; cell < place.walls.length; cell++) if (place.walls[cell]) used.set(cell, 'wall');
      for (const door of place.doors) claim(door.x, door.y, 'door');
      for (const thing of place.things) claim(thing.x, thing.y, thing.thing);
      for (const crop of place.crops) {
        for (let y = crop.rect.y; y < crop.rect.y + crop.rect.h; y++) {
          for (let x = crop.rect.x; x < crop.rect.x + crop.rect.w; x++) claim(x, y, crop.crop);
        }
      }
      for (const fire of place.fires) expect(place.walls[fire.y * W + fire.x], `${kind}: fire on a wall`).toBe(0);
    }
  });

  it('grows fields of every crop over a run of seeds, the wheat, maize and rice slow to cross and the rice under water', () => {
    const crops = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((seed) => laySettlement('village', W, H, seed).crops);
    expect(new Set(crops.map((crop) => crop.crop))).toEqual(new Set(['vegetable', 'wheat', 'corn', 'rice']));

    const village = laySettlement('village', W, H, 3);
    const built = settlementBlocks(village, W, H, 12, false);
    const slow = village.crops.filter((crop) => SLOWING_CROPS.includes(crop.crop));
    expect(built.slows.map((patch) => patch.rect)).toEqual(slow.map((crop) => crop.rect));
    expect(built.slows.every((patch) => patch.extraCost === 1)).toBe(true);
    const paddies = village.crops.filter((crop) => crop.crop === 'rice');
    expect(built.ambiences.filter((ambience) => ambience.kind === 'water').map((water) => water.rect)).toEqual(
      paddies.map((crop) => crop.rect)
    );
  });

  it('still lays out a fort and a village with houses where it is asked for nothing more', () => {
    for (const kind of SETTLEMENT_KINDS) {
      const place = laySettlement(kind, W, H, 7, 0);
      expect(
        place.walls.some((wall) => wall > 0),
        kind
      ).toBe(true);
      expect(place.doors.length, kind).toBeGreaterThan(0);
    }
  });
});

describe('settlementBlocks()', () => {
  it('stands the walls of a fort as blocks nobody sees past or climbs, and its fences as low ones looked over', () => {
    const village = settlementBlocks(laySettlement('village', W, H, 3), W, H, 12, false);
    const fences = village.blocks.filter((block) => block.thing === 'fence');
    expect(fences.length).toBeGreaterThan(0);
    expect(fences.every((fence) => !fence.blocksSight && !fence.blocksClimb)).toBe(true);
    expect(fences.every((fence) => Math.min(fence.footprint!.w, fence.footprint!.d) === 0.2)).toBe(true);

    const fort = settlementBlocks(laySettlement('stoneFort', W, H, 3), W, H, 12, false);
    const walls = fort.blocks.filter((block) => block.thing === 'stoneWall' || block.thing === 'tower');
    expect(walls.length).toBeGreaterThan(0);
    expect(walls.every((wall) => wall.blocksSight && wall.blocksClimb)).toBe(true);
    const gates = fort.blocks.filter((block) => block.thing === 'gate');
    expect(gates).toHaveLength(2);
    expect(gates.map((gate) => gate.doorMirrored)).toEqual([false, true]);
    expect(gates.every((gate) => gate.prop === 'door_iron_grate' && gate.doorStyle === 'lift')).toBe(true);
  });

  it('draws every wall and the small things as models when asked, the walls of barns and tents as their own', () => {
    for (const kind of SETTLEMENT_KINDS) {
      const place = laySettlement(kind, W, H, 3);
      const drawn = settlementBlocks(place, W, H, 12, true);
      const walls = drawn.blocks.filter(
        (block) => block.kind === 'prop' && ['wall', 'barn', 'tent'].includes(block.thing!)
      );
      expect(walls.length, kind).toBeGreaterThan(0);
      expect(
        walls.filter((block) => !block.model),
        kind
      ).toEqual([]);
      const own = { barn: 'plank_wall', tent: 'hide_wall' } as Record<string, string>;
      for (const block of walls) if (own[block.thing!]) expect(block.model).toBe(own[block.thing!]);
      const things = drawn.blocks.filter((block) => place.things.some((thing) => thing.thing === block.thing));
      expect(things.length, kind).toBe(place.things.length);
      expect(things.every((block) => block.model && !block.footprint)).toBe(true);

      const plain = settlementBlocks(place, W, H, 12, false);
      expect(plain.blocks.filter((block) => block.model)).toEqual([]);
    }
  });

  it('grows each field’s crop as a model on a block thin enough to walk through, hiding nothing and stopping nobody', () => {
    const village = laySettlement('village', W, H, 3);
    const drawn = settlementBlocks(village, W, H, 12, true);
    const crops = drawn.blocks.filter((block) => block.model?.startsWith('crop_'));
    expect(crops.map((block) => block.rect)).toEqual(village.crops.map((crop) => crop.rect));
    expect(crops.map((block) => block.model)).toEqual(village.crops.map((crop) => `crop_${crop.crop}`));
    for (const block of crops) {
      expect(block.height).toBeLessThan(0.05);
      expect(block.blocksSight || block.blocksClimb).toBeFalsy();
      expect(block.modelTurn ?? 0).toBe(block.rect.h > block.rect.w ? 90 : 0);
    }

    const onHexes = settlementBlocks(village, W, H, 1, true).blocks.filter((block) => block.model?.startsWith('crop_'));
    const cells = village.crops.reduce((sum, crop) => sum + crop.rect.w * crop.rect.h, 0);
    expect(onHexes).toHaveLength(cells);
  });

  it('stands every block on a cell of its own on hexes, as a hex board takes them', () => {
    const fort = settlementBlocks(laySettlement('barbarianFort', W, H, 3), W, H, 1, false);
    expect(fort.blocks.every((block) => block.rect.w === 1 && block.rect.h === 1)).toBe(true);
  });
});
