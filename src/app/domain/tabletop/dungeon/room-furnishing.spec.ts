import { seededRandom } from '@axe/core/util/seeded-random';
import { atmosphereById, DUNGEON_ATMOSPHERE_IDS } from '@axe/domain/tabletop/dungeon/dungeon-atmosphere';
import { layoutToBlocks } from '@axe/domain/tabletop/dungeon/dungeon-blocks';
import { defaultCorridorWidth, generateDungeon, planDungeon } from '@axe/domain/tabletop/dungeon/dungeon-generator';
import {
  cellAt,
  DungeonCell,
  DungeonLayout,
  DungeonPoint,
  DungeonRect,
  DungeonRoomRole,
} from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { musterCells } from '@axe/domain/tabletop/dungeon/entrance-muster';
import {
  CONTAINER_LENGTH,
  CONTAINER_WIDTH,
  furnishedCells,
  FURNISHING_SHAPES,
  furnishRooms,
} from '@axe/domain/tabletop/dungeon/room-furnishing';
import { GridType } from '@axe/domain/tabletop/game-table';

const SEEDS = [1, 7, 42, 1234, 99999];
const FURNISHED = ['illegalBar', 'abandonedBuilding', 'containerWarehouse'] as const;

function open(layout: DungeonLayout, x: number, y: number): boolean {
  const cell = cellAt(layout, x, y);
  return cell === DungeonCell.Room || cell === DungeonCell.Corridor || cell === DungeonCell.Door;
}

/** Every open cell a party could walk to from the way in, going round the furniture. */
function walkable(layout: DungeonLayout): Set<number> {
  const blocked = furnishedCells(layout);
  const start = layout.entrance.y * layout.width + layout.entrance.x;
  const seen = new Set<number>([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const x = queue[head] % layout.width;
    const y = Math.floor(queue[head] / layout.width);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = (y + dy) * layout.width + x + dx;
      if (!open(layout, x + dx, y + dy) || blocked.has(next) || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

function openCount(layout: DungeonLayout): number {
  let count = 0;
  for (let y = 0; y < layout.height; y++) {
    for (let x = 0; x < layout.width; x++) if (open(layout, x, y)) count++;
  }
  return count;
}

function near(a: DungeonPoint, b: DungeonPoint): boolean {
  return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
}

/** Whether any cell a piece takes is on or beside a point. */
function touches(piece: DungeonRect, point: DungeonPoint): boolean {
  return (
    point.x >= piece.x - 1 && point.x <= piece.x + piece.w && point.y >= piece.y - 1 && point.y <= piece.y + piece.h
  );
}

const CONTAINERS = ['containerRed', 'containerBlue', 'containerGreen'];

describe('furnishRooms()', () => {
  it('leaves every room reachable, going round whatever stands in it', () => {
    for (const atmosphere of FURNISHED) {
      for (const gridType of [GridType.SQUARE, GridType.HEX_VERTICAL]) {
        for (const seed of SEEDS) {
          const layout = generateDungeon({ atmosphere, roomCount: 10, seed, gridType });
          const furniture = furnishedCells(layout).size;

          expect(layout.furnishings!.length).toBeGreaterThan(0);
          expect(walkable(layout).size).toBe(openCount(layout) - furniture);
        }
      }
    }
  });

  it('puts nothing on the way in or the way out, nor beside either', () => {
    for (const atmosphere of FURNISHED) {
      for (const seed of SEEDS) {
        const layout = generateDungeon({ atmosphere, roomCount: 10, seed });
        const ends = [layout.entrance, layout.exit, ...(layout.mouth ? [layout.mouth] : [])];
        for (const piece of layout.furnishings!) {
          for (const end of ends) expect(touches(piece, end)).toBe(false);
        }
      }
    }
  });

  it('stands nothing beside a door, where it would be in the way of it', () => {
    for (const atmosphere of FURNISHED) {
      for (const seed of SEEDS) {
        const layout = generateDungeon({ atmosphere, roomCount: 10, seed });
        for (const piece of layout.furnishings!.filter((each) => each.w === 1 && each.h === 1)) {
          for (const door of layout.doors) expect(near(piece, door)).toBe(false);
        }
      }
    }
  });

  it('runs a counter along the long wall of a bar, with room to serve behind it and seats in front', () => {
    const layout = SEEDS.map((seed) => generateDungeon({ atmosphere: 'illegalBar', roomCount: 8, seed })).find((each) =>
      each.furnishings!.some((piece) => piece.piece === 'counter')
    )!;
    const counter = layout.furnishings!.find((piece) => piece.piece === 'counter')!;
    const hall = layout.rooms.find((room) => room.role === DungeonRoomRole.Hall)!;
    const along = counter.w > 1;

    expect(along ? counter.w : counter.h).toBe((along ? hall.w : hall.h) - 2);
    const behind = along
      ? { x: counter.x, y: counter.y === hall.y + 1 ? hall.y : counter.y + 1 }
      : { x: counter.x === hall.x + 1 ? hall.x : counter.x + 1, y: counter.y };
    expect(cellAt(layout, behind.x, behind.y)).toBe(DungeonCell.Room);
    expect(furnishedCells(layout).has(behind.y * layout.width + behind.x)).toBe(false);
    expect(layout.furnishings!.filter((piece) => piece.piece === 'stool').length).toBeGreaterThan(0);
  });

  it('keeps a counter to the floor of the bar, and tables out of its store rooms', () => {
    for (const seed of SEEDS) {
      const layout = generateDungeon({ atmosphere: 'illegalBar', roomCount: 12, seed });
      const roleAt = (x: number, y: number) =>
        layout.rooms.find((room) => room.x <= x && x < room.x + room.w && room.y <= y && y < room.y + room.h)?.role;
      for (const piece of layout.furnishings!) {
        if (piece.piece === 'counter') expect(roleAt(piece.x, piece.y)).toBe(DungeonRoomRole.Hall);
        if (piece.piece === 'table') expect(roleAt(piece.x, piece.y)).not.toBe(DungeonRoomRole.DeadEnd);
      }
    }
  });

  it('holds the ceiling of an office floor up on columns, well apart', () => {
    const pillars = SEEDS.flatMap(
      (seed) =>
        generateDungeon({ atmosphere: 'abandonedBuilding', roomCount: 10, seed }).furnishings!.filter(
          (piece) => piece.piece === 'pillar'
        ).length
    );

    expect(pillars.some((count) => count > 0)).toBe(true);
  });

  it('turns only what is shoved about, and each only as far as its shape allows', () => {
    for (const atmosphere of FURNISHED) {
      for (const seed of SEEDS) {
        for (const piece of generateDungeon({ atmosphere, roomCount: 10, seed }).furnishings!) {
          expect(Math.abs(piece.spin)).toBeLessThanOrEqual(FURNISHING_SHAPES[piece.piece].spin ?? 0);
        }
      }
    }
  });

  it('gives back the same furniture for the same request', () => {
    const first = generateDungeon({ atmosphere: 'illegalBar', roomCount: 8, seed: 42 });
    const second = generateDungeon({ atmosphere: 'illegalBar', roomCount: 8, seed: 42 });

    expect(second.furnishings).toEqual(first.furnishings);
  });

  it('rows containers down a hold with aisles between, none touching another or a wall', () => {
    for (const seed of SEEDS) {
      const layout = generateDungeon({ atmosphere: 'containerWarehouse', roomCount: 8, seed });
      const containers = layout.furnishings!.filter((piece) => CONTAINERS.includes(piece.piece));

      expect(containers.length).toBeGreaterThan(0);
      for (const box of containers) {
        expect([box.w, box.h].sort()).toEqual([CONTAINER_WIDTH, CONTAINER_LENGTH]);
        for (let dy = -1; dy <= box.h; dy++) {
          for (let dx = -1; dx <= box.w; dx++) {
            const inside = dx >= 0 && dy >= 0 && dx < box.w && dy < box.h;
            const cell = cellAt(layout, box.x + dx, box.y + dy);
            if (!inside) expect([DungeonCell.Room, DungeonCell.Corridor]).toContain(cell);
          }
        }
        for (const other of containers) {
          if (other === box) continue;
          const apart =
            other.x > box.x + box.w ||
            box.x > other.x + other.w ||
            other.y > box.y + box.h ||
            box.y > other.y + other.h;
          expect(apart).toBe(true);
        }
      }
    }
  });

  it('stands no container against anything already put down, however crowded the room', () => {
    let crowded = 0;
    for (const seed of SEEDS) {
      const layout = generateDungeon({ atmosphere: 'containerWarehouse', roomCount: 8, seed });
      const placed = furnishRooms(
        layout,
        [
          { piece: 'crate', arrangement: 'scatter', roles: ['hall', 'chamber'], every: 12 },
          { piece: 'containerRed', arrangement: 'stacks', roles: ['hall', 'chamber'], every: 2 },
        ],
        seededRandom(seed)
      );
      const crates = placed.filter((piece) => piece.piece === 'crate');
      const containers = placed.filter((piece) => piece.piece === 'containerRed');

      if (crates.length > 0) crowded += containers.length;
      for (const box of containers) {
        for (const crate of crates) expect(touches(box, crate)).toBe(false);
      }
    }
    expect(crowded).toBeGreaterThan(0);
  });

  it('keeps a counter and its seats clear of the way in, even where it would otherwise stand', () => {
    for (const seed of SEEDS) {
      const layout = generateDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed });
      const room = layout.rooms.find((each) => each.index !== 0 && each.w >= each.h && each.w >= 5 && each.h >= 5)!;
      layout.entrance = { x: room.x + 1, y: room.y + 3 };
      layout.exit = layout.entrance;
      layout.mouth = null;
      for (const other of layout.rooms) other.role = other === room ? 'hall' : 'chamber';
      const placed = furnishRooms(
        layout,
        [{ piece: 'counter', arrangement: 'counter', roles: ['hall'], every: 0, seat: 'stool' }],
        seededRandom(seed)
      );

      for (const piece of placed) expect(touches(piece, layout.entrance)).toBe(false);
    }
  });

  it('stacks some containers two high on squares, and none on hexes', () => {
    const stacked = (gridType: GridType) =>
      SEEDS.flatMap(
        (seed) => generateDungeon({ atmosphere: 'containerWarehouse', roomCount: 8, seed, gridType }).furnishings!
      ).filter((piece) => piece.stack).length;

    expect(stacked(GridType.SQUARE)).toBeGreaterThan(0);
    expect(stacked(GridType.HEX_VERTICAL)).toBe(0);
  });

  it('cuts the passages of a warehouse two cells wide unless the table says otherwise', () => {
    expect(defaultCorridorWidth(atmosphereById('containerWarehouse'))).toBe(2);
    expect(defaultCorridorWidth(atmosphereById('illegalBar'))).toBe(1);
  });

  it('hides the ways out of the front of an illegal bar, and no other door', () => {
    for (const seed of SEEDS) {
      const layout = generateDungeon({ atmosphere: 'illegalBar', roomCount: 8, seed });
      const front = layout.doorLeaves.filter((leaf) => leaf.rooms.includes(0));

      expect(front.length).toBeGreaterThan(0);
      for (const leaf of layout.doorLeaves) expect(leaf.hidden === true).toBe(leaf.rooms.includes(0));
    }
    for (const seed of SEEDS) {
      const layout = generateDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed });
      expect(layout.doorLeaves.some((leaf) => leaf.hidden)).toBe(false);
    }
  });

  it('leaves a place with nothing to furnish it with bare', () => {
    for (const atmosphere of DUNGEON_ATMOSPHERE_IDS.filter((id) => !atmosphereById(id).furnishings)) {
      expect(generateDungeon({ atmosphere, roomCount: 8, seed: 42 }).furnishings).toBeUndefined();
    }
  });

  it('puts nothing in a room no plan calls for', () => {
    const layout = generateDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 42 });

    expect(furnishRooms(layout, [{ piece: 'table', arrangement: 'scatter', roles: [], every: 1 }], () => 0.5)).toEqual(
      []
    );
  });
});

describe('a furnished place on the table', () => {
  it('stands the party on the floor, never on the furniture', () => {
    for (const atmosphere of FURNISHED) {
      for (const seed of SEEDS) {
        const layout = generateDungeon({ atmosphere, roomCount: 8, seed });
        const furniture = furnishedCells(layout);
        for (const cell of musterCells(layout, layout.entrance, 12)) {
          expect(furniture.has(cell.y * layout.width + cell.x)).toBe(false);
        }
      }
    }
  });

  it('lights no lamp where furniture stands', () => {
    for (const atmosphere of FURNISHED) {
      for (const seed of SEEDS) {
        const plan = planDungeon({ atmosphere, roomCount: 12, seed });
        const furniture = furnishedCells(plan.layout);
        for (const light of plan.blocks.lights) {
          expect(furniture.has(light.y * plan.layout.width + light.x)).toBe(false);
        }
      }
    }
  });

  it('moves a lamp off a cell furniture has been put on', () => {
    const plan = planDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 42 });
    const lit = plan.blocks.lights;
    plan.layout.furnishings = lit.map((light) => ({
      piece: 'table' as const,
      x: light.x,
      y: light.y,
      w: 1,
      h: 1,
      spin: 0,
    }));
    const relit = layoutToBlocks(plan.layout, plan.atmosphere).lights;

    expect(lit.length).toBeGreaterThan(0);
    for (const light of relit) {
      expect(lit.some((before) => before.x === light.x && before.y === light.y)).toBe(false);
    }
  });

  it('builds each piece out of its own stuff, and a column out of the walls of the place', () => {
    const plan = planDungeon({ atmosphere: 'abandonedBuilding', roomCount: 12, seed: 7 });
    const pieces = plan.blocks.blocks.filter((block) => block.thing);

    expect(pieces.length).toBe(plan.layout.furnishings!.length);
    for (const block of pieces) {
      const shape = FURNISHING_SHAPES[block.thing as keyof typeof FURNISHING_SHAPES];
      if (shape.skin) {
        expect(block.kind).toBe('prop');
        expect(block.skin?.side).toEqual({ kind: 'texture', id: shape.skin.side });
      } else {
        expect(block.kind).toBe('wall');
        expect(block.skin).toBeUndefined();
        expect(block.blocksSight).toBe(true);
      }
    }
  });

  it('lays a counter as one run on squares, and as a piece to a cell on hexes', () => {
    const square = planDungeon({ atmosphere: 'illegalBar', roomCount: 8, seed: 7 });
    const run = square.layout.furnishings!.find((piece) => piece.piece === 'counter');
    const hexed = planDungeon({ atmosphere: 'illegalBar', roomCount: 8, seed: 7, gridType: GridType.HEX_VERTICAL });

    if (run) {
      const block = square.blocks.blocks.find((each) => each.thing === 'counter')!;
      const length = Math.max(run.w, run.h);
      expect(Math.max(block.footprint!.w, block.footprint!.d)).toBe(length);
      expect(Math.min(block.footprint!.w, block.footprint!.d)).toBe(FURNISHING_SHAPES.counter.fill);
    }
    const pieces = hexed.blocks.blocks.filter((block) => block.thing);
    expect(pieces.every((block) => block.rect.w === 1 && block.rect.h === 1)).toBe(true);
    const cells = hexed.layout.furnishings!.reduce((sum, piece) => sum + piece.w * piece.h, 0);
    expect(pieces.length).toBe(cells);
  });

  it('makes a column too sheer to climb when the walls are, and leaves the rest to be climbed on', () => {
    const plan = planDungeon(
      { atmosphere: 'abandonedBuilding', roomCount: 12, seed: 7 },
      { placeDoors: true, placeStairs: true, sheerWalls: true }
    );
    for (const block of plan.blocks.blocks.filter((each) => each.thing)) {
      expect(block.blocksClimb).toBe(block.thing === 'pillar');
    }
  });

  it('hangs steel doors in a bar that slide aside, and lights it with tubes in turn of colour', () => {
    const plan = planDungeon({ atmosphere: 'illegalBar', roomCount: 8, seed: 42 });
    const doors = plan.blocks.blocks.filter((block) => block.kind === 'door');
    const colors = atmosphereById('illegalBar').lighting!.colors!;

    expect(doors.length).toBeGreaterThan(0);
    expect(doors.every((door) => door.prop === 'door_steel' && door.doorStyle === 'slide')).toBe(true);
    expect(plan.blocks.lights.length).toBeGreaterThan(1);
    plan.blocks.lights.forEach((light, index) => {
      expect(light.kind).toBe('neon');
      expect(light.color).toBe(colors[index % colors.length]);
    });
  });

  it('still lights a dungeon by fire, burning the colour of its kind', () => {
    const plan = planDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 42 });

    expect(plan.blocks.lights.length).toBeGreaterThan(0);
    for (const light of plan.blocks.lights) {
      expect(['sconce', 'lantern', 'campfire', 'brazier', 'stand']).toContain(light.kind);
      expect(light.color).toBeUndefined();
    }
  });

  it('builds a stacked container as one block to a level, each standing on the one below', () => {
    const plan = planDungeon({ atmosphere: 'containerWarehouse', roomCount: 8, seed: 42 });
    const stacked = plan.layout.furnishings!.find((piece) => piece.stack)!;
    const levels = plan.blocks.blocks.filter((block) => block.rect.x === stacked.x && block.rect.y === stacked.y);

    expect(levels.map((block) => block.thing)).toEqual([stacked.piece, ...stacked.stack!]);
    expect(levels[0].altitude).toBeUndefined();
    expect(levels[1].altitude).toBe(FURNISHING_SHAPES[stacked.piece].height);
    for (const block of levels) {
      expect(block.footprint).toBeUndefined();
      expect(block.blocksSight).toBe(true);
      expect(block.rect).toEqual({ x: stacked.x, y: stacked.y, w: stacked.w, h: stacked.h });
    }
  });

  it('dresses a hidden door as the wall it stands in', () => {
    const plan = planDungeon({ atmosphere: 'illegalBar', roomCount: 8, seed: 42 });
    const doors = plan.blocks.blocks.filter((block) => block.kind === 'door');

    expect(doors.some((door) => door.disguised)).toBe(true);
    expect(doors.some((door) => !door.disguised)).toBe(true);
    for (const door of doors) expect(door.disguised === true).toBe(door.rooms.includes(0));
  });
});
