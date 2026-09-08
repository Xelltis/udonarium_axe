import { seededRandom } from '@axe/core/util/seeded-random';
import { CaveParams, generateCave } from '@axe/domain/tabletop/dungeon/cave-automata';
import {
  cellAt,
  countOpenCells,
  DungeonCell,
  DungeonLayout,
  reachableCells,
} from '@axe/domain/tabletop/dungeon/dungeon-layout';

const SEEDS = [1, 7, 42, 1234, 99999];

function params(overrides: Partial<CaveParams> = {}): CaveParams {
  return {
    width: 40,
    height: 30,
    chamberCount: 8,
    wallFill: 0.45,
    iterations: 4,
    birth: 5,
    survive: 4,
    minTunnel: 2,
    maxTunnel: 2,
    hazardPools: 0,
    seed: 1,
    ...overrides,
  };
}

function build(overrides: Partial<CaveParams> = {}): DungeonLayout {
  const settings = params(overrides);
  return generateCave(settings, seededRandom(settings.seed));
}

function borderIsAllRock(layout: DungeonLayout): boolean {
  for (let x = 0; x < layout.width; x++) {
    if (cellAt(layout, x, 0) !== DungeonCell.Rock) return false;
    if (cellAt(layout, x, layout.height - 1) !== DungeonCell.Rock) return false;
  }
  for (let y = 0; y < layout.height; y++) {
    if (cellAt(layout, 0, y) !== DungeonCell.Rock) return false;
    if (cellAt(layout, layout.width - 1, y) !== DungeonCell.Rock) return false;
  }
  return true;
}

describe('generateCave()', () => {
  it('gives the same cave back for the same seed', () => {
    expect(Array.from(build({ seed: 42 }).cells)).toEqual(Array.from(build({ seed: 42 }).cells));
  });

  it('gives a different cave for a different seed', () => {
    expect(Array.from(build({ seed: 42 }).cells)).not.toEqual(Array.from(build({ seed: 43 }).cells));
  });

  it('leaves one cavern and no pockets walled off from it', () => {
    for (const seed of SEEDS) {
      const layout = build({ seed });
      expect(reachableCells(layout, layout.entrance).size).toBe(countOpenCells(layout));
    }
  });

  it('keeps the outer ring solid', () => {
    for (const seed of SEEDS) {
      expect(borderIsAllRock(build({ seed }))).toBe(true);
    }
  });

  it('opens between a third and three quarters of the board', () => {
    for (const seed of SEEDS) {
      const layout = build({ seed });
      const share = countOpenCells(layout) / (layout.width * layout.height);
      expect(share).toBeGreaterThan(0.3);
      expect(share).toBeLessThan(0.75);
    }
  });

  it('opens more of the board when less of it starts as rock', () => {
    expect(countOpenCells(build({ seed: 7, wallFill: 0.4 }))).toBeGreaterThan(
      countOpenCells(build({ seed: 7, wallFill: 0.52 }))
    );
  });

  it('keeps every chamber it reports open at its middle', () => {
    for (const seed of SEEDS) {
      const layout = build({ seed });
      for (const room of layout.rooms) {
        const x = room.x + Math.floor(room.w / 2);
        const y = room.y + Math.floor(room.h / 2);
        expect(cellAt(layout, x, y)).not.toBe(DungeonCell.Rock);
      }
    }
  });

  it('digs its chambers apart from one another', () => {
    // Placed on top of each other they are still reported as two rooms in the one spot.
    for (const seed of SEEDS) {
      const layout = build({ seed });
      for (const room of layout.rooms) {
        const cx = room.x + Math.floor(room.w / 2);
        const cy = room.y + Math.floor(room.h / 2);
        const inside = layout.rooms.filter(
          (other) =>
            other !== room && cx >= other.x && cx < other.x + other.w && cy >= other.y && cy < other.y + other.h
        );
        expect(inside).toEqual([]);
      }
    }
  });

  it('numbers the chambers it kept from nothing upward', () => {
    for (const seed of SEEDS) {
      build({ seed }).rooms.forEach((room, index) => expect(room.index).toBe(index));
    }
  });

  it('digs its chambers apart from one another', () => {
    // Placed on top of each other they are still reported as two rooms in the one spot.
    for (const seed of SEEDS) {
      const layout = build({ seed });
      for (const room of layout.rooms) {
        const cx = room.x + Math.floor(room.w / 2);
        const cy = room.y + Math.floor(room.h / 2);
        const inside = layout.rooms.filter(
          (other) =>
            other !== room && cx >= other.x && cx < other.x + other.w && cy >= other.y && cy < other.y + other.h
        );
        expect(inside).toEqual([]);
      }
    }
  });

  it('never reports more chambers than it was asked to dig', () => {
    for (const seed of SEEDS) {
      expect(build({ seed }).rooms.length).toBeLessThanOrEqual(8);
    }
  });

  it('numbers its chambers in order and links only ones it kept', () => {
    for (const seed of SEEDS) {
      const layout = build({ seed });
      layout.rooms.forEach((room, index) => expect(room.index).toBe(index));
      for (const [from, to] of layout.links) {
        expect(from).toBeLessThan(layout.rooms.length);
        expect(to).toBeLessThan(layout.rooms.length);
      }
    }
  });

  it('pours the hazard pools it was asked for', () => {
    const layout = build({ seed: 7, hazardPools: 3 });
    let hazard = 0;
    for (const cell of layout.cells) if (cell === DungeonCell.Hazard) hazard++;

    expect(hazard).toBeGreaterThan(0);
    expect(hazard).toBeLessThanOrEqual(3 * 12);
  });

  it('leaves the cave whole once the hazards are in', () => {
    const layout = build({ seed: 7, hazardPools: 3 });

    expect(reachableCells(layout, layout.entrance).size).toBe(countOpenCells(layout));
  });

  it('starts somewhere open', () => {
    for (const seed of SEEDS) {
      const layout = build({ seed });
      expect(cellAt(layout, layout.entrance.x, layout.entrance.y)).not.toBe(DungeonCell.Rock);
    }
  });
});
