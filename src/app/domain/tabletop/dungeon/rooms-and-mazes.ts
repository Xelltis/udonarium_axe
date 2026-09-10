import {
  cellAt,
  clampCorridorWidth,
  DungeonCell,
  DungeonCellValue,
  DungeonDoor,
  DungeonLayout,
  DungeonRect,
  DungeonRoom,
  DungeonRoomRole,
  firstCellOf,
  setCell,
} from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { ROOM_SHAPES, RoomShape, shapeCells, shapeFits } from '@axe/domain/tabletop/dungeon/room-shapes';

export interface RoomsAndMazesParams {
  width: number;
  height: number;
  roomCount: number;
  minRoom: number;
  maxRoom: number;
  /** How much the passages twist. At nothing they run dead straight; at a hundred they never do. */
  windingPercent: number;
  /** How often a join that is no longer needed is opened anyway, which is what makes loops. */
  extraConnectorChance: number;
  wallBreakChance: number;
  shapes: readonly RoomShape[];
  /** The narrowest and the widest a passage is cut, in cells. One apiece is a plain maze. */
  minCorridor: number;
  maxCorridor: number;
  seed: number;
}

const PLACEMENT_TRIES_PER_ROOM = 60;
const DIRECTIONS: readonly [number, number][] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

/**
 * The step the maze takes, which is a passage and the wall that follows it.
 *
 * A passage one cell across steps two, which is the maze every dungeon on paper is drawn from.
 * A wider one steps that much further, and the wall between two passages stays the one cell it
 * has always been: what widens is the passage, not the stone.
 */
function mazeStep(corridorWidth: number): number {
  return corridorWidth + 1;
}

/** The largest board of this size or under that ends on a wall rather than half a passage. */
export function fitBoardTo(value: number, corridorWidth: number): number {
  const wide = clampCorridorWidth(corridorWidth);
  const step = mazeStep(wide);
  const least = wide + 2;
  if (value <= least) return least;
  return value - ((value - least) % step);
}

/**
 * Rooms first, then a maze through everything left over, then the two joined at the walls.
 *
 * Running a corridor from one room's middle to another's drags it along whatever lies
 * between, and a passage with no stone beside it opens the whole flank of the room it
 * passes. A maze cannot do that: it only ever carves into rock a wall's width from anything
 * already open, so a wall always stands between a passage and a room it does not serve.
 */
export function generateRoomsAndMazes(params: RoomsAndMazesParams, rng: () => number): DungeonLayout {
  const wide = clampCorridorWidth(params.maxCorridor);
  const narrow = Math.min(wide, clampCorridorWidth(params.minCorridor));
  // The maze steps a passage and a wall at a time, so the board has to end where a wall does.
  const width = fitBoardTo(params.width, wide);
  const height = fitBoardTo(params.height, wide);

  const layout: DungeonLayout = {
    width,
    height,
    cells: new Uint8Array(width * height).fill(DungeonCell.Rock),
    rooms: [],
    doors: [],
    doorLeaves: [],
    links: [],
    entrance: { x: 1, y: 1 },
    exit: { x: 1, y: 1 },
    mouth: null,
    keyRoomIndex: -1,
    seed: params.seed,
  };

  const regions = new Int32Array(width * height).fill(-1);
  /**
   * The whole bounding box of every room, shape or no shape.
   *
   * A circle leaves the corners of its box as rock, and without holding them back the maze
   * carves into them and comes to rest against the room's edge with no wall between.
   */
  const reserved = new Uint8Array(width * height);
  let regionCount = 0;

  const carve = (x: number, y: number, kind: number, region: number) => {
    layout.cells[y * width + x] = kind;
    regions[y * width + x] = region;
  };

  const isSolid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && regions[y * width + x] === -1 && reserved[y * width + x] === 0;

  regionCount = placeRooms(layout, regions, reserved, wide, params, rng, regionCount);
  regionCount = growMazes(layout, regions, { narrow, wide }, params, rng, regionCount, carve, isSolid);
  layout.doors = joinRegions(layout, regions, params, rng, regionCount);
  pruneDeadEnds(layout, wide);
  crumble(layout, params, wide, rng);
  layout.doors = layout.doors.filter((door) => layout.cells[door.y * width + door.x] === DungeonCell.Door);
  layout.links = deriveLinks(layout);

  const start = firstCellOf(layout, 0);
  layout.entrance = { ...start };
  layout.exit = { ...start };
  return layout;
}

/**
 * A room stands on the same lattice the maze is cut on, and ends where a square of it ends.
 *
 * Off the lattice a room would leave the maze a wall two cells thick to come to rest against,
 * and a wall two thick has no single stone to knock through for a door. On it, whatever the
 * width of the passages, one stone always stands between a room and whatever passes it.
 */
function placeRooms(
  layout: DungeonLayout,
  regions: Int32Array,
  reserved: Uint8Array,
  wide: number,
  params: RoomsAndMazesParams,
  rng: () => number,
  regionCount: number
): number {
  const step = mazeStep(wide);
  const onLattice = (low: number, high: number) => {
    const span = Math.max(1, Math.floor((high - low) / step) + 1);
    return low + Math.floor(rng() * span) * step;
  };
  const sideOf = (least: number, most: number) => {
    const first = wide + step * Math.max(0, Math.ceil((least - wide) / step));
    const last = wide + step * Math.floor((most - wide) / step);
    return last < first ? first : onLattice(first, last);
  };
  const rooms: DungeonRoom[] = [];
  let region = regionCount;

  for (
    let attempt = 0;
    attempt < params.roomCount * PLACEMENT_TRIES_PER_ROOM && rooms.length < params.roomCount;
    attempt++
  ) {
    const w = sideOf(params.minRoom, params.maxRoom);
    const h = sideOf(params.minRoom, params.maxRoom);
    if (w + 2 >= layout.width || h + 2 >= layout.height) continue;
    const x = onLattice(1, layout.width - w - 2);
    const y = onLattice(1, layout.height - h - 2);
    const bounds = { x, y, w, h };

    const shape = pickShape(params.shapes, bounds, rng);
    const cells = shapeCells(shape, bounds, rng);
    if (cells.length === 0) continue;

    // Grown by one on every side, so two rooms always keep a wall between them.
    let clashes = bounds.x < 1 || bounds.y < 1;
    for (let dy = -1; dy <= bounds.h && !clashes; dy++) {
      for (let dx = -1; dx <= bounds.w && !clashes; dx++) {
        const nx = bounds.x + dx;
        const ny = bounds.y + dy;
        if (nx < 0 || ny < 0 || nx >= layout.width || ny >= layout.height) clashes = true;
        else if (regions[ny * layout.width + nx] !== -1 || reserved[ny * layout.width + nx] !== 0) clashes = true;
      }
    }
    if (clashes) continue;

    for (let dy = 0; dy < bounds.h; dy++) {
      for (let dx = 0; dx < bounds.w; dx++) reserved[(bounds.y + dy) * layout.width + bounds.x + dx] = 1;
    }
    for (const cell of cells) {
      layout.cells[cell.y * layout.width + cell.x] = DungeonCell.Room;
      regions[cell.y * layout.width + cell.x] = region;
    }
    rooms.push({ ...bounds, index: rooms.length, role: DungeonRoomRole.Chamber });
    region++;
  }

  layout.rooms = rooms;
  return region;
}

function pickShape(shapes: readonly RoomShape[], bounds: { w: number; h: number }, rng: () => number): RoomShape {
  const usable = (shapes.length > 0 ? shapes : ROOM_SHAPES).filter((shape) =>
    shapeFits(shape, { x: 0, y: 0, ...bounds })
  );
  if (usable.length === 0) return 'rect';
  return usable[Math.floor(rng() * usable.length)];
}

/**
 * The ground a passage takes up between two points of the lattice, ends included.
 *
 * A step along the lattice is a square of passage and the run of it that reaches the next
 * square, so asking for both at once is asking for the whole of what the step opens.
 */
function spanBetween(
  from: { x: number; y: number },
  to: { x: number; y: number },
  wide: number
): { x: number; y: number; w: number; h: number } {
  const x = Math.min(from.x, to.x);
  const y = Math.min(from.y, to.y);
  return {
    x,
    y,
    w: Math.abs(to.x - from.x) + wide,
    h: Math.abs(to.y - from.y) + wide,
  };
}

/** The narrowest and the widest a passage may be cut on this table. */
interface CorridorWidths {
  narrow: number;
  wide: number;
}

function growMazes(
  layout: DungeonLayout,
  regions: Int32Array,
  widths: CorridorWidths,
  params: RoomsAndMazesParams,
  rng: () => number,
  regionCount: number,
  carve: (x: number, y: number, kind: number, region: number) => void,
  isSolid: (x: number, y: number) => boolean
): number {
  let region = regionCount;
  const wide = widths.wide;
  const step = mazeStep(wide);
  const solidSquare = (x: number, y: number) => {
    if (x + wide > layout.width - 1 || y + wide > layout.height - 1) return false;
    for (let dy = 0; dy < wide; dy++) {
      for (let dx = 0; dx < wide; dx++) if (!isSolid(x + dx, y + dy)) return false;
    }
    return true;
  };

  for (let y = 1; y + wide <= layout.height - 1; y += step) {
    for (let x = 1; x + wide <= layout.width - 1; x += step) {
      if (!solidSquare(x, y)) continue;
      growOneMaze(layout, widths, params, rng, region, { x, y }, carve, solidSquare);
      region++;
    }
  }

  return region;
}

/**
 * One maze, cut a square of the lattice at a time.
 *
 * A passage may be cut anywhere between the narrowest and the widest the table allows, and the
 * lattice is spaced for the widest of them whatever this one turns out to be. Every passage is
 * laid against the same corner of the square it crosses, so a narrow one meeting a wide one
 * always meets it: they share the corner, and what they share is a way through.
 */
function growOneMaze(
  layout: DungeonLayout,
  widths: CorridorWidths,
  params: RoomsAndMazesParams,
  rng: () => number,
  region: number,
  start: { x: number; y: number },
  carve: (x: number, y: number, kind: number, region: number) => void,
  solidSquare: (x: number, y: number) => boolean
): void {
  const wide = widths.wide;
  const step = mazeStep(wide);
  const cutWidth = () => widths.narrow + Math.floor(rng() * (widths.wide - widths.narrow + 1));
  const stack: { x: number; y: number }[] = [start];
  const open = (rect: { x: number; y: number; w: number; h: number }) => {
    for (let dy = 0; dy < rect.h; dy++) {
      for (let dx = 0; dx < rect.w; dx++) carve(rect.x + dx, rect.y + dy, DungeonCell.Corridor, region);
    }
  };
  const first = cutWidth();
  open({ x: start.x, y: start.y, w: first, h: first });
  let lastDir: [number, number] | null = null;

  while (stack.length > 0) {
    const cell = stack[stack.length - 1];
    const ways = DIRECTIONS.filter(([dx, dy]) => {
      // A wall has to stand past the square the maze is reaching for, or it eats its own.
      const beyond = {
        x: cell.x + (dx > 0 ? step + wide : dx * (step + 1)),
        y: cell.y + (dy > 0 ? step + wide : dy * (step + 1)),
      };
      if (beyond.x < 0 || beyond.y < 0 || beyond.x >= layout.width || beyond.y >= layout.height) return false;
      return solidSquare(cell.x + dx * step, cell.y + dy * step);
    });

    if (ways.length === 0) {
      stack.pop();
      lastDir = null;
      continue;
    }

    const heading: [number, number] | null = lastDir;
    const straightOn: boolean = heading !== null && ways.some(([ox, oy]) => ox === heading[0] && oy === heading[1]);
    const chosen: [number, number] =
      straightOn && heading !== null && rng() * 100 > params.windingPercent
        ? heading
        : ways[Math.floor(rng() * ways.length)];
    const [dx, dy] = chosen;
    const next = { x: cell.x + dx * step, y: cell.y + dy * step };

    open(spanBetween(cell, next, cutWidth()));
    stack.push(next);
    lastDir = [dx, dy];
  }
}

interface Connector {
  x: number;
  y: number;
  regions: number[];
}

function joinRegions(
  layout: DungeonLayout,
  regions: Int32Array,
  params: RoomsAndMazesParams,
  rng: () => number,
  regionCount: number
): DungeonDoor[] {
  const merged = new Int32Array(regionCount);
  for (let index = 0; index < regionCount; index++) merged[index] = index;
  const openRegions = new Set<number>();
  for (let index = 0; index < regionCount; index++) openRegions.add(index);

  let connectors: Connector[] = [];
  for (let y = 1; y < layout.height - 1; y++) {
    for (let x = 1; x < layout.width - 1; x++) {
      if (regions[y * layout.width + x] !== -1) continue;
      const beside = new Set<number>();
      for (const [dx, dy] of DIRECTIONS) {
        const region = regions[(y + dy) * layout.width + x + dx];
        if (region !== -1) beside.add(region);
      }
      if (beside.size >= 2) connectors.push({ x, y, regions: [...beside] });
    }
  }

  const doors: DungeonDoor[] = [];
  const roomOf = roomsByRegion(layout, regions);

  while (openRegions.size > 1 && connectors.length > 0) {
    const chosen = connectors[Math.floor(rng() * connectors.length)];
    openConnector(layout, chosen, roomOf, doors);

    const sources = chosen.regions.map((region) => merged[region]);
    const target = sources[0];
    // A join can touch the same region twice over, or two that have already been joined. Only
    // the ones that are really being swallowed may be struck off, or the survivor goes with them
    // and the count of what is left falls below what is still standing apart.
    const absorbed = [...new Set(sources)].filter((root) => root !== target);
    for (let index = 0; index < regionCount; index++) {
      if (absorbed.includes(merged[index])) merged[index] = target;
    }
    for (const region of absorbed) openRegions.delete(region);

    connectors = connectors.filter((connector) => {
      if (Math.abs(connector.x - chosen.x) + Math.abs(connector.y - chosen.y) < 2) return false;
      const spans = new Set(connector.regions.map((region) => merged[region]));
      if (spans.size > 1) return true;
      // A join that is no longer needed still gets opened now and then, and that is a loop.
      if (rng() < params.extraConnectorChance) openConnector(layout, connector, roomOf, doors);
      return false;
    });
  }

  return doors;
}

function roomsByRegion(layout: DungeonLayout, regions: Int32Array): Map<number, number> {
  const byRegion = new Map<number, number>();
  for (const room of layout.rooms) {
    for (let dy = 0; dy < room.h; dy++) {
      for (let dx = 0; dx < room.w; dx++) {
        const index = (room.y + dy) * layout.width + room.x + dx;
        if (layout.cells[index] === DungeonCell.Room) byRegion.set(regions[index], room.index);
      }
    }
  }
  return byRegion;
}

function openConnector(
  layout: DungeonLayout,
  connector: Connector,
  roomOf: Map<number, number>,
  doors: DungeonDoor[]
): void {
  layout.cells[connector.y * layout.width + connector.x] = DungeonCell.Door;
  const rooms = connector.regions
    .map((region) => roomOf.get(region))
    .filter((index): index is number => index !== undefined);
  doors.push({ x: connector.x, y: connector.y, rooms: [...new Set(rooms)].sort((a, b) => a - b), locked: false });
}

/** The one cell, or the run of cells, that a step of the lattice would open in this direction. */
function gapBeside(x: number, y: number, dx: number, dy: number, wide: number): DungeonRect {
  if (dx !== 0) return { x: dx > 0 ? x + wide : x - 1, y, w: 1, h: wide };
  return { x, y: dy > 0 ? y + wide : y - 1, w: wide, h: 1 };
}

function allCells(layout: DungeonLayout, rect: DungeonRect, is: (cell: number) => boolean): boolean {
  for (let dy = 0; dy < rect.h; dy++) {
    for (let dx = 0; dx < rect.w; dx++) {
      if (!is(cellAt(layout, rect.x + dx, rect.y + dy))) return false;
    }
  }
  return true;
}

function someCell(layout: DungeonLayout, rect: DungeonRect, is: (cell: number) => boolean): boolean {
  return !allCells(layout, rect, (cell) => !is(cell));
}

function fillRect(layout: DungeonLayout, rect: DungeonRect, value: DungeonCellValue): void {
  for (let dy = 0; dy < rect.h; dy++) {
    for (let dx = 0; dx < rect.w; dx++) setCell(layout, rect.x + dx, rect.y + dy, value);
  }
}

/** A passage that goes nowhere is not a passage; the maze is trimmed back until every stub is gone. */
function pruneDeadEnds(layout: DungeonLayout, wide: number): void {
  if (wide > 1) {
    pruneWideDeadEnds(layout, wide);
    return;
  }
  for (;;) {
    let trimmed = false;
    for (let y = 1; y < layout.height - 1; y++) {
      for (let x = 1; x < layout.width - 1; x++) {
        const index = y * layout.width + x;
        if (layout.cells[index] === DungeonCell.Rock) continue;
        if (layout.cells[index] === DungeonCell.Room) continue;

        let exits = 0;
        for (const [dx, dy] of DIRECTIONS) {
          if (layout.cells[(y + dy) * layout.width + x + dx] !== DungeonCell.Rock) exits++;
        }
        if (exits > 1) continue;
        layout.cells[index] = DungeonCell.Rock;
        trimmed = true;
      }
    }
    if (!trimmed) return;
  }
}

/**
 * The same trimming, done a square of passage at a time.
 *
 * A wide passage has no cell with one way out of it: every cell of it has the rest of the
 * passage beside it, and cutting one cell away would leave a shape no passage ever had. What
 * goes nowhere here is a whole square of the lattice, and it goes back the way it was cut.
 */
function pruneWideDeadEnds(layout: DungeonLayout, wide: number): void {
  const step = mazeStep(wide);
  const open = (cell: number) => cell !== DungeonCell.Rock;
  /** Whether any of this ground is what a door opens onto, and so is a way somebody needs. */
  const holdsUpADoor = (rect: DungeonRect) => {
    for (let dy = 0; dy < rect.h; dy++) {
      for (let dx = 0; dx < rect.w; dx++) {
        const x = rect.x + dx;
        const y = rect.y + dy;
        if (cellAt(layout, x, y) === DungeonCell.Door) return true;
        if (DIRECTIONS.some(([nx, ny]) => cellAt(layout, x + nx, y + ny) === DungeonCell.Door)) return true;
      }
    }
    return false;
  };
  for (;;) {
    let trimmed = false;
    for (let y = 1; y + wide <= layout.height - 1; y += step) {
      for (let x = 1; x + wide <= layout.width - 1; x += step) {
        const square = { x, y, w: wide, h: wide };
        // A square holds a passage rather than being one: a narrow passage leaves the rest of
        // the square as stone, and a room standing on the lattice is nobody's stub to trim.
        if (someCell(layout, square, (cell) => cell === DungeonCell.Room)) continue;
        if (!someCell(layout, square, (cell) => cell === DungeonCell.Corridor)) continue;
        const ways = DIRECTIONS.filter(([dx, dy]) => someCell(layout, gapBeside(x, y, dx, dy, wide), open));
        // A door is how a room is reached, so a square whose one way out carries a door, or
        // holds up one beside it, is that room's porch rather than a stub of passage. Trimming
        // it would leave the door opening onto stone, or onto a nub of way one cell across.
        const gaps = ways.map(([dx, dy]) => gapBeside(x, y, dx, dy, wide));
        if (ways.length > 1 || gaps.some((gap) => holdsUpADoor(gap))) continue;
        fillRect(layout, square, DungeonCell.Rock);
        for (const gap of gaps) fillRect(layout, gap, DungeonCell.Rock);
        trimmed = true;
      }
    }
    if (!trimmed) return;
  }
}

function crumble(layout: DungeonLayout, params: RoomsAndMazesParams, wide: number, rng: () => number): void {
  if (params.wallBreakChance <= 0) return;
  if (wide > 1) {
    crumbleWideWalls(layout, params, wide, rng);
    return;
  }
  const doomed: number[] = [];

  for (let y = 1; y < layout.height - 1; y++) {
    for (let x = 1; x < layout.width - 1; x++) {
      if (layout.cells[y * layout.width + x] !== DungeonCell.Rock) continue;
      const besideARoom = layout.rooms.some(
        (room) => x >= room.x - 1 && x <= room.x + room.w && y >= room.y - 1 && y <= room.y + room.h
      );
      if (besideARoom) continue;
      let open = 0;
      for (const [dx, dy] of DIRECTIONS) {
        if (layout.cells[(y + dy) * layout.width + x + dx] !== DungeonCell.Rock) open++;
      }
      if (open >= 2 && rng() < params.wallBreakChance) doomed.push(y * layout.width + x);
    }
  }

  for (const index of doomed) layout.cells[index] = DungeonCell.Corridor;
}

/**
 * The same ruin, taken a wall of the lattice at a time.
 *
 * One cell of a wall broken through a passage four across is a hole, not a way. What falls in
 * here is the whole wall between two squares of passage that both still stand.
 */
function crumbleWideWalls(layout: DungeonLayout, params: RoomsAndMazesParams, wide: number, rng: () => number): void {
  const step = mazeStep(wide);
  const isRock = (cell: number) => cell === DungeonCell.Rock;
  const isOpen = (cell: number) => cell !== DungeonCell.Rock;
  const doomed: DungeonRect[] = [];

  for (let y = 1; y + wide <= layout.height - 1; y += step) {
    for (let x = 1; x + wide <= layout.width - 1; x += step) {
      if (!someCell(layout, { x, y, w: wide, h: wide }, isOpen)) continue;
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ] as const) {
        const gap = gapBeside(x, y, dx, dy, wide);
        const beyond = { x: x + dx * step, y: y + dy * step, w: wide, h: wide };
        if (beyond.x + wide > layout.width - 1 || beyond.y + wide > layout.height - 1) continue;
        if (!allCells(layout, gap, isRock) || !someCell(layout, beyond, isOpen)) continue;
        const besideARoom = layout.rooms.some(
          (room) => gap.x >= room.x - 1 && gap.x <= room.x + room.w && gap.y >= room.y - 1 && gap.y <= room.y + room.h
        );
        if (besideARoom) continue;
        // Only where both sides are open does a hole become a way, so the wall falls in exactly
        // as far as the two passages meeting through it are wide.
        const through = sharedRun(layout, { x, y }, [dx, dy], wide);
        if (through.w > 0 && through.h > 0 && rng() < params.wallBreakChance) doomed.push(through);
      }
    }
  }

  for (const gap of doomed) fillRect(layout, gap, DungeonCell.Corridor);
}

/** The stretch of a wall that has a passage open on both sides of it, which is what may fall in. */
function sharedRun(layout: DungeonLayout, at: { x: number; y: number }, way: readonly [number, number], wide: number) {
  const step = mazeStep(wide);
  const [dx, dy] = way;
  const gap = gapBeside(at.x, at.y, dx, dy, wide);
  const along: number[] = [];
  for (let offset = 0; offset < wide; offset++) {
    const near = dx !== 0 ? { x: at.x + wide - 1, y: at.y + offset } : { x: at.x + offset, y: at.y + wide - 1 };
    const far = dx !== 0 ? { x: at.x + step, y: at.y + offset } : { x: at.x + offset, y: at.y + step };
    const open =
      cellAt(layout, near.x, near.y) !== DungeonCell.Rock && cellAt(layout, far.x, far.y) !== DungeonCell.Rock;
    if (open) along.push(offset);
    else if (along.length > 0) break;
  }
  if (along.length < 1) return { x: gap.x, y: gap.y, w: 0, h: 0 };
  const from = along[0];
  return dx !== 0
    ? { x: gap.x, y: gap.y + from, w: 1, h: along.length }
    : { x: gap.x + from, y: gap.y, w: along.length, h: 1 };
}

/** Which rooms a party can walk between without crossing a third, read off the finished map. */
function deriveLinks(layout: DungeonLayout): [number, number][] {
  const roomAt = new Int32Array(layout.cells.length).fill(-1);
  for (const room of layout.rooms) {
    for (let dy = 0; dy < room.h; dy++) {
      for (let dx = 0; dx < room.w; dx++) {
        const index = (room.y + dy) * layout.width + room.x + dx;
        if (layout.cells[index] === DungeonCell.Room) roomAt[index] = room.index;
      }
    }
  }

  const links = new Set<string>();
  for (const room of layout.rooms) {
    const seen = new Set<number>();
    const queue: number[] = [];
    for (let dy = 0; dy < room.h; dy++) {
      for (let dx = 0; dx < room.w; dx++) {
        const index = (room.y + dy) * layout.width + room.x + dx;
        if (roomAt[index] === room.index) queue.push(index);
      }
    }
    for (const index of queue) seen.add(index);

    for (let head = 0; head < queue.length; head++) {
      const index = queue[head];
      const x = index % layout.width;
      const y = Math.floor(index / layout.width);
      for (const [dx, dy] of DIRECTIONS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= layout.width || ny >= layout.height) continue;
        const next = ny * layout.width + nx;
        if (seen.has(next) || layout.cells[next] === DungeonCell.Rock) continue;
        seen.add(next);
        const other = roomAt[next];
        if (other !== -1 && other !== room.index) {
          const pair = other < room.index ? [other, room.index] : [room.index, other];
          links.add(pair.join(','));
          continue;
        }
        queue.push(next);
      }
    }
  }

  return [...links].map((key) => key.split(',').map(Number) as [number, number]);
}
