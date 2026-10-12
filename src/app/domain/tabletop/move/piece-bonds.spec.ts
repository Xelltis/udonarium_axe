import { BondedPiece, bondGroupOf, boundBelow, boundTo } from '@axe/domain/tabletop/move/piece-bonds';

describe('bonds between pieces', () => {
  const pieces: BondedPiece[] = [
    { id: 'horse' },
    { id: 'rider', ridingOn: 'horse' },
    { id: 'friend', ridingOn: 'horse' },
    { id: 'snake' },
    { id: 'victim', grabbedBy: 'snake' },
    { id: 'alone' },
    { id: 'lost', ridingOn: 'gone' },
  ];
  const counted = new Set(pieces.map((piece) => piece.id));

  it('binds a piece to the one holding on to it before the one it rides, and to nothing missing or itself', () => {
    expect(boundTo({ id: 'a', grabbedBy: 'snake', ridingOn: 'horse' }, counted)).toBe('snake');
    expect(boundTo({ id: 'rider', ridingOn: 'horse' }, counted)).toBe('horse');
    expect(boundTo({ id: 'lost', ridingOn: 'gone' }, counted)).toBe('');
    expect(boundTo({ id: 'horse', ridingOn: 'horse' }, counted)).toBe('');
    expect(boundTo({ id: 'alone' }, counted)).toBe('');
  });

  it('gathers every piece bound together along each bond, whichever of them it starts from', () => {
    expect(bondGroupOf('friend', pieces)).toEqual(['horse', 'rider', 'friend']);
    expect(bondGroupOf('horse', pieces)).toEqual(['horse', 'rider', 'friend']);
    expect(bondGroupOf('victim', pieces)).toEqual(['snake', 'victim']);
    expect(bondGroupOf('alone', pieces)).toEqual(['alone']);
    expect(bondGroupOf('lost', pieces)).toEqual(['lost']);
    expect(bondGroupOf('nobody', pieces)).toEqual([]);
  });

  it('follows bonds from one kind into the other, as a piece held on to by a rider', () => {
    const chained: BondedPiece[] = [...pieces, { id: 'mouse', grabbedBy: 'rider' }];

    expect(bondGroupOf('mouse', chained)).toEqual(['horse', 'rider', 'friend', 'mouse']);
  });

  it('ends a ring of bonds rather than going round it for ever', () => {
    const ring: BondedPiece[] = [
      { id: 'a', grabbedBy: 'b' },
      { id: 'b', grabbedBy: 'a' },
    ];

    expect(bondGroupOf('a', ring)).toEqual(['a', 'b']);
  });

  it('finds what goes where a piece goes, and not the piece it is itself bound to', () => {
    const chained: BondedPiece[] = [...pieces, { id: 'mouse', grabbedBy: 'rider' }];

    expect(boundBelow('horse', chained)).toEqual(['rider', 'friend', 'mouse']);
    expect(boundBelow('rider', chained)).toEqual(['mouse']);
    expect(boundBelow('alone', chained)).toEqual([]);
  });
});
