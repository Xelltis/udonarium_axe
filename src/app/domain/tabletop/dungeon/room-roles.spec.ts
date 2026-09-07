import { seededRandom } from '@axe/core/util/seeded-random';
import { cellAt, DungeonCell, DungeonLayout, DungeonRoomRole } from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { assignRoomRoles } from '@axe/domain/tabletop/dungeon/room-roles';
import { generateRoomsAndMazes, RoomsAndMazesParams } from '@axe/domain/tabletop/dungeon/rooms-and-mazes';

const SEEDS = [1, 7, 42, 1234, 99999];

function build(overrides: Partial<RoomsAndMazesParams> = {}): DungeonLayout {
  const settings: RoomsAndMazesParams = {
    width: 37,
    height: 27,
    roomCount: 8,
    minRoom: 5,
    maxRoom: 9,
    windingPercent: 25,
    extraConnectorChance: 0.06,
    wallBreakChance: 0,
    shapes: ['rect'],
    corridorWidth: 1,
    seed: 1,
    ...overrides,
  };
  const layout = generateRoomsAndMazes(settings, seededRandom(settings.seed));
  assignRoomRoles(layout);
  return layout;
}

function roleOf(layout: DungeonLayout, role: string): number {
  return layout.rooms.findIndex((room) => room.role === role);
}

describe('assignRoomRoles()', () => {
  it('makes the first room the way in', () => {
    for (const seed of SEEDS) {
      expect(build({ seed }).rooms[0].role).toBe(DungeonRoomRole.Entrance);
    }
  });

  it('puts the way out at the middle of the deepest room', () => {
    for (const seed of SEEDS) {
      const layout = build({ seed });
      const boss = layout.rooms.find((room) => room.role === DungeonRoomRole.Boss);
      expect(boss).toBeDefined();
      expect(layout.exit).toEqual({
        x: boss!.x + Math.floor(boss!.w / 2),
        y: boss!.y + Math.floor(boss!.h / 2),
      });
    }
  });

  it('never gives two rooms the same singular part', () => {
    for (const seed of SEEDS) {
      const layout = build({ seed });
      for (const role of [
        DungeonRoomRole.Entrance,
        DungeonRoomRole.Boss,
        DungeonRoomRole.Treasure,
        DungeonRoomRole.Hall,
      ]) {
        expect(layout.rooms.filter((room) => room.role === role).length).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives every room some part to play', () => {
    for (const seed of SEEDS) {
      for (const room of build({ seed }).rooms) {
        expect(Object.values(DungeonRoomRole)).toContain(room.role);
      }
    }
  });

  it('locks only doors that lead into the deepest room', () => {
    for (const seed of SEEDS) {
      const layout = build({ seed });
      const boss = roleOf(layout, DungeonRoomRole.Boss);
      for (const door of layout.doors.filter((entry) => entry.locked)) {
        expect(door.rooms).toContain(boss);
      }
    }
  });

  it('leaves no way into the deepest room standing open', () => {
    // Counting doors is not enough: a two-wide entrance leaves a plain corridor cell beside
    // the door, and one gap anywhere in the wall makes the key an ornament.
    for (const seed of [1, 7, 42, 1234, 99999, 5, 11, 23, 3, 17]) {
      const layout = build({ seed });
      if (layout.keyRoomIndex < 0) continue;
      const boss = layout.rooms[roleOf(layout, DungeonRoomRole.Boss)];

      const ring: { x: number; y: number }[] = [];
      for (let dx = 0; dx < boss.w; dx++) {
        ring.push({ x: boss.x + dx, y: boss.y - 1 }, { x: boss.x + dx, y: boss.y + boss.h });
      }
      for (let dy = 0; dy < boss.h; dy++) {
        ring.push({ x: boss.x - 1, y: boss.y + dy }, { x: boss.x + boss.w, y: boss.y + dy });
      }

      for (const cell of ring) {
        if (cellAt(layout, cell.x, cell.y) === DungeonCell.Rock) continue;
        const door = layout.doors.find((entry) => entry.x === cell.x && entry.y === cell.y);
        expect(door?.locked).toBe(true);
      }
    }
  });

  it('leaves the key somewhere the party can walk to without passing the deepest room', () => {
    for (const seed of [1, 7, 42, 1234, 99999, 5, 11, 23]) {
      const layout = build({ seed });
      if (layout.keyRoomIndex < 0) continue;
      const boss = roleOf(layout, DungeonRoomRole.Boss);

      const neighbours = new Map<number, number[]>();
      for (const [a, b] of layout.links) {
        neighbours.set(a, [...(neighbours.get(a) ?? []), b]);
        neighbours.set(b, [...(neighbours.get(b) ?? []), a]);
      }
      const seen = new Set([0]);
      const queue = [0];
      for (let head = 0; head < queue.length; head++) {
        for (const next of neighbours.get(queue[head]) ?? []) {
          if (next === boss || seen.has(next)) continue;
          seen.add(next);
          queue.push(next);
        }
      }

      expect(seen.has(layout.keyRoomIndex)).toBe(true);
    }
  });

  it('leaves the key somewhere the party can walk to without opening the room it unlocks', () => {
    for (const seed of [1, 7, 42, 1234, 99999, 3, 11, 23]) {
      const layout = build({ seed });
      if (layout.keyRoomIndex < 0) continue;
      const boss = layout.rooms[roleOf(layout, DungeonRoomRole.Boss)];

      const blocked = new Set<number>();
      for (let dy = 0; dy < boss.h; dy++) {
        for (let dx = 0; dx < boss.w; dx++) blocked.add((boss.y + dy) * layout.width + boss.x + dx);
      }

      const start = layout.entrance.y * layout.width + layout.entrance.x;
      const seen = new Set([start]);
      const queue = [start];
      for (let head = 0; head < queue.length; head++) {
        const index = queue[head];
        const x = index % layout.width;
        const y = Math.floor(index / layout.width);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const next = (y + dy) * layout.width + x + dx;
          if (seen.has(next) || blocked.has(next)) continue;
          if (cellAt(layout, x + dx, y + dy) === DungeonCell.Rock) continue;
          seen.add(next);
          queue.push(next);
        }
      }

      const key = layout.rooms[layout.keyRoomIndex];
      const reachable = [...seen].some((index) => {
        const x = index % layout.width;
        const y = Math.floor(index / layout.width);
        return x >= key.x && x < key.x + key.w && y >= key.y && y < key.y + key.h;
      });
      expect(reachable).toBe(true);
    }
  });

  it('leaves everything open when there is nowhere to hide a key', () => {
    const layout = build({ roomCount: 1, width: 21, height: 17, minRoom: 5, maxRoom: 5 });

    expect(layout.doors.every((door) => !door.locked)).toBe(true);
    expect(layout.keyRoomIndex).toBe(-1);
  });

  it('does nothing to a dungeon with no rooms at all', () => {
    const layout = build({ roomCount: 0 });

    expect(layout.rooms).toEqual([]);
    expect(layout.keyRoomIndex).toBe(-1);
  });
});
