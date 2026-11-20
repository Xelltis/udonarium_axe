import {
  cellAt,
  DungeonCell,
  DungeonDoor,
  DungeonLayout,
  DungeonRoomRole,
  DungeonRoomRoleValue,
  firstCellOf,
  roomCells,
} from '@axe/domain/tabletop/dungeon/dungeon-layout';

const NEIGHBOURS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * How far each room lies from the way in, counted in steps across the floor.
 *
 * Counting joins between rooms would do if the passages formed a tree, but a maze links
 * everything to everything and every room comes out one hop away. The floor does not lie.
 */
function roomDepths(layout: DungeonLayout, blocked: ReadonlySet<number> = new Set()): number[] {
  const distance = new Int32Array(layout.cells.length).fill(-1);
  const start = layout.entrance.y * layout.width + layout.entrance.x;
  if (layout.cells[start] === DungeonCell.Rock) return layout.rooms.map(() => -1);

  distance[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    const x = index % layout.width;
    const y = Math.floor(index / layout.width);
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= layout.width || ny >= layout.height) continue;
      const next = ny * layout.width + nx;
      if (distance[next] !== -1 || blocked.has(next)) continue;
      if (layout.cells[next] === DungeonCell.Rock) continue;
      distance[next] = distance[index] + 1;
      queue.push(next);
    }
  }

  return layout.rooms.map((room) => {
    let best = -1;
    for (const cell of roomCells(layout, room)) {
      if (distance[cell] === -1) continue;
      if (best === -1 || distance[cell] < best) best = distance[cell];
    }
    return best;
  });
}

function doorsOf(layout: DungeonLayout, index: number): DungeonDoor[] {
  return layout.doors.filter((door) => door.rooms.includes(index));
}

function deepest(depths: readonly number[], allowed: (index: number) => boolean): number {
  let best = -1;
  let bestDepth = -1;
  depths.forEach((depth, index) => {
    if (depth < 0 || !allowed(index)) return;
    if (depth > bestDepth) {
      bestDepth = depth;
      best = index;
    }
  });
  return best;
}

/**
 * Give each room a part to play, then shut the deepest one and hide its key off the way there.
 *
 * Rooms that all look the same give a party no reason to pick one way over another, and a
 * dungeon with nothing shut gives them nothing to solve.
 */
export function assignRoomRoles(layout: DungeonLayout): void {
  if (layout.rooms.length === 0) return;

  // Walked in by a tunnel, the party starts at its mouth rather than in the middle of a room.
  layout.entrance = layout.mouth ?? firstCellOf(layout, 0);
  const depths = roomDepths(layout);
  const taken = new Set<number>([0]);
  const roles = new Map<number, DungeonRoomRoleValue>([[0, DungeonRoomRole.Entrance]]);

  const boss = deepest(depths, (index) => !taken.has(index));
  if (boss >= 0) {
    roles.set(boss, DungeonRoomRole.Boss);
    taken.add(boss);
  }

  // The treasury is the room hardest to stumble into: one way in, and a long walk to it.
  let treasure = -1;
  let treasureScore = -1;
  layout.rooms.forEach((room) => {
    if (taken.has(room.index) || depths[room.index] < 0) return;
    const ways = Math.max(1, doorsOf(layout, room.index).length);
    const score = depths[room.index] / ways;
    if (score > treasureScore) {
      treasureScore = score;
      treasure = room.index;
    }
  });
  if (treasure >= 0) {
    roles.set(treasure, DungeonRoomRole.Treasure);
    taken.add(treasure);
  }

  let hall = -1;
  let hallArea = -1;
  for (const room of layout.rooms) {
    if (taken.has(room.index)) continue;
    const area = roomCells(layout, room).length;
    if (area > hallArea) {
      hallArea = area;
      hall = room.index;
    }
  }
  if (hall >= 0) {
    roles.set(hall, DungeonRoomRole.Hall);
    taken.add(hall);
  }

  for (const room of layout.rooms) {
    if (!roles.has(room.index) && doorsOf(layout, room.index).length <= 1) {
      roles.set(room.index, DungeonRoomRole.DeadEnd);
    }
  }

  for (const room of layout.rooms) room.role = roles.get(room.index) ?? DungeonRoomRole.Chamber;

  layout.exit = boss >= 0 ? firstCellOf(layout, boss) : layout.entrance;
  if (boss > 0) lockTheDeepestRoom(layout, boss);
}

/**
 * Shut every opening in the deepest room's wall, not merely the doors already marked.
 *
 * A passage two cells wide leaves one cell as a door and the other as plain floor, and a
 * single gap anywhere in the wall makes the key an ornament.
 */
function sealRoom(layout: DungeonLayout, index: number): DungeonDoor[] {
  const room = layout.rooms[index];
  if (!room) return [];

  const ring: { x: number; y: number }[] = [];
  for (let dx = -1; dx <= room.w; dx++) {
    ring.push({ x: room.x + dx, y: room.y - 1 }, { x: room.x + dx, y: room.y + room.h });
  }
  for (let dy = -1; dy <= room.h; dy++) {
    ring.push({ x: room.x - 1, y: room.y + dy }, { x: room.x + room.w, y: room.y + dy });
  }

  const sealed: DungeonDoor[] = [];
  for (const cell of ring) {
    const value = cellAt(layout, cell.x, cell.y);
    if (value !== DungeonCell.Corridor && value !== DungeonCell.Door) continue;
    // Only a cell that actually touches the room is a way into it.
    const touches = NEIGHBOURS.some(([dx, dy]) => {
      const x = cell.x + dx;
      const y = cell.y + dy;
      return (
        cellAt(layout, x, y) === DungeonCell.Room &&
        x >= room.x &&
        x < room.x + room.w &&
        y >= room.y &&
        y < room.y + room.h
      );
    });
    if (!touches) continue;

    layout.cells[cell.y * layout.width + cell.x] = DungeonCell.Door;
    const existing = layout.doors.find((door) => door.x === cell.x && door.y === cell.y);
    if (existing) {
      existing.locked = true;
      if (!existing.rooms.includes(index)) existing.rooms.push(index);
      sealed.push(existing);
      continue;
    }
    const added: DungeonDoor = { x: cell.x, y: cell.y, rooms: [index], locked: true };
    layout.doors.push(added);
    sealed.push(added);
  }

  layout.doors.sort((left, right) => left.y * layout.width + left.x - (right.y * layout.width + right.x));
  return sealed;
}

function lockTheDeepestRoom(layout: DungeonLayout, boss: number): void {
  layout.keyRoomIndex = -1;
  for (const door of layout.doors) door.locked = false;

  const blocked = new Set(roomCells(layout, layout.rooms[boss]));
  const withoutBoss = roomDepths(layout, blocked);
  // The key has to lie somewhere the party can walk to without going through the room it opens.
  const candidate = deepest(withoutBoss, (index) => index !== 0 && index !== boss);
  if (candidate < 0) return;

  if (sealRoom(layout, boss).length === 0) return;
  layout.keyRoomIndex = candidate;
}

/**
 * Gives the rooms playing each part one of the kinds of room the place keeps for that part, in turn
 * by the order the rooms were dug in: a tower's small rooms a library, a workshop, an observatory and
 * a bedroom, and round again. It draws nothing from the seed, so the rest of the place comes out
 * of its seed as it would without them.
 */
export function assignRoomSets(
  layout: DungeonLayout,
  sets: Readonly<Partial<Record<DungeonRoomRoleValue, readonly string[]>>>
): void {
  const counted = new Map<DungeonRoomRoleValue, number>();
  for (const room of layout.rooms) {
    const kinds = sets[room.role];
    if (!kinds || kinds.length === 0) continue;
    const order = counted.get(room.role) ?? 0;
    counted.set(room.role, order + 1);
    room.set = kinds[order % kinds.length];
  }
}
