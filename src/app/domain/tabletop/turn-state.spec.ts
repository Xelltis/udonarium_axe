import { readTurnStart, turnStartMark } from '@axe/domain/tabletop/turn-state';

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
