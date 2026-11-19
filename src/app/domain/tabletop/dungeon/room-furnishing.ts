import { TextureId, WallTextureId } from '@axe/domain/media/texture-catalog';
import { ORTHOGONAL_STEPS, SQUARE_STEPS_WITH_CORNERS } from '@axe/domain/tabletop/cell-steps';
import {
  cellAt,
  DungeonCell,
  DungeonFurnishing,
  DungeonLayout,
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
};

/** How long and how wide a shipping container stands on the floor, in cells. */
export const CONTAINER_LENGTH = 4;
export const CONTAINER_WIDTH = 2;

/**
 * How a piece is set out in a room.
 *
 * - `counter`: one run along the long wall with room to stand behind it, and seats in front.
 * - `grid`: posts standing in rows, the way the columns of a building hold its floors up.
 * - `scatter`: one here and there, none touching another.
 * - `stacks`: rows of containers down the length of the room, aisles between the rows and a
 *   gap between one container and the next, some of them stacked two high.
 * - `corners`: heaps pushed into the corners of the room, each a few pieces standing against the
 *   walls and against one another, the way things are left where they are out of the way.
 * - `pipeRun`: one pipe laid along the walls of the room, cell by cell, round its corners: it comes
 *   up out of the floor at one end and goes back into it at the other, with a valve every so often.
 */
export type FurnishingArrangement = 'counter' | 'grid' | 'scatter' | 'stacks' | 'corners' | 'pipeRun';

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
  /** What each one is picked from, where the pieces come in more than one kind. Left out, the piece alone. */
  pieces?: readonly FurnishingId[];
}

export interface FurnishingOptions {
  /**
   * Whether anything may be stacked on anything else.
   *
   * A board of hexes builds a piece a cell at a time, so a stacked container costs its cells
   * twice over; there it stands one high.
   */
  stackable: boolean;
}

/** The most pieces one heap in a corner is made of. */
const HEAP_MOST = 4;
/** The fewest pieces heaped in a room that has room for any. */
const HEAPED_LEAST = 2;

/**
 * The four sides of a cell, as the step to the cell on that side: up, down, left and right. A heap is
 * grown by its neighbours drawn in this order, which the sewer a seed makes is made by.
 */
const SIDES: readonly { dx: number; dy: number }[] = [0, 2, 3, 1].map((side) => {
  const [dx, dy] = ORTHOGONAL_STEPS[side];
  return { dx, dy };
});

/** The fewest cells a pipe runs: an end, one length and an end. */
const PIPE_SHORTEST = 3;

type Way = 'n' | 'e' | 's' | 'w';

const OPPOSITE: Readonly<Record<Way, Way>> = { n: 's', s: 'n', e: 'w', w: 'e' };

/**
 * How far the end of a pipe is turned, clockwise as the board is looked down on, for the pipe to
 * leave it each way: its model is made with the pipe leaving to the west.
 */
const PIPE_END_TURNS: Readonly<Record<Way, number>> = { w: 0, n: 90, e: 180, s: 270 };

/**
 * How far a bend is turned, clockwise as the board is looked down on, to join each pair of ways: its
 * model is made joining the west to the south.
 */
const PIPE_ELBOW_TURNS: Readonly<Record<string, number>> = { sw: 0, nw: 90, en: 180, es: 270 };

/** The way from one cell to the cell beside it. */
function stepTo(from: { x: number; y: number }, to: { x: number; y: number }): Way {
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
    turned?: number
  ): void {
    const spin = FURNISHING_SHAPES[piece].spin ?? 0;
    const turn = turned ?? (spin > 0 ? Math.round((this.rng() * 2 - 1) * spin) : 0);
    this.placed.push(stack ? { piece, x, y, w, h, spin: turn, stack } : { piece, x, y, w, h, spin: turn });
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
    return SIDES.some((side) => cellAt(this.layout, x + side.dx, y + side.dy) === DungeonCell.Rock);
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
      for (const side of SIDES) {
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
      for (const side of SIDES) {
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
      SIDES.filter((side) => cellAt(this.layout, x + side.dx, y + side.dy) === DungeonCell.Rock).length;
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
          .flatMap((at) => SIDES.map((side) => ({ x: at.x + side.dx, y: at.y + side.dy })))
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
        } else if (back === OPPOSITE[on]) {
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

    for (const { far } of sides) {
      const rows = far === 1 ? [depth - 1, depth - 2, depth - 3] : [0, 1, 2];
      const [behind, bar, front] = rows;
      const at = (offset: number, row: number) =>
        along ? { x: room.x + 1 + offset, y: room.y + row } : { x: room.x + row, y: room.y + 1 + offset };
      const cells = [behind, bar, front].flatMap((row) => Array.from({ length }, (_, offset) => at(offset, row)));
      if (!cells.every((cell) => this.free(cell.x, cell.y))) continue;
      const seats = plan.seat ? Array.from({ length: Math.ceil(length / 2) }, (_, index) => at(index * 2, front)) : [];
      const standing = [...Array.from({ length }, (_, offset) => at(offset, bar)), ...seats];
      if (standing.some((cell) => this.nearEnd(cell.x, cell.y))) continue;
      const ends = [at(-1, behind), at(length, behind), at(-1, bar), at(length, bar)];
      if (!ends.every((cell) => this.walkable(cell.x, cell.y))) continue;

      const start = at(0, bar);
      this.put(plan.piece, start.x, start.y, along ? length : 1, along ? 1 : length);
      for (const seat of seats) this.put(plan.seat!, seat.x, seat.y, 1, 1);
      return;
    }
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
        const stacked = this.options.stackable && this.rng() < 0.55;
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
    let doors = 0;
    const span = along ? room.w : room.h;
    for (let offset = -1; offset <= span; offset++) {
      const x = along ? room.x + offset : far ? room.x + room.w : room.x - 1;
      const y = along ? (far ? room.y + room.h : room.y - 1) : room.y + offset;
      const cell = cellAt(this.layout, x, y);
      if (cell === DungeonCell.Door || cell === DungeonCell.Corridor) doors++;
    }
    return doors;
  }
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
  options: FurnishingOptions = { stackable: true }
): DungeonFurnishing[] {
  const furnisher = new Furnisher(layout, rng, options);
  for (const plan of plans) {
    for (const room of layout.rooms) {
      if (!plan.roles.includes(room.role)) continue;
      furnisher[plan.arrangement](plan, room);
    }
  }
  return furnisher.placed;
}
