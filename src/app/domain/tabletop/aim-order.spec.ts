import { type AimCandidate, aimOrder, nextAim } from '@axe/domain/tabletop/aim-order';

const at = (identifier: string, x: number, side: AimCandidate['side'] = null): AimCandidate => ({
  identifier,
  x,
  y: 0,
  side,
});

describe('aimOrder', () => {
  const hero = at('hero', 0, 'left');
  const pieces = [hero, at('ally', 50, 'left'), at('far', 300, 'right'), at('near', 100, 'right'), at('bystander', 20)];

  it('orders the pieces of the other side of the fight from a piece, nearest first', () => {
    expect(aimOrder(hero, pieces)).toEqual(['near', 'far']);
  });

  it('orders every piece but itself from a piece on no side, nearest first', () => {
    expect(aimOrder(at('bystander', 20), pieces)).toEqual(['hero', 'ally', 'near', 'far']);
  });

  it('keeps the order of the room for pieces as near, and with no piece to go from', () => {
    expect(aimOrder(at('me', 0), [at('b', 100), at('a', -100)])).toEqual(['b', 'a']);
    expect(aimOrder(null, pieces)).toEqual(['hero', 'ally', 'far', 'near', 'bystander']);
  });
});

describe('nextAim', () => {
  const order = ['near', 'mid', 'far'];

  it('aims at the first, or the last going back, where none of the order is aimed at', () => {
    expect(nextAim(order, new Set(), 1)).toBe('near');
    expect(nextAim(order, new Set(['elsewhere']), -1)).toBe('far');
  });

  it('steps on or back from the one aimed at, round from end to start', () => {
    expect(nextAim(order, new Set(['near']), 1)).toBe('mid');
    expect(nextAim(order, new Set(['far']), 1)).toBe('near');
    expect(nextAim(order, new Set(['near']), -1)).toBe('far');
  });

  it('aims at nothing in an order of none', () => {
    expect(nextAim([], new Set(), 1)).toBeNull();
  });
});
