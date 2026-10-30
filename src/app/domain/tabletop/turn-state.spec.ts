import { ObjectStore } from '@axe/core/sync/object-store';
import {
  NO_HOLDING,
  readTurnHolding,
  readTurnStart,
  turnStartMark,
  TurnState,
  writeTurnHolding,
} from '@axe/domain/tabletop/turn-state';

describe('the mark of a turn beginning', () => {
  it('reads back whose turn began and when', () => {
    expect(readTurnStart(turnStartMark('character-1', 1_700_000_000_000))).toEqual({
      identifier: 'character-1',
      at: 1_700_000_000_000,
    });
  });

  it('keeps an identifier that holds the separator itself', () => {
    expect(readTurnStart(turnStartMark('odd@name', 5))).toEqual({ identifier: 'odd@name', at: 5 });
  });

  it('reads nothing from an empty or unreadable mark, as a room from before the mark holds', () => {
    expect(readTurnStart('')).toBeNull();
    expect(readTurnStart('character-1')).toBeNull();
    expect(readTurnStart('character-1@soon')).toBeNull();
    expect(readTurnStart('@5')).toBeNull();
  });
});

describe('what the round holds back', () => {
  it('reads back who was waiting and whose turn was stepped into', () => {
    const holding = { held: ['a', 'b'], begun: ['a'], interrupted: ['c'], givenBack: [] };

    expect(readTurnHolding(writeTurnHolding(holding))).toEqual(holding);
  });

  it('reads back whose countdown was given back as they began to wait, and writes none where there is none', () => {
    const holding = { held: ['a'], begun: ['a'], interrupted: [], givenBack: ['a'] };

    expect(readTurnHolding(writeTurnHolding(holding))).toEqual(holding);
    expect(writeTurnHolding({ ...holding, givenBack: [] })).toBe('{"held":["a"],"begun":["a"],"interrupted":[]}');
    expect(readTurnHolding('{"held":["a"],"begun":["a"],"interrupted":[]}').givenBack).toEqual([]);
  });

  it('writes nothing while it holds nobody back, so a room that never waited saves as it did', () => {
    expect(writeTurnHolding(NO_HOLDING)).toBe('');
  });

  it('holds nobody back on nothing, or on text it cannot read, as from a version that knew nothing of waiting', () => {
    expect(readTurnHolding(undefined)).toEqual(NO_HOLDING);
    expect(readTurnHolding('')).toEqual(NO_HOLDING);
    expect(readTurnHolding('{"held":')).toEqual(NO_HOLDING);
    expect(readTurnHolding('"held"')).toEqual(NO_HOLDING);
  });

  it('keeps only the names in a list, and reads anything else as an empty one', () => {
    expect(readTurnHolding('{"held":["a",1,"",null],"begun":"a"}')).toEqual({
      held: ['a'],
      begun: [],
      interrupted: [],
      givenBack: [],
    });
  });
});

describe('the turn state the room holds', () => {
  it('makes one anew once the one held has left the store, rather than putting that one back', () => {
    const held = TurnState.instance;
    held.round = 3;

    ObjectStore.instance.delete(held, false);

    expect(TurnState.instance).not.toBe(held);
    expect(TurnState.instance.round).toBe(0);
  });
});
