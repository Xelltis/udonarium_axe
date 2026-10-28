import { minimalEdit } from '@axe/features/chat/chat-editor/minimal-edit';

describe('minimalEdit', () => {
  function applied(before: string, after: string): string {
    const edit = minimalEdit(before, after);
    return edit ? before.slice(0, edit.from) + edit.insert + before.slice(edit.to) : before;
  }

  it('writes over only what differs, keeping what both start and end with', () => {
    expect(minimalEdit('今日は晴れ', '今日はとても晴れ')).toEqual({ from: 3, to: 3, insert: 'とても' });
    expect(minimalEdit('abcdef', 'abXYef')).toEqual({ from: 2, to: 4, insert: 'XY' });
  });

  it('turns the one text into the other whatever they hold', () => {
    for (const [before, after] of [
      ['', 'abc'],
      ['abc', ''],
      ['aaa', 'aaaa'],
      ['2d6 攻撃', '3d6 攻撃'],
      ['x', 'yxy'],
    ]) {
      expect(applied(before, after), `${before} → ${after}`).toBe(after);
    }
  });

  it('answers null where nothing changes', () => {
    expect(minimalEdit('同じ', '同じ')).toBeNull();
  });
});
