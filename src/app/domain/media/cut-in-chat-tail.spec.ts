import { cutInNamedAtLineEnd, readCutInChatTail } from '@axe/domain/media/cut-in-chat-tail';

describe('readCutInChatTail', () => {
  it('reads the last word of a line and where it stands', () => {
    const text = '行くぞ 爆発';
    const tail = readCutInChatTail(text)!;
    expect(tail).toMatchObject({ name: '爆発', soundOnly: false });
    expect(text.slice(tail.from, tail.to)).toBe('爆発');
  });

  it('reads an @ before the word as the sound alone, spanning the mark too', () => {
    const text = '行くぞ @爆発';
    const tail = readCutInChatTail(text)!;
    expect(tail).toMatchObject({ name: '爆発', soundOnly: true });
    expect(text.slice(tail.from, tail.to)).toBe('@爆発');
  });

  it('reads a line of one word, since a space is put before the line', () => {
    expect(readCutInChatTail('爆発')).toMatchObject({ name: '爆発', from: 0, to: 2 });
  });

  it('reads nothing when a space ends the line', () => {
    expect(readCutInChatTail('行くぞ 爆発 ')).toBeNull();
  });

  it('takes a name a line can end with, read back whole, and no other', () => {
    expect(cutInNamedAtLineEnd('爆発')).toBe(true);
    expect(cutInNamedAtLineEnd('big boom')).toBe(false);
    expect(cutInNamedAtLineEnd('@boom')).toBe(false);
    expect(cutInNamedAtLineEnd('')).toBe(false);
  });
});
