import {
  ROUND_NEXT_SHOWN,
  type RoundRow,
  roundRows,
  roundSideRows,
  type RoundStanding,
} from '@axe/features/inventory/inventory-round-view/round-rows';
import { describe, expect, it } from 'vitest';

interface Piece {
  readonly identifier: string;
}

const pieces = (count: number, prefix = 'p'): Piece[] =>
  Array.from({ length: count }, (_, index) => ({ identifier: `${prefix}${index}` }));

function standing(current: string, acted: string[] = [], held: string[] = []): RoundStanding {
  return { currentIdentifier: current, acted: new Set(acted), held: new Set(held) };
}

/** The rows written short: a piece by its name, starred where its turn it is, and a gathered row by what it gathers and how many. */
function short(rows: readonly RoundRow<Piece>[]): string[] {
  return rows.map((row) =>
    row.kind === 'piece'
      ? `${row.piece.identifier}${row.current ? '*' : ''}`
      : row.kind === 'gathered'
        ? `[${row.what} ${row.pieces.length}]`
        : `^${row.what}`
  );
}

describe('roundRows', () => {
  it('lays every piece of a round that does not gather, as they come', () => {
    expect(short(roundRows(pieces(5), standing('p2', ['p0', 'p1']), new Set(), false))).toEqual([
      'p0',
      'p1',
      'p2*',
      'p3',
      'p4',
    ]);
  });

  it('gathers those done and those far off, laying the one up and the next few on their own', () => {
    const rows = roundRows(
      pieces(20),
      standing('p8', ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']),
      new Set(),
      true
    );

    expect(short(rows)).toEqual(['[acted 8]', 'p8*', 'p9', 'p10', 'p11', 'p12', '[later 7]']);
    expect(ROUND_NEXT_SHOWN).toBe(4);
  });

  it('stands no taller however many pieces the round takes', () => {
    const acted = pieces(30).map((piece) => piece.identifier);
    const tall = (count: number) =>
      roundRows(pieces(count), standing('p30', acted.slice(0, 30)), new Set(), true).length;

    expect(tall(40)).toBe(tall(200));
  });

  it('lays out on their own those waiting to step in, wherever they wait', () => {
    const rows = roundRows(pieces(12), standing('p5', ['p0', 'p1', 'p2', 'p4'], ['p3']), new Set(), true);

    expect(short(rows)).toEqual(['[acted 4]', 'p3', 'p5*', 'p6', 'p7', 'p8', 'p9', '[later 2]']);
  });

  it('gathers no single piece, and lays the first few before the round has begun', () => {
    expect(short(roundRows(pieces(10), standing('p1', ['p0']), new Set(), true))).toEqual([
      'p0',
      'p1*',
      'p2',
      'p3',
      'p4',
      'p5',
      '[later 4]',
    ]);
    expect(short(roundRows(pieces(10), standing(''), new Set(), true))).toEqual(['p0', 'p1', 'p2', 'p3', '[later 6]']);
  });

  it('lays a gathered row opened in full, after a row that gathers it up again', () => {
    const rows = roundRows(pieces(12), standing('p3', ['p0', 'p1', 'p2']), new Set(['round:acted']), true);

    expect(short(rows)).toEqual(['^acted', 'p0', 'p1', 'p2', 'p3*', 'p4', 'p5', 'p6', 'p7', '[later 4]']);
  });
});

describe('roundSideRows', () => {
  const sides = [
    { side: 'friends', members: pieces(5, 'f') },
    { side: 'foes', members: pieces(12, 'e') },
    { side: 'others', members: pieces(1, 'o') },
  ];

  it('lays the side that is up as a round of its own, and gathers every other side into one row', () => {
    const rows = roundSideRows(
      sides,
      'foes',
      standing('e2', ['f0', 'f1', 'f2', 'f3', 'f4', 'e0', 'e1']),
      new Set(),
      true
    );

    expect(rows.map((group) => [group.side, group.current, short(group.rows)])).toEqual([
      ['friends', false, ['[side 5]']],
      ['foes', true, ['[acted 2]', 'e2*', 'e3', 'e4', 'e5', 'e6', '[later 5]']],
      ['others', false, ['o0']],
    ]);
  });

  it('lays every side in full where the round does not gather, and a side opened in full', () => {
    const whole = roundSideRows(sides, 'foes', standing('e0'), new Set(), false);
    expect(whole.map((group) => group.rows.length)).toEqual([5, 12, 1]);

    const opened = roundSideRows(sides, 'foes', standing('e0'), new Set(['side:friends']), true);
    expect(short(opened[0].rows)).toEqual(['^side', 'f0', 'f1', 'f2', 'f3', 'f4']);
  });
});
