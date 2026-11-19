import { seededRandom } from '@axe/core/util/seeded-random';
import { HEADED_ORTHOGONAL_STEPS } from '@axe/domain/tabletop/cell-steps';
import {
  type MillKind,
  SETTLEMENT_ZONES,
  type SettlementLayout,
  type SettlementMill,
  type SettlementStream,
  type SettlementStreamCell,
} from '@axe/domain/tabletop/field/settlement-layout';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import type { MapPoint, MapRect } from '@axe/domain/tabletop/map-blocks';

/** How far the bed of a stream is dug into the ground it runs through, in cells. */
export const STREAM_DEPTH = 0.5;

/** How far under the ground beside it a stream's surface lies, in cells. */
const STREAM_SURFACE_DROP = 0.2;

/** The lowest a stream's surface lies over the board, in cells, where the ground beside it lies on the board. */
const STREAM_LEAST_SURFACE = 0.06;

/**
 * How many cells across and deep each mill stands, as its model is made facing south, and how tall:
 * a windmill and its sails, and a watermill's house with its wheel along its east side.
 */
export const MILL_SHAPES: Readonly<
  Record<MillKind, { readonly across: number; readonly deep: number; readonly tall: number }>
> = {
  windmill: { across: 3, deep: 3, tall: 5.6 },
  watermill: { across: 3, deep: 2, tall: 2.8 },
};

/**
 * What a stream's course costs: each step on, each turn over and above its step, and each column the
 * stream sets out from away from the one the seed picks. A turn costs two steps, so the stream runs
 * straight wherever it can; setting out a column aside costs half a step, so it sets out from where the
 * seed picks unless a course from beside it is straighter, and never runs along the top edge to get there.
 */
const STEP_COST = 2;
const TURN_COST = 4;
const SHIFT_COST = 1;

/** How many cells are kept clear between a watermill and the road. */
const MILL_CLEAR_OF_ROAD = 2;

/** How many places a windmill is tried at before the village is left without one. */
const WINDMILL_TRIES = 300;

/**
 * How far in from the edge of the board a watermill is stood where it can be, in cells, and how many
 * of the places nearest a bridge the seed picks among: a mill at the edge of the board, or far up the
 * stream from the road, is a mill nobody comes upon.
 */
const MILL_OFF_EDGE = 4;
const MILL_PLACES_NEAREST = 3;

/**
 * How many cells are kept clear round a windmill where there is room, and where there is not: its
 * sails sweep a cell out past its tower either side.
 */
const WINDMILL_ROOM = 2;
const WINDMILL_LEAST_ROOM = 1;

/** What the stream and the mills draw their chances from, apart from what the village drew its own from. */
const MILL_SEED = 8521;

/** The four ways a stream runs on from a cell, with the heading that is, in degrees clockwise from the top. */
const STEPS = HEADED_ORTHOGONAL_STEPS;

/** The heading a stream's state is given when it comes in over the top edge of the board: south. */
const SOUTH = 2;

/** How high the surface of a stream run through ground levelled to a height lies, in cells over the board. */
export function streamSurfaceOver(level: number): number {
  return Math.max(level - STREAM_SURFACE_DROP, STREAM_LEAST_SURFACE);
}

/** The column or row of a watermill's rectangle its wheel turns in, standing in the stream. */
export function watermillWheelOf(mill: SettlementMill): MapRect {
  const { x, y, w, h } = mill.rect;
  switch (mill.turn) {
    case 0:
      return { x: x + w - 1, y, w: 1, h };
    case 180:
      return { x, y, w: 1, h };
    case 90:
      return { x, y: y + h - 1, w, h: 1 };
    default:
      return { x, y, w, h: 1 };
  }
}

/** The rest of a watermill's rectangle, besides its wheel: its house, standing on the bank. */
export function watermillHouseOf(mill: SettlementMill): MapRect {
  const { x, y, w, h } = mill.rect;
  switch (mill.turn) {
    case 0:
      return { x, y, w: w - 1, h };
    case 180:
      return { x: x + 1, y, w: w - 1, h };
    case 90:
      return { x, y, w, h: h - 1 };
    default:
      return { x, y: y + 1, w, h: h - 1 };
  }
}

/**
 * A village with a stream run through it and its mills put up, the same from the same seed: what the
 * village laid down is left as it was, and these go where it left room.
 *
 * The stream runs a cell wide from the top edge of the board to the bottom edge, over open ground and
 * straight across the road, which bridges it; never through a yard, a floor, a field or a paddy, in
 * front of a door or the way into a field, or over anything standing. On a board of hexes it keeps a
 * cell clear of everything standing but the road, as the blocks there stand over a square a cell wide
 * round each hex, which reaches over the cells beside it. It takes the course of least cost, as
 * `STEP_COST`, `TURN_COST` and `SHIFT_COST` count it, setting out from the column the seed picks or
 * from another, at a cost for every column it lies aside; where no course reaches the bottom edge, the
 * village has no stream and no watermill.
 *
 * A watermill stands where the stream runs straight for two cells clear of the road, its wheel in the
 * stream and its house on the bank with a cell clear round it, on the bank where the foot of its wheel
 * turns the way the water runs, or on the other bank where that one has no room. A windmill stands on
 * open ground with a cell clear round it, its sails facing the road. The stream's cells but for its
 * bridges, the watermill's house and the windmill are all taken.
 */
export function layMillStream(
  village: SettlementLayout,
  width: number,
  height: number,
  seed: number,
  gridType: GridType = GridType.SQUARE
): SettlementLayout {
  const rng = seededRandom(seed + MILL_SEED);
  const taken = village.taken.slice();
  const fronts = doorFrontsOf(village, width, height);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  const open = (x: number, y: number) => {
    if (!inside(x, y)) return false;
    const cell = y * width + x;
    return !taken[cell] && village.zones[cell] === SETTLEMENT_ZONES.ground && !fronts[cell];
  };

  const banks = isHexGrid(gridType) ? banksOf(village, width, height) : null;
  const flowing = (x: number, y: number) => open(x, y) && !banks?.[y * width + x];
  const first = 2 + Math.floor(rng() * Math.max(1, width - 4));
  const course = streamFrom(village, width, height, first, flowing);
  const stream = course ? { cells: course } : null;
  const wet = new Uint8Array(width * height);
  for (const cell of course ?? []) {
    if (cell.bridge) continue;
    wet[cell.y * width + cell.x] = 1;
    taken[cell.y * width + cell.x] = 1;
  }
  const mills: SettlementMill[] = [];
  const watermill = stream ? watermillBeside(stream, village, width, height, open, taken, wet, rng) : null;
  if (watermill) {
    mills.push(watermill);
    takeRect(taken, width, watermillHouseOf(watermill));
  }
  const windmill = windmillOn(village, width, height, open, taken, rng);
  if (windmill) {
    mills.push(windmill);
    takeRect(taken, width, windmill.rect);
  }
  return { ...village, taken, ...(stream ? { stream } : {}), ...(mills.length > 0 ? { mills } : {}) };
}

/**
 * The cells beside anything standing, any of the eight round them, each as 1: whatever the village
 * took but its road.
 */
function banksOf(village: SettlementLayout, width: number, height: number): Uint8Array {
  const banks = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = y * width + x;
      if (!village.taken[cell] || village.zones[cell] === SETTLEMENT_ZONES.road) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (x + dx >= 0 && y + dy >= 0 && x + dx < width && y + dy < height) banks[cell + dy * width + dx] = 1;
        }
      }
    }
  }
  return banks;
}

/** Marks every cell of a rectangle taken. */
function takeRect(taken: Uint8Array, width: number, rect: MapRect): void {
  for (let y = rect.y; y < rect.y + rect.h; y++) taken.fill(1, y * width + rect.x, y * width + rect.x + rect.w);
}

/**
 * The cells in front of a door, either side of it along the way it opens onto, and outside the gap in
 * the fence round a field, each as 1.
 */
function doorFrontsOf(village: SettlementLayout, width: number, height: number): Uint8Array {
  const fronts = new Uint8Array(width * height);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  const mark = (x: number, y: number) => {
    if (inside(x, y)) fronts[y * width + x] = 1;
  };
  for (const door of village.doors) {
    if (door.across === 'y') {
      mark(door.x, door.y - 1);
      mark(door.x, door.y + 1);
    } else {
      mark(door.x - 1, door.y);
      mark(door.x + 1, door.y);
    }
  }
  for (const { rect, crop } of village.crops) {
    if (crop === 'rice') continue;
    for (let x = rect.x - 1; x <= rect.x + rect.w; x++) {
      for (const [y, out] of [
        [rect.y - 1, -1],
        [rect.y + rect.h, 1],
      ] as const) {
        if (inside(x, y) && village.walls[y * width + x] === 0) mark(x, y + out);
      }
    }
  }
  return fronts;
}

/**
 * The course of least cost from the top edge of the board to the bottom, a step at a time to one of the
 * four cells beside, never back the way it came: over the cells it may flow through, and over the road
 * only straight across it, north to south or south to north. It sets out southward from any cell of the
 * top edge it may flow through, at a cost for each column that lies from `first`, and ends at the first
 * cell of the bottom edge it reaches. Null where no course reaches the bottom edge.
 */
function streamFrom(
  village: SettlementLayout,
  width: number,
  height: number,
  first: number,
  flowing: (x: number, y: number) => boolean
): SettlementStreamCell[] | null {
  const road = (cell: number) => village.zones[cell] === SETTLEMENT_ZONES.road;
  const best = new Float64Array(width * height * STEPS.length).fill(Number.POSITIVE_INFINITY);
  const from = new Int32Array(width * height * STEPS.length).fill(-1);
  const queue: number[][] = [];
  for (let column = 0; column < width; column++) {
    if (!flowing(column, 0)) continue;
    const start = column * STEPS.length + SOUTH;
    const cost = Math.abs(column - first) * SHIFT_COST;
    best[start] = cost;
    (queue[cost] ??= []).push(start);
  }
  for (let cost = 0; cost < queue.length; cost++) {
    for (const state of queue[cost] ?? []) {
      if (best[state] !== cost) continue;
      const cell = Math.floor(state / STEPS.length);
      const heading = state % STEPS.length;
      const x = cell % width;
      const y = Math.floor(cell / width);
      if (y === height - 1) return courseTo(state, from, village, width);
      for (let turn = 0; turn < STEPS.length; turn++) {
        if (turn === (heading + 2) % STEPS.length) continue;
        if (road(cell) && turn !== heading) continue;
        const [dx, dy] = STEPS[turn];
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (road(next) ? dx !== 0 : !flowing(nx, ny)) continue;
        const reached = cost + STEP_COST + (turn === heading ? 0 : TURN_COST);
        const nextState = next * STEPS.length + turn;
        if (best[nextState] <= reached) continue;
        best[nextState] = reached;
        from[nextState] = state;
        (queue[reached] ??= []).push(nextState);
      }
    }
  }
  return null;
}

/** The cells of the course that ends in a state, from where it set out, each running on towards the next and the last off the board. */
function courseTo(last: number, from: Int32Array, village: SettlementLayout, width: number): SettlementStreamCell[] {
  const states: number[] = [];
  for (let state = last; state >= 0; state = from[state]) states.push(state);
  states.reverse();
  return states.map((state, at) => {
    const cell = Math.floor(state / STEPS.length);
    const onward = states[at + 1] ?? state;
    return {
      x: cell % width,
      y: Math.floor(cell / width),
      flow: STEPS[onward % STEPS.length][2],
      bridge: village.zones[cell] === SETTLEMENT_ZONES.road,
    };
  });
}

/** A watermill with its wheel at a cell of the stream, standing the way it is turned, its rectangle reaching back from the wheel. */
function watermillAt(wheel: MapPoint, turn: number): SettlementMill {
  const { across, deep } = MILL_SHAPES.watermill;
  const rect =
    turn === 0
      ? { x: wheel.x - across + 1, y: wheel.y, w: across, h: deep }
      : turn === 180
        ? { x: wheel.x, y: wheel.y, w: across, h: deep }
        : turn === 90
          ? { x: wheel.x, y: wheel.y - across + 1, w: deep, h: across }
          : { x: wheel.x, y: wheel.y, w: deep, h: across };
  return { kind: 'watermill', rect, turn };
}

/**
 * Where a watermill stands beside the stream, picked by the seed among the places it fits: any where
 * the foot of its wheel turns the way the water runs, and only where there is none of those, any where
 * it turns against it. Its wheel stands in two cells of the stream running straight on the same way,
 * neither of them a bridge; its house on open ground with nothing but the stream in the cells round it;
 * and the whole of it `MILL_CLEAR_OF_ROAD` cells clear of the road. Of the places it fits, those
 * `MILL_OFF_EDGE` cells in from the edge of the board are kept where there are any, and the seed
 * picks among the `MILL_PLACES_NEAREST` of them nearest a bridge. Null where it fits nowhere.
 */
function watermillBeside(
  stream: SettlementStream,
  village: SettlementLayout,
  width: number,
  height: number,
  open: (x: number, y: number) => boolean,
  taken: Uint8Array,
  wet: Uint8Array,
  rng: () => number
): SettlementMill | null {
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  const fits = (mill: SettlementMill): boolean => {
    const { rect } = mill;
    if (!inside(rect.x, rect.y) || !inside(rect.x + rect.w - 1, rect.y + rect.h - 1)) return false;
    const house = watermillHouseOf(mill);
    for (let y = house.y - 1; y <= house.y + house.h; y++) {
      for (let x = house.x - 1; x <= house.x + house.w; x++) {
        const within = x >= house.x && y >= house.y && x < house.x + house.w && y < house.y + house.h;
        if (within ? !open(x, y) : inside(x, y) && taken[y * width + x] && !wet[y * width + x]) return false;
      }
    }
    for (let y = rect.y - MILL_CLEAR_OF_ROAD; y < rect.y + rect.h + MILL_CLEAR_OF_ROAD; y++) {
      for (let x = rect.x - MILL_CLEAR_OF_ROAD; x < rect.x + rect.w + MILL_CLEAR_OF_ROAD; x++) {
        if (inside(x, y) && village.zones[y * width + x] === SETTLEMENT_ZONES.road) return false;
      }
    }
    return true;
  };
  const along: SettlementMill[] = [];
  const against: SettlementMill[] = [];
  const cells = stream.cells;
  for (let at = 0; at + 1 < cells.length; at++) {
    const here = cells[at];
    const next = cells[at + 1];
    if (here.bridge || next.bridge || here.flow !== next.flow) continue;
    const wheel = { x: Math.min(here.x, next.x), y: Math.min(here.y, next.y) };
    const fitting = watermillAt(wheel, here.flow);
    if (fits(fitting)) along.push(fitting);
    const facing = watermillAt(wheel, (here.flow + 180) % 360);
    if (fits(facing)) against.push(facing);
  }
  const places = along.length > 0 ? along : against;
  if (places.length < 1) return null;
  const offEdge = ({ rect }: SettlementMill) =>
    Math.min(rect.x, rect.y, width - rect.x - rect.w, height - rect.y - rect.h);
  const bridges = cells.filter((cell) => cell.bridge);
  const fromBridge = ({ rect }: SettlementMill) =>
    Math.min(
      ...bridges.map((bridge) => Math.abs(bridge.x - rect.x - rect.w / 2) + Math.abs(bridge.y - rect.y - rect.h / 2)),
      width + height
    );
  const inward = places.filter((place) => offEdge(place) >= MILL_OFF_EDGE);
  const nearest = (inward.length > 0 ? inward : places)
    .map((place, order) => ({ place, order, far: fromBridge(place) }))
    .sort((a, b) => a.far - b.far || a.order - b.order)
    .slice(0, MILL_PLACES_NEAREST);
  return nearest[Math.floor(rng() * nearest.length)].place;
}

/**
 * Where a windmill stands, tried at places the seed picks: on open ground, with nothing taken within
 * `WINDMILL_ROOM` cells of it, or within `WINDMILL_LEAST_ROOM` once half the tries have found no such
 * place, its sails facing the road, south where it stands north of the road and north where it stands
 * south of it. Null where none of the places tried will do.
 */
function windmillOn(
  village: SettlementLayout,
  width: number,
  height: number,
  open: (x: number, y: number) => boolean,
  taken: Uint8Array,
  rng: () => number
): SettlementMill | null {
  const { across, deep } = MILL_SHAPES.windmill;
  for (let tries = 0; tries < WINDMILL_TRIES; tries++) {
    const x = 1 + Math.floor(rng() * Math.max(1, width - across - 1));
    const y = 1 + Math.floor(rng() * Math.max(1, height - deep - 1));
    const rect = { x, y, w: across, h: deep };
    const room = tries < WINDMILL_TRIES / 2 ? WINDMILL_ROOM : WINDMILL_LEAST_ROOM;
    if (!clearFor(rect, width, height, open, taken, room)) continue;
    return { kind: 'windmill', rect, turn: facingRoad(village, width, height, rect) };
  }
  return null;
}

/** Whether every cell of a rectangle is open ground on the board, with no cell taken within so many cells round it. */
function clearFor(
  rect: MapRect,
  width: number,
  height: number,
  open: (x: number, y: number) => boolean,
  taken: Uint8Array,
  room: number
): boolean {
  for (let y = rect.y - room; y < rect.y + rect.h + room; y++) {
    for (let x = rect.x - room; x < rect.x + rect.w + room; x++) {
      const within = x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h;
      if (within ? !open(x, y) : x >= 0 && y >= 0 && x < width && y < height && taken[y * width + x]) return false;
    }
  }
  return true;
}

/** How far a mill is turned to face the road: not at all where it stands north of the road, half round where it stands south of it. */
function facingRoad(village: SettlementLayout, width: number, height: number, rect: MapRect): number {
  const column = rect.x + Math.floor(rect.w / 2);
  for (let y = 0; y < height; y++) {
    if (village.zones[y * width + column] === SETTLEMENT_ZONES.road) return rect.y + rect.h / 2 <= y ? 0 : 180;
  }
  return 0;
}
