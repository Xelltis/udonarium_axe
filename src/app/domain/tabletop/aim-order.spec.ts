import { type AimCandidate, aimOrder, bodyGap, nextAim } from '@axe/domain/tabletop/aim-order';

const at = (
  identifier: string,
  x: number,
  side: AimCandidate['side'] = null,
  { z = 0, tall = 0, whole = identifier }: { z?: number; tall?: number; whole?: string } = {}
): AimCandidate => ({ identifier, feet: { x, y: 0, z }, head: { x, y: 0, z: z + tall }, side, whole });

describe('bodyGap', () => {
  const body = (x: number, z: number, tall: number) => ({ feet: { x, y: 0, z }, head: { x, y: 0, z: z + tall } });

  it('takes bodies standing on one floor as far apart as they stand across it, however tall either is', () => {
    expect(bodyGap(body(0, 0, 50), body(100, 0, 300))).toBeCloseTo(100);
    expect(bodyGap(body(0, 0, 50), body(100, 0, 50))).toBeCloseTo(100);
  });

  it('takes a body over another as far as the gap from its feet down to the other’s head', () => {
    expect(bodyGap(body(0, 200, 50), body(0, 0, 50))).toBeCloseTo(150);
    expect(bodyGap(body(0, 0, 50), body(0, 200, 50))).toBeCloseTo(150);
    expect(bodyGap(body(0, 200, 50), body(30, 0, 50))).toBeCloseTo(Math.hypot(30, 150));
  });

  it('reads a body whose feet and head are one point as that point, as a range’s centre is', () => {
    const point = { feet: { x: 0, y: 0, z: 100 }, head: { x: 0, y: 0, z: 100 } };
    expect(bodyGap(point, body(40, 0, 300))).toBeCloseTo(40);
    expect(bodyGap(point, body(40, 0, 50))).toBeCloseTo(Math.hypot(40, 50));
    expect(bodyGap(point, point)).toBe(0);
  });

  it('measures bodies standing out from a wall along the way they stand', () => {
    const onWall = { feet: { x: 0, y: 0, z: 100 }, head: { x: 0, y: 80, z: 100 } };
    expect(bodyGap(onWall, { feet: { x: 0, y: 200, z: 100 }, head: { x: 0, y: 200, z: 100 } })).toBeCloseTo(120);
  });
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

  it('measures how high each stands, so a piece flying straight overhead is no nearer than one beside', () => {
    expect(aimOrder(hero, [at('overhead', 0, 'right', { z: 200 }), at('beside', 100, 'right')])).toEqual([
      'beside',
      'overhead',
    ]);
  });

  it('takes a tall piece as near as a small one standing as far across, its body reaching down to the floor', () => {
    const standing = at('hero', 0, 'left', { tall: 50 });
    expect(
      aimOrder(standing, [at('giant', 100, 'right', { tall: 300 }), at('imp', -100, 'right', { tall: 20 })])
    ).toEqual(['giant', 'imp']);
  });

  it('passes over the pieces one with the piece it goes from, its body and its other parts, but takes the parts of another', () => {
    const head = at('head', 0, null, { whole: 'dragon' });
    const pieces = [
      at('dragon', 0),
      at('tail', 10, null, { whole: 'dragon' }),
      at('goblin', 50),
      at('arm', 60, null, { whole: 'golem' }),
    ];
    expect(aimOrder(head, pieces)).toEqual(['goblin', 'arm']);
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
