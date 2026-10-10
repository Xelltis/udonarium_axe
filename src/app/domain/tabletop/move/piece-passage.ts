import { GameCharacter } from '@axe/domain/character/game-character';
import { NO_ALLIANCE, PartyAlliance } from '@axe/domain/party/party-alliance';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, CellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import { occupiedCells } from '@axe/domain/tabletop/move/occupied-cells';
import { PieceRelation, relationBetween } from '@axe/domain/tabletop/move/piece-relation';

/**
 * What the ground somebody else is standing on does to a piece walking into it.
 *
 * `share` is what a table has always done, and `block` what it did with sharing turned off.
 * Between them are the two a piece squeezing past its own side needs: ground it may cross but
 * not stand on, whether or not it is charged for the trouble.
 */
export const PIECE_PASSAGE_MODES = ['block', 'pass', 'cost', 'share'] as const;

export type PiecePassageMode = (typeof PIECE_PASSAGE_MODES)[number];

export const DEFAULT_PIECE_PASSAGE_COST = 1;

/** Reads a stored passage mode, answering with nothing for anything it does not know. */
export function asPiecePassageMode(value: unknown): PiecePassageMode | null {
  return typeof value === 'string' && (PIECE_PASSAGE_MODES as readonly string[]).includes(value)
    ? (value as PiecePassageMode)
    : null;
}

/**
 * How far apart in size two pieces must be for one to squeeze past the other.
 *
 * Counted in cells, which is what a table knows of size: a piece of one cell and a piece of
 * three are two steps apart on the ladder most games keep, and a piece of two and a piece of
 * four likewise. Anything closer than that is a body in the way.
 */
export const SLIPS_PAST_CELLS = 2;

/** Whether one of the two is far enough from the other in size to squeeze past it. */
function slipsPast(piece: GameCharacter, mover: GameCharacter): boolean {
  const theirs = Math.max(1, Math.round(piece.size));
  const ours = Math.max(1, Math.round(mover.size));
  return Math.abs(theirs - ours) >= SLIPS_PAST_CELLS;
}

/** The ground the pieces on the table hold against one walking among them. */
export interface PassageCells {
  /** Ground it may not enter at all. */
  blocked: CellBits;
  /** Ground it pays over the odds to enter. */
  costly: CellBits;
  /** Ground it crosses without being able to stop on it. */
  noStop: CellBits;
}

/**
 * The ground the pieces already standing take up, sorted by what the table lets a piece do with it.
 *
 * The pieces are sorted by what they are to the one moving and each group is measured with the
 * ground it covers, so a golem standing three across shuts or charges for all nine of its cells
 * exactly as it always did.
 */
export function passageCells(
  grid: CellGrid,
  pieces: readonly GameCharacter[],
  mover: GameCharacter,
  modeFor: (relation: PieceRelation) => PiecePassageMode,
  slipsPastBySize = false,
  allied: PartyAlliance = NO_ALLIANCE
): PassageCells {
  const total = cellCount(grid);
  const held: PassageCells = {
    blocked: new CellBits(total),
    costly: new CellBits(total),
    noStop: new CellBits(total),
  };

  const grouped = new Map<PiecePassageMode, GameCharacter[]>();
  for (const piece of pieces) {
    if (piece.identifier === mover.identifier) continue;
    let mode = modeFor(relationBetween(piece, mover, allied));
    // Ground shut to a piece of one's own size is ground one squeezes past where the two are
    // far enough apart in size, which is how a table lets a rat under a giant and a giant over
    // a rat. It is still no place to stop: half a giant standing on a rat is nobody's rule.
    if (mode === 'block' && slipsPastBySize && slipsPast(piece, mover)) mode = 'pass';
    if (mode === 'share') continue;
    const group = grouped.get(mode);
    if (group) group.push(piece);
    else grouped.set(mode, [piece]);
  }

  for (const [mode, group] of grouped) {
    const standing = occupiedCells(grid, group, mover.identifier);
    if (mode === 'block') held.blocked.or(standing);
    else held.noStop.or(standing);
    if (mode === 'cost') held.costly.or(standing);
  }
  // Ground shut to the piece is ground it never stands on either, and saying so twice would
  // leave the two sets disagreeing about a cell two pieces share.
  held.noStop.without(held.blocked);
  held.costly.without(held.blocked);
  return held;
}
