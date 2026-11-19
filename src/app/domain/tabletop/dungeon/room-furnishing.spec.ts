import { seededRandom } from '@axe/core/util/seeded-random';
import { atmosphereById, DUNGEON_ATMOSPHERE_IDS } from '@axe/domain/tabletop/dungeon/dungeon-atmosphere';
import { DEFAULT_BLOCK_OPTIONS, layoutToBlocks } from '@axe/domain/tabletop/dungeon/dungeon-blocks';
import { defaultCorridorWidth, generateDungeon, planDungeon } from '@axe/domain/tabletop/dungeon/dungeon-generator';
import {
  cellAt,
  DungeonCell,
  DungeonLayout,
  DungeonPoint,
  DungeonRect,
  DungeonRoomRole,
  FurnishingId,
} from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { musterCells } from '@axe/domain/tabletop/dungeon/entrance-muster';
import { DOOR_MODELS, doorModelTurn, FURNISHING_MODELS } from '@axe/domain/tabletop/dungeon/furnishing-models';
import {
  CONTAINER_LENGTH,
  CONTAINER_WIDTH,
  furnishedCells,
  FURNISHING_SHAPES,
  furnishRooms,
} from '@axe/domain/tabletop/dungeon/room-furnishing';
import { assignRoomSets } from '@axe/domain/tabletop/dungeon/room-roles';
import { GridType } from '@axe/domain/tabletop/game-table';

const SEEDS = [1, 7, 42, 1234, 99999];
const FURNISHED = ['illegalBar', 'abandonedBuilding', 'containerWarehouse', 'sewer', 'wizardTower'] as const;

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
const PIPES: readonly FurnishingId[] = ['pipe', 'pipeValve', 'pipeElbow', 'pipeEnd'];

type Way = 'n' | 'e' | 's' | 'w';
/** The four ways out of a cell, in the order a quarter turn clockwise takes one to the next. */
const WAYS: readonly (readonly [Way, number, number])[] = [
  ['n', 0, -1],
  ['e', 1, 0],
  ['s', 0, 1],
  ['w', -1, 0],
];
const BACK: Readonly<Record<Way, Way>> = { n: 's', s: 'n', e: 'w', w: 'e' };

/**
 * The ways a part of a pipe joins on, turned as it is: a length and a valve are made west to east, a
 * bend west to south and an end to the west, and each is turned clockwise from there.
 */
function pipeWays(piece: FurnishingId, spin: number): Way[] {
  const made: Way[] = piece === 'pipeEnd' ? ['w'] : piece === 'pipeElbow' ? ['w', 's'] : ['w', 'e'];
  const order = WAYS.map(([name]) => name);
  return made.map((way) => order[(order.indexOf(way) + spin / 90) % 4]);
}

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
      each.furnishings!.some((piece) => piece.piece === 'barCounter')
    )!;
    const counter = layout.furnishings!.find((piece) => piece.piece === 'barCounter')!;
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
        if (piece.piece === 'barCounter') expect(roleAt(piece.x, piece.y)).toBe(DungeonRoomRole.Hall);
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

  it('stands everything in a sewer against a wall, its barrels and crates heaped in the corners', () => {
    let heaped = 0;
    for (const gridType of [GridType.SQUARE, GridType.HEX_VERTICAL]) {
      for (const seed of SEEDS) {
        const layout = generateDungeon({ atmosphere: 'sewer', roomCount: 10, seed, gridType });
        const pieces = layout.furnishings!;
        const at = new Map(pieces.map((piece) => [piece.y * layout.width + piece.x, piece]));
        for (const piece of pieces) {
          expect([piece.w, piece.h]).toEqual([1, 1]);
          const walls = WAYS.filter(([, dx, dy]) => cellAt(layout, piece.x + dx, piece.y + dy) === DungeonCell.Rock);
          expect(walls.length, `${piece.piece} at ${piece.x},${piece.y} of seed ${seed}`).toBeGreaterThan(0);
          if (PIPES.includes(piece.piece)) continue;
          if (WAYS.some(([, dx, dy]) => at.has((piece.y + dy) * layout.width + piece.x + dx))) heaped++;
        }
      }
    }
    expect(heaped).toBeGreaterThan(10);
  });

  it('lays a pipe in a sewer as one run: every part joins the next, bends at the corners and an end at each end', () => {
    let runs = 0;
    let bends = 0;
    let valves = 0;
    for (const seed of SEEDS) {
      const layout = generateDungeon({ atmosphere: 'sewer', roomCount: 10, seed });
      const parts = layout.furnishings!.filter((piece) => PIPES.includes(piece.piece));
      const at = new Map(parts.map((part) => [part.y * layout.width + part.x, part]));
      const joins = (part: (typeof parts)[number]) => pipeWays(part.piece, part.spin);
      for (const part of parts) {
        const ways = joins(part);
        expect(ways.length, part.piece).toBe(part.piece === 'pipeEnd' ? 1 : 2);
        for (const way of ways) {
          const [, dx, dy] = WAYS.find(([name]) => name === way)!;
          const next = at.get((part.y + dy) * layout.width + part.x + dx);
          expect(next, `${part.piece} at ${part.x},${part.y} of seed ${seed} leads ${way} to nothing`).toBeDefined();
          // The part it leads to leads back to it.
          expect(joins(next!)).toContain(BACK[way]);
        }
      }
      runs += parts.filter((part) => part.piece === 'pipeEnd').length / 2;
      bends += parts.filter((part) => part.piece === 'pipeElbow').length;
      valves += parts.filter((part) => part.piece === 'pipeValve').length;
    }
    expect(Number.isInteger(runs)).toBe(true);
    expect(runs).toBeGreaterThan(3);
    expect(bends).toBeGreaterThan(0);
    expect(valves).toBeGreaterThan(0);
  });

  it('keeps a pipe in a chamber short, and runs one round the walls of the room at the bottom', () => {
    for (const seed of SEEDS) {
      const layout = generateDungeon({ atmosphere: 'sewer', roomCount: 10, seed });
      for (const room of layout.rooms) {
        const parts = layout.furnishings!.filter(
          (piece) =>
            PIPES.includes(piece.piece) &&
            piece.x >= room.x &&
            piece.x < room.x + room.w &&
            piece.y >= room.y &&
            piece.y < room.y + room.h
        );
        if (room.role === DungeonRoomRole.Chamber) expect(parts.length).toBeLessThanOrEqual(6);
        if (parts.length > 0) expect(parts.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('turns only what is shoved about, and each only as far as its shape allows', () => {
    for (const atmosphere of FURNISHED) {
      for (const seed of SEEDS) {
        for (const piece of generateDungeon({ atmosphere, roomCount: 10, seed }).furnishings!) {
          // A part of a pipe is turned to its run rather than shoved about.
          if (PIPES.includes(piece.piece)) continue;
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
    const cells = hexed.layout.furnishings!.reduce(
      (sum, piece) => sum + piece.w * piece.h * (1 + (piece.stack?.length ?? 0)),
      0
    );
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

  it('stands each piece of furniture that has a model as it, turned a quarter where it lies north to south', () => {
    const options = { placeDoors: true, placeStairs: true, models: true };
    const warehouse = planDungeon({ atmosphere: 'containerWarehouse', roomCount: 8, seed: 42 }, options);
    const containers = warehouse.blocks.blocks.filter((block) => block.thing?.startsWith('container'));

    expect(containers.length).toBeGreaterThan(0);
    for (const block of containers) {
      expect(block.model).toBe(FURNISHING_MODELS[block.thing as FurnishingId]);
      expect(block.modelTurn).toBe(block.rect.h > block.rect.w ? 90 : undefined);
    }
    const building = planDungeon({ atmosphere: 'abandonedBuilding', roomCount: 12, seed: 7 }, options);
    const pieces = building.blocks.blocks.filter((block) => block.thing);
    expect(pieces.filter((block) => block.thing === 'pillar').every((block) => block.model === undefined)).toBe(true);
    expect(pieces.filter((block) => block.thing === 'desk').every((block) => block.model === 'prop_desk')).toBe(true);
  });

  it('stands a counter run along a wall as a row of its one-cell model, one block a cell over the run', () => {
    const options = { placeDoors: true, placeStairs: true, models: true };
    const built = planDungeon({ atmosphere: 'illegalBar', roomCount: 8, seed: 7 });
    const modelled = planDungeon({ atmosphere: 'illegalBar', roomCount: 8, seed: 7 }, options);
    const runs = built.layout.furnishings!.filter(
      (piece) => piece.piece === 'barCounter' || piece.piece === 'shopCounter'
    );
    const counters = modelled.blocks.blocks.filter(
      (block) => block.thing === 'barCounter' || block.thing === 'shopCounter'
    );

    expect(runs.length).toBeGreaterThan(0);
    expect(counters.length).toBe(runs.reduce((cells, run) => cells + run.w * run.h, 0));
    for (const block of counters) {
      expect(block.rect.w * block.rect.h).toBe(1);
      expect(block.model).toBe(FURNISHING_MODELS[block.thing as FurnishingId]);
    }
    const upright = SEEDS.concat([2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16])
      .map((seed) => planDungeon({ atmosphere: 'illegalBar', roomCount: 10, seed }, options))
      .find((plan) => plan.layout.furnishings!.some((piece) => piece.piece === 'barCounter' && piece.h > piece.w))!;
    expect(upright).toBeDefined();
    const run = upright.layout.furnishings!.find((piece) => piece.piece === 'barCounter' && piece.h > piece.w)!;
    const cells = upright.blocks.blocks.filter(
      (block) =>
        block.thing === 'barCounter' && block.rect.x === run.x && block.rect.y >= run.y && block.rect.y < run.y + run.h
    );
    expect(cells.length).toBe(run.h);
    expect(cells.every((block) => [90, 270].includes(block.modelTurn ?? 0) && block.footprint!.d === 1)).toBe(true);
  });

  it('builds furniture of its blocks where models are not asked for, or where it takes a block a cell', () => {
    const built = planDungeon({ atmosphere: 'containerWarehouse', roomCount: 8, seed: 42 });
    expect(built.blocks.blocks.some((block) => block.model)).toBe(false);

    const hexed = planDungeon(
      { atmosphere: 'containerWarehouse', roomCount: 8, seed: 42, gridType: GridType.HEX_VERTICAL },
      { placeDoors: true, placeStairs: true, models: true }
    );
    expect(
      hexed.blocks.blocks.filter((block) => block.thing?.startsWith('container')).some((block) => block.model)
    ).toBe(false);
  });

  it('stands every door as the model of its kind, hinged where the door turns, but no door dressed as its wall', () => {
    const options = { placeDoors: true, placeStairs: true, models: true };
    const plans = ['stoneDungeon', 'illegalBar', 'containerWarehouse'].flatMap((atmosphere) =>
      SEEDS.map((seed) => planDungeon({ atmosphere: atmosphere as never, roomCount: 8, seed }, options))
    );
    const doors = plans.flatMap((plan) => plan.blocks.blocks.filter((block) => block.kind === 'door'));
    const hidden = doors.filter((door) => door.disguised);
    const shown = doors.filter((door) => !door.disguised);

    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden.every((door) => door.model === undefined)).toBe(true);
    expect(new Set(shown.map((door) => door.model))).toEqual(new Set(['door_wood', 'door_steel', 'door_shutter']));
    for (const door of shown) {
      expect(door.model).toBe(DOOR_MODELS[door.prop!]);
      expect(door.modelTurn ?? 0).toBe(doorModelTurn(door.across!, door.doorMirrored === true));
    }
    expect(shown.some((door) => door.doorMirrored)).toBe(true);
    expect(shown.some((door) => door.across === 'x') && shown.some((door) => door.across === 'y')).toBe(true);
  });

  it('hangs the kind of door chosen in every doorway, opening as that kind opens, and sees over a saloon’s', () => {
    const doors = SEEDS.flatMap((seed) =>
      planDungeon(
        { atmosphere: 'illegalBar', roomCount: 8, seed },
        { placeDoors: true, placeStairs: true, models: true, door: 'door_saloon' }
      ).blocks.blocks.filter((block) => block.kind === 'door')
    );
    expect(doors.some((door) => door.disguised) && doors.some((door) => !door.disguised)).toBe(true);
    expect(doors.every((door) => door.prop === 'door_saloon' && door.doorStyle === 'swing')).toBe(true);
    expect(
      doors.filter((door) => !door.disguised).every((door) => !door.blocksSight && door.model === 'door_saloon')
    ).toBe(true);
    expect(doors.filter((door) => door.disguised).every((door) => door.blocksSight)).toBe(true);

    const grates = planDungeon(
      { atmosphere: 'illegalBar', roomCount: 8, seed: 42 },
      { placeDoors: true, placeStairs: true, door: 'door_iron_grate' }
    );
    const barred = grates.blocks.blocks.filter((block) => block.kind === 'door');
    expect(
      barred.every((door) => door.prop === 'door_iron_grate' && door.doorStyle === 'lift' && door.blocksSight)
    ).toBe(true);
    expect(barred.some((door) => door.model)).toBe(false);
  });

  it('dresses a hidden door as the wall it stands in', () => {
    const plan = planDungeon({ atmosphere: 'illegalBar', roomCount: 8, seed: 42 });
    const doors = plan.blocks.blocks.filter((block) => block.kind === 'door');

    expect(doors.some((door) => door.disguised)).toBe(true);
    expect(doors.some((door) => !door.disguised)).toBe(true);
    for (const door of doors) expect(door.disguised === true).toBe(door.rooms.includes(0));
  });
});

describe('furniture against the walls and in the middle', () => {
  /** A plain dungeon of every shape of room, furnished only as the plans given say. */
  function furnished(seed: number, plans: Parameters<typeof furnishRooms>[1]): DungeonLayout {
    const layout = generateDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed });
    layout.furnishings = furnishRooms(layout, plans, seededRandom(seed + 5));
    return layout;
  }

  /** The step from a cell towards the wall a piece facing a way has its back to. */
  const BEHIND: Readonly<Record<number, readonly [number, number]>> = {
    0: [0, -1],
    90: [1, 0],
    180: [0, 1],
    270: [-1, 0],
  };

  it('stands each piece with its back to a wall, clear of every way through the edge of its room', () => {
    let pieces = 0;
    for (const seed of SEEDS) {
      const layout = furnished(seed, [{ piece: 'crate', arrangement: 'wall', roles: ['hall', 'chamber'], every: 6 }]);
      for (const piece of layout.furnishings ?? []) {
        pieces++;
        expect(piece.facing, `${seed}`).toBeDefined();
        expect(piece.spin).toBe(0);
        const [bx, by] = BEHIND[piece.facing!];
        expect(cellAt(layout, piece.x + bx, piece.y + by), `${seed} ${JSON.stringify(piece)}`).toBe(DungeonCell.Rock);
        for (const door of layout.doors) expect(touches(piece, door), `${seed}`).toBe(false);
        expect(touches(piece, layout.entrance) || touches(piece, layout.exit)).toBe(false);
      }
      expect(walkable(layout).size, `${seed}`).toBe(openCount(layout) - furnishedCells(layout).size);
    }
    expect(pieces).toBeGreaterThan(SEEDS.length * 3);
  });

  it('lays them in runs side by side along one wall, and hangs one thing over each run where the plan asks', () => {
    for (const seed of SEEDS) {
      const layout = furnished(seed, [
        { piece: 'crate', arrangement: 'wall', roles: ['hall'], every: 2, most: 3, above: ['barrel'] },
      ]);
      const placed = layout.furnishings ?? [];
      const hung = placed.filter((piece) => piece.stack);
      expect(hung.length, `${seed}`).toBeGreaterThan(0);
      for (const piece of hung) expect(piece.stack).toEqual(['barrel']);
      const beside = placed.filter((piece) =>
        placed.some(
          (other) =>
            other !== piece &&
            other.facing === piece.facing &&
            Math.abs(other.x - piece.x) + Math.abs(other.y - piece.y) === 1
        )
      );
      expect(beside.length, `${seed}`).toBeGreaterThan(0);
    }
  });

  it('stands one piece in the middle of a room with open floor all round it, beside the stair where that is in the middle', () => {
    let pieces = 0;
    for (const seed of SEEDS) {
      const layout = furnished(seed, [{ piece: 'barrel', arrangement: 'centre', roles: ['hall', 'boss'], every: 1 }]);
      expect((layout.furnishings ?? []).length, `${seed}`).toBe(2);
      for (const piece of layout.furnishings ?? []) {
        pieces++;
        const room = layout.rooms.find(
          (each) => piece.x >= each.x && piece.y >= each.y && piece.x < each.x + each.w && piece.y < each.y + each.h
        )!;
        const off = Math.abs(piece.x - (room.x + (room.w - 1) / 2)) + Math.abs(piece.y - (room.y + (room.h - 1) / 2));
        expect(off, `${seed}`).toBeLessThanOrEqual(room.role === 'boss' ? 3 : 1);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          expect(open(layout, piece.x + dx, piece.y + dy)).toBe(true);
        }
      }
    }
    expect(pieces).toBeGreaterThanOrEqual(SEEDS.length);
  });

  it('stands a row against the wall behind a counter, facing the counter, and keeps a row to serve from between them', () => {
    let backed = 0;
    for (const id of DUNGEON_ATMOSPHERE_IDS) {
      for (const seed of SEEDS) {
        const layout = generateDungeon({ atmosphere: id, roomCount: 8, seed });
        if (atmosphereById(id).algorithm !== 'rooms') continue;
        const placed = furnishRooms(
          layout,
          [{ piece: 'counter', arrangement: 'counter', roles: ['hall'], every: 0, back: 'crate' }],
          seededRandom(seed)
        );
        const shelves = placed.filter((piece) => piece.piece === 'crate');
        const counter = placed.find((piece) => piece.piece === 'counter');
        if (!counter || shelves.length === 0) continue;
        backed++;
        expect(shelves.length).toBe(Math.max(counter.w, counter.h));
        for (const shelf of shelves) {
          const [bx, by] = BEHIND[shelf.facing!];
          expect(cellAt(layout, shelf.x + bx, shelf.y + by), `${id} ${seed}`).toBe(DungeonCell.Rock);
          const servedFrom = { x: shelf.x - bx, y: shelf.y - by };
          expect(
            placed.some((piece) => touchesCell(piece, servedFrom)),
            `${id} ${seed}`
          ).toBe(false);
          expect(touchesCell(counter, { x: shelf.x - 2 * bx, y: shelf.y - 2 * by }), `${id} ${seed}`).toBe(true);
        }
      }
    }
    expect(backed).toBeGreaterThan(0);
  });

  it('furnishes a room only by the plans for the kind of room it is', () => {
    const layout = generateDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 42 });
    assignRoomSets(layout, { chamber: ['store', 'barracks'], deadEnd: ['store'] });
    const kinds = layout.rooms.filter((room) => room.role === 'chamber').map((room) => room.set);
    expect(kinds.slice(0, 4)).toEqual(['store', 'barracks', 'store', 'barracks'].slice(0, kinds.length));
    expect(layout.rooms.filter((room) => room.role === 'hall').every((room) => room.set === undefined)).toBe(true);

    const placed = furnishRooms(
      layout,
      [{ piece: 'barrel', arrangement: 'scatter', roles: ['chamber', 'deadEnd'], every: 4, set: 'store' }],
      seededRandom(3)
    );
    const roomOf = (piece: DungeonRect) =>
      layout.rooms.find(
        (room) => piece.x >= room.x && piece.y >= room.y && piece.x < room.x + room.w && piece.y < room.y + room.h
      )!;
    expect(placed.length).toBeGreaterThan(0);
    expect(placed.every((piece) => roomOf(piece).set === 'store')).toBe(true);
  });

  it('turns the model of a piece that faces a way to face it', () => {
    const layout = furnished(7, [{ piece: 'crate', arrangement: 'wall', roles: ['hall', 'chamber'], every: 4 }]);
    const blocks = layoutToBlocks(layout, atmosphereById('stoneDungeon'), {
      ...DEFAULT_BLOCK_OPTIONS,
      models: true,
    }).blocks.filter((block) => block.thing === 'crate');
    const faced = (layout.furnishings ?? []).map((piece) => piece.facing ?? 0).sort();
    expect(blocks.map((block) => block.modelTurn ?? 0).sort()).toEqual(faced);
    expect(new Set(faced).size).toBeGreaterThan(1);
  });
});

/** Whether a piece takes a cell. */
function touchesCell(piece: DungeonRect, cell: DungeonPoint): boolean {
  return cell.x >= piece.x && cell.y >= piece.y && cell.x < piece.x + piece.w && cell.y < piece.y + piece.h;
}

describe('a piece of several cells against a wall', () => {
  it('names the cell out from the wall for it to stand on, and none for one in the middle of a room', () => {
    let beds = 0;
    for (const seed of SEEDS) {
      const layout = generateDungeon({ atmosphere: 'wizardTower', roomCount: 8, seed });
      for (const piece of layout.furnishings ?? []) {
        if (piece.piece === 'magicCircle') expect(piece.standsOn, `${seed}`).toBeUndefined();
        if (piece.piece !== 'canopyBed' || !piece.standsOn) continue;
        beds++;
        const back = { 0: [0, -1], 90: [1, 0], 180: [0, 1], 270: [-1, 0] }[piece.facing as 0 | 90 | 180 | 270];
        const beyond = { x: piece.standsOn.x + back[0], y: piece.standsOn.y + back[1] };
        const inside =
          beyond.x >= piece.x && beyond.y >= piece.y && beyond.x < piece.x + piece.w && beyond.y < piece.y + piece.h;
        expect(inside, `${seed} ${JSON.stringify(piece)}`).toBe(true);
      }
    }
    expect(beds).toBeGreaterThan(0);
  });
});

describe('one piece in the middle of a room', () => {
  it('lies along the room’s length, whichever way the piece was made longer', () => {
    for (const [roomW, roomH] of [
      [8, 4],
      [4, 8],
    ]) {
      const width = roomW + 4;
      const height = roomH + 4;
      const cells = new Uint8Array(width * height).fill(DungeonCell.Rock);
      const room = { x: 2, y: 2, w: roomW, h: roomH, index: 0, role: DungeonRoomRole.Hall };
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) cells[y * width + x] = DungeonCell.Room;
      }
      const layout = {
        width,
        height,
        cells,
        rooms: [room],
        doors: [],
        doorLeaves: [],
        links: [],
        entrance: { x: 0, y: 0 },
        exit: { x: 0, y: 0 },
        mouth: null,
        keyRoomIndex: -1,
        seed: 1,
      } as DungeonLayout;
      for (const piece of ['bed', 'rouletteTable'] as const) {
        const [placed] = furnishRooms(
          layout,
          [{ piece, arrangement: 'centre', roles: ['hall'], every: 0 }],
          seededRandom(1)
        );
        expect(placed.w > placed.h, `${piece} in ${roomW}x${roomH}`).toBe(roomW > roomH);
      }
    }
  });
});

describe('rows of seats facing the far end of a room', () => {
  it('faces away from the way in out of the rooms, though a way into a room next door opens on another side', () => {
    const width = 16;
    const height = 12;
    const cells = new Uint8Array(width * height).fill(DungeonCell.Rock);
    const nave = { x: 2, y: 2, w: 7, h: 7, index: 0, role: DungeonRoomRole.Hall };
    const vestry = { x: 10, y: 2, w: 3, h: 3, index: 1, role: DungeonRoomRole.Chamber };
    for (const room of [nave, vestry]) {
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) cells[y * width + x] = DungeonCell.Room;
      }
    }
    cells[9 * width + 5] = DungeonCell.Door;
    cells[10 * width + 5] = DungeonCell.Corridor;
    cells[3 * width + 9] = DungeonCell.Door;
    const layout = {
      width,
      height,
      cells,
      rooms: [nave, vestry],
      doors: [],
      doorLeaves: [],
      links: [],
      entrance: { x: 5, y: 10 },
      exit: { x: 11, y: 3 },
      mouth: null,
      keyRoomIndex: -1,
      seed: 1,
    } as DungeonLayout;

    const placed = furnishRooms(
      layout,
      [{ piece: 'barrel', arrangement: 'rows', roles: ['hall'], every: 0, back: 'crate' }],
      seededRandom(1)
    );

    const altar = placed.find((piece) => piece.piece === 'crate')!;
    expect(altar.y).toBe(nave.y);
    expect(placed.filter((piece) => piece.piece === 'barrel').every((pew) => pew.facing === 180)).toBe(true);
  });

  it('stands the back piece against the wall across from the way in facing the room, and rows of seats facing it with an aisle', () => {
    let rooms = 0;
    for (const seed of SEEDS) {
      const layout = generateDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed });
      const placed = furnishRooms(
        layout,
        [{ piece: 'barrel', arrangement: 'rows', roles: ['hall'], every: 0, back: 'crate' }],
        seededRandom(seed)
      );
      const altar = placed.find((piece) => piece.piece === 'crate');
      const pews = placed.filter((piece) => piece.piece === 'barrel');
      if (!altar || pews.length === 0) continue;
      rooms++;
      const back: Readonly<Record<number, readonly [number, number]>> = {
        0: [0, -1],
        90: [1, 0],
        180: [0, 1],
        270: [-1, 0],
      };
      const [bx, by] = back[altar.facing!];
      expect(cellAt(layout, altar.x + bx, altar.y + by), `${seed}`).toBe(DungeonCell.Rock);
      for (const pew of pews) {
        expect((pew.facing! + 180) % 360, `${seed}`).toBe(altar.facing);
        const towards = bx !== 0 ? Math.sign(altar.x - pew.x) : Math.sign(altar.y - pew.y);
        expect(towards, `${seed}`).toBe(bx !== 0 ? bx : by);
      }
      const hall = layout.rooms.find((room) => room.role === 'hall')!;
      const across = bx === 0;
      const middle = across ? hall.x + Math.floor(hall.w / 2) : hall.y + Math.floor(hall.h / 2);
      expect(pews.some((pew) => (across ? pew.x : pew.y) === middle)).toBe(false);
    }
    expect(rooms).toBeGreaterThan(2);
  });
});
