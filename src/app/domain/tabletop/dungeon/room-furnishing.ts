import { TextureId, WallTextureId } from '@axe/domain/media/texture-catalog';
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
}

/**
 * What each piece of furniture is built as.
 *
 * A bar's counter is a pale top over the same tubes its walls are lit by, and its tables are
 * lit from inside, which is most of what tells a bar from a back room. What an abandoned
 * building leaves behind is steel desks shoved off square and rubble where the ceiling came
 * down. A shipping container is the size of one, a little taller than a man is.
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
 */
export type FurnishingArrangement = 'counter' | 'grid' | 'scatter' | 'stacks';

export interface FurnishingPlan {
  piece: FurnishingId;
  arrangement: FurnishingArrangement;
  /** The rooms it goes in, by the part they play. */
  roles: readonly DungeonRoomRoleValue[];
  /**
   * For a scatter, how many cells of floor there are to one piece; for a grid, how far apart the
   * posts stand; for stacks, how wide the aisles between the rows are.
   */
  every: number;
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

const AROUND: readonly [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

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

  private put(piece: FurnishingId, x: number, y: number, w: number, h: number, stack?: FurnishingId[]): void {
    const spin = FURNISHING_SHAPES[piece].spin ?? 0;
    const turn = spin > 0 ? Math.round((this.rng() * 2 - 1) * spin) : 0;
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
 * a piece is only put down with open floor all round it, and a counter leaves both its ends open.
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
