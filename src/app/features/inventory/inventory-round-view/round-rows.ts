/** How many pieces a round may take before those that are done and those far off are gathered up. */
export const ROUND_SHOWN_WHOLE = 8;

/** How many of the pieces still to come stand out on their own after the one whose turn it is. */
export const ROUND_NEXT_SHOWN = 4;

/** What a run of gathered pieces is: those done this round, those far off, or a side not up. */
export type RoundGathering = 'acted' | 'later' | 'side';

/** One row of the round as its view lays it. */
export type RoundRow<T> =
  | { readonly kind: 'piece'; readonly piece: T; readonly current: boolean }
  | {
      readonly kind: 'gathered';
      readonly key: string;
      readonly what: RoundGathering;
      readonly pieces: readonly T[];
    }
  | { readonly kind: 'fold'; readonly key: string; readonly what: RoundGathering };

/** Where the round stands, as far as how its pieces are laid goes. */
export interface RoundStanding {
  readonly currentIdentifier: string;
  readonly acted: ReadonlySet<string>;
  readonly held: ReadonlySet<string>;
}

/** A side of the round with the rows its pieces are laid in. */
export interface RoundSideRows<T> {
  readonly side: string;
  readonly current: boolean;
  readonly rows: readonly RoundRow<T>[];
}

/**
 * The rows a round's pieces are laid in. A round of a few pieces lays them all as they come. One of
 * more gathers those done this round into one row and those far off into another, so the view
 * stands no taller however many there are: what it lays out on their own are those waiting to step
 * in, the one whose turn it is and the next few to come. A gathered row opened is laid out in full,
 * after a row that gathers it up again.
 */
export function roundRows<T extends { readonly identifier: string }>(
  pieces: readonly T[],
  standing: RoundStanding,
  opened: ReadonlySet<string>,
  gathers: boolean,
  key = 'round'
): RoundRow<T>[] {
  const current = standing.currentIdentifier;
  const plain = (piece: T): RoundRow<T> => ({ kind: 'piece', piece, current: piece.identifier === current });
  if (!gathers) return pieces.map(plain);

  const held = pieces.filter((piece) => piece.identifier !== current && standing.held.has(piece.identifier));
  const acted = pieces.filter(
    (piece) =>
      piece.identifier !== current && !standing.held.has(piece.identifier) && standing.acted.has(piece.identifier)
  );
  const ahead = pieces.filter(
    (piece) =>
      piece.identifier !== current && !standing.held.has(piece.identifier) && !standing.acted.has(piece.identifier)
  );
  const up = pieces.filter((piece) => piece.identifier === current);
  return [
    ...gathered(acted, `${key}:acted`, 'acted', opened, plain),
    ...held.map(plain),
    ...up.map(plain),
    ...ahead.slice(0, ROUND_NEXT_SHOWN).map(plain),
    ...gathered(ahead.slice(ROUND_NEXT_SHOWN), `${key}:later`, 'later', opened, plain),
  ];
}

/**
 * The rows of a round taken side by side. The side that is up is laid as a round of its own is;
 * every other side, where the round gathers, is one row of its pieces until it is opened.
 */
export function roundSideRows<T extends { readonly identifier: string }>(
  sides: readonly { readonly side: string; readonly members: readonly T[] }[],
  currentSide: string,
  standing: RoundStanding,
  opened: ReadonlySet<string>,
  gathers: boolean
): RoundSideRows<T>[] {
  return sides.map((group) => {
    const current = group.side === currentSide;
    const key = `side:${group.side}`;
    const plain = (piece: T): RoundRow<T> => ({
      kind: 'piece',
      piece,
      current: piece.identifier === standing.currentIdentifier,
    });
    const rows =
      current || !gathers
        ? roundRows(group.members, standing, opened, gathers, key)
        : gathered(group.members, key, 'side', opened, plain);
    return { side: group.side, current, rows };
  });
}

function gathered<T>(
  pieces: readonly T[],
  key: string,
  what: RoundGathering,
  opened: ReadonlySet<string>,
  plain: (piece: T) => RoundRow<T>
): RoundRow<T>[] {
  if (pieces.length < 2) return pieces.map(plain);
  if (opened.has(key)) return [{ kind: 'fold', key, what }, ...pieces.map(plain)];
  return [{ kind: 'gathered', key, what, pieces }];
}
