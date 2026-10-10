import { seededRandom } from '@axe/core/util/seeded-random';
import { generateDungeon } from '@axe/domain/tabletop/dungeon/dungeon-generator';
import { cellAt, DungeonCell, DungeonLayout, DungeonRoomRole } from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { clampTrapCount, MAX_DUNGEON_TRAPS, placeTraps } from '@axe/domain/tabletop/dungeon/trap-placing';

function dungeon(seed = 11): DungeonLayout {
  return generateDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed });
}

describe('clampTrapCount', () => {
  it('reads nothing as no traps at all', () => {
    expect(clampTrapCount(undefined)).toBe(0);
    expect(clampTrapCount(Number.NaN)).toBe(0);
  });

  it('holds a count between none and what a board will take', () => {
    expect(clampTrapCount(-4)).toBe(0);
    expect(clampTrapCount(6.4)).toBe(6);
    expect(clampTrapCount(999)).toBe(MAX_DUNGEON_TRAPS);
  });
});

describe('placeTraps', () => {
  it('sets as many as were asked for', () => {
    expect(placeTraps(dungeon(), 8, seededRandom(3)).length).toBe(8);
  });

  it('sets none where none were asked for', () => {
    expect(placeTraps(dungeon(), 0, seededRandom(3))).toEqual([]);
  });

  it('sets every one on ground a piece can walk on', () => {
    const layout = dungeon();

    for (const trap of placeTraps(layout, 12, seededRandom(5))) {
      const cell = cellAt(layout, trap.x, trap.y);
      expect(cell === DungeonCell.Room || cell === DungeonCell.Corridor).toBe(true);
    }
  });

  it('leaves the room the party walks in by alone', () => {
    const layout = dungeon();
    const entrance = layout.rooms.find((room) => room.role === DungeonRoomRole.Entrance);
    expect(entrance).toBeDefined();

    for (const trap of placeTraps(layout, MAX_DUNGEON_TRAPS, seededRandom(5))) {
      const inside =
        trap.x >= entrance!.x &&
        trap.x < entrance!.x + entrance!.w &&
        trap.y >= entrance!.y &&
        trap.y < entrance!.y + entrance!.h;
      expect(inside).toBe(false);
    }
  });

  it('leaves the ground the stairs stand on alone', () => {
    const layout = dungeon();
    const set = placeTraps(layout, MAX_DUNGEON_TRAPS, seededRandom(5));

    for (const spot of [layout.entrance, layout.exit]) {
      expect(set.some((trap) => trap.x === spot.x && trap.y === spot.y)).toBe(false);
    }
  });

  it('never sets two of them on top of one another', () => {
    const set = placeTraps(dungeon(), MAX_DUNGEON_TRAPS, seededRandom(9));

    for (const trap of set) {
      const beside = set.filter((other) => Math.abs(other.x - trap.x) < 3 && Math.abs(other.y - trap.y) < 3);
      expect(beside.length).toBe(1);
    }
  });

  it('gives a passage what a passage gets and a room what needs the floor of one', () => {
    const layout = dungeon();

    for (const trap of placeTraps(layout, MAX_DUNGEON_TRAPS, seededRandom(4))) {
      const room = cellAt(layout, trap.x, trap.y) === DungeonCell.Room;
      expect(['pit', 'rune'].includes(trap.kind)).toBe(room);
    }
  });

  it('strews the same board the same way from the same seed', () => {
    const layout = dungeon();

    expect(placeTraps(layout, 10, seededRandom(21))).toEqual(placeTraps(layout, 10, seededRandom(21)));
  });
});

describe('a dungeon asked for traps', () => {
  it('sets them where it was asked, and none where it was not', () => {
    expect(generateDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 11 }).traps).toBeUndefined();
    expect(generateDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 11, trapCount: 5 }).traps?.length).toBe(5);
  });

  it('comes out of its seed exactly as it always has, traps or no traps', () => {
    const plain = dungeon(11);
    const trapped = generateDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 11, trapCount: 5 });

    // Drawn last of all, so what was there before them is untouched by their being there.
    expect([...trapped.cells]).toEqual([...plain.cells]);
    expect(trapped.doorLeaves).toEqual(plain.doorLeaves);
  });
});
