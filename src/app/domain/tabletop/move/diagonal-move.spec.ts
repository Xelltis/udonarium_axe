import {
  allowsDiagonal,
  asDiagonalMove,
  countsDiagonals,
  DEFAULT_DIAGONAL_MOVE,
  diagonalCost,
} from '@axe/domain/tabletop/move/diagonal-move';

describe('how a table counts a corner', () => {
  it('reads back the four answers a table may give, and nothing else', () => {
    expect(asDiagonalMove('alternating')).toBe('alternating');
    expect(asDiagonalMove('double')).toBe('double');
    expect(asDiagonalMove('none')).toBe('none');
    expect(asDiagonalMove('equal')).toBe('equal');
    expect(asDiagonalMove('半分')).toBeNull();
    expect(asDiagonalMove(true)).toBeNull();
    expect(asDiagonalMove(null)).toBeNull();
  });

  it('starts a table where it has always been: a corner costs what a side costs', () => {
    expect(DEFAULT_DIAGONAL_MOVE).toBe('equal');
    expect(diagonalCost('equal', 0)).toBe(1);
    expect(diagonalCost('equal', 7)).toBe(1);
  });

  it('charges a corner double where the table says so, whichever corner it is', () => {
    expect(diagonalCost('double', 0)).toBe(2);
    expect(diagonalCost('double', 1)).toBe(2);
  });

  it('charges one, then two, by turns, which is how 3.5e and Pathfinder count', () => {
    expect([0, 1, 2, 3, 4].map((cut) => diagonalCost('alternating', cut))).toEqual([1, 2, 1, 2, 1]);
  });

  it('prices a corner out of reach where corners are not steps', () => {
    expect(diagonalCost('none', 0)).toBe(Number.POSITIVE_INFINITY);
    expect(allowsDiagonal('none')).toBe(false);
    expect(allowsDiagonal('equal')).toBe(true);
  });

  it('says which answer makes the price of a step depend on the way taken to it', () => {
    expect(countsDiagonals('alternating')).toBe(true);
    expect(countsDiagonals('equal')).toBe(false);
    expect(countsDiagonals('double')).toBe(false);
    expect(countsDiagonals('none')).toBe(false);
  });
});
