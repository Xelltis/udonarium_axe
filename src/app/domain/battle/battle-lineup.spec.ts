import {
  asBattleSide,
  attackerSideFor,
  BATTLE_SIDE_OUT,
  battleSideOf,
  lineupBout,
  LineupMember,
} from '@axe/domain/battle/battle-lineup';

describe('asBattleSide()', () => {
  it('reads the two sides and nothing else', () => {
    expect(asBattleSide('left')).toBe('left');
    expect(asBattleSide('right')).toBe('right');
    expect(asBattleSide('')).toBeNull();
    expect(asBattleSide('LEFT')).toBeNull();
    expect(asBattleSide(undefined)).toBeNull();
  });
});

describe('lineupBout()', () => {
  const lineup: LineupMember[] = [
    { identifier: 'hero', side: 'left' },
    { identifier: 'mage', side: 'left' },
    { identifier: 'goblin', side: 'right' },
    { identifier: 'orc', side: 'right' },
  ];

  it('has the first on the left strike everybody on the right when nobody is asked for', () => {
    expect(lineupBout(lineup, [], 4)).toEqual({
      attacker: 'hero',
      defenders: ['goblin', 'orc'],
      attackerSide: 'left',
    });
  });

  it('has the first one asked for who stands in the lineup strike', () => {
    expect(lineupBout(lineup, ['outsider', 'orc', 'mage'], 4)).toEqual({
      attacker: 'orc',
      defenders: ['hero', 'mage'],
      attackerSide: 'right',
    });
    expect(lineupBout(lineup, [null, undefined, 'mage'], 4)?.attacker).toBe('mage');
  });

  it('stands no more struck than the stage holds', () => {
    expect(lineupBout(lineup, [], 1)?.defenders).toEqual(['goblin']);
  });

  it('plays nothing where one side is empty', () => {
    const rightOnly: LineupMember[] = [{ identifier: 'goblin', side: 'right' }];
    expect(lineupBout(rightOnly, [], 4)).toBeNull();
    expect(lineupBout(rightOnly, ['goblin'], 4)).toBeNull();
  });

  it('plays nothing without a lineup', () => {
    expect(lineupBout([], ['hero'], 4)).toBeNull();
  });
});

describe('attackerSideFor()', () => {
  it('stands the one striking on the side it was put on', () => {
    expect(attackerSideFor('right', ['right'])).toBe('right');
  });

  it('stands it across from the first struck that was put anywhere', () => {
    expect(attackerSideFor(null, [null, 'left'])).toBe('right');
    expect(attackerSideFor(null, ['right'])).toBe('left');
  });

  it('stands it on the left where nobody was put anywhere', () => {
    expect(attackerSideFor(null, [null])).toBe('left');
    expect(attackerSideFor(null, [])).toBe('left');
  });
});

describe('battleSideOf()', () => {
  const parties = (identifier: string) => (identifier === 'heroes' ? 'right' : null);

  it('stands a piece where it was put, whatever its party does', () => {
    expect(battleSideOf({ battleSide: 'left', partyIdentifier: 'heroes' }, parties)).toBe('left');
  });

  it('stands a piece put on no side where its party stands', () => {
    expect(battleSideOf({ battleSide: '', partyIdentifier: 'heroes' }, parties)).toBe('right');
    expect(battleSideOf({ battleSide: '', partyIdentifier: 'villains' }, parties)).toBeNull();
    expect(battleSideOf({ battleSide: '', partyIdentifier: '' }, parties)).toBeNull();
  });

  it('keeps a piece taken out of the lineup out, though its party stands on a side', () => {
    expect(battleSideOf({ battleSide: BATTLE_SIDE_OUT, partyIdentifier: 'heroes' }, parties)).toBeNull();
  });
});
