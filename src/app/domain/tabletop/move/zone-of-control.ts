import { GameCharacter } from '@axe/domain/character/game-character';
import { NO_ALLIANCE, PartyAlliance } from '@axe/domain/party/party-alliance';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, CellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import { forEachMoveNeighbour } from '@axe/domain/tabletop/move/move-neighbours';
import { occupiedCells } from '@axe/domain/tabletop/move/occupied-cells';
import { relationBetween } from '@axe/domain/tabletop/move/piece-relation';

/** What the ground around an enemy does to a piece walking into it. */
export const ZOC_MODES = ['none', 'stop', 'block', 'cost'] as const;

export type ZocMode = (typeof ZOC_MODES)[number];

export const DEFAULT_ZOC_MODE: ZocMode = 'none';
export const DEFAULT_ZOC_RANGE = 1;
export const DEFAULT_ZOC_EXTRA_COST = 1;

/** The value as a zone-of-control mode, reading anything unknown, such as an empty setting, as none. */
export function asZocMode(value: unknown): ZocMode {
  return typeof value === 'string' && (ZOC_MODES as readonly string[]).includes(value)
    ? (value as ZocMode)
    : DEFAULT_ZOC_MODE;
}

/**
 * How a table tells its two sides apart.
 *
 * By whom the master runs, which needs nothing of anybody and is right for most tables; or by
 * the parties the pieces have been sorted into, which a table playing three sides against one
 * another needs and which says nothing at all about a piece nobody has placed.
 */
export const HOSTILITY_BY = ['npc', 'party'] as const;

export type HostilityBy = (typeof HOSTILITY_BY)[number];

export const DEFAULT_HOSTILITY_BY: HostilityBy = 'npc';

/** Reads a stored way of telling the sides apart, falling back to whom the master runs. */
export function asHostilityBy(value: unknown): HostilityBy {
  return typeof value === 'string' && (HOSTILITY_BY as readonly string[]).includes(value)
    ? (value as HostilityBy)
    : DEFAULT_HOSTILITY_BY;
}

/**
 * Whether one piece is the other's enemy, which is the whole of who holds ground against whom.
 *
 * A monster to a hero and a hero to a monster: by default the two sides of the table are told
 * apart by which of them the game master runs. Nothing finer is asked for unless a table asks,
 * because a party is a loose thing here - most pieces belong to none - and a wrong guess at it
 * would bend the range of every piece on the board.
 *
 * A table that has sorted its pieces into parties may say so instead, and then only a piece of
 * another party is an enemy: a piece in no party holds no ground and has none held against it,
 * which is the honest answer where nobody has said whose side it is on.
 */
export function isHostileTo(
  piece: GameCharacter,
  mover: GameCharacter,
  by: HostilityBy = DEFAULT_HOSTILITY_BY,
  allied: PartyAlliance = NO_ALLIANCE
): boolean {
  if (piece.identifier === mover.identifier) return false;
  if (by === 'party') {
    // Held both ways or neither. A piece in no party holds no ground, and a table that held
    // ground against it all the same would answer a stray monster with every party's reach
    // while it held none of its own.
    if (mover.partyIdentifier.length < 1) return false;
    return relationBetween(piece, mover, allied) === 'other';
  }
  return piece.isNpc !== mover.isNpc;
}

/**
 * The ground an enemy holds against a piece walking past.
 *
 * Counted outwards from where the enemies stand, by the same steps a piece walks in, so a
 * table that forbids cutting corners holds a diamond rather than a square. The cells the
 * enemies stand on are left out: whether a piece may stop on one of those is the table's
 * own question about sharing a cell, asked and answered elsewhere.
 */
export function zoneOfControl(
  grid: CellGrid,
  foes: readonly GameCharacter[],
  range: number,
  cutsCorners = true
): CellBits {
  const total = cellCount(grid);
  const zone = new CellBits(total);
  if (range < 1 || foes.length < 1) return zone;

  const standing = occupiedCells(grid, foes, '');
  const seen = standing.copy();
  let frontier: number[] = [];
  for (let index = 0; index < total; index++) {
    if (standing.get(index)) frontier.push(index);
  }

  for (let step = 0; step < range && frontier.length > 0; step++) {
    const next: number[] = [];
    for (const cell of frontier) {
      forEachMoveNeighbour(
        grid,
        cell,
        (neighbour) => {
          if (seen.get(neighbour)) return;
          seen.set(neighbour);
          zone.set(neighbour);
          next.push(neighbour);
        },
        cutsCorners
      );
    }
    frontier = next;
  }
  return zone;
}
