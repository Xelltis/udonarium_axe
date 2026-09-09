import {
  clampDoorWidth,
  clampDoubleDoorPercent,
  DEFAULT_DOUBLE_DOOR_PERCENT,
  doorWidthsFor,
  MAX_DOOR_WIDTH,
  MIN_DOOR_WIDTH,
} from '@axe/domain/tabletop/dungeon/door-hanging';
import { DungeonRequest, generateDungeon } from '@axe/domain/tabletop/dungeon/dungeon-generator';
import {
  cellAt,
  DungeonCell,
  DungeonDoorLeaf,
  DungeonLayout,
  DungeonRoomRole,
} from '@axe/domain/tabletop/dungeon/dungeon-layout';

const SEEDS = [1, 7, 42, 1234, 99999, 5, 11, 23];

function build(overrides: Partial<DungeonRequest> = {}): DungeonLayout {
  return generateDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 7, ...overrides });
}

function spanOf(leaf: DungeonDoorLeaf): number {
  return leaf.across === 'x' ? leaf.h : leaf.w;
}

describe('door widths', () => {
  it('holds a width inside what a door may be hung at', () => {
    expect(clampDoorWidth(0)).toBe(MIN_DOOR_WIDTH);
    expect(clampDoorWidth(9)).toBe(MAX_DOOR_WIDTH);
    expect(clampDoorWidth(2.4)).toBe(2);
    expect(clampDoorWidth(undefined)).toBe(MIN_DOOR_WIDTH);
  });

  it('keeps the narrowest under the widest, whichever was asked for first', () => {
    expect(doorWidthsFor({ least: 4, most: 2 })).toEqual({ least: 2, most: 2 });
    expect(doorWidthsFor({ least: 1, most: 4 })).toEqual({ least: 1, most: 4 });
    expect(doorWidthsFor()).toEqual({ least: MIN_DOOR_WIDTH, most: MIN_DOOR_WIDTH });
  });

  it('hangs half of what it can as a pair when nothing was asked for', () => {
    expect(clampDoubleDoorPercent(undefined)).toBe(DEFAULT_DOUBLE_DOOR_PERCENT);
    expect(clampDoubleDoorPercent(-20)).toBe(0);
    expect(clampDoubleDoorPercent(400)).toBe(100);
  });
});

describe('hangDoors()', () => {
  it('fills one cell with one door until it is asked for a wider one', () => {
    const layout = build();

    expect(layout.doorLeaves.length).toBe(layout.doors.length);
    for (const leaf of layout.doorLeaves) expect(spanOf(leaf)).toBe(1);
  });

  it('covers every door cell once and stands on nothing else', () => {
    for (const seed of SEEDS) {
      const layout = build({ seed, roomCount: 10, doorWidth: { least: 3, most: 4 }, doubleDoorPercent: 60 });
      const covered = new Set<number>();

      for (const leaf of layout.doorLeaves) {
        for (let dy = 0; dy < leaf.h; dy++) {
          for (let dx = 0; dx < leaf.w; dx++) {
            expect(cellAt(layout, leaf.x + dx, leaf.y + dy)).toBe(DungeonCell.Door);
            covered.add((leaf.y + dy) * layout.width + leaf.x + dx);
          }
        }
      }

      expect(covered.size).toBe(layout.doors.length);
    }
  });

  it('cuts an opening wide enough for the door it is asked to hang', () => {
    for (const seed of SEEDS) {
      const wide = build({ seed, doorWidth: { least: 4, most: 4 }, doubleDoorPercent: 0 });
      const plain = build({ seed });

      expect(wide.doors.length).toBeGreaterThan(plain.doors.length);
      expect(wide.doorLeaves.some((leaf) => spanOf(leaf) === 4)).toBe(true);
    }
  });

  it('hangs a door of four as two leaves of two that part in the middle', () => {
    const layout = build({ doorWidth: { least: 4, most: 4 }, doubleDoorPercent: 100 });
    let pairs = 0;

    expect(layout.doorLeaves.every((leaf) => spanOf(leaf) !== 4)).toBe(true);
    layout.doorLeaves.forEach((leaf, index) => {
      const before = layout.doorLeaves[index - 1];
      if (!leaf.mirrored || !before || spanOf(before) !== 2 || spanOf(leaf) !== 2) return;
      const meets =
        leaf.across === 'x'
          ? leaf.x === before.x && leaf.y === before.y + 2
          : leaf.y === before.y && leaf.x === before.x + 2;
      if (!meets) return;
      expect(before.mirrored).toBe(false);
      pairs++;
    });

    expect(pairs).toBeGreaterThan(0);
  });

  it('hangs one leaf across the whole opening when no pair was asked for', () => {
    const layout = build({ doorWidth: { least: 4, most: 4 }, doubleDoorPercent: 0 });

    expect(layout.doorLeaves.some((leaf) => spanOf(leaf) === 4)).toBe(true);
    expect(layout.doorLeaves.every((leaf) => !leaf.mirrored || spanOf(leaf) > 1)).toBe(true);
  });

  it('leaves no way into the room a key opens standing open', () => {
    for (const seed of SEEDS) {
      const layout = build({ seed, roomCount: 10, doorWidth: { least: 4, most: 4 }, doubleDoorPercent: 50 });
      if (layout.keyRoomIndex < 0) continue;
      const boss = layout.rooms.find((room) => room.role === DungeonRoomRole.Boss)!;

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

  it('never cuts an opening past the stone that holds its door up', () => {
    for (const seed of Array.from({ length: 12 }, (_, index) => index * 7 + 1)) {
      const layout = build({ seed, doorWidth: { least: 4, most: 4 }, doubleDoorPercent: 100 });
      const doorAt = new Set(layout.doors.map((door) => door.y * layout.width + door.x));

      for (const leaf of layout.doorLeaves) {
        const step = leaf.across === 'x' ? { x: 0, y: 1 } : { x: 1, y: 0 };
        let start = { x: leaf.x, y: leaf.y };
        let end = { x: leaf.x + leaf.w - 1, y: leaf.y + leaf.h - 1 };
        while (doorAt.has((start.y - step.y) * layout.width + start.x - step.x)) {
          start = { x: start.x - step.x, y: start.y - step.y };
        }
        while (doorAt.has((end.y + step.y) * layout.width + end.x + step.x)) {
          end = { x: end.x + step.x, y: end.y + step.y };
        }

        // Open ground past both ends of an opening is a screen standing in a room, not a door.
        const ends = [
          cellAt(layout, start.x - step.x, start.y - step.y),
          cellAt(layout, end.x + step.x, end.y + step.y),
        ];
        expect(ends.some((cell) => cell === DungeonCell.Rock)).toBe(true);
      }
    }
  });

  it('keeps the outer wall standing while it cuts', () => {
    for (const seed of SEEDS) {
      const layout = build({ seed, doorWidth: { least: 4, most: 4 }, doubleDoorPercent: 50 });

      for (let x = 0; x < layout.width; x++) {
        expect(cellAt(layout, x, 0)).toBe(DungeonCell.Rock);
        expect(cellAt(layout, x, layout.height - 1)).toBe(DungeonCell.Rock);
      }
      for (let y = 0; y < layout.height; y++) {
        expect(cellAt(layout, 0, y)).toBe(DungeonCell.Rock);
        expect(cellAt(layout, layout.width - 1, y)).toBe(DungeonCell.Rock);
      }
    }
  });

  it('hangs the same doors again for the same seed', () => {
    const asked = { doorWidth: { least: 1, most: 4 }, doubleDoorPercent: 50 } as const;

    expect(build({ ...asked })).toEqual(build({ ...asked }));
  });
});
