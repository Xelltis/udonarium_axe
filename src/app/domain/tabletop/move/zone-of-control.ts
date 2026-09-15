import { GameCharacter } from '@axe/domain/character/game-character';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, CellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import { forEachMoveNeighbour } from '@axe/domain/tabletop/move/move-neighbours';
import { occupiedCells } from '@axe/domain/tabletop/move/occupied-cells';

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
 * Whether one piece is the other's enemy, which is the whole of who holds ground against whom.
 *
 * A monster to a hero and a hero to a monster: the two sides of the table are told apart by
 * which of them the game master runs. Nothing finer is asked for, because a party is a loose
 * thing here - most pieces belong to none - and a wrong guess at it would bend the range of
 * every piece on the board.
 */
export function isHostileTo(piece: GameCharacter, mover: GameCharacter): boolean {
  return piece.identifier !== mover.identifier && piece.isNpc !== mover.isNpc;
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
