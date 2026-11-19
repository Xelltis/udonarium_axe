import { HEADED_ORTHOGONAL_STEPS, SQUARE_STEPS_WITH_CORNERS } from '@axe/domain/tabletop/cell-steps';
import type { WaterwayPlan } from '@axe/domain/tabletop/dungeon/dungeon-atmosphere';
import {
  cellAt,
  DungeonCell,
  DungeonLayout,
  DungeonPoint,
  DungeonRoom,
  DungeonSpout,
  inBounds,
  roomCells,
  WaterwayKind,
} from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { levelUnder } from '@axe/domain/tabletop/field/field-sample-points';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { GROUND_SAMPLES_PER_CELL } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { GroundRaster, groundRasterOver } from '@axe/domain/tabletop/ground/ground-raster';
import { cellCentre } from '@axe/domain/tabletop/map-grid';

const AROUND = SQUARE_STEPS_WITH_CORNERS;

/** The four ways water runs on from a cell, with the heading that is, in degrees clockwise from the top. */
const STEPS = HEADED_ORTHOGONAL_STEPS;

/**
 * The walls a pipe can come out of, as where the wall lies from the water and which way the pipe faces
 * away from it, measured as a light on a wall is: along x at nought, along y at ninety.
 */
const NORTH_WALL: readonly [number, number, number] = [0, -1, 90];
const SOUTH_WALL: readonly [number, number, number] = [0, 1, 270];
const WEST_WALL: readonly [number, number, number] = [-1, 0, 0];
const EAST_WALL: readonly [number, number, number] = [1, 0, 180];

/**
 * Runs water through a laid-out place, as its plan says.
 *
 * A channel runs down the middle of every passage, in each cell of passage with passage all round it,
 * so it never comes up against the stone or a door and leaves a walkway either side. A basin is sunk
 * in each room that plays a part the plan names, in every cell of it with the room all round it, so a
 * ledge of floor is left along its walls; a place too small to have such a room has one sunk in the
 * largest of its rooms that is neither the way in nor the way out. Nothing is put under water on or beside the way in, the way
 * out or a tunnel's mouth. Wherever water would cut some of the floor off from the way in, the
 * fewest cells that join it up again are left dry, as a bridge.
 *
 * The channels run towards the basins: each run of channel along itself to its outlet, the cell of it
 * nearest a basin by the walk, and out of the outlet towards the basin; with no basin they run towards
 * the way out. The last cells of a run before its outlet are its outfall, cut as deep as a basin, so
 * the channel falls into them over a weir; a run no longer than its outfall would be is left level.
 *
 * A pipe pours into each basin out of the wall at the middle of each of its two long sides, the
 * basin's water let in through the ledge under it. A pipe whose water a bridge has left dry is not
 * stood.
 *
 * Nothing here is left to chance, so the same place always takes the same water, and whatever is
 * worked out from the seed after it comes out as it would have.
 */
export function cutWaterways(layout: DungeonLayout, plan: WaterwayPlan): void {
  const kinds = new Uint8Array(layout.width * layout.height);
  const dry = keptDry(layout);
  for (let y = 0; y < layout.height; y++) {
    for (let x = 0; x < layout.width; x++) {
      const index = y * layout.width + x;
      if (dry.has(index) || cellAt(layout, x, y) !== DungeonCell.Corridor) continue;
      if (AROUND.every(([dx, dy]) => cellAt(layout, x + dx, y + dy) === DungeonCell.Corridor)) {
        kinds[index] = WaterwayKind.Channel;
      }
    }
  }
  for (const room of basinRoomsOf(layout, plan)) {
    for (const index of roomCells(layout, room)) {
      const x = index % layout.width;
      const y = Math.floor(index / layout.width);
      if (dry.has(index)) continue;
      if (AROUND.every(([dx, dy]) => inRoom(layout, room, x + dx, y + dy))) kinds[index] = WaterwayKind.Basin;
    }
  }
  const spouts = spoutsOf(layout, kinds, dry);
  for (const spout of spouts) kinds[spout.y * layout.width + spout.x] = WaterwayKind.Basin;
  for (let index = 0; index < kinds.length; index++) {
    if (kinds[index] !== WaterwayKind.Dry) layout.cells[index] = DungeonCell.Water;
  }
  bridgeOver(layout, kinds);
  layout.waterway = { kinds, flow: flowOf(layout, kinds, plan.outfallCells) };
  layout.spouts = spouts.filter((spout) => {
    const [dx, dy] = awayFrom(spout.facing);
    return [spout, { x: spout.x + dx, y: spout.y + dy }].every(
      (cell) => kinds[cell.y * layout.width + cell.x] === WaterwayKind.Basin
    );
  });
}

/**
 * How high the ground of a place with water run through it stands, at every sample of the ground over
 * the board, in cells: its floor raised to the walkway, with the beds of its channels and its basins
 * dug down under their water.
 *
 * A sample lies under the cell it falls in, and where it falls on the line between cells, under the
 * highest of them; so on squares the bank of the water slopes down inside the water's own cells and
 * the floor beside it lies level. What stands on the ground is let down to the lowest of it under its
 * foot, so every sample that foot could be read at is kept at the walkway wherever anything stands: the
 * stone, a door, a stair or a piece of furniture.
 */
export function reliefOfWaterways(layout: DungeonLayout, plan: WaterwayPlan, gridType: GridType): GroundRaster {
  const kinds = layout.waterway?.kinds;
  const levelAt = (x: number, y: number): number => {
    if (!kinds || !inBounds(layout, x, y)) return plan.walkway;
    const kind = kinds[y * layout.width + x];
    if (kind === WaterwayKind.Channel) return plan.channel.bed;
    if (kind === WaterwayKind.Basin || kind === WaterwayKind.Outfall) return plan.basin.bed;
    return plan.walkway;
  };
  const { columns, rows, heights } = groundRasterOver(layout, gridType, (x, y) => levelUnder(gridType, x, y, levelAt));
  for (const cell of standingCells(layout)) {
    const centre = cellCentre(cell, { type: gridType, sizePx: 1 });
    const across = sampleSpan(centre.x, columns);
    const down = sampleSpan(centre.y, rows);
    for (let row = down.from; row <= down.to; row++) {
      for (let column = across.from; column <= across.to; column++) {
        heights[row * columns + column] = Math.max(heights[row * columns + column], plan.walkway);
      }
    }
  }
  return { columns, rows, heights };
}

/**
 * The rooms a basin is sunk in: those that play a part the plan names, or where none does, the one
 * largest room that holds neither the way in nor the way out.
 */
function basinRoomsOf(layout: DungeonLayout, plan: WaterwayPlan): DungeonRoom[] {
  const named = layout.rooms.filter((room) => plan.basinRoles.includes(room.role));
  if (named.length > 0) return named;
  const holds = (room: DungeonRoom, spot: DungeonPoint) =>
    spot.x >= room.x && spot.y >= room.y && spot.x < room.x + room.w && spot.y < room.y + room.h;
  let largest: DungeonRoom | null = null;
  for (const room of layout.rooms) {
    if (holds(room, layout.entrance) || holds(room, layout.exit)) continue;
    if (!largest || room.w * room.h > largest.w * largest.h) largest = room;
  }
  return largest ? [largest] : [];
}

/** Whether a cell is the floor of this room, within the box it stands in. */
function inRoom(layout: DungeonLayout, room: DungeonRoom, x: number, y: number): boolean {
  const inside = x >= room.x && y >= room.y && x < room.x + room.w && y < room.y + room.h;
  return inside && cellAt(layout, x, y) === DungeonCell.Room;
}

/** The cells on and beside the way in, the way out and a tunnel's mouth, which are kept out of the water. */
function keptDry(layout: DungeonLayout): Set<number> {
  const dry = new Set<number>();
  for (const spot of [layout.entrance, layout.exit, layout.mouth]) {
    if (!spot) continue;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (inBounds(layout, spot.x + dx, spot.y + dy)) dry.add((spot.y + dy) * layout.width + spot.x + dx);
      }
    }
  }
  return dry;
}

/** Whether a cell is floor a piece walks on without wading: anything but the stone and the water. */
function dryFloor(cell: number): boolean {
  return cell !== DungeonCell.Rock && cell !== DungeonCell.Water;
}

/**
 * Leaves dry, a bridge at a time, the water between the way in and whatever floor it cuts off, until
 * every floor is reached from the way in without wading.
 */
function bridgeOver(layout: DungeonLayout, kinds: Uint8Array): void {
  const start = layout.entrance.y * layout.width + layout.entrance.x;
  if (!inBounds(layout, layout.entrance.x, layout.entrance.y) || !dryFloor(layout.cells[start])) return;
  for (;;) {
    const bridge = shortestWade(layout, dryReach(layout, start));
    if (bridge.length < 1) return;
    for (const index of bridge) {
      layout.cells[index] = kinds[index] === WaterwayKind.Basin ? DungeonCell.Room : DungeonCell.Corridor;
      kinds[index] = WaterwayKind.Dry;
    }
  }
}

/** Every floor reached from a cell without wading, flagged cell by cell. */
function dryReach(layout: DungeonLayout, start: number): Uint8Array {
  const reached = new Uint8Array(layout.cells.length);
  reached[start] = 1;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const x = queue[head] % layout.width;
    const y = Math.floor(queue[head] / layout.width);
    for (const [dx, dy] of STEPS) {
      if (!inBounds(layout, x + dx, y + dy)) continue;
      const next = (y + dy) * layout.width + x + dx;
      if (reached[next] || !dryFloor(layout.cells[next])) continue;
      reached[next] = 1;
      queue.push(next);
    }
  }
  return reached;
}

/** The fewest cells of water to wade from the floor reached to a floor it does not reach, or none where there is no such floor. */
function shortestWade(layout: DungeonLayout, reached: Uint8Array): number[] {
  const unseen = -2;
  const from = new Int32Array(layout.cells.length).fill(unseen);
  const queue: number[] = [];
  for (let index = 0; index < reached.length; index++) {
    if (!reached[index]) continue;
    from[index] = -1;
    queue.push(index);
  }
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    const x = index % layout.width;
    const y = Math.floor(index / layout.width);
    for (const [dx, dy] of STEPS) {
      if (!inBounds(layout, x + dx, y + dy)) continue;
      const next = (y + dy) * layout.width + x + dx;
      if (from[next] !== unseen) continue;
      const cell = layout.cells[next];
      if (cell === DungeonCell.Water) {
        from[next] = index;
        queue.push(next);
        continue;
      }
      if (!dryFloor(cell)) continue;
      const bridge: number[] = [];
      for (let at = index; from[at] >= 0; at = from[at]) bridge.push(at);
      return bridge;
    }
  }
  return [];
}

/** How many steps of the walk each cell lies from the nearest basin, or from the way out where there is none; -1 where none is reached. */
function walkFromBasins(layout: DungeonLayout, kinds: Uint8Array): Int32Array {
  const distance = new Int32Array(kinds.length).fill(-1);
  const queue: number[] = [];
  for (let index = 0; index < kinds.length; index++) {
    if (kinds[index] !== WaterwayKind.Basin) continue;
    distance[index] = 0;
    queue.push(index);
  }
  if (queue.length < 1 && cellAt(layout, layout.exit.x, layout.exit.y) !== DungeonCell.Rock) {
    const exit = layout.exit.y * layout.width + layout.exit.x;
    distance[exit] = 0;
    queue.push(exit);
  }
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    const x = index % layout.width;
    const y = Math.floor(index / layout.width);
    for (const [dx, dy] of STEPS) {
      if (cellAt(layout, x + dx, y + dy) === DungeonCell.Rock) continue;
      const next = (y + dy) * layout.width + x + dx;
      if (distance[next] >= 0) continue;
      distance[next] = distance[index] + 1;
      queue.push(next);
    }
  }
  return distance;
}

/**
 * Which way the water of each channel cell runs.
 *
 * Each run of channel, every cell of it joined to the next, drains at its outlet, the cell of it the
 * walk to a basin is shortest from: the water runs along the channel a cell at a time towards the outlet,
 * and out of the outlet on towards the basin. The cells of a run fewer than `outfallCells` from its
 * outlet are marked its outfall, where the run reaches further than that.
 */
function flowOf(layout: DungeonLayout, kinds: Uint8Array, outfallCells: number): Int16Array {
  const flow = new Int16Array(kinds.length).fill(-1);
  const distance = walkFromBasins(layout, kinds);
  const seen = new Uint8Array(kinds.length);
  for (let first = 0; first < kinds.length; first++) {
    if (kinds[first] !== WaterwayKind.Channel || seen[first]) continue;
    const run = channelRun(layout, kinds, first, seen);
    let outlet = -1;
    for (const index of run) {
      if (distance[index] > 0 && (outlet < 0 || distance[index] < distance[outlet])) outlet = index;
    }
    if (outlet < 0) continue;
    flow[outlet] = headingTo(layout, outlet, (next) => distance[next] >= 0 && distance[next] < distance[outlet]);
    const along = new Int32Array(kinds.length).fill(-1);
    along[outlet] = 0;
    const queue = [outlet];
    for (let head = 0; head < queue.length; head++) {
      const index = queue[head];
      for (const next of neighboursOf(layout, index)) {
        if (kinds[next] !== WaterwayKind.Channel || along[next] >= 0) continue;
        along[next] = along[index] + 1;
        flow[next] = headingTo(layout, next, (cell) => cell === index);
        queue.push(next);
      }
    }
    if (outfallCells < 1 || !run.some((index) => along[index] >= outfallCells)) continue;
    for (const index of run) {
      if (along[index] >= 0 && along[index] < outfallCells) kinds[index] = WaterwayKind.Outfall;
    }
  }
  return flow;
}

/** Every channel cell joined to this one, flagging each as seen, in the order they are come upon. */
function channelRun(layout: DungeonLayout, kinds: Uint8Array, first: number, seen: Uint8Array): number[] {
  seen[first] = 1;
  const run = [first];
  for (let head = 0; head < run.length; head++) {
    for (const next of neighboursOf(layout, run[head])) {
      if (kinds[next] !== WaterwayKind.Channel || seen[next]) continue;
      seen[next] = 1;
      run.push(next);
    }
  }
  return run;
}

/** The cells beside a cell on the board, the four ways in turn. */
function neighboursOf(layout: DungeonLayout, index: number): number[] {
  const x = index % layout.width;
  const y = Math.floor(index / layout.width);
  const beside: number[] = [];
  for (const [dx, dy] of STEPS) {
    if (inBounds(layout, x + dx, y + dy)) beside.push((y + dy) * layout.width + x + dx);
  }
  return beside;
}

/** The heading from a cell to the first cell beside it that will do, or -1 where none will. */
function headingTo(layout: DungeonLayout, index: number, will: (next: number) => boolean): number {
  const x = index % layout.width;
  const y = Math.floor(index / layout.width);
  for (const [dx, dy, heading] of STEPS) {
    if (inBounds(layout, x + dx, y + dy) && will((y + dy) * layout.width + x + dx)) return heading;
  }
  return -1;
}

/**
 * The step a pipe faces, across the board, from the way it faces as a light on a wall is measured:
 * along x at nought, along y at ninety. Whatever reads which way a pipe faces reads it here.
 */
export function awayFrom(facing: number): [number, number] {
  const turn = (facing * Math.PI) / 180;
  return [Math.round(Math.cos(turn)), Math.round(Math.sin(turn))];
}

/**
 * Where a pipe pours into each basin: out of the wall at the middle of each of its two long sides,
 * from the cell of ledge against the wall there, facing out over the water. A cell is passed over
 * where it is kept dry, where what lies behind it is not the stone, or where a door stands beside it.
 */
function spoutsOf(layout: DungeonLayout, kinds: Uint8Array, dry: ReadonlySet<number>): DungeonSpout[] {
  const spouts: DungeonSpout[] = [];
  for (const room of layout.rooms) {
    const basin: DungeonPoint[] = [];
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (inBounds(layout, x, y) && kinds[y * layout.width + x] === WaterwayKind.Basin) basin.push({ x, y });
      }
    }
    if (basin.length < 1) continue;
    const xs = basin.map((cell) => cell.x);
    const ys = basin.map((cell) => cell.y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    const middle = { x: (left + right) / 2, y: (top + bottom) / 2 };
    const walls = right - left >= bottom - top ? [NORTH_WALL, SOUTH_WALL] : [WEST_WALL, EAST_WALL];
    for (const [wx, wy, facing] of walls) {
      let best: DungeonPoint | null = null;
      let off = Number.POSITIVE_INFINITY;
      for (const cell of basin) {
        const ledge = { x: cell.x + wx, y: cell.y + wy };
        if (!inRoom(layout, room, ledge.x, ledge.y) || dry.has(ledge.y * layout.width + ledge.x)) continue;
        if (kinds[ledge.y * layout.width + ledge.x] !== WaterwayKind.Dry) continue;
        if (cellAt(layout, ledge.x + wx, ledge.y + wy) !== DungeonCell.Rock) continue;
        if (AROUND.some(([dx, dy]) => cellAt(layout, ledge.x + dx, ledge.y + dy) === DungeonCell.Door)) continue;
        const along = wx === 0 ? Math.abs(cell.x - middle.x) : Math.abs(cell.y - middle.y);
        if (along >= off) continue;
        off = along;
        best = ledge;
      }
      if (best) spouts.push({ x: best.x, y: best.y, facing });
    }
  }
  return spouts;
}

/** Every cell something stands on: the stone, the doors, the stairs and the mouth, and the furniture. */
function standingCells(layout: DungeonLayout): DungeonPoint[] {
  const standing: DungeonPoint[] = [];
  for (let y = 0; y < layout.height; y++) {
    for (let x = 0; x < layout.width; x++) {
      const cell = cellAt(layout, x, y);
      if (cell === DungeonCell.Rock || cell === DungeonCell.Door) standing.push({ x, y });
    }
  }
  standing.push(layout.entrance, layout.exit, ...(layout.mouth ? [layout.mouth] : []));
  for (const piece of layout.furnishings ?? []) {
    for (let dy = 0; dy < piece.h; dy++) {
      for (let dx = 0; dx < piece.w; dx++) standing.push({ x: piece.x + dx, y: piece.y + dy });
    }
  }
  return standing;
}

/**
 * The samples within a cell's width of a point along one way, every one the foot of a thing standing
 * there could be read at, kept to the samples there are.
 */
function sampleSpan(centre: number, count: number): { from: number; to: number } {
  return {
    from: Math.max(0, Math.floor((centre - 1) * GROUND_SAMPLES_PER_CELL) + 1),
    to: Math.min(count - 1, Math.ceil((centre + 1) * GROUND_SAMPLES_PER_CELL) - 1),
  };
}
