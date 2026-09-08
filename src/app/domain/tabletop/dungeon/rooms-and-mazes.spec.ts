import { seededRandom } from '@axe/core/util/seeded-random';
import {
  cellAt,
  countOpenCells,
  DungeonCell,
  DungeonLayout,
  reachableCells,
} from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { fitBoardTo, generateRoomsAndMazes, RoomsAndMazesParams } from '@axe/domain/tabletop/dungeon/rooms-and-mazes';

const SEEDS = [1, 7, 42, 1234, 99999];

function build(overrides: Partial<RoomsAndMazesParams> = {}): DungeonLayout {
  const params: RoomsAndMazesParams = {
    width: 37,
    height: 27,
    roomCount: 8,
    minRoom: 5,
    maxRoom: 9,
    windingPercent: 25,
    extraConnectorChance: 0.06,
    wallBreakChance: 0,
    shapes: ['rect'],
    minCorridor: 1,
    maxCorridor: 1,
    seed: 1,
    ...overrides,
  };
  return generateRoomsAndMazes(params, seededRandom(params.seed));
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

describe('generateRoomsAndMazes()', () => {
  it('gives the same dungeon back for the same seed', () => {
    expect(Array.from(build({ seed: 42 }).cells)).toEqual(Array.from(build({ seed: 42 }).cells));
  });

  it('gives a different dungeon for a different seed', () => {
    expect(Array.from(build({ seed: 42 }).cells)).not.toEqual(Array.from(build({ seed: 43 }).cells));
  });

  it('works on an odd board whatever size it is handed', () => {
    const even = build({ width: 40, height: 30 });

    expect(even.width % 2).toBe(1);
    expect(even.height % 2).toBe(1);
  });

  it('never places more rooms than asked for', () => {
    for (const seed of SEEDS) expect(build({ seed }).rooms.length).toBeLessThanOrEqual(8);
  });

  it('keeps a wall between every pair of rooms', () => {
    for (const seed of SEEDS) {
      const rooms = build({ seed }).rooms;
      for (let a = 0; a < rooms.length; a++) {
        for (let b = a + 1; b < rooms.length; b++) {
          const left = rooms[a];
          const right = rooms[b];
          const touching =
            left.x <= right.x + right.w &&
            right.x <= left.x + left.w &&
            left.y <= right.y + right.h &&
            right.y <= left.y + left.h;
          expect(touching).toBe(false);
        }
      }
    }
  });

  it('leaves every open cell reachable from the entrance', () => {
    for (const seed of SEEDS) {
      const layout = build({ seed });
      expect(reachableCells(layout, layout.entrance).size).toBe(countOpenCells(layout));
    }
  });

  it('keeps the outer ring solid', () => {
    for (const seed of SEEDS) expect(borderIsAllRock(build({ seed }))).toBe(true);
  });

  it('leaves no passage that goes nowhere', () => {
    // A maze grown to fill the rock is nearly all dead ends until they are trimmed back.
    for (const seed of SEEDS) {
      const layout = build({ seed });
      for (let y = 1; y < layout.height - 1; y++) {
        for (let x = 1; x < layout.width - 1; x++) {
          const cell = cellAt(layout, x, y);
          if (cell !== DungeonCell.Corridor && cell !== DungeonCell.Door) continue;
          const exits = [
            cellAt(layout, x + 1, y),
            cellAt(layout, x - 1, y),
            cellAt(layout, x, y + 1),
            cellAt(layout, x, y - 1),
          ].filter((neighbour) => neighbour !== DungeonCell.Rock).length;
          expect(exits).toBeGreaterThan(1);
        }
      }
    }
  });

  it('never runs a passage flush along a room it does not open onto', () => {
    // The maze only carves two cells from anything already open, so stone always stands between.
    for (const seed of SEEDS) {
      for (const layout of [build({ seed }), build({ seed, shapes: ['circle', 'cross'], minRoom: 7, maxRoom: 9 })]) {
        for (const room of layout.rooms) {
          for (let dy = -1; dy <= room.h; dy++) {
            for (let dx = -1; dx <= room.w; dx++) {
              const x = room.x + dx;
              const y = room.y + dy;
              const inside = dx >= 0 && dx < room.w && dy >= 0 && dy < room.h;
              if (inside && cellAt(layout, x, y) === DungeonCell.Room) continue;
              expect(cellAt(layout, x, y)).not.toBe(DungeonCell.Corridor);
            }
          }
        }
      }
    }
  });

  it('gives every room it kept a way in', () => {
    for (const seed of SEEDS) {
      const layout = build({ seed });
      for (const room of layout.rooms) {
        expect(layout.doors.some((door) => door.rooms.includes(room.index))).toBe(true);
      }
    }
  });

  it('marks every door cell as a door and never two in one place', () => {
    const layout = build({ seed: 7 });
    const cells = layout.doors.map((door) => `${door.x},${door.y}`);

    expect(new Set(cells).size).toBe(cells.length);
    for (const door of layout.doors) expect(cellAt(layout, door.x, door.y)).toBe(DungeonCell.Door);
  });

  it('joins rooms it can walk between and no others', () => {
    const layout = build({ seed: 7 });

    for (const [from, to] of layout.links) {
      expect(from).toBeLessThan(layout.rooms.length);
      expect(to).toBeLessThan(layout.rooms.length);
      expect(from).not.toBe(to);
    }
  });

  it('opens more joins when told to make loops', () => {
    const tight = build({ seed: 7, extraConnectorChance: 0 }).doors.length;
    const loose = build({ seed: 7, extraConnectorChance: 0.9 }).doors.length;

    expect(loose).toBeGreaterThan(tight);
  });

  it('draws rooms in the shapes it was given', () => {
    const circles = build({ seed: 7, shapes: ['circle'], minRoom: 7, maxRoom: 9 });
    const corners = circles.rooms.filter((room) => cellAt(circles, room.x, room.y) === DungeonCell.Rock);

    expect(circles.rooms.length).toBeGreaterThan(0);
    expect(corners.length).toBe(circles.rooms.length);
  });

  it('crumbles a ruin without dissolving the room walls', () => {
    for (const seed of SEEDS) {
      const layout = build({ seed, wallBreakChance: 0.2 });
      expect(reachableCells(layout, layout.entrance).size).toBe(countOpenCells(layout));
      expect(borderIsAllRock(layout)).toBe(true);
    }
  });

  it('copes with a board too small for the rooms it was asked for', () => {
    const layout = build({ width: 13, height: 13, roomCount: 8 });

    expect(layout.rooms.length).toBeLessThan(8);
    expect(reachableCells(layout, layout.entrance).size).toBe(countOpenCells(layout));
  });
});

describe('a board sized for the passages it has to hold', () => {
  it('leaves an odd board where a passage is one cell across', () => {
    expect(fitBoardTo(37, 1)).toBe(37);
    expect(fitBoardTo(38, 1)).toBe(37);
  });

  it('ends on a wall however wide the passage is', () => {
    for (const wide of [2, 3, 4]) {
      for (const asked of [20, 31, 44, 50]) {
        const fitted = fitBoardTo(asked, wide);

        expect(fitted).toBeLessThanOrEqual(asked);
        expect((fitted - wide - 2) % (wide + 1)).toBe(0);
      }
    }
  });

  it('never answers with a board too small to hold one passage', () => {
    expect(fitBoardTo(3, 4)).toBe(6);
  });
});

describe('passages cut wider than one cell', () => {
  const WIDTHS = [2, 3, 4];

  /** Every square and every join of the lattice the maze is cut on. */
  function latticePieces(layout: DungeonLayout, wide: number) {
    const step = wide + 1;
    const pieces: { x: number; y: number; w: number; h: number }[] = [];
    for (let y = 1; y + wide <= layout.height - 1; y += step) {
      for (let x = 1; x + wide <= layout.width - 1; x += step) {
        pieces.push({ x, y, w: wide, h: wide });
        pieces.push({ x: x + wide, y, w: 1, h: wide });
        pieces.push({ x, y: y + wide, w: wide, h: 1 });
      }
    }
    return pieces;
  }

  /** Whether this ground carries a door, or is what one opens onto. */
  function opensADoor(layout: DungeonLayout, piece: { x: number; y: number; w: number; h: number }): boolean {
    for (let dy = 0; dy < piece.h; dy++) {
      for (let dx = 0; dx < piece.w; dx++) {
        const x = piece.x + dx;
        const y = piece.y + dy;
        const around = [
          [0, 0],
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ];
        if (around.some(([ox, oy]) => cellAt(layout, x + ox, y + oy) === DungeonCell.Door)) return true;
      }
    }
    return false;
  }

  function cellsOf(layout: DungeonLayout, piece: { x: number; y: number; w: number; h: number }) {
    const cells: number[] = [];
    for (let dy = 0; dy < piece.h; dy++) {
      for (let dx = 0; dx < piece.w; dx++) cells.push(cellAt(layout, piece.x + dx, piece.y + dy));
    }
    return cells;
  }

  it('opens a passage across its whole width, never a cell of it', () => {
    for (const wide of WIDTHS) {
      for (const seed of SEEDS) {
        const layout = build({ minCorridor: wide, maxCorridor: wide, seed, width: 45, height: 33 });
        for (const piece of latticePieces(layout, wide)) {
          const cells = cellsOf(layout, piece);
          if (!cells.includes(DungeonCell.Corridor)) continue;
          if (cells.includes(DungeonCell.Room)) continue;

          expect(cells.every((cell) => cell !== DungeonCell.Rock)).toBe(true);
        }
      }
    }
  });

  it('keeps the outer ring solid', () => {
    for (const wide of WIDTHS) {
      for (const seed of SEEDS) {
        expect(borderIsAllRock(build({ minCorridor: wide, maxCorridor: wide, seed, width: 45, height: 33 }))).toBe(
          true
        );
      }
    }
  });

  it('leaves every open cell reachable from the entrance', () => {
    for (const wide of WIDTHS) {
      for (const seed of SEEDS) {
        const layout = build({ minCorridor: wide, maxCorridor: wide, seed, width: 45, height: 33 });

        expect(reachableCells(layout, layout.entrance).size).toBe(countOpenCells(layout));
      }
    }
  });

  it("leaves a stub of passage standing only where it is a room's porch", () => {
    for (const wide of WIDTHS) {
      for (const seed of SEEDS) {
        const layout = build({ minCorridor: wide, maxCorridor: wide, seed, width: 45, height: 33 });
        const step = wide + 1;
        for (let y = 1; y + wide <= layout.height - 1; y += step) {
          for (let x = 1; x + wide <= layout.width - 1; x += step) {
            const square = cellsOf(layout, { x, y, w: wide, h: wide });
            if (!square.some((cell) => cell === DungeonCell.Corridor)) continue;
            if (square.some((cell) => cell === DungeonCell.Room)) continue;
            const ways = [
              { x: x + wide, y, w: 1, h: wide },
              { x: x - 1, y, w: 1, h: wide },
              { x, y: y + wide, w: wide, h: 1 },
              { x, y: y - 1, w: wide, h: 1 },
            ]
              .map((gap) => ({ cells: cellsOf(layout, gap), opensADoor: opensADoor(layout, gap) }))
              .filter((gap) => gap.cells.some((cell) => cell !== DungeonCell.Rock));

            expect(ways.length).toBeGreaterThan(0);
            if (ways.length > 1) continue;

            expect(ways[0].opensADoor).toBe(true);
          }
        }
      }
    }
  });

  it('opens more of the board the wider the passages are', () => {
    const narrow = countOpenCells(build({ minCorridor: 1, maxCorridor: 1, width: 45, height: 33 }));
    const wide = countOpenCells(build({ minCorridor: 3, maxCorridor: 3, width: 45, height: 33 }));

    expect(wide).toBeGreaterThan(narrow);
  });

  it('keeps a wall between every pair of rooms', () => {
    for (const wide of WIDTHS) {
      const layout = build({ minCorridor: wide, maxCorridor: wide, seed: 42, width: 45, height: 33 });
      for (const room of layout.rooms) {
        for (const other of layout.rooms) {
          if (other.index <= room.index) continue;
          const apart =
            room.x > other.x + other.w ||
            other.x > room.x + room.w ||
            room.y > other.y + other.h ||
            other.y > room.y + room.h;

          expect(apart).toBe(true);
        }
      }
    }
  });
});

describe('passages cut anywhere between two widths', () => {
  /** Whether a cell sits in a block of open ground that many cells on a side. */
  function standsInABlock(layout: DungeonLayout, x: number, y: number, side: number): boolean {
    for (let oy = -side + 1; oy <= 0; oy++) {
      for (let ox = -side + 1; ox <= 0; ox++) {
        let whole = true;
        for (let dy = 0; dy < side && whole; dy++) {
          for (let dx = 0; dx < side && whole; dx++) {
            if (cellAt(layout, x + ox + dx, y + oy + dy) === DungeonCell.Rock) whole = false;
          }
        }
        if (whole) return true;
      }
    }
    return false;
  }

  it('never cuts one narrower than the table allows', () => {
    for (const [narrow, wide] of [
      [2, 4],
      [3, 4],
      [2, 3],
    ]) {
      for (const seed of SEEDS) {
        const layout = build({ minCorridor: narrow, maxCorridor: wide, seed, width: 45, height: 33 });
        for (let y = 0; y < layout.height; y++) {
          for (let x = 0; x < layout.width; x++) {
            if (cellAt(layout, x, y) !== DungeonCell.Corridor) continue;

            expect(standsInABlock(layout, x, y, narrow)).toBe(true);
          }
        }
      }
    }
  });

  it('leaves every open cell reachable where the widths are mixed', () => {
    for (const seed of SEEDS) {
      const layout = build({ minCorridor: 1, maxCorridor: 4, seed, width: 45, height: 33 });

      expect(reachableCells(layout, layout.entrance).size).toBe(countOpenCells(layout));
    }
  });

  it('cuts more than one width where more than one is allowed', () => {
    const widths = new Set<number>();
    for (const seed of SEEDS) {
      const layout = build({ minCorridor: 1, maxCorridor: 4, seed, width: 45, height: 33 });
      const step = 5;
      for (let y = 1; y + 4 <= layout.height - 1; y += step) {
        for (let x = 1; x + 4 <= layout.width - 1; x += step) {
          let across = 0;
          for (let dy = 0; dy < 4; dy++) {
            if (cellAt(layout, x, y + dy) === DungeonCell.Corridor) across++;
          }
          if (across > 0) widths.add(across);
        }
      }
    }

    expect(widths.size).toBeGreaterThan(1);
  });

  it('takes one width for both ends as a single width', () => {
    const asked = build({ minCorridor: 3, maxCorridor: 3, seed: 7, width: 45, height: 33 });
    const swapped = build({ minCorridor: 5, maxCorridor: 3, seed: 7, width: 45, height: 33 });

    expect(Array.from(swapped.cells)).toEqual(Array.from(asked.cells));
  });
});
