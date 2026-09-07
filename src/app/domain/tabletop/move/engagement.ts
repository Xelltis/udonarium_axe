import { GameCharacter } from '@axe/domain/character/game-character';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, CellGrid, forEachCellInBox } from '@axe/domain/tabletop/fog/cell-grid';
import { forEachMoveNeighbour } from '@axe/domain/tabletop/move/move-neighbours';
import { isHostileTo } from '@axe/domain/tabletop/move/zone-of-control';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';

/**
 * A knot of pieces standing close enough to be at each other.
 *
 * Some tables do not hold a fight as a set of pairs but as one place: whoever steps beside a
 * piece that is already fighting joins the same fight, and the knot grows rather than a second
 * one forming beside it. It is what a piece has to break out of, so the whole of it counts
 * against a piece leaving, allies of the leaver included.
 *
 * A knot with only one side in it is nobody's fight and is no engagement at all, which is how
 * one comes apart: it lasts exactly as long as an enemy is still standing in it.
 */
export interface Engagement {
  /** Everyone caught in it, of both sides. */
  members: readonly GameCharacter[];
  /** The ground they stand on. */
  cells: CellBits;
}

interface Standing {
  piece: GameCharacter;
  cells: number[];
}

/**
 * Every engagement on the table, worked out from where the pieces stand.
 *
 * Touching is the whole of it: two pieces a step apart are in the same one, and a piece that
 * touches any member of a knot is in the knot, however far from an enemy it happens to be.
 */
export function engagementsOn(grid: CellGrid, characters: readonly GameCharacter[], cutsCorners = true): Engagement[] {
  const standing = standingOn(grid, characters);
  if (standing.length < 2) return [];

  const on = new Map<number, number[]>();
  standing.forEach((held, index) => {
    for (const cell of held.cells) {
      const already = on.get(cell);
      if (already) already.push(index);
      else on.set(cell, [index]);
    }
  });

  const parent = standing.map((_, index) => index);
  const rootOf = (index: number): number => {
    let held = index;
    while (parent[held] !== held) held = parent[held] = parent[parent[held]];
    return held;
  };
  const join = (one: number, other: number): void => {
    const left = rootOf(one);
    const right = rootOf(other);
    if (left !== right) parent[right] = left;
  };
  const meet = (index: number, cell: number): void => {
    for (const other of on.get(cell) ?? []) {
      if (other !== index) join(index, other);
    }
  };

  standing.forEach((held, index) => {
    for (const cell of held.cells) {
      meet(index, cell);
      forEachMoveNeighbour(grid, cell, (neighbour) => meet(index, neighbour), cutsCorners);
    }
  });

  const knots = new Map<number, number[]>();
  standing.forEach((_, index) => {
    const root = rootOf(index);
    const already = knots.get(root);
    if (already) already.push(index);
    else knots.set(root, [index]);
  });

  const total = cellCount(grid);
  const engagements: Engagement[] = [];
  for (const knot of knots.values()) {
    const members = knot.map((index) => standing[index].piece);
    if (!members.some((piece) => members.some((other) => isHostileTo(piece, other)))) continue;
    const cells = new CellBits(total);
    for (const index of knot) {
      for (const cell of standing[index].cells) cells.set(cell);
    }
    engagements.push({ members, cells });
  }
  return engagements;
}

/** The engagement a piece is caught in, or nothing where it stands clear of every one. */
export function engagementOf(engagements: readonly Engagement[], piece: GameCharacter): Engagement | null {
  return (
    engagements.find((engagement) => engagement.members.some((member) => member.identifier === piece.identifier)) ??
    null
  );
}

/** The two sides of an engagement as they stand to one piece: its own, and the one against it. */
export function sidesOf(
  engagement: Engagement,
  piece: GameCharacter
): { own: readonly GameCharacter[]; against: readonly GameCharacter[] } {
  const against = engagement.members.filter((member) => isHostileTo(member, piece));
  const own = engagement.members.filter((member) => !isHostileTo(member, piece));
  return { own, against };
}

/**
 * What it costs a piece to walk out of the engagement it is caught in, in steps.
 *
 * The two sides are weighed against one another rather than added up: a side that outweighs
 * the one across from it walks out where it likes and owes nothing, and a side that does not
 * owes what it is short by. Standing level is not enough to walk out of, so the shortfall is
 * counted from level rather than from behind.
 */
export function breakOutCost(engagement: Engagement, piece: GameCharacter, countsSize: boolean): number {
  const { own, against } = sidesOf(engagement, piece);
  const short = engagementWeight(against, countsSize) - engagementWeight(own, countsSize);
  return Math.max(0, short + 1);
}

/**
 * What a body of pieces weighs, which is what a table counts a break-out against.
 *
 * Counted in the ground they take up, so a piece standing three cells across weighs three of a
 * piece standing on one. A table that would rather not have the size of a piece decide how hard
 * it is to get away from counts a body instead, one apiece.
 */
export function engagementWeight(pieces: readonly GameCharacter[], countsSize: boolean): number {
  return pieces.reduce((weight, piece) => weight + (countsSize ? Math.max(1, piece.size) : 1), 0);
}

function standingOn(grid: CellGrid, characters: readonly GameCharacter[]): Standing[] {
  if (grid.sizePx <= 0) return [];
  const standing: Standing[] = [];
  for (const piece of characters) {
    if (!piece.isVisibleOnTable || surfaceOf(piece) !== 'floor') continue;
    const cells: number[] = [];
    const span = Math.max(1, piece.size) * grid.sizePx;
    const { x, y } = piece.location;
    forEachCellInBox(grid, x, y, x + span - 1, y + span - 1, (cell) => cells.push(cell));
    if (cells.length > 0) standing.push({ piece, cells });
  }
  return standing;
}
