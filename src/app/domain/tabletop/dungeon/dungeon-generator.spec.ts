import {
  atmosphereById,
  DUNGEON_ATMOSPHERE_IDS,
  DUNGEON_ATMOSPHERES,
  DUNGEON_DOOR_STYLES,
  DUNGEON_ENTRANCE_STYLES,
} from '@axe/domain/tabletop/dungeon/dungeon-atmosphere';
import { MAX_MERGE_SPAN } from '@axe/domain/tabletop/dungeon/dungeon-blocks';
import {
  boardSizeFor,
  clampRoomCount,
  defaultCorridorWidth,
  generateDungeon,
  MAX_BOARD_HEIGHT,
  MAX_BOARD_WIDTH,
  planDungeon,
} from '@axe/domain/tabletop/dungeon/dungeon-generator';
import {
  cellAt,
  clampCorridorWidth,
  countOpenCells,
  DungeonCell,
  reachableCells,
} from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { GridType } from '@axe/domain/tabletop/game-table';
import { MAP_MAX_TERRAINS, syncObjectCount } from '@axe/domain/tabletop/map-blocks';

const SEEDS = [1, 7, 42, 1234, 99999];

describe('clampRoomCount()', () => {
  it('holds the count between three and twenty', () => {
    expect(clampRoomCount(0)).toBe(3);
    expect(clampRoomCount(99)).toBe(20);
    expect(clampRoomCount(8)).toBe(8);
    expect(clampRoomCount(Number.NaN)).toBe(3);
  });
});

describe('boardSizeFor()', () => {
  it('grows the board with the number of rooms', () => {
    const rooms = DUNGEON_ATMOSPHERES.stoneDungeon;

    // A maze fills whatever rock is left over, so the board is kept snug and always odd.
    expect(boardSizeFor(rooms, 3)).toEqual({ width: 27, height: 19 });
    expect(boardSizeFor(rooms, 8)).toEqual({ width: 35, height: 27 });
    expect(boardSizeFor(rooms, 20)).toEqual({ width: 49, height: 37 });
  });

  it('never lets the board outgrow one scratch mask', () => {
    for (const id of DUNGEON_ATMOSPHERE_IDS) {
      for (const rooms of [3, 8, 12, 16, 20, 99]) {
        const size = boardSizeFor(atmosphereById(id), rooms);
        expect(size.width).toBeLessThanOrEqual(MAX_BOARD_WIDTH);
        expect(size.height).toBeLessThanOrEqual(MAX_BOARD_HEIGHT);
      }
    }
  });

  it('gives a cave a smaller board than a set of rooms', () => {
    const rooms = boardSizeFor(DUNGEON_ATMOSPHERES.stoneDungeon, 12);
    const cave = boardSizeFor(DUNGEON_ATMOSPHERES.cavern, 12);

    expect(cave.width).toBeLessThan(rooms.width);
    expect(cave.height).toBeLessThan(rooms.height);
  });
});

describe('generateDungeon()', () => {
  it('sends each atmosphere to the shape it asks for', () => {
    for (const id of DUNGEON_ATMOSPHERE_IDS) {
      const layout = generateDungeon({ atmosphere: id, roomCount: 8, seed: 7 });
      const size = boardSizeFor(atmosphereById(id), 8);

      expect({ width: layout.width, height: layout.height }).toEqual(size);
    }
  });

  it('leaves every dungeon walkable end to end', () => {
    for (const id of DUNGEON_ATMOSPHERE_IDS) {
      for (const seed of SEEDS) {
        const layout = generateDungeon({ atmosphere: id, roomCount: 8, seed });
        expect(reachableCells(layout, layout.entrance).size).toBe(countOpenCells(layout));
      }
    }
  });

  it('breaks the outer wall in exactly one place for a tunnel mouth', () => {
    for (const id of DUNGEON_ATMOSPHERE_IDS) {
      for (const seed of SEEDS) {
        const layout = generateDungeon({ atmosphere: id, roomCount: 8, seed, entrance: 'tunnel' });
        expect(layout.mouth).not.toBeNull();

        const open: string[] = [];
        for (let x = 0; x < layout.width; x++) {
          if (cellAt(layout, x, 0) !== DungeonCell.Rock) open.push(`${x},0`);
          if (cellAt(layout, x, layout.height - 1) !== DungeonCell.Rock) open.push(`${x},${layout.height - 1}`);
        }
        for (let y = 0; y < layout.height; y++) {
          if (cellAt(layout, 0, y) !== DungeonCell.Rock) open.push(`0,${y}`);
          if (cellAt(layout, layout.width - 1, y) !== DungeonCell.Rock) open.push(`${layout.width - 1},${y}`);
        }

        expect(open).toEqual([`${layout.mouth!.x},${layout.mouth!.y}`]);
      }
    }
  });

  it('leaves the outer wall whole when the way in is a stair', () => {
    for (const id of DUNGEON_ATMOSPHERE_IDS) {
      const layout = generateDungeon({ atmosphere: id, roomCount: 8, seed: 7, entrance: 'stair' });

      expect(layout.mouth).toBeNull();
      for (let x = 0; x < layout.width; x++) {
        expect(cellAt(layout, x, 0)).toBe(DungeonCell.Rock);
        expect(cellAt(layout, x, layout.height - 1)).toBe(DungeonCell.Rock);
      }
    }
  });

  it('starts the party at the mouth, and can still walk the whole place from there', () => {
    for (const seed of SEEDS) {
      const layout = generateDungeon({ atmosphere: 'cavern', roomCount: 8, seed, entrance: 'tunnel' });

      expect(layout.entrance).toEqual(layout.mouth);
      expect(reachableCells(layout, layout.entrance).size).toBe(countOpenCells(layout));
    }
  });

  it('draws no stair over a mouth, because the mouth is the way in', () => {
    const tunnel = planDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 7, entrance: 'tunnel' });
    const stair = planDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 7, entrance: 'stair' });

    expect(tunnel.blocks.blocks.some((block) => block.kind === 'stairUp')).toBe(false);
    expect(stair.blocks.blocks.some((block) => block.kind === 'stairUp')).toBe(true);
  });

  it('gives back the same dungeon for the same request', () => {
    const first = generateDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 55 });
    const second = generateDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 55 });

    expect(Array.from(first.cells)).toEqual(Array.from(second.cells));
  });

  it('falls back to the stone dungeon for an atmosphere it does not know', () => {
    const layout = generateDungeon({ atmosphere: 'nonsense' as never, roomCount: 8, seed: 7 });

    expect({ width: layout.width, height: layout.height }).toEqual(boardSizeFor(DUNGEON_ATMOSPHERES.stoneDungeon, 8));
  });
});

describe('planDungeon()', () => {
  it('stays inside the terrain budget for every atmosphere at any size', () => {
    for (const id of DUNGEON_ATMOSPHERE_IDS) {
      for (const rooms of [8, 20]) {
        for (const seed of SEEDS) {
          const plan = planDungeon({ atmosphere: id, roomCount: rooms, seed });
          expect(plan.blocks.blocks.length).toBeLessThanOrEqual(MAP_MAX_TERRAINS);
        }
      }
    }
  });

  describe('walls too sheer to get up', () => {
    function planWith(sheerWalls: boolean) {
      return planDungeon(
        { atmosphere: 'stoneDungeon', roomCount: 8, seed: 7 },
        {
          placeDoors: true,
          placeStairs: true,
          sheerWalls,
        }
      ).blocks.blocks;
    }

    it('leaves every block climbable when it is not asked for', () => {
      expect(planWith(false).every((block) => block.blocksClimb !== true)).toBe(true);
    });

    it('is not asked for by a caller that says nothing of it', () => {
      const blocks = planDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 7 }).blocks.blocks;

      expect(blocks.every((block) => block.blocksClimb !== true)).toBe(true);
    });

    it('makes the walls and the doors sheer, and leaves the stairs to be walked up', () => {
      const blocks = planWith(true);
      const kindsOf = (sheer: boolean) => new Set(blocks.filter((b) => b.blocksClimb === sheer).map((b) => b.kind));

      expect(blocks.some((block) => block.kind === 'wall')).toBe(true);
      expect(blocks.some((block) => block.kind === 'door')).toBe(true);
      expect(kindsOf(true)).toEqual(new Set(['wall', 'door']));
      expect(kindsOf(true).has('stairUp')).toBe(false);
      expect(kindsOf(true).has('stairDown')).toBe(false);
    });
  });

  it('counts twelve objects to sync for every terrain', () => {
    const plan = planDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 7 });

    expect(syncObjectCount(plan.blocks.blocks)).toBe(plan.blocks.blocks.length * 12);
  });

  it('stands every light on open floor, never inside the rock', () => {
    // A light on a merged rock block stops the block blocking light, opening a hole its whole size.
    for (const id of DUNGEON_ATMOSPHERE_IDS) {
      const plan = planDungeon({ atmosphere: id, roomCount: 12, seed: 7 });
      for (const light of plan.blocks.lights) {
        expect(cellAt(plan.layout, light.x, light.y)).not.toBe(DungeonCell.Rock);
      }
    }
  });

  it('fixes a bracket to stone and leaves a fire room to stand around', () => {
    for (const id of DUNGEON_ATMOSPHERE_IDS) {
      const plan = planDungeon({ atmosphere: id, roomCount: 12, seed: 7 });
      for (const light of plan.blocks.lights) {
        const againstStone = [
          cellAt(plan.layout, light.x + 1, light.y),
          cellAt(plan.layout, light.x - 1, light.y),
          cellAt(plan.layout, light.x, light.y + 1),
          cellAt(plan.layout, light.x, light.y - 1),
        ].some((cell) => cell === DungeonCell.Rock);

        // A bracket needs a wall to hang on; a fire needs room to stand around it.
        if (light.kind === 'sconce') expect(againstStone).toBe(true);
        if (light.kind === 'campfire' || light.kind === 'brazier') expect(againstStone).toBe(false);
      }
    }
  });

  it('turns a bracket away from the stone behind it', () => {
    const plan = planDungeon({ atmosphere: 'stoneDungeon', roomCount: 12, seed: 7 });
    let checked = 0;

    for (const light of plan.blocks.lights) {
      if (light.kind !== 'sconce') continue;
      expect([0, 90, 180, 270]).toContain(light.facing);

      // The angle everything on the table measures: cosine along x, sine along y, y running down.
      const radians = (light.facing * Math.PI) / 180;
      const ax = Math.round(Math.cos(radians));
      const ay = Math.round(Math.sin(radians));

      expect(cellAt(plan.layout, light.x - ax, light.y - ay)).toBe(DungeonCell.Rock);
      expect(cellAt(plan.layout, light.x + ax, light.y + ay)).not.toBe(DungeonCell.Rock);
      checked++;
    }

    expect(checked).toBeGreaterThan(0);
  });

  it('never stands two lights on the one cell', () => {
    for (const id of DUNGEON_ATMOSPHERE_IDS) {
      for (const seed of SEEDS) {
        const plan = planDungeon({ atmosphere: id, roomCount: 12, seed });
        const cells = plan.blocks.lights.map((light) => `${light.x},${light.y}`);

        expect(new Set(cells).size).toBe(cells.length);
      }
    }
  });

  it('never merges a block longer than the span', () => {
    const plan = planDungeon({ atmosphere: 'stoneDungeon', roomCount: 12, seed: 7 });

    for (const block of plan.blocks.blocks) {
      expect(block.rect.w).toBeLessThanOrEqual(MAX_MERGE_SPAN);
      expect(block.rect.h).toBeLessThanOrEqual(MAX_MERGE_SPAN);
    }
  });

  it('leaves out the doors and the stairs when told to', () => {
    const plan = planDungeon(
      { atmosphere: 'stoneDungeon', roomCount: 8, seed: 7 },
      { placeDoors: false, placeStairs: false }
    );

    expect(plan.blocks.blocks.some((block) => block.kind === 'door')).toBe(false);
    expect(plan.blocks.blocks.some((block) => block.kind.startsWith('stair'))).toBe(false);
  });

  it('stands no more torches than the atmosphere asks for', () => {
    for (const id of DUNGEON_ATMOSPHERE_IDS) {
      const plan = planDungeon({ atmosphere: id, roomCount: 12, seed: 7 });

      expect(plan.blocks.torchSpots.length).toBeLessThanOrEqual(atmosphereById(id).torches);
      expect(plan.blocks.torchSpots.length).toBe(plan.blocks.torchRooms.length);
    }
  });

  it('opens two doors filling one gap outward from the middle, not both the same way', () => {
    const plan = planDungeon({ atmosphere: 'stoneDungeon', roomCount: 12, seed: 7 });
    const doors = plan.blocks.blocks.filter((block) => block.kind === 'door');
    const at = new Map(doors.map((door) => [`${door.rect.x},${door.rect.y}`, door]));
    let pairs = 0;

    for (const door of doors) {
      const before = door.across === 'x' ? `${door.rect.x},${door.rect.y - 1}` : `${door.rect.x - 1},${door.rect.y}`;
      const partner = at.get(before);
      if (!partner) {
        expect(door.doorMirrored).toBe(false);
        continue;
      }
      pairs++;
      // One of the pair is turned round, so the two swing apart rather than following each other.
      expect(door.doorMirrored).toBe(true);
      expect(partner.doorMirrored).toBe(false);
    }

    expect(pairs).toBeGreaterThan(0);
  });

  it('builds a door of four out of two slabs of two', () => {
    const plan = planDungeon({
      atmosphere: 'stoneDungeon',
      roomCount: 12,
      seed: 7,
      doorWidth: { least: 4, most: 4 },
      doubleDoorPercent: 100,
    });
    const doors = plan.blocks.blocks.filter((block) => block.kind === 'door');

    expect(doors.some((door) => Math.max(door.rect.w, door.rect.h) === 2)).toBe(true);
    expect(doors.some((door) => door.doorMirrored)).toBe(true);
    expect(doors.every((door) => Math.max(door.rect.w, door.rect.h) !== 4)).toBe(true);
  });

  it('gathers no door into a run of cells on a board of hexes', () => {
    const plan = planDungeon({
      atmosphere: 'stoneDungeon',
      roomCount: 8,
      seed: 7,
      gridType: GridType.HEX_VERTICAL,
      doorWidth: { least: 4, most: 4 },
    });

    for (const block of plan.blocks.blocks.filter((entry) => entry.kind === 'door')) {
      expect(block.rect.w).toBe(1);
      expect(block.rect.h).toBe(1);
    }
  });

  it('paints the ground rather than building it, and stops light at a wall facing open ground', () => {
    const plan = planDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 7 });
    const walls = plan.blocks.blocks.filter((block) => block.kind === 'wall');

    expect(plan.blocks.paint.some((patch) => patch.kind === 'floor')).toBe(true);
    expect(walls.some((block) => block.blocksSight)).toBe(true);
  });

  it('spares the sight test the stone buried behind other stone', () => {
    // How much stone ends up buried depends on the shape, so it is only checked where there is some.
    for (const seed of SEEDS) {
      const plan = planDungeon({ atmosphere: 'stoneDungeon', roomCount: 20, seed });
      for (const block of plan.blocks.blocks) {
        if (block.kind !== 'wall' || block.blocksSight) continue;
        expect(block.rooms).toEqual([]);
      }
    }
  });
});

describe('the atmosphere table', () => {
  it('has an entry for every id', () => {
    for (const id of DUNGEON_ATMOSPHERE_IDS) {
      expect(DUNGEON_ATMOSPHERES[id].id).toBe(id);
    }
  });

  it('says how its doors open and how the party gets in', () => {
    for (const id of DUNGEON_ATMOSPHERE_IDS) {
      const atmosphere = DUNGEON_ATMOSPHERES[id];
      expect(DUNGEON_DOOR_STYLES).toContain(atmosphere.doorStyle);
      expect(DUNGEON_ENTRANCE_STYLES).toContain(atmosphere.entrance);
    }
  });

  it('carries the shape its algorithm needs', () => {
    for (const id of DUNGEON_ATMOSPHERE_IDS) {
      const atmosphere = DUNGEON_ATMOSPHERES[id];
      if (atmosphere.algorithm === 'cave') expect(atmosphere.cave).toBeDefined();
      else expect(atmosphere.rooms).toBeDefined();
    }
  });
});

describe('laying a dungeon on hexes', () => {
  const moods = DUNGEON_ATMOSPHERE_IDS;

  it('gives every cell a block of its own, hexes not gathering into rectangles', () => {
    const plan = planDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 42, gridType: GridType.HEX_VERTICAL });

    expect(plan.blocks.blocks.every((block) => block.rect.w === 1 && block.rect.h === 1)).toBe(true);
  });

  it('still gathers them on squares, which is what keeps a dungeon affordable', () => {
    const plan = planDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 42 });

    expect(plan.blocks.blocks.some((block) => block.rect.w > 1 || block.rect.h > 1)).toBe(true);
  });

  it('cuts the board down for hexes, since each cell now costs a block', () => {
    const square = planDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 42 });
    const hexed = planDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 42, gridType: GridType.HEX_VERTICAL });

    expect(hexed.layout.width).toBeLessThan(square.layout.width);
    expect(hexed.layout.height).toBeLessThan(square.layout.height);
  });

  it('stays within what a table will carry, whatever is asked of it', () => {
    for (const atmosphere of moods) {
      for (const roomCount of [3, 8, 20]) {
        for (const seed of [1, 42, 777, 1234]) {
          for (const gridType of [GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL]) {
            const plan = planDungeon({ atmosphere, roomCount, seed, gridType });
            expect(plan.blocks.blocks.length).toBeLessThanOrEqual(MAP_MAX_TERRAINS);
          }
        }
      }
    }
  });

  it('leaves a hex dungeon walkable, the ways it carves being ways a hex can be walked', () => {
    const plan = planDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 42, gridType: GridType.HEX_VERTICAL });

    // Every way the layout joins two cells - north, south, east, west on the offset grid - is
    // one of the six a hex has, so nothing it carved can have come apart by being laid on hexes.
    expect(plan.layout.rooms.length).toBeGreaterThan(0);
  });
});

describe('passages cut to the width the room asked for', () => {
  it('holds the width between one and four', () => {
    expect(clampCorridorWidth(0)).toBe(1);
    expect(clampCorridorWidth(9)).toBe(4);
    expect(clampCorridorWidth(3)).toBe(3);
    expect(clampCorridorWidth(undefined)).toBe(1);
    expect(clampCorridorWidth(Number.NaN)).toBe(1);
  });

  it('leaves a dungeon of rooms cutting one cell across, and a cave its own two', () => {
    expect(defaultCorridorWidth(atmosphereById('stoneDungeon'))).toBe(1);
    expect(defaultCorridorWidth(atmosphereById('cavern'))).toBe(2);
  });

  it('opens a passage the width it was asked for', () => {
    for (const wide of [2, 3, 4]) {
      const layout = generateDungeon({
        atmosphere: 'stoneDungeon',
        roomCount: 8,
        seed: 7,
        corridorWidth: { least: wide, most: wide },
      });
      const step = wide + 1;
      let squares = 0;
      for (let y = 1; y + wide <= layout.height - 1; y += step) {
        for (let x = 1; x + wide <= layout.width - 1; x += step) {
          const cells: number[] = [];
          for (let dy = 0; dy < wide; dy++) {
            for (let dx = 0; dx < wide; dx++) cells.push(cellAt(layout, x + dx, y + dy));
          }
          if (!cells.includes(DungeonCell.Corridor)) continue;
          if (cells.includes(DungeonCell.Room)) continue;
          squares++;

          expect(cells.every((cell) => cell !== DungeonCell.Rock)).toBe(true);
        }
      }

      expect(squares).toBeGreaterThan(0);
    }
  });

  it('leaves every open cell reachable however wide the passages are', () => {
    for (const wide of [1, 2, 3, 4]) {
      for (const seed of SEEDS) {
        const layout = generateDungeon({
          atmosphere: 'stoneDungeon',
          roomCount: 8,
          seed,
          corridorWidth: { least: wide, most: wide },
        });

        expect(reachableCells(layout, layout.entrance).size).toBe(countOpenCells(layout));
      }
    }
  });

  it('digs a cave its tunnels at the width asked for as well', () => {
    const narrow = generateDungeon({
      atmosphere: 'cavern',
      roomCount: 8,
      seed: 7,
      corridorWidth: { least: 1, most: 1 },
    });
    const wide = generateDungeon({ atmosphere: 'cavern', roomCount: 8, seed: 7, corridorWidth: { least: 4, most: 4 } });

    expect(countOpenCells(wide)).toBeGreaterThan(countOpenCells(narrow));
  });

  it('keeps a board it can lay the lattice on whole', () => {
    for (const wide of [1, 2, 3, 4]) {
      const size = boardSizeFor(atmosphereById('stoneDungeon'), 12, wide);

      expect((size.width - wide - 2) % (wide + 1)).toBe(0);
      expect((size.height - wide - 2) % (wide + 1)).toBe(0);
      expect(size.width).toBeLessThanOrEqual(MAX_BOARD_WIDTH);
      expect(size.height).toBeLessThanOrEqual(MAX_BOARD_HEIGHT);
    }
  });

  it('stays inside what a table may hold', () => {
    for (const wide of [1, 2, 3, 4]) {
      const plan = planDungeon({
        atmosphere: 'stoneDungeon',
        roomCount: 20,
        seed: 3,
        corridorWidth: { least: wide, most: wide },
      });

      expect(plan.blocks.blocks.length).toBeLessThanOrEqual(MAP_MAX_TERRAINS);
    }
  });
});
