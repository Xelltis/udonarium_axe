import { effectPickOrder, toggleEffectPick } from '@axe/domain/effect/effect-target-picks';

describe('toggleEffectPick()', () => {
  it('adds each target in the order it was chosen', () => {
    let picks = toggleEffectPick([], 'a', 3);
    picks = toggleEffectPick(picks, 'b', 3);
    picks = toggleEffectPick(picks, 'c', 3);

    expect(picks).toEqual(['a', 'b', 'c']);
  });

  it('takes one off when it is chosen again', () => {
    const picks = toggleEffectPick(['a', 'b', 'c'], 'b', 3);

    // The rest keep their order after one goes.
    expect(picks).toEqual(['a', 'c']);
  });

  it('pushes the oldest out once it is full', () => {
    expect(toggleEffectPick(['a', 'b'], 'c', 2)).toEqual(['b', 'c']);
    // A single-target effect behaves as a change of choice.
    expect(toggleEffectPick(['a'], 'b', 1)).toEqual(['b']);
  });

  it('ignores an empty identifier', () => {
    expect(toggleEffectPick(['a'], '', 3)).toEqual(['a']);
  });
});

describe('effectPickOrder()', () => {
  it('numbers the chosen from one and leaves the unchosen at nothing', () => {
    expect(effectPickOrder(['a', 'b'], 'a')).toBe(1);
    expect(effectPickOrder(['a', 'b'], 'b')).toBe(2);
    expect(effectPickOrder(['a', 'b'], 'c')).toBe(0);
  });
});
