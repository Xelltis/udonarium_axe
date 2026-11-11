import { SAID_HIDDEN_NAME, saidNameOf, shownNameOf } from '@axe/domain/character/hidden-name';
import { describe, expect, it } from 'vitest';

describe('hidden names', () => {
  const hidden = { name: '黒幕', hideName: true };
  const plain = { name: '勇者', hideName: false };

  it('shows a hidden name only to one who may see what is kept back', () => {
    expect(shownNameOf(hidden, false, '？？？')).toBe('？？？');
    expect(shownNameOf(hidden, true, '？？？')).toBe('黒幕');
    expect(shownNameOf(plain, false, '？？？')).toBe('勇者');
    expect(shownNameOf({ name: '扉' }, false, '？？？')).toBe('扉');
  });

  it('says a hidden name to the room as the label whoever says it, and any other as it is', () => {
    expect(saidNameOf(hidden)).toBe(SAID_HIDDEN_NAME);
    expect(saidNameOf(plain)).toBe('勇者');
  });
});
