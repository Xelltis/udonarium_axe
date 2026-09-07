import {
  describeSide,
  encodeFactionOrder,
  groupBySide,
  nextSide,
  normalizeFactionOrder,
  parseFactionOrder,
  PartyLike,
  resolveCurrentSide,
  SidedPiece,
  SideGroup,
  sideOfPiece,
  UNASSIGNED_SIDE,
} from '@axe/domain/tabletop/turn-side';

const heroes: PartyLike = { identifier: 'p-heroes', name: '味方', color: '#7dd3fc' };
const monsters: PartyLike = { identifier: 'p-monsters', name: '敵', color: '#fca5a5' };
const bystanders: PartyLike = { identifier: 'p-bystanders', name: '中立', color: '#bef264' };

function piece(identifier: string, partyIdentifier = ''): SidedPiece {
  return { identifier, partyIdentifier };
}

describe('parseFactionOrder()', () => {
  it('reads nothing out of an empty order', () => {
    expect(parseFactionOrder('')).toEqual([]);
  });

  it('reads several, trimming the spaces and dropping repeats', () => {
    expect(parseFactionOrder(' a , b ,,a ')).toEqual(['a', 'b']);
  });

  it('writes the order back the way it reads it', () => {
    expect(encodeFactionOrder(['a', 'b', 'a'])).toBe('a,b');
  });
});

describe('normalizeFactionOrder()', () => {
  it('keeps the order the room wrote down', () => {
    const order = normalizeFactionOrder('p-monsters,p-heroes', [heroes, monsters]);

    expect(order).toEqual(['p-monsters', 'p-heroes', UNASSIGNED_SIDE]);
  });

  it('drops a party that is no longer there', () => {
    const order = normalizeFactionOrder('p-gone,p-heroes', [heroes]);

    expect(order).toEqual(['p-heroes', UNASSIGNED_SIDE]);
  });

  it('puts a party the room never ordered at the end, in the order the parties come', () => {
    const order = normalizeFactionOrder('p-monsters', [heroes, monsters, bystanders]);

    expect(order).toEqual(['p-monsters', 'p-heroes', 'p-bystanders', UNASSIGNED_SIDE]);
  });

  it('leaves the pieces on no party out when the room asks it to', () => {
    const order = normalizeFactionOrder('', [heroes], { skipUnassigned: true });

    expect(order).toEqual(['p-heroes']);
  });

  it('takes the room at its word about where the ones on no party go', () => {
    const order = normalizeFactionOrder(`${UNASSIGNED_SIDE},p-heroes`, [heroes]);

    expect(order).toEqual([UNASSIGNED_SIDE, 'p-heroes']);
  });

  it('orders nothing but the ones on no party for a room with no parties', () => {
    expect(normalizeFactionOrder('', [])).toEqual([UNASSIGNED_SIDE]);
  });
});

describe('sideOfPiece()', () => {
  const order = ['p-heroes', UNASSIGNED_SIDE];

  it('reads the party a piece is on', () => {
    expect(sideOfPiece(piece('a', 'p-heroes'), order)).toBe('p-heroes');
  });

  it('leaves a piece on no party on the side of nobody', () => {
    expect(sideOfPiece(piece('a'), order)).toBe(UNASSIGNED_SIDE);
  });

  it('leaves a piece whose party has gone on the side of nobody', () => {
    expect(sideOfPiece(piece('a', 'p-gone'), order)).toBe(UNASSIGNED_SIDE);
  });
});

describe('groupBySide()', () => {
  it('gathers the pieces under the side each is on, in the order of the sides', () => {
    const order = ['p-monsters', 'p-heroes', UNASSIGNED_SIDE];
    const groups = groupBySide([piece('a', 'p-heroes'), piece('b', 'p-monsters'), piece('c')], order);

    expect(groups.map((group) => group.side)).toEqual(['p-monsters', 'p-heroes', UNASSIGNED_SIDE]);
    expect(groups[0].members.map((held) => held.identifier)).toEqual(['b']);
    expect(groups[2].members.map((held) => held.identifier)).toEqual(['c']);
  });

  it('leaves out a side nobody is on', () => {
    const groups = groupBySide([piece('a', 'p-heroes')], ['p-heroes', 'p-monsters', UNASSIGNED_SIDE]);

    expect(groups.map((group) => group.side)).toEqual(['p-heroes']);
  });

  it('keeps the order the pieces came in within a side', () => {
    const groups = groupBySide([piece('a', 'p-heroes'), piece('b', 'p-heroes')], ['p-heroes']);

    expect(groups[0].members.map((held) => held.identifier)).toEqual(['a', 'b']);
  });
});

describe('resolveCurrentSide()', () => {
  const groups: SideGroup<SidedPiece>[] = [
    { side: 'p-monsters', members: [piece('b', 'p-monsters')] },
    { side: 'p-heroes', members: [piece('a', 'p-heroes')] },
  ];
  const acted = new Set<string>();
  const hasUnacted = (group: SideGroup<SidedPiece>) => group.members.some((held) => !acted.has(held.identifier));

  it('holds the round on the side it is on', () => {
    expect(resolveCurrentSide('p-heroes', groups, hasUnacted)).toBe('p-heroes');
  });

  it('moves the round off a side that is no longer there', () => {
    expect(resolveCurrentSide('p-gone', groups, hasUnacted)).toBe('p-monsters');
  });

  it('moves it to a side with somebody left rather than one that is done', () => {
    acted.add('b');

    expect(resolveCurrentSide('p-gone', groups, hasUnacted)).toBe('p-heroes');

    acted.delete('b');
  });

  it('has nowhere to stand with no sides at all', () => {
    expect(resolveCurrentSide('p-heroes', [], hasUnacted)).toBe('');
  });
});

describe('nextSide()', () => {
  const groups: SideGroup<SidedPiece>[] = [
    { side: 'a', members: [piece('1', 'a')] },
    { side: 'b', members: [piece('2', 'b')] },
    { side: 'c', members: [piece('3', 'c')] },
  ];
  const none = () => true;

  it('hands the round on to the side after this one', () => {
    expect(nextSide('a', groups, none)).toBe('b');
  });

  it('ends the round after the last side', () => {
    expect(nextSide('c', groups, none)).toBe('');
  });

  it('starts at the first side when the round is on none', () => {
    expect(nextSide('', groups, none)).toBe('a');
  });

  it('passes over a side that has all acted', () => {
    const done = (group: SideGroup<SidedPiece>) => group.side !== 'b';

    expect(nextSide('a', groups, done)).toBe('c');
  });

  it('ends the round where nobody after this side has anything left', () => {
    expect(nextSide('a', groups, () => false)).toBe('');
  });
});

describe('describeSide()', () => {
  it('names a side after the party it is', () => {
    expect(describeSide('p-heroes', [heroes], 'なし')).toEqual({ name: '味方', color: '#7dd3fc' });
  });

  it('gives the ones on no party the name it is handed', () => {
    expect(describeSide(UNASSIGNED_SIDE, [heroes], 'その他')).toEqual({ name: 'その他', color: '' });
  });
});
