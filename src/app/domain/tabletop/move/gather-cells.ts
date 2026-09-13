import { GameCharacter } from '@axe/domain/character/game-character';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, CellGrid, forEachCellInBox } from '@axe/domain/tabletop/fog/cell-grid';
import { forEachMoveNeighbour } from '@axe/domain/tabletop/move/move-neighbours';
import { pieceCornerOn } from '@axe/domain/tabletop/move/piece-on-grid';

/** How many cells the search may look at before it gives up on a heavy table. */
const DEFAULT_GATHER_BUDGET = 4096;

export interface GatherSpot {
  readonly character: GameCharacter;
  readonly cell: number;
  readonly x: number;
  readonly y: number;
}

export interface GatherOptions {
  readonly budget?: number;
}

/**
 * Where each of a party's pieces goes to stand around one spot.
 *
 * The cell asked for is filled first and the rest are laid around it, nearest first, so a party
 * gathered on a doorway stands in the doorway rather than in a row running off it. Ground already
 * taken is passed over: a piece three cells across needs all nine of them free, and once it is
 * given a place the ground it covers is taken from the pieces after it.
 *
 * Pieces are answered for in the order they are given. One that finds no room within reach is
 * left out of the answer rather than piled onto ground somebody is standing on.
 */
export function gatherSpotsAround(
  grid: CellGrid,
  gridSize: number,
  start: number,
  characters: readonly GameCharacter[],
  taken: CellBits,
  options: GatherOptions = {}
): GatherSpot[] {
  const spots: GatherSpot[] = [];
  const total = cellCount(grid);
  if (grid.sizePx <= 0 || gridSize <= 0 || total <= 0) return spots;
  if (start < 0 || start >= total) return spots;

  const budget = Math.max(1, Math.floor(options.budget ?? DEFAULT_GATHER_BUDGET));
  const ground = taken.copy();
  for (const character of characters) {
    const spot = nearestRoomFor(grid, gridSize, start, character, ground, budget);
    if (!spot) continue;
    coverOf(grid, gridSize, character, spot.cell, (cell) => ground.set(cell));
    spots.push(spot);
  }
  return spots;
}

function nearestRoomFor(
  grid: CellGrid,
  gridSize: number,
  start: number,
  character: GameCharacter,
  ground: CellBits,
  budget: number
): GatherSpot | null {
  const total = cellCount(grid);
  const seen = new CellBits(total);
  let frontier = [start];
  seen.set(start);
  let looked = 0;

  while (frontier.length > 0) {
    const next: number[] = [];
    for (const cell of frontier) {
      if (++looked > budget) return null;
      if (hasRoomFor(grid, gridSize, character, cell, ground)) {
        const corner = pieceCornerOn(grid, character, gridSize, cell);
        return { character, cell, x: corner.x, y: corner.y };
      }
      forEachMoveNeighbour(grid, cell, (neighbour) => {
        if (seen.get(neighbour)) return;
        seen.set(neighbour);
        next.push(neighbour);
      });
    }
    frontier = next;
  }
  return null;
}

function hasRoomFor(
  grid: CellGrid,
  gridSize: number,
  character: GameCharacter,
  cell: number,
  ground: CellBits
): boolean {
  let room = true;
  let covered = 0;
  coverOf(grid, gridSize, character, cell, (covering) => {
    covered++;
    if (ground.get(covering)) room = false;
  });
  return room && covered > 0;
}

/**
 * The cells a piece would cover standing on one.
 *
 * Read the same way the ground already taken is read, so a piece asking for room and a piece
 * answering for the room it takes up cannot disagree about which cells those are.
 */
function coverOf(
  grid: CellGrid,
  gridSize: number,
  character: GameCharacter,
  cell: number,
  visit: (cell: number) => void
): void {
  const span = Math.max(1, character.size) * gridSize;
  const corner = pieceCornerOn(grid, character, gridSize, cell);
  forEachCellInBox(grid, corner.x, corner.y, corner.x + span - 1, corner.y + span - 1, visit);
}
