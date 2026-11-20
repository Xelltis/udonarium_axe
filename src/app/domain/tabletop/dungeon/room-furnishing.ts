import { TextureId, WallTextureId } from '@axe/domain/media/texture-catalog';
import {
  OPPOSITE_SIDE,
  ORTHOGONAL_STEPS,
  type Side,
  SIDE_STEPS,
  SIDES,
  SQUARE_STEPS_WITH_CORNERS,
  TURN_TO_FACE,
} from '@axe/domain/tabletop/cell-steps';
import {
  cellAt,
  DungeonCell,
  DungeonFurnishing,
  DungeonLayout,
  DungeonPoint,
  DungeonRect,
  DungeonRoom,
  DungeonRoomRoleValue,
  FurnishingId,
  roomCells,
} from '@axe/domain/tabletop/dungeon/dungeon-layout';

export interface FurnishingShape {
  /** What it is made of. Left out, it is made of the walls of the place, as a pillar is. */
  skin?: { side: WallTextureId | TextureId; top: WallTextureId | TextureId };
  /** How tall it stands, in cells. Left out, it goes up to the ceiling like the walls do. */
  height?: number;
  /** How much of its cell it takes, across and deep. A run takes all of its length; one fills its cells whole. */
  fill: number;
  blocksSight: boolean;
  /** How far it may be knocked off square, in degrees. Left out, it stands square to the room. */
  spin?: number;
  /**
   * Whether its model is made to the whole of its cell, as a part of a pipe is that meets the next at
   * the cell's edge: stood as its model it takes the whole cell, whatever share of it its blocks fill.
   */
  whole?: boolean;
  /**
   * How many cells it takes, across its front and deep from its front to its back, as its model is
   * made facing south: a bed is one across and two deep. Left out, one each way.
   */
  cells?: { w: number; d: number };
  /** Whether it lies on the floor as a picture walked over, as a circle drawn on it is. */
  floor?: boolean;
}

/** How many cells a piece takes across its front and deep, as its model is made. */
export function cellsTakenBy(piece: FurnishingId): { w: number; d: number } {
  return FURNISHING_SHAPES[piece].cells ?? { w: 1, d: 1 };
}

/**
 * What each piece of furniture is built as.
 *
 * A bar's counter is a pale top over the same tubes its walls are lit by, and its tables are
 * lit from inside, which is most of what tells a bar from a back room. What an abandoned
 * building leaves behind is steel desks shoved off square and rubble where the ceiling came
 * down. A shipping container is the size of one, a little taller than a man is. A sewer keeps
 * barrels and crates heaped in its corners, and a pipe run along its walls, laid of lengths, bends,
 * ends that go into the floor, and lengths with a wheel to turn the water off by.
 */
export const FURNISHING_SHAPES: Record<FurnishingId, FurnishingShape> = {
  counter: { skin: { side: 'wall_neon', top: 'marble' }, height: 0.55, fill: 0.8, blocksSight: false },
  stool: { skin: { side: 'wall_metal', top: 'marble' }, height: 0.35, fill: 0.36, blocksSight: false },
  table: { skin: { side: 'wall_metal', top: 'neon_floor' }, height: 0.45, fill: 0.62, blocksSight: false, spin: 45 },
  pillar: { fill: 0.7, blocksSight: true },
  desk: { skin: { side: 'wall_metal', top: 'wall_metal' }, height: 0.42, fill: 0.8, blocksSight: false, spin: 35 },
  crate: { skin: { side: 'wood_plank', top: 'wood_plank' }, height: 0.6, fill: 0.78, blocksSight: false, spin: 12 },
  rubble: { skin: { side: 'wall_rubble', top: 'rubble_floor' }, height: 0.3, fill: 0.9, blocksSight: false, spin: 45 },
  shopCounter: { skin: { side: 'wood_plank', top: 'wood_plank' }, height: 0.55, fill: 0.8, blocksSight: false },
  gamingTable: { skin: { side: 'wood_plank', top: 'felt' }, height: 0.45, fill: 0.84, blocksSight: false },
  containerRed: { skin: { side: 'container_red', top: 'container_red' }, height: 1.7, fill: 1, blocksSight: true },
  containerBlue: { skin: { side: 'container_blue', top: 'container_blue' }, height: 1.7, fill: 1, blocksSight: true },
  containerGreen: {
    skin: { side: 'container_green', top: 'container_green' },
    height: 1.7,
    fill: 1,
    blocksSight: true,
  },
  barrel: { skin: { side: 'wood_plank', top: 'wood_plank' }, height: 0.9, fill: 0.7, blocksSight: false, spin: 45 },
  pipe: { skin: { side: 'wall_metal', top: 'wall_metal' }, height: 0.7, fill: 0.4, blocksSight: false, whole: true },
  pipeValve: {
    skin: { side: 'wall_metal', top: 'metal_grate' },
    height: 1.1,
    fill: 0.4,
    blocksSight: false,
    whole: true,
  },
  pipeElbow: {
    skin: { side: 'wall_metal', top: 'wall_metal' },
    height: 0.7,
    fill: 0.4,
    blocksSight: false,
    whole: true,
  },
  pipeEnd: {
    skin: { side: 'wall_metal', top: 'wall_metal' },
    height: 0.7,
    fill: 0.4,
    blocksSight: false,
    whole: true,
  },
  neonCocktail: {
    skin: { side: 'wall_neon', top: 'wall_metal' },
    height: 0.6,
    fill: 0.3,
    blocksSight: false,
    whole: true,
  },
  neonDice: { skin: { side: 'wall_neon', top: 'wall_metal' }, height: 0.6, fill: 0.3, blocksSight: false, whole: true },
  neonHeart: {
    skin: { side: 'wall_neon', top: 'wall_metal' },
    height: 0.6,
    fill: 0.3,
    blocksSight: false,
    whole: true,
  },
  backBar: { skin: { side: 'wood_plank', top: 'marble' }, height: 1.35, fill: 0.5, blocksSight: false, whole: true },
  boothSofa: { skin: { side: 'wall_metal', top: 'felt' }, height: 0.65, fill: 0.7, blocksSight: false, whole: true },
  lowTable: { skin: { side: 'wall_metal', top: 'neon_floor' }, height: 0.43, fill: 0.7, blocksSight: false, spin: 15 },
  jukebox: { skin: { side: 'wall_neon', top: 'wall_metal' }, height: 1.2, fill: 0.7, blocksSight: false, whole: true },
  slotMachine: {
    skin: { side: 'wall_neon', top: 'wall_metal' },
    height: 1.25,
    fill: 0.7,
    blocksSight: false,
    whole: true,
  },
  arcadeCabinet: {
    skin: { side: 'wall_neon', top: 'wall_metal' },
    height: 1.35,
    fill: 0.7,
    blocksSight: false,
    whole: true,
  },
  rouletteTable: {
    skin: { side: 'wood_plank', top: 'felt' },
    height: 0.47,
    fill: 0.84,
    blocksSight: false,
    cells: { w: 2, d: 1 },
    whole: true,
  },
  vendingMachine: {
    skin: { side: 'wall_neon', top: 'wall_metal' },
    height: 1.5,
    fill: 0.7,
    blocksSight: false,
    whole: true,
  },
  goodsShelf: {
    skin: { side: 'wall_metal', top: 'wall_metal' },
    height: 1.4,
    fill: 0.6,
    blocksSight: false,
    whole: true,
  },
  safe: { skin: { side: 'wall_metal', top: 'wall_metal' }, height: 0.6, fill: 0.55, blocksSight: false },
  executiveDesk: {
    skin: { side: 'wood_plank', top: 'wood_plank' },
    height: 0.76,
    fill: 0.8,
    blocksSight: false,
    cells: { w: 2, d: 1 },
  },
  still: { skin: { side: 'wood_plank', top: 'wall_metal' }, height: 0.89, fill: 0.8, blocksSight: false, spin: 20 },
  speaker: { skin: { side: 'wall_metal', top: 'wall_metal' }, height: 1.3, fill: 0.7, blocksSight: false, whole: true },
  aquarium: {
    skin: { side: 'wall_metal', top: 'neon_floor' },
    height: 1.2,
    fill: 0.6,
    blocksSight: false,
    whole: true,
  },
  plant: { skin: { side: 'wood_plank', top: 'rock_moss' }, height: 1.07, fill: 0.5, blocksSight: false, spin: 30 },
  bookshelf: {
    skin: { side: 'wood_plank', top: 'wood_plank' },
    height: 1.8,
    fill: 0.5,
    blocksSight: false,
    whole: true,
  },
  lectern: { skin: { side: 'wood_plank', top: 'wood_plank' }, height: 0.75, fill: 0.5, blocksSight: false, spin: 20 },
  bookPile: { skin: { side: 'wood_plank', top: 'wood_plank' }, height: 0.45, fill: 0.6, blocksSight: false, spin: 30 },
  alchemyTable: {
    skin: { side: 'wood_plank', top: 'wood_plank' },
    height: 0.95,
    fill: 0.7,
    blocksSight: false,
    whole: true,
  },
  cauldron: { skin: { side: 'wall_metal', top: 'poison_pool' }, height: 0.6, fill: 0.8, blocksSight: false },
  potionShelf: {
    skin: { side: 'wood_plank', top: 'wood_plank' },
    height: 1.5,
    fill: 0.5,
    blocksSight: false,
    whole: true,
  },
  magicCircle: {
    skin: { side: 'obsidian', top: 'stone_mosaic' },
    height: 0.03,
    fill: 1,
    blocksSight: false,
    cells: { w: 3, d: 3 },
    whole: true,
    floor: true,
  },
  crystalPedestal: { skin: { side: 'wall_ashlar', top: 'ice' }, height: 1.1, fill: 0.5, blocksSight: false },
  orrery: { skin: { side: 'wood_plank', top: 'marble' }, height: 1.1, fill: 0.8, blocksSight: false },
  telescope: { skin: { side: 'wood_plank', top: 'wood_plank' }, height: 1, fill: 0.7, blocksSight: false, spin: 30 },
  canopyBed: {
    skin: { side: 'wood_plank', top: 'felt' },
    height: 1.4,
    fill: 0.9,
    blocksSight: false,
    cells: { w: 1, d: 2 },
    whole: true,
  },
  wardrobe: {
    skin: { side: 'wood_plank', top: 'wood_plank' },
    height: 1.7,
    fill: 0.6,
    blocksSight: false,
    whole: true,
  },
  treasureChest: {
    skin: { side: 'wood_plank', top: 'wood_plank' },
    height: 0.55,
    fill: 0.7,
    blocksSight: false,
    spin: 20,
  },
  candelabra: { skin: { side: 'wall_metal', top: 'wall_metal' }, height: 1.2, fill: 0.4, blocksSight: false },
  gargoyle: { skin: { side: 'wall_ashlar', top: 'stone_tile' }, height: 1.1, fill: 0.6, blocksSight: false, spin: 30 },
  writingDesk: {
    skin: { side: 'wood_plank', top: 'wood_plank' },
    height: 1,
    fill: 0.7,
    blocksSight: false,
    whole: true,
  },
  storageJars: {
    skin: { side: 'wall_earth', top: 'packed_earth' },
    height: 0.7,
    fill: 0.8,
    blocksSight: false,
    spin: 30,
  },
  bed: {
    skin: { side: 'wood_plank', top: 'felt' },
    height: 0.6,
    fill: 0.9,
    blocksSight: false,
    cells: { w: 1, d: 2 },
    whole: true,
  },
  tableWood: { skin: { side: 'wood_plank', top: 'wood_plank' }, height: 0.45, fill: 0.8, blocksSight: false, spin: 10 },
  chairWood: { skin: { side: 'wood_plank', top: 'wood_plank' }, height: 0.55, fill: 0.4, blocksSight: false, spin: 30 },
  cupboard: {
    skin: { side: 'wood_plank', top: 'wood_plank' },
    height: 1.5,
    fill: 0.6,
    blocksSight: false,
    whole: true,
  },
  fireplace: {
    skin: { side: 'wall_brick', top: 'wall_brick' },
    height: 1.6,
    fill: 0.7,
    blocksSight: false,
    whole: true,
  },
  anvil: { skin: { side: 'wall_metal', top: 'wall_metal' }, height: 0.45, fill: 0.6, blocksSight: false, spin: 20 },
  forge: { skin: { side: 'wall_brick', top: 'lava' }, height: 1.5, fill: 0.8, blocksSight: false, whole: true },
  weaponRack: {
    skin: { side: 'wood_plank', top: 'wood_plank' },
    height: 1.5,
    fill: 0.5,
    blocksSight: false,
    whole: true,
  },
  breadOven: {
    skin: { side: 'wall_brick', top: 'wall_brick' },
    height: 1.3,
    fill: 0.8,
    blocksSight: false,
    whole: true,
  },
  flourSacks: { skin: { side: 'wall_earth', top: 'sand' }, height: 0.5, fill: 0.8, blocksSight: false, spin: 20 },
  pew: { skin: { side: 'wood_plank', top: 'wood_plank' }, height: 0.55, fill: 0.8, blocksSight: false },
  altar: { skin: { side: 'wall_ashlar', top: 'marble' }, height: 1.2, fill: 0.8, blocksSight: false, whole: true },
  bunkBed: {
    skin: { side: 'wood_plank', top: 'felt' },
    height: 1.3,
    fill: 0.9,
    blocksSight: false,
    cells: { w: 1, d: 2 },
    whole: true,
  },
  chestWood: { skin: { side: 'wood_plank', top: 'wood_plank' }, height: 0.45, fill: 0.7, blocksSight: false, spin: 15 },
  shelfGoods: {
    skin: { side: 'wood_plank', top: 'wood_plank' },
    height: 1.5,
    fill: 0.6,
    blocksSight: false,
    whole: true,
  },
  barCounter: { skin: { side: 'wall_neon', top: 'marble' }, height: 0.62, fill: 0.8, blocksSight: false },
  tavernCounter: { skin: { side: 'wood_plank', top: 'wood_plank' }, height: 0.62, fill: 0.8, blocksSight: false },
};

/** How long and how wide a shipping container stands on the floor, in cells. */
export const CONTAINER_LENGTH = 4;
export const CONTAINER_WIDTH = 2;

/**
 * How a piece is set out in a room.
 *
 * - `counter`: one run along the long wall with room to stand behind it, its front facing away from
 *   that wall, and seats in front; with a piece to stand at its back, a row of those along the wall
 *   behind whoever serves.
 * - `grid`: posts standing in rows, the way the columns of a building hold its floors up.
 * - `scatter`: one here and there, none touching another.
 * - `stacks`: rows of containers down the length of the room, aisles between the rows and a
 *   gap between one container and the next, some of them stacked two high.
 * - `corners`: heaps pushed into the corners of the room, each a few pieces standing against the
 *   walls and against one another, the way things are left where they are out of the way.
 * - `pipeRun`: one pipe laid along the walls of the room, cell by cell, round its corners: it comes
 *   up out of the floor at one end and goes back into it at the other, with a valve every so often.
 * - `wall`: runs of pieces standing with their backs to the walls and facing into the room, the way
 *   shelves, cabinets and benches are lined up along a wall, some with a sign hung over them.
 * - `centre`: one piece in the middle of the room, lying along its length.
 * - `rows`: rows of seats facing the far end of the room from its way in, an aisle down the middle,
 *   the way pews face an altar, with the plan's back piece against that far wall facing them.
 */
export type FurnishingArrangement =
  'counter' | 'grid' | 'scatter' | 'stacks' | 'corners' | 'pipeRun' | 'wall' | 'centre' | 'rows';

export interface FurnishingPlan {
  piece: FurnishingId;
  arrangement: FurnishingArrangement;
  /** The rooms it goes in, by the part they play. */
  roles: readonly DungeonRoomRoleValue[];
  /**
   * For a scatter and for heaps in the corners, how many cells of floor there are to one piece; for a
   * grid, how far apart the posts stand; for stacks, how wide the aisles between the rows are; for a
   * pipe, how many lengths of it there are to one with a valve.
   */
  every: number;
  /** For a pipe, the most cells it runs. Left out, it runs as far as the walls let it. */
  most?: number;
  /** What is set along the front of a counter, one to every other cell. */
  seat?: FurnishingId;
  /**
   * What stands along the wall behind a counter, a cell to each cell of it, where the room is deep
   * enough to keep a row to serve from between them and that wall has no way through it.
   */
  back?: FurnishingId;
  /** What is hung over a run of pieces against a wall, one to a run, picked from these. */
  above?: readonly FurnishingId[];
  /** What each one is picked from, where the pieces come in more than one kind. Left out, the piece alone. */
  pieces?: readonly FurnishingId[];
  /**
   * The kinds of room it goes in, of the kinds the place keeps for the part the room plays, one or
   * several. Left out, any.
   */
  set?: string | readonly string[];
}

export interface FurnishingOptions {
  /**
   * Whether the containers a hold is stowed with may be stacked two high.
   *
   * A board of hexes builds a container a cell at a time, so a stacked one costs its cells twice
   * over; there they stand one high. A sign hung over one piece of a run along a wall is one piece
   * over one, and is hung on every board.
   */
  stacksContainers: boolean;
}

/** The most pieces one heap in a corner is made of. */
const HEAP_MOST = 4;
/** The fewest pieces heaped in a room that has room for any. */
const HEAPED_LEAST = 2;

/**
 * The four sides of a cell, as the step to the cell on that side: up, down, left and right. A heap is
 * grown by its neighbours drawn in this order, which the sewer a seed makes is made by.
 */
const HEAP_STEPS: readonly { dx: number; dy: number }[] = [0, 2, 3, 1].map((side) => {
  const [dx, dy] = ORTHOGONAL_STEPS[side];
  return { dx, dy };
});

/** The fewest cells a pipe runs: an end, one length and an end. */
const PIPE_SHORTEST = 3;

/** The most pieces in one run against a wall, unless a plan says otherwise. */
const WALL_RUN_MOST = 3;

/**
 * How far a piece made facing south is turned, clockwise as the board is looked down on, to stand
 * with its back to a wall on one side of it: to face the side across.
 */
function backTo(wall: Side): number {
  return TURN_TO_FACE[OPPOSITE_SIDE[wall]];
}

/**
 * How far the end of a pipe is turned, clockwise as the board is looked down on, for the pipe to
 * leave it each way: its model is made with the pipe leaving to the west.
 */
const PIPE_END_TURNS: Readonly<Record<Side, number>> = { w: 0, n: 90, e: 180, s: 270 };

/**
 * How far a bend is turned, clockwise as the board is looked down on, to join each pair of ways: its
 * model is made joining the west to the south.
 */
const PIPE_ELBOW_TURNS: Readonly<Record<string, number>> = { sw: 0, nw: 90, en: 180, es: 270 };

/**
 * The cells a piece takes standing with its back to a wall on one side of a cell: so many along the
 * wall from that cell, rightwards or downwards, and so many out from the wall into the room.
 */
function againstWall(
  side: Side,
  cell: { x: number; y: number },
  along: number,
  out: number
): { x: number; y: number; w: number; h: number } {
  switch (side) {
    case 'n':
      return { x: cell.x, y: cell.y, w: along, h: out };
    case 's':
      return { x: cell.x, y: cell.y - out + 1, w: along, h: out };
    case 'w':
      return { x: cell.x, y: cell.y, w: out, h: along };
    default:
      return { x: cell.x - out + 1, y: cell.y, w: out, h: along };
  }
}

/** The way from one cell to the cell beside it. */
function stepTo(from: { x: number; y: number }, to: { x: number; y: number }): Side {
  if (to.x > from.x) return 'e';
  if (to.x < from.x) return 'w';
  return to.y > from.y ? 's' : 'n';
}

/** The cells along the inside of a room's edge, in order round it, each beside the one before. */
function edgeRing(room: DungeonRoom): { x: number; y: number }[] {
  const ring: { x: number; y: number }[] = [];
  const right = room.x + room.w - 1;
  const bottom = room.y + room.h - 1;
  for (let x = room.x; x <= right; x++) ring.push({ x, y: room.y });
  for (let y = room.y + 1; y <= bottom; y++) ring.push({ x: right, y });
  for (let x = right - 1; x >= room.x; x--) ring.push({ x, y: bottom });
  for (let y = bottom - 1; y > room.y; y--) ring.push({ x: room.x, y });
  return ring;
}

const AROUND = SQUARE_STEPS_WITH_CORNERS;

/** The cells furniture stands on, which nothing else is to be put down on. */
export function furnishedCells(layout: DungeonLayout): Set<number> {
  const cells = new Set<number>();
  for (const piece of layout.furnishings ?? []) {
    for (let dy = 0; dy < piece.h; dy++) {
      for (let dx = 0; dx < piece.w; dx++) cells.add((piece.y + dy) * layout.width + piece.x + dx);
    }
  }
  return cells;
}

class Furnisher {
  private readonly taken: Uint8Array;
  private readonly ends: { x: number; y: number }[];
  readonly placed: DungeonFurnishing[] = [];

  constructor(
    private readonly layout: DungeonLayout,
    private readonly rng: () => number,
    private readonly options: FurnishingOptions
  ) {
    this.taken = new Uint8Array(layout.width * layout.height);
    this.ends = [layout.entrance, layout.exit, ...(layout.mouth ? [layout.mouth] : [])];
    for (const point of this.ends) this.taken[point.y * layout.width + point.x] = 1;
  }

  /** Whether a cell is on or beside the way in or the way out. */
  private nearEnd(x: number, y: number): boolean {
    return this.ends.some((end) => Math.abs(end.x - x) <= 1 && Math.abs(end.y - y) <= 1);
  }

  /** Whether a cell is floor of a room with nothing on it yet. */
  private free(x: number, y: number): boolean {
    return cellAt(this.layout, x, y) === DungeonCell.Room && !this.taken[y * this.layout.width + x];
  }

  private walkable(x: number, y: number): boolean {
    const cell = cellAt(this.layout, x, y);
    return (cell === DungeonCell.Room || cell === DungeonCell.Corridor) && !this.taken[y * this.layout.width + x];
  }

  /**
   * Whether everything round a cell is open floor.
   *
   * A thing standing in the middle of eight open cells cannot cut the room in two, since the
   * eight still join up round it; so the floor stays one piece however many are put down.
   */
  private clearAround(x: number, y: number): boolean {
    return AROUND.every(([dx, dy]) => this.walkable(x + dx, y + dy));
  }

  private put(
    piece: FurnishingId,
    x: number,
    y: number,
    w: number,
    h: number,
    stack?: FurnishingId[],
    turned?: number,
    facing?: number
  ): void {
    const spin = FURNISHING_SHAPES[piece].spin ?? 0;
    const turn = turned ?? (spin > 0 ? Math.round((this.rng() * 2 - 1) * spin) : 0);
    this.placed.push({
      piece,
      x,
      y,
      w,
      h,
      spin: turn,
      ...(stack ? { stack } : {}),
      ...(facing !== undefined ? { facing } : {}),
    });
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) this.taken[(y + dy) * this.layout.width + x + dx] = 1;
    }
  }

  scatter(plan: FurnishingPlan, room: DungeonRoom): void {
    const cells = roomCells(this.layout, room);
    const count = Math.floor(cells.length / Math.max(1, plan.every));
    const order = cells.map((cell) => ({ cell, key: this.rng() })).sort((left, right) => left.key - right.key);
    let left = count;
    for (const { cell } of order) {
      if (left <= 0) break;
      const x = cell % this.layout.width;
      const y = Math.floor(cell / this.layout.width);
      if (!this.free(x, y) || !this.clearAround(x, y)) continue;
      this.put(plan.piece, x, y, 1, 1);
      left--;
    }
  }

  /** Takes the piece put down last off the floor again. */
  private takeBack(): void {
    const piece = this.placed.pop();
    if (!piece) return;
    for (let dy = 0; dy < piece.h; dy++) {
      for (let dx = 0; dx < piece.w; dx++) this.taken[(piece.y + dy) * this.layout.width + piece.x + dx] = 0;
    }
  }

  /** Whether a cell is a way through the edge of a room: a door, a passage, or water running in. */
  private opens(x: number, y: number): boolean {
    const cell = cellAt(this.layout, x, y);
    return cell === DungeonCell.Door || cell === DungeonCell.Corridor || cell === DungeonCell.Water;
  }

  /**
   * Whether a piece may stand against a wall on a cell: open floor, wall on one side of it at least,
   * and no way through the edge of the room on it or beside it, nor the way in or out.
   */
  private byWall(x: number, y: number): boolean {
    if (!this.free(x, y) || this.nearEnd(x, y)) return false;
    if (AROUND.some(([dx, dy]) => this.opens(x + dx, y + dy))) return false;
    return HEAP_STEPS.some((side) => cellAt(this.layout, x + side.dx, y + side.dy) === DungeonCell.Rock);
  }

  /**
   * Whether the open floor of a room is still one piece, with every way through its edge opening
   * onto it. Pieces against the walls can close a corner off or stand a doorway shut where the room
   * is an odd shape; whatever would is taken back.
   */
  private staysJoined(room: DungeonRoom): boolean {
    const width = this.layout.width;
    const open = roomCells(this.layout, room).filter((cell) => !this.taken[cell]);
    if (open.length === 0) return false;
    const reached = new Set<number>([open[0]]);
    const queue = [open[0]];
    const inRoom = new Set(open);
    for (let at = 0; at < queue.length; at++) {
      const x = queue[at] % width;
      const y = Math.floor(queue[at] / width);
      for (const side of HEAP_STEPS) {
        const next = (y + side.dy) * width + x + side.dx;
        if (!inRoom.has(next) || reached.has(next)) continue;
        reached.add(next);
        queue.push(next);
      }
    }
    if (reached.size !== open.length) return false;
    for (const cell of roomCells(this.layout, room)) {
      const x = cell % width;
      const y = Math.floor(cell / width);
      for (const side of HEAP_STEPS) {
        if (!this.opens(x + side.dx, y + side.dy)) continue;
        if (this.taken[cell]) return false;
      }
    }
    return true;
  }

  /** Puts a piece on one cell unless the room's floor would no longer be one piece, and tells whether it stands. */
  private putJoined(room: DungeonRoom, piece: FurnishingId, x: number, y: number, turned?: number): boolean {
    this.put(piece, x, y, 1, 1, undefined, turned);
    if (this.staysJoined(room)) return true;
    this.takeBack();
    return false;
  }

  /**
   * Heaps in the corners of the room.
   *
   * A heap starts in a corner, against two walls, and grows along the walls and against what is in
   * it already, so the pieces stand together out of the way and the middle of the room stays clear.
   */
  corners(plan: FurnishingPlan, room: DungeonRoom): void {
    const width = this.layout.width;
    const cells = roomCells(this.layout, room);
    const pieces = plan.pieces ?? [plan.piece];
    const pick = () => pieces[Math.floor(this.rng() * pieces.length) % pieces.length];
    let left = Math.max(HEAPED_LEAST, Math.floor(cells.length / Math.max(1, plan.every)));
    const walls = (x: number, y: number) =>
      HEAP_STEPS.filter((side) => cellAt(this.layout, x + side.dx, y + side.dy) === DungeonCell.Rock).length;
    const corners = cells
      .map((cell) => ({ x: cell % width, y: Math.floor(cell / width), key: this.rng() }))
      .filter((cell) => walls(cell.x, cell.y) >= 2)
      .sort((one, other) => one.key - other.key);

    for (const corner of corners) {
      if (left <= 0) break;
      if (!this.byWall(corner.x, corner.y) || !this.putJoined(room, pick(), corner.x, corner.y)) continue;
      left--;
      const heap = [{ x: corner.x, y: corner.y }];
      const size = 2 + Math.floor(this.rng() * (HEAP_MOST - 1));
      while (heap.length < size && left > 0) {
        const beside = heap
          .flatMap((at) => HEAP_STEPS.map((side) => ({ x: at.x + side.dx, y: at.y + side.dy })))
          .filter((cell) => this.byWall(cell.x, cell.y))
          .map((cell) => ({ ...cell, key: this.rng() }))
          .sort((one, other) => one.key - other.key);
        const next = beside.find((cell) => this.putJoined(room, pick(), cell.x, cell.y));
        if (!next) break;
        heap.push({ x: next.x, y: next.y });
        left--;
      }
    }
  }

  /**
   * One pipe along the walls of the room.
   *
   * It takes the longest stretch of the room's edge that has wall behind it and no way through, round
   * the corners where the stretch goes round them, and is laid a cell at a time: an end that goes into
   * the floor, lengths with a valve to every few, a bend at each corner, and an end again. A stretch
   * that would cut the room's floor in two is taken a cell shorter until it does not.
   */
  pipeRun(plan: FurnishingPlan, room: DungeonRoom): void {
    const ring = edgeRing(room);
    const fits = ring.map((cell) => this.byWall(cell.x, cell.y));
    let best: { start: number; length: number } = { start: 0, length: 0 };
    for (let start = 0; start < ring.length; start++) {
      if (!fits[start] || fits[(start + ring.length - 1) % ring.length]) continue;
      let length = 0;
      while (length < ring.length && fits[(start + length) % ring.length]) length++;
      if (length > best.length) best = { start, length };
    }
    if (best.length === 0 && fits.every(Boolean)) best = { start: 0, length: ring.length - 1 };

    const every = Math.max(2, plan.every);
    for (let length = Math.min(best.length, plan.most ?? Infinity); length >= PIPE_SHORTEST; length--) {
      const cells = Array.from({ length }, (_, at) => ring[(best.start + at) % ring.length]);
      const before = this.placed.length;
      let lengths = 0;
      cells.forEach((cell, at) => {
        const back = at > 0 ? stepTo(cell, cells[at - 1]) : null;
        const on = at < length - 1 ? stepTo(cell, cells[at + 1]) : null;
        if (!back || !on) {
          this.put('pipeEnd', cell.x, cell.y, 1, 1, undefined, PIPE_END_TURNS[(back ?? on)!]);
        } else if (back === OPPOSITE_SIDE[on]) {
          const valved = ++lengths % every === 0;
          this.put(
            valved ? 'pipeValve' : plan.piece,
            cell.x,
            cell.y,
            1,
            1,
            undefined,
            on === 'e' || on === 'w' ? 0 : 90
          );
        } else {
          this.put('pipeElbow', cell.x, cell.y, 1, 1, undefined, PIPE_ELBOW_TURNS[[back, on].sort().join('')]);
        }
      });
      if (this.staysJoined(room)) return;
      while (this.placed.length > before) this.takeBack();
    }
  }

  grid(plan: FurnishingPlan, room: DungeonRoom): void {
    const pitch = Math.max(2, plan.every);
    for (let y = room.y + 2; y <= room.y + room.h - 3; y += pitch) {
      for (let x = room.x + 2; x <= room.x + room.w - 3; x += pitch) {
        if (this.free(x, y) && this.clearAround(x, y)) this.put(plan.piece, x, y, 1, 1);
      }
    }
  }

  /**
   * A counter the length of the room less a cell at each end, a cell in from the long wall.
   *
   * The cell behind it is where whoever serves stands, and the open ends are how they get
   * there, so a door on that wall still opens onto floor that joins the rest of the room.
   * The wall with no door on it is taken where there is one, and neither the counter nor its
   * seats stand beside the way in or out.
   */
  counter(plan: FurnishingPlan, room: DungeonRoom): void {
    const along = room.w >= room.h;
    const length = (along ? room.w : room.h) - 2;
    const depth = along ? room.h : room.w;
    if (length < 3 || depth < 4) return;

    const sides = [0, 1]
      .map((far) => ({ far, doors: this.doorsOnSide(room, along, far === 1), key: this.rng() }))
      .sort((left, right) => left.doors - right.doors || left.key - right.key);

    for (const { far, doors } of sides) {
      const backed = plan.back !== undefined && depth >= 5 && doors === 0;
      const from = backed ? 1 : 0;
      const rows = [from, from + 1, from + 2].map((row) => (far === 1 ? depth - 1 - row : row));
      const [behind, bar, front] = rows;
      const shelf = far === 1 ? depth - 1 : 0;
      const at = (offset: number, row: number) =>
        along ? { x: room.x + 1 + offset, y: room.y + row } : { x: room.x + row, y: room.y + 1 + offset };
      const used = backed ? [shelf, behind, bar, front] : [behind, bar, front];
      const cells = used.flatMap((row) => Array.from({ length }, (_, offset) => at(offset, row)));
      if (!cells.every((cell) => this.free(cell.x, cell.y))) continue;
      const seats = plan.seat ? Array.from({ length: Math.ceil(length / 2) }, (_, index) => at(index * 2, front)) : [];
      const standing = [...Array.from({ length }, (_, offset) => at(offset, bar)), ...seats];
      if (standing.some((cell) => this.nearEnd(cell.x, cell.y))) continue;
      const ends = [at(-1, behind), at(length, behind), at(-1, bar), at(length, bar)];
      if (!ends.every((cell) => this.walkable(cell.x, cell.y))) continue;

      const start = at(0, bar);
      const wall: Side = along ? (far === 1 ? 's' : 'n') : far === 1 ? 'e' : 'w';
      this.put(plan.piece, start.x, start.y, along ? length : 1, along ? 1 : length, undefined, 0, backTo(wall));
      for (const seat of seats) this.put(plan.seat!, seat.x, seat.y, 1, 1);
      if (backed) {
        for (let offset = 0; offset < length; offset++) {
          const cell = at(offset, shelf);
          this.put(plan.back!, cell.x, cell.y, 1, 1, undefined, 0, backTo(wall));
        }
      }
      return;
    }
  }

  /**
   * Runs of pieces with their backs to the walls, facing into the room.
   *
   * The stretches of wall with nothing through them are taken in an order the seed picks, and along
   * each a run of one kind of piece is laid from a cell the seed picks, each turned so its back meets
   * the wall, until the room has as many as the plan asks: one to every so many cells of its floor. A
   * piece that takes more than a cell takes them along the wall and out from it, as a bed does. Each
   * stands clear of every way through the edge of the room, and only where the room's floor stays one
   * piece round it. A plan that hangs something over the pieces hangs one over a run.
   */
  wall(plan: FurnishingPlan, room: DungeonRoom): void {
    const pieces = plan.pieces ?? [plan.piece];
    let left = Math.max(1, Math.floor(roomCells(this.layout, room).length / Math.max(1, plan.every)));
    const stretches = this.wallStretches(room)
      .map((stretch) => ({ ...stretch, key: this.rng() }))
      .sort((one, other) => one.key - other.key);
    for (const { side, cells } of stretches) {
      if (left <= 0) break;
      const piece = pieces[Math.floor(this.rng() * pieces.length) % pieces.length];
      const { w, d } = cellsTakenBy(piece);
      const most = Math.min(plan.most ?? WALL_RUN_MOST, left);
      const first = Math.floor(this.rng() * cells.length);
      const run: DungeonFurnishing[] = [];
      for (let at = first; at + w <= cells.length && run.length < most; at += w) {
        const rect = againstWall(side, cells[at], w, d);
        if (!this.standsClear(rect) || !this.putRect(room, piece, rect, backTo(side))) {
          if (run.length > 0) break;
          continue;
        }
        const stood = this.placed[this.placed.length - 1];
        if (w * d > 1) stood.standsOn = cellOutFrom(rect, side);
        run.push(stood);
      }
      left -= run.length;
      if (plan.above && run.length > 0) {
        const under = run[Math.floor(run.length / 2)];
        under.stack = [plan.above[Math.floor(this.rng() * plan.above.length) % plan.above.length]];
      }
    }
  }

  /**
   * One piece in the middle of the room, lying along the room's length where it is longer one way
   * than the other, with open floor all round it. Where the middle is taken, as by the stair down
   * in the deepest room, it stands as near the middle as there is room for it.
   */
  centre(plan: FurnishingPlan, room: DungeonRoom): void {
    const pieces = plan.pieces ?? [plan.piece];
    const piece = pieces[Math.floor(this.rng() * pieces.length) % pieces.length];
    const { w, d } = cellsTakenBy(piece);
    const turned = w !== d && room.w !== room.h && w > d !== room.w > room.h;
    const across = turned ? d : w;
    const deep = turned ? w : d;
    const middle = { x: room.x + room.w / 2, y: room.y + room.h / 2 };
    const spots: { x: number; y: number; far: number }[] = [];
    for (let y = room.y; y + deep <= room.y + room.h; y++) {
      for (let x = room.x; x + across <= room.x + room.w; x++) {
        spots.push({ x, y, far: Math.abs(x + across / 2 - middle.x) + Math.abs(y + deep / 2 - middle.y) });
      }
    }
    spots.sort((one, other) => one.far - other.far || one.y - other.y || one.x - other.x);
    const spot = spots.find((at) => this.clearRect({ x: at.x, y: at.y, w: across, h: deep }));
    if (!spot) return;
    this.put(piece, spot.x, spot.y, across, deep, undefined, 0, turned ? 90 : 0);
  }

  /**
   * Rows of seats facing the far end of the room from the side of it it is come into by, as pews face
   * an altar across from a church's door (see {@link wayInWeight}): the plan's back piece stands against
   * the middle of that far wall facing the room,
   * and the rows run across the room every other cell from the second in front of it to the second
   * short of the way in, an aisle left down the middle. A seat stands only clear of every way through
   * the edge of the room, and only where the room's floor stays one piece.
   */
  rows(plan: FurnishingPlan, room: DungeonRoom): void {
    const ways = SIDES.map((side) => ({ side, count: this.wayInWeight(room, side) }));
    const near = ways.reduce((best, way) => (way.count > best.count ? way : best)).side;
    const far = OPPOSITE_SIDE[near];
    const across = far === 'n' || far === 's';
    const depth = across ? room.h : room.w;
    const breadth = across ? room.w : room.h;
    const cellAtDepth = (fromFar: number, along: number) => {
      const row = far === 'n' || far === 'w' ? fromFar : depth - 1 - fromFar;
      return across ? { x: room.x + along, y: room.y + row } : { x: room.x + row, y: room.y + along };
    };
    if (plan.back) {
      const altar = { ...cellAtDepth(0, Math.floor(breadth / 2)), w: 1, h: 1 };
      if (this.standsClear(altar)) this.putRect(room, plan.back, altar, backTo(far));
    }
    const aisle = Math.floor(breadth / 2);
    for (let fromFar = 2; fromFar <= depth - 3; fromFar += 2) {
      for (let along = 0; along < breadth; along++) {
        if (along === aisle || (breadth % 2 === 0 && along === aisle - 1)) continue;
        const seat = { ...cellAtDepth(fromFar, along), w: 1, h: 1 };
        if (this.standsClear(seat)) this.putRect(room, plan.piece, seat, backTo(near));
      }
    }
  }

  /**
   * How much a side of a room counts as the side it is come into by: by the ways through it out of the
   * rooms, to a passage or a street, before any number of ways into a room next door, and then by how
   * many of either there are. A church's nave is come into by its door from the street, not by the
   * vestry's door.
   */
  private wayInWeight(room: DungeonRoom, side: Side): number {
    let out = 0;
    let through = 0;
    const step = SIDE_STEPS[side];
    const past = cellsPast(room, side);
    for (const { x, y } of past) {
      if (!this.opens(x, y)) continue;
      if (this.inSomeRoom(x + step.dx, y + step.dy)) through++;
      else out++;
    }
    return out * (past.length + 1) + through;
  }

  /** Whether a cell lies inside one of the place's rooms. */
  private inSomeRoom(x: number, y: number): boolean {
    return this.layout.rooms.some((room) => x >= room.x && y >= room.y && x < room.x + room.w && y < room.y + room.h);
  }

  /**
   * The stretches of a room's floor along its walls: the cells with wall on one side, gathered into
   * runs of cells side by side along that wall.
   */
  private wallStretches(room: DungeonRoom): { side: Side; cells: { x: number; y: number }[] }[] {
    const width = this.layout.width;
    const floor = roomCells(this.layout, room).map((cell) => ({ x: cell % width, y: Math.floor(cell / width) }));
    const stretches: { side: Side; cells: { x: number; y: number }[] }[] = [];
    for (const side of SIDES) {
      const { dx, dy } = SIDE_STEPS[side];
      const acrossX = dx === 0;
      const cells = floor
        .filter((cell) => cellAt(this.layout, cell.x + dx, cell.y + dy) === DungeonCell.Rock)
        .sort((one, other) => (acrossX ? one.y - other.y || one.x - other.x : one.x - other.x || one.y - other.y));
      let run: { x: number; y: number }[] = [];
      for (const cell of cells) {
        const last = run[run.length - 1];
        const next =
          last !== undefined &&
          (acrossX ? last.y === cell.y && cell.x === last.x + 1 : last.x === cell.x && cell.y === last.y + 1);
        if (!next && run.length > 0) {
          stretches.push({ side, cells: run });
          run = [];
        }
        run.push(cell);
      }
      if (run.length > 0) stretches.push({ side, cells: run });
    }
    return stretches;
  }

  /** Whether a piece may take every cell of a rectangle: open floor, nowhere near the way in or out or a way through the room's edge. */
  private standsClear(rect: { x: number; y: number; w: number; h: number }): boolean {
    for (let dy = 0; dy < rect.h; dy++) {
      for (let dx = 0; dx < rect.w; dx++) {
        const x = rect.x + dx;
        const y = rect.y + dy;
        if (!this.free(x, y) || this.nearEnd(x, y)) return false;
        if (AROUND.some(([ax, ay]) => this.opens(x + ax, y + ay))) return false;
      }
    }
    return true;
  }

  /** Puts a piece on a rectangle, facing a way, unless the room's floor would no longer be one piece, and tells whether it stands. */
  private putRect(
    room: DungeonRoom,
    piece: FurnishingId,
    rect: { x: number; y: number; w: number; h: number },
    facing: number
  ): boolean {
    this.put(piece, rect.x, rect.y, rect.w, rect.h, undefined, 0, facing);
    if (this.staysJoined(room)) return true;
    this.takeBack();
    return false;
  }

  /**
   * Rows of containers down the length of the room.
   *
   * A container is only put down where every cell round it is open floor, which keeps it off
   * the walls, out of the doorways and clear of the next one, and so leaves the aisles joined up
   * however many are stood there.
   */
  stacks(plan: FurnishingPlan, room: DungeonRoom): void {
    const pieces = plan.pieces ?? [plan.piece];
    const pick = () => pieces[Math.floor(this.rng() * pieces.length) % pieces.length];
    const along = room.w >= room.h;
    const length = along ? room.w : room.h;
    const across = along ? room.h : room.w;
    const aisle = Math.max(1, plan.every);
    for (let row = 1; row + CONTAINER_WIDTH <= across - 1; row += CONTAINER_WIDTH + aisle) {
      for (let at = 1; at + CONTAINER_LENGTH <= length - 1; at += CONTAINER_LENGTH + 1) {
        const rect = along
          ? { x: room.x + at, y: room.y + row, w: CONTAINER_LENGTH, h: CONTAINER_WIDTH }
          : { x: room.x + row, y: room.y + at, w: CONTAINER_WIDTH, h: CONTAINER_LENGTH };
        if (!this.clearRect(rect)) continue;
        const piece = pick();
        const stacked = this.options.stacksContainers && this.rng() < 0.55;
        this.put(piece, rect.x, rect.y, rect.w, rect.h, stacked ? [pick()] : undefined);
      }
    }
  }

  /** Whether a whole rectangle is open floor, with open floor all round it and nowhere near the way in or out. */
  private clearRect(rect: { x: number; y: number; w: number; h: number }): boolean {
    for (let dy = -1; dy <= rect.h; dy++) {
      for (let dx = -1; dx <= rect.w; dx++) {
        const x = rect.x + dx;
        const y = rect.y + dy;
        const inside = dx >= 0 && dy >= 0 && dx < rect.w && dy < rect.h;
        if (inside ? !this.free(x, y) || this.nearEnd(x, y) : !this.walkable(x, y)) return false;
      }
    }
    return true;
  }

  private doorsOnSide(room: DungeonRoom, along: boolean, far: boolean): number {
    const side: Side = along ? (far ? 's' : 'n') : far ? 'e' : 'w';
    return cellsPast(room, side, true).filter(({ x, y }) => {
      const cell = cellAt(this.layout, x, y);
      return cell === DungeonCell.Door || cell === DungeonCell.Corridor;
    }).length;
  }
}

/**
 * The cell of a piece's rectangle out from the wall its back is against: of those farthest from it,
 * the one nearest the rectangle's middle.
 */
function cellOutFrom(rect: DungeonRect, wall: Side): DungeonPoint {
  const { dx, dy } = SIDE_STEPS[OPPOSITE_SIDE[wall]];
  const cells = Array.from({ length: rect.w * rect.h }, (_, at) => ({
    x: rect.x + (at % rect.w),
    y: rect.y + Math.floor(at / rect.w),
  }));
  const reach = Math.max(...cells.map(({ x, y }) => x * dx + y * dy));
  const middle = { x: rect.x + (rect.w - 1) / 2, y: rect.y + (rect.h - 1) / 2 };
  const off = (cell: DungeonPoint) => Math.hypot(cell.x - middle.x, cell.y - middle.y);
  return cells
    .filter(({ x, y }) => x * dx + y * dy === reach)
    .reduce((best, cell) => (off(cell) < off(best) ? cell : best));
}

/**
 * The cells just past one side of a room, along it: the wall or the way through it beside each cell of
 * that side, and, with `corners`, the two at its ends as well.
 */
function cellsPast(room: DungeonRoom, side: Side, corners = false): { x: number; y: number }[] {
  const along = side === 'n' || side === 's';
  const span = along ? room.w : room.h;
  const cells: { x: number; y: number }[] = [];
  for (let offset = corners ? -1 : 0; offset < (corners ? span + 1 : span); offset++) {
    const x = along ? room.x + offset : side === 'w' ? room.x - 1 : room.x + room.w;
    const y = along ? (side === 'n' ? room.y - 1 : room.y + room.h) : room.y + offset;
    cells.push({ x, y });
  }
  return cells;
}

/** Whether a plan goes in a room of a kind: any where the plan names none, else one of those it names. */
function goesIn(plan: FurnishingPlan, set: string | undefined): boolean {
  if (plan.set === undefined) return true;
  return typeof plan.set === 'string' ? plan.set === set : set !== undefined && plan.set.includes(set);
}

/**
 * Puts furniture in the rooms that call for it, plan by plan and room by room.
 *
 * Nothing goes on the way in, the way out or the cells round them, and nothing blocks a door:
 * a piece in the open is only put down with open floor all round it, a counter leaves both its ends
 * open, and a piece against a wall stands clear of every way through the edge of the room, with the
 * room's floor still one piece round it.
 */
export function furnishRooms(
  layout: DungeonLayout,
  plans: readonly FurnishingPlan[],
  rng: () => number,
  options: FurnishingOptions = { stacksContainers: true }
): DungeonFurnishing[] {
  const furnisher = new Furnisher(layout, rng, options);
  for (const plan of plans) {
    for (const room of layout.rooms) {
      if (!plan.roles.includes(room.role) || !goesIn(plan, room.set)) continue;
      furnisher[plan.arrangement](plan, room);
    }
  }
  return furnisher.placed;
}
