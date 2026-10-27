import {
  buildTurnRoster,
  mayHoldTurn,
  mayInterruptTurn,
  TurnPiece,
  TurnStanding,
} from '@axe/domain/tabletop/turn-roster';
import { UNASSIGNED_SIDE } from '@axe/domain/tabletop/turn-side';
import { NO_HOLDING } from '@axe/domain/tabletop/turn-state';

function piece(identifier: string, more: Partial<TurnPiece> = {}): TurnPiece {
  return {
    identifier,
    partyIdentifier: '',
    ridingOn: '',
    rideSeat: '',
    mountable: '',
    noTurn: false,
    hideInventory: false,
    ...more,
  };
}

const ids = (pieces: readonly TurnPiece[]) => pieces.map((one) => one.identifier);

describe('the turn roster', () => {
  it('goes round the pieces in the order given, leaving out those who take no turn or are kept out of view', () => {
    const roster = buildTurnRoster([piece('a'), piece('b', { noTurn: true }), piece('c', { hideInventory: true })], {
      mode: 'initiative',
      sideOrder: [],
    });

    expect(ids(roster.order)).toEqual(['a']);
    expect(roster.sides).toEqual([]);
  });

  it('lists the pieces kept out of view where it is asked to', () => {
    const roster = buildTurnRoster([piece('a'), piece('c', { hideInventory: true })], {
      mode: 'initiative',
      sideOrder: [],
      includeHidden: true,
    });

    expect(ids(roster.order)).toEqual(['a', 'c']);
  });

  it('has a mount and whoever sits behind take their turn in the turn of the one riding in front', () => {
    const roster = buildTurnRoster(
      [
        piece('horse', { mountable: '1' }),
        piece('knight', { ridingOn: 'horse', rideSeat: 'rider' }),
        piece('squire', { ridingOn: 'horse', rideSeat: 'passenger' }),
        piece('crate', { ridingOn: 'horse', rideSeat: 'cargo' }),
      ],
      { mode: 'initiative', sideOrder: [] }
    );

    expect(ids(roster.order)).toEqual(['knight', 'crate']);
    expect(ids(roster.companions.get('knight') ?? [])).toEqual(['horse', 'squire']);
  });

  it('leaves a mount its own turn where the one in front takes none', () => {
    const roster = buildTurnRoster(
      [piece('horse', { mountable: '1' }), piece('knight', { ridingOn: 'horse', rideSeat: 'rider', noTurn: true })],
      { mode: 'initiative', sideOrder: [] }
    );

    expect(ids(roster.order)).toEqual(['horse']);
    expect(roster.companions.size).toBe(0);
  });

  it('gathers the pieces under their sides in the order the sides are taken, side by side', () => {
    const roster = buildTurnRoster(
      [piece('a', { partyIdentifier: 'red' }), piece('b'), piece('c', { partyIdentifier: 'blue' })],
      { mode: 'faction', sideOrder: ['blue', 'red', UNASSIGNED_SIDE] }
    );

    expect(roster.sides.map((group) => group.side)).toEqual(['blue', 'red', UNASSIGNED_SIDE]);
    expect(ids(roster.order)).toEqual(['c', 'a', 'b']);
  });
});

describe('waiting to step in', () => {
  const order = ['a', 'b'];
  const acting = (more: Partial<TurnStanding> = {}): TurnStanding => ({
    phase: 'acting',
    acted: [],
    holding: NO_HOLDING,
    ...more,
  });

  it('is open to a piece the round reaches while one is under way', () => {
    expect(mayHoldTurn(acting(), order, 'a')).toBe(true);
    expect(mayHoldTurn(acting({ phase: 'roundStart' }), order, 'a')).toBe(true);
    expect(mayHoldTurn(acting({ phase: 'idle' }), order, 'a')).toBe(false);
    expect(mayHoldTurn(acting({ phase: 'roundEnd' }), order, 'a')).toBe(false);
    expect(mayHoldTurn(acting(), order, 'z')).toBe(false);
  });

  it('is closed to a piece that has had its turn, waits already, or had its turn stepped into', () => {
    expect(mayHoldTurn(acting({ acted: ['a'] }), order, 'a')).toBe(false);
    expect(mayHoldTurn(acting({ holding: { ...NO_HOLDING, held: ['a'] } }), order, 'a')).toBe(false);
    expect(mayHoldTurn(acting({ holding: { ...NO_HOLDING, interrupted: ['a'] } }), order, 'a')).toBe(false);
  });

  it('lets a waiting piece step in while it has not had its turn and the round reaches it', () => {
    const waiting = acting({ holding: { ...NO_HOLDING, held: ['a', 'z'] } });

    expect(mayInterruptTurn(waiting, order, 'a')).toBe(true);
    expect(mayInterruptTurn(waiting, order, 'b')).toBe(false);
    expect(mayInterruptTurn(waiting, order, 'z')).toBe(false);
    expect(mayInterruptTurn({ ...waiting, acted: ['a'] }, order, 'a')).toBe(false);
    expect(mayInterruptTurn({ ...waiting, phase: 'roundEnd' }, order, 'a')).toBe(false);
  });
});
