import { BuffSnapshotEntry } from '@axe/domain/character/buff-manager';
import {
  changedBuffs,
  parseTurnHistory,
  stringifyTurnHistory,
  TURN_HISTORY_LIMIT,
  TurnStep,
} from '@axe/domain/tabletop/turn-history';

function step(round: number, currentSide = ''): TurnStep {
  return { round, phase: 'acting', currentIdentifier: 'a', currentSide, acted: [], buffs: [] };
}

describe('parseTurnHistory()', () => {
  it('reads nothing out of an empty record', () => {
    expect(parseTurnHistory('')).toEqual([]);
    expect(parseTurnHistory('[]')).toEqual([]);
  });

  it('reads nothing out of a record it cannot make sense of', () => {
    expect(parseTurnHistory('not json')).toEqual([]);
    expect(parseTurnHistory('{}')).toEqual([]);
  });

  it('writes a step back the way it reads it', () => {
    expect(parseTurnHistory(stringifyTurnHistory([step(2, 'p-heroes')]))).toEqual([step(2, 'p-heroes')]);
  });

  it('reads a step written where the round had no sides as being on none', () => {
    const written = '[{"round":1,"phase":"acting","currentIdentifier":"a","acted":[],"buffs":[]}]';

    expect(parseTurnHistory(written)[0].currentSide).toBe('');
  });
});

describe('stringifyTurnHistory()', () => {
  it('keeps only as many steps back as the round can be taken', () => {
    const steps = Array.from({ length: TURN_HISTORY_LIMIT + 5 }, (_, index) => step(index));

    const kept = parseTurnHistory(stringifyTurnHistory(steps));

    expect(kept).toHaveLength(TURN_HISTORY_LIMIT);
    expect(kept[0].round).toBe(5);
  });

  it('keeps enough for a round taken side by side to be put back', () => {
    expect(TURN_HISTORY_LIMIT).toBeGreaterThanOrEqual(60);
  });
});

describe('changedBuffs()', () => {
  function buff(name: string, value: number): BuffSnapshotEntry {
    return { name, value, info: '', appearance: { icon: '', color: '' }, modifier: null };
  }

  it('keeps only the pieces whose buffs moved', () => {
    const before = new Map([
      ['a', [buff('haste', 2)]],
      ['b', [buff('slow', 1)]],
    ]);
    const after = new Map([
      ['a', [buff('haste', 1)]],
      ['b', [buff('slow', 1)]],
    ]);

    const changed = changedBuffs(before, after);

    expect(changed.map((entry) => entry.identifier)).toEqual(['a']);
    expect(changed[0].buffs).toEqual([buff('haste', 2)]);
  });
});
