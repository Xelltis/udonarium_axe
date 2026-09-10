import { extraLinks, spanningTree } from '@axe/domain/tabletop/dungeon/dungeon-graph';
import {
  cellAt,
  DungeonCell,
  DungeonLayout,
  DungeonRoom,
  DungeonRoomRole,
  roomCenter,
  setCell,
} from '@axe/domain/tabletop/dungeon/dungeon-layout';

export interface CaveParams {
  width: number;
  height: number;
  chamberCount: number;
  wallFill: number;
  iterations: number;
  birth: number;
  survive: number;
  /** The narrowest and the widest a tunnel is dug, in cells. */
  minTunnel: number;
  maxTunnel: number;
  hazardPools: number;
  seed: number;
}

const CHAMBER_MIN_RADIUS = 2;
const CHAMBER_MAX_RADIUS = 4;
const HAZARD_POOL_CELLS = 12;
const CHAMBER_TRIES = 40;

function intRange(rng: () => number, low: number, high: number): number {
  if (high <= low) return low;
  return low + Math.floor(rng() * (high - low + 1));
}

function seedNoise(layout: DungeonLayout, wallFill: number, rng: () => number): void {
  for (let y = 0; y < layout.height; y++) {
    for (let x = 0; x < layout.width; x++) {
      const edge = x === 0 || y === 0 || x === layout.width - 1 || y === layout.height - 1;
      const rock = edge || rng() < wallFill;
      setCell(layout, x, y, rock ? DungeonCell.Rock : DungeonCell.Room);
    }
  }
}

/**
 * Dig the chambers apart from one another.
 *
 * Placed without a check they land on top of each other, and each one is still reported as
 * a room: two rooms at one spot, two torches on one cell, and a summary listing a place
 * twice. The tunnels and the smoothing join them soon enough.
 */
function digChambers(layout: DungeonLayout, count: number, rng: () => number): DungeonRoom[] {
  const chambers: DungeonRoom[] = [];
  const centres: { x: number; y: number; r: number }[] = [];

  for (let attempt = 0; attempt < count * CHAMBER_TRIES && chambers.length < count; attempt++) {
    const radius = intRange(rng, CHAMBER_MIN_RADIUS, CHAMBER_MAX_RADIUS);
    const cx = intRange(rng, radius + 1, layout.width - radius - 2);
    const cy = intRange(rng, radius + 1, layout.height - radius - 2);
    const overlaps = centres.some((other) => (other.x - cx) ** 2 + (other.y - cy) ** 2 < (other.r + radius) ** 2);
    if (overlaps) continue;
    centres.push({ x: cx, y: cy, r: radius });

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 1 || y < 1 || x > layout.width - 2 || y > layout.height - 2) continue;
        setCell(layout, x, y, DungeonCell.Room);
      }
    }

    const size = radius * 2 + 1;
    chambers.push({
      x: cx - radius,
      y: cy - radius,
      w: size,
      h: size,
      index: chambers.length,
      role: DungeonRoomRole.Chamber,
    });
  }

  return chambers;
}

function paintTunnel(layout: DungeonLayout, x: number, y: number, thickness: number): void {
  const reach = Math.max(1, thickness);
  for (let dy = 0; dy < reach; dy++) {
    for (let dx = 0; dx < reach; dx++) {
      const cx = Math.min(Math.max(x + dx, 1), layout.width - 2);
      const cy = Math.min(Math.max(y + dy, 1), layout.height - 2);
      setCell(layout, cx, cy, DungeonCell.Room);
    }
  }
}

function digTunnels(layout: DungeonLayout, chambers: readonly DungeonRoom[], params: CaveParams, rng: () => number) {
  const narrow = Math.max(1, Math.min(params.minTunnel, params.maxTunnel));
  const wide = Math.max(narrow, params.maxTunnel);
  const centers = chambers.map(roomCenter);
  const tree = spanningTree(centers);
  const loops = extraLinks(centers, tree, Math.floor(chambers.length / 4));
  const links = [...tree, ...loops];

  for (const [from, to] of links) {
    const start = centers[from];
    const end = centers[to];
    const step = (value: number, target: number) => (value === target ? 0 : value < target ? 1 : -1);
    let { x, y } = start;
    // One thickness for the whole run, so a tunnel does not swell and pinch along its length.
    const thickness = narrow + Math.floor(rng() * (wide - narrow + 1));
    const horizontalFirst = rng() < 0.5;

    if (horizontalFirst) {
      while (x !== end.x) {
        x += step(x, end.x);
        paintTunnel(layout, x, y, thickness);
      }
      while (y !== end.y) {
        y += step(y, end.y);
        paintTunnel(layout, x, y, thickness);
      }
    } else {
      while (y !== end.y) {
        y += step(y, end.y);
        paintTunnel(layout, x, y, thickness);
      }
      while (x !== end.x) {
        x += step(x, end.x);
        paintTunnel(layout, x, y, thickness);
      }
    }
  }

  return links;
}

function rockNeighbours(layout: DungeonLayout, x: number, y: number): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (cellAt(layout, x + dx, y + dy) === DungeonCell.Rock) count++;
    }
  }
  return count;
}

function smooth(layout: DungeonLayout, params: CaveParams): void {
  for (let pass = 0; pass < params.iterations; pass++) {
    const next = Uint8Array.from(layout.cells);
    for (let y = 1; y < layout.height - 1; y++) {
      for (let x = 1; x < layout.width - 1; x++) {
        const rock = cellAt(layout, x, y) === DungeonCell.Rock;
        const neighbours = rockNeighbours(layout, x, y);
        const staysRock = rock ? neighbours >= params.survive : neighbours >= params.birth;
        next[y * layout.width + x] = staysRock ? DungeonCell.Rock : DungeonCell.Room;
      }
    }
    layout.cells.set(next);
  }

  for (let x = 0; x < layout.width; x++) {
    setCell(layout, x, 0, DungeonCell.Rock);
    setCell(layout, x, layout.height - 1, DungeonCell.Rock);
  }
  for (let y = 0; y < layout.height; y++) {
    setCell(layout, 0, y, DungeonCell.Rock);
    setCell(layout, layout.width - 1, y, DungeonCell.Rock);
  }
}

/** Fill in every pocket but the biggest, so nothing is walled off from the rest. */
function keepLargestCavern(layout: DungeonLayout): void {
  const seen = new Int32Array(layout.cells.length).fill(-1);
  let bestLabel = -1;
  let bestSize = 0;
  let label = 0;

  for (let start = 0; start < layout.cells.length; start++) {
    if (layout.cells[start] === DungeonCell.Rock || seen[start] !== -1) continue;
    const queue = [start];
    seen[start] = label;
    let size = 0;

    for (let head = 0; head < queue.length; head++) {
      const index = queue[head];
      size++;
      const x = index % layout.width;
      const y = Math.floor(index / layout.width);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= layout.width || ny >= layout.height) continue;
        const next = ny * layout.width + nx;
        if (layout.cells[next] === DungeonCell.Rock || seen[next] !== -1) continue;
        seen[next] = label;
        queue.push(next);
      }
    }

    if (size > bestSize) {
      bestSize = size;
      bestLabel = label;
    }
    label++;
  }

  for (let index = 0; index < layout.cells.length; index++) {
    if (layout.cells[index] !== DungeonCell.Rock && seen[index] !== bestLabel) {
      layout.cells[index] = DungeonCell.Rock;
    }
  }
}

function pourHazards(layout: DungeonLayout, pools: number, rng: () => number): void {
  if (pools < 1) return;
  const open: number[] = [];
  for (let index = 0; index < layout.cells.length; index++) {
    if (layout.cells[index] === DungeonCell.Room) open.push(index);
  }
  if (open.length === 0) return;

  for (let pool = 0; pool < pools; pool++) {
    const start = open[Math.floor(rng() * open.length)];
    const queue = [start];
    const filled = new Set<number>([start]);

    while (queue.length > 0 && filled.size < HAZARD_POOL_CELLS) {
      const index = queue.shift()!;
      layout.cells[index] = DungeonCell.Hazard;
      const x = index % layout.width;
      const y = Math.floor(index / layout.width);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        // Without the bounds test a pool would wrap round the edge into the row above.
        if (nx < 0 || ny < 0 || nx >= layout.width || ny >= layout.height) continue;
        const next = ny * layout.width + nx;
        if (layout.cells[next] !== DungeonCell.Room || filled.has(next)) continue;
        filled.add(next);
        queue.push(next);
      }
    }
  }
}

function firstOpenCell(layout: DungeonLayout): { x: number; y: number } {
  for (let index = 0; index < layout.cells.length; index++) {
    if (layout.cells[index] !== DungeonCell.Rock) {
      return { x: index % layout.width, y: Math.floor(index / layout.width) };
    }
  }
  return { x: 1, y: 1 };
}

export function generateCave(params: CaveParams, rng: () => number): DungeonLayout {
  const layout: DungeonLayout = {
    width: params.width,
    height: params.height,
    cells: new Uint8Array(params.width * params.height).fill(DungeonCell.Rock),
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

  seedNoise(layout, params.wallFill, rng);
  const chambers = digChambers(layout, params.chamberCount, rng);
  layout.links = digTunnels(layout, chambers, params, rng);
  smooth(layout, params);
  keepLargestCavern(layout);

  // A chamber the smoothing closed over is no longer a place, so it stops being one here too.
  const renumbered = new Map<number, number>();
  layout.rooms = [];
  chambers.forEach((chamber, oldIndex) => {
    const center = roomCenter(chamber);
    if (cellAt(layout, center.x, center.y) === DungeonCell.Rock) return;
    renumbered.set(oldIndex, layout.rooms.length);
    layout.rooms.push({ ...chamber, index: layout.rooms.length });
  });
  layout.links = layout.links
    .filter(([from, to]) => renumbered.has(from) && renumbered.has(to))
    .map(([from, to]) => [renumbered.get(from)!, renumbered.get(to)!] as [number, number]);

  pourHazards(layout, params.hazardPools, rng);

  const start = layout.rooms.length > 0 ? roomCenter(layout.rooms[0]) : firstOpenCell(layout);
  layout.entrance = { ...start };
  layout.exit = { ...start };

  return layout;
}
