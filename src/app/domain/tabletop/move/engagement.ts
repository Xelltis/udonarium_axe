import { GameCharacter } from '@axe/domain/character/game-character';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellColRow, cellCount, CellGrid, cellIndexOf, forEachCellInBox } from '@axe/domain/tabletop/fog/cell-grid';
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

/**
 * What a table does to a piece walking out of a fight.
 *
 * - `weighed` — the two sides are weighed against one another, and the heavier walks out free
 * - `cost` — leaving costs the same wherever it is done and whoever is doing it
 * - `block` — a fight is not walked out of at all
 * - `free` — a fight holds nobody who wants to leave it
 */
export const BREAK_OUT_MODES = ['weighed', 'cost', 'block', 'free'] as const;

export type BreakOutMode = (typeof BREAK_OUT_MODES)[number];

export const DEFAULT_BREAK_OUT_MODE: BreakOutMode = 'weighed';
export const DEFAULT_BREAK_OUT_COST = 1;

export function asBreakOutMode(value: unknown): BreakOutMode {
  return typeof value === 'string' && (BREAK_OUT_MODES as readonly string[]).includes(value)
    ? (value as BreakOutMode)
    : DEFAULT_BREAK_OUT_MODE;
}

/**
 * What the step out of a fight costs, in steps, as this table has it.
 *
 * The weighing is one way of pricing it rather than the price itself: a table that charges the
 * same for every leaving never weighs the sides at all, and one that lets nobody leave prices
 * the step at more than any piece has.
 */
export function breakOutToll(mode: BreakOutMode, weighed: number, flat: number): number {
  switch (mode) {
    case 'free':
      return 0;
    case 'block':
      return Number.POSITIVE_INFINITY;
    case 'cost':
      return Math.max(0, flat);
    default:
      return weighed;
  }
}

/** What ground holding no fight is priced at, which is no price at all. */
export const NO_FIGHT = -1;

/**
 * The fight a piece would be in wherever it went, and what walking out of it would cost.
 *
 * Which fight a piece is in follows from where it stands, so both answers belong to the ground
 * rather than to the piece: one that breaks out of a fight and comes to stand beside another
 * enemy is in a fight again, and owes that one whatever the new weighing comes to.
 */
export interface Fights {
  /** What leaving the fight on each cell would cost, or {@link NO_FIGHT} where none holds it. */
  readonly prices: Float64Array;
  /** The knots caught up on each cell, by which two cells are told to hold the same fight. */
  readonly knots: readonly (readonly number[] | undefined)[];
}

interface Standing {
  piece: GameCharacter;
  cells: number[];
}

interface Knotted {
  standing: Standing[];
  rootOf: (index: number) => number;
  knots: Map<number, number[]>;
}

/**
 * Every engagement on the table, worked out from where the pieces stand.
 *
 * Touching is the whole of it: two pieces a step apart are in the same one, and a piece that
 * touches any member of a knot is in the knot, however far from an enemy it happens to be.
 */
export function engagementsOn(grid: CellGrid, characters: readonly GameCharacter[], cutsCorners = true): Engagement[] {
  const knotted = knotsOn(grid, characters, cutsCorners);
  const total = cellCount(grid);
  const engagements: Engagement[] = [];
  for (const knot of knotted.knots.values()) {
    const members = knot.map((index) => knotted.standing[index].piece);
    if (!members.some((piece) => members.some((other) => isHostileTo(piece, other)))) continue;
    const cells = new CellBits(total);
    for (const index of knot) {
      for (const cell of knotted.standing[index].cells) cells.set(cell);
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

/**
 * What a side owes for walking out of a fight, given what the two sides weigh.
 *
 * The sides are weighed against one another rather than added up: a side that outweighs the one
 * across from it walks out where it likes and owes nothing, and a side that does not owes what
 * it is short by. Standing level is not enough to walk out of, so the shortfall is counted from
 * level rather than from behind.
 */
export function breakOutPrice(against: number, own: number): number {
  return Math.max(0, against - own + 1);
}

/** The fight on every cell of the table, as it would stand to the piece being moved. */
export function fightsByCell(
  grid: CellGrid,
  mover: GameCharacter,
  others: readonly GameCharacter[],
  countsSize: boolean,
  cutsCorners = true
): Fights {
  const total = cellCount(grid);
  const prices = new Float64Array(total).fill(NO_FIGHT);
  const knots: (number[] | undefined)[] = new Array(total);
  const knotted = knotsOn(
    grid,
    others.filter((piece) => piece.identifier !== mover.identifier),
    cutsCorners
  );
  if (knotted.standing.length < 1) return { prices, knots };

  const own = new Map<number, number>();
  const against = new Map<number, number>();
  const standingOn = new Map<number, number[]>();
  knotted.standing.forEach((held, index) => {
    const root = knotted.rootOf(index);
    const side = isHostileTo(held.piece, mover) ? against : own;
    side.set(root, (side.get(root) ?? 0) + weightOf(held.piece, countsSize));
    for (const cell of held.cells) {
      const already = standingOn.get(cell);
      if (already) already.push(index);
      else standingOn.set(cell, [index]);
    }
  });

  const mine = weightOf(mover, countsSize);
  // A piece standing on a cell takes up as much ground as it is wide, and touches with all of
  // it: a golem three across is beside an enemy its middle cell is nowhere near.
  const across = Math.max(1, Math.round(mover.size));
  const back = Math.floor((across - 1) / 2);
  for (let cell = 0; cell < total; cell++) {
    const touched: number[] = [];
    const gather = (met: number): void => {
      for (const index of standingOn.get(met) ?? []) {
        const root = knotted.rootOf(index);
        if (!touched.includes(root)) touched.push(root);
      }
    };
    const { col, row } = cellColRow(grid, cell);
    for (let down = 0; down < across; down++) {
      for (let right = 0; right < across; right++) {
        const stood = cellIndexOf(grid, col - back + right, row - back + down);
        if (stood < 0) continue;
        gather(stood);
        forEachMoveNeighbour(grid, stood, (neighbour) => gather(neighbour), cutsCorners);
      }
    }
    if (touched.length < 1) continue;
    let theirs = 0;
    let ours = mine;
    for (const root of touched) {
      theirs += against.get(root) ?? 0;
      ours += own.get(root) ?? 0;
    }
    if (theirs < 1) continue;
    prices[cell] = breakOutPrice(theirs, ours);
    knots[cell] = touched;
  }
  return { prices, knots };
}

/**
 * Whether a step walks out of a fight rather than staying in one.
 *
 * Staying is having somebody in common: a piece that steps away from half of what it was
 * fighting is still fighting the other half and has broken out of nothing. Walking from one
 * fight straight into another leaves the first, which is owed for like any other leaving.
 */
export function leavesFight(fights: Fights, from: number, to: number): boolean {
  const left = fights.knots[from];
  if (!left || fights.prices[from] === NO_FIGHT) return false;
  const into = fights.prices[to] === NO_FIGHT ? undefined : fights.knots[to];
  return !into || !left.some((knot) => into.includes(knot));
}

/** What one piece weighs: the ground it covers, or one where size is not to decide it. */
function weightOf(piece: GameCharacter, countsSize: boolean): number {
  return countsSize ? Math.max(1, piece.size) : 1;
}

/** Every piece run together with the ones it touches, whichever side any of them is on. */
function knotsOn(grid: CellGrid, characters: readonly GameCharacter[], cutsCorners: boolean): Knotted {
  const standing = standingOn(grid, characters);
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

  const on = new Map<number, number[]>();
  standing.forEach((held, index) => {
    for (const cell of held.cells) {
      const already = on.get(cell);
      if (already) already.push(index);
      else on.set(cell, [index]);
    }
  });
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
  return { standing, rootOf, knots };
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
