import { sideOfPiece } from '@axe/domain/tabletop/zone/zone-sides';

describe('sideOfPiece', () => {
  it('tells the sides by whether a piece is a non-player one', () => {
    const side = sideOfPiece('npc', []);

    expect(side({ isNpc: true, partyIdentifier: 'p1' })).toBe('npc');
    expect(side({ isNpc: false, partyIdentifier: '' })).toBe('pc');
  });

  it('tells the sides by party, parties standing together as one, and puts a piece in no party on none', () => {
    const side = sideOfPiece('party', [
      { identifier: 'red', alliedWith: ['gold'] },
      { identifier: 'gold', alliedWith: [] },
      { identifier: 'blue', alliedWith: [] },
    ]);

    expect(side({ isNpc: false, partyIdentifier: 'red' })).toBe(side({ isNpc: true, partyIdentifier: 'gold' }));
    expect(side({ isNpc: false, partyIdentifier: 'red' })).not.toBe(side({ isNpc: false, partyIdentifier: 'blue' }));
    expect(side({ isNpc: false, partyIdentifier: '' })).toBeNull();
  });
});
