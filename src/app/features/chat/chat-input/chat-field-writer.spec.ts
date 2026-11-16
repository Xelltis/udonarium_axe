import { chatFieldWriter } from '@axe/features/chat/chat-input/chat-field-writer';
import { TextareaChatField } from '@axe/features/chat/chat-input/chat-text-field';

describe('chatFieldWriter', () => {
  let box: HTMLTextAreaElement;

  function writerOver(text: string, from: number, to = from) {
    box.value = text;
    box.setSelectionRange(from, to);
    const field = new TextareaChatField(
      box,
      () => 'ja',
      () => new Set<string>()
    );
    return chatFieldWriter((edit) => edit(field));
  }

  beforeEach(() => {
    box = document.createElement('textarea');
    document.body.appendChild(box);
  });

  afterEach(() => box.remove());

  it('puts a secret roll’s mark after the count of repeats the roll starts with', () => {
    writerOver('3 2D6', 5).prefix('S', 'roll');

    expect(box.value).toBe('3 S2D6');
  });

  it('leaves the caret where it stood before a secret roll’s mark put in after it', () => {
    writerOver('3 2D6', 0).prefix('S', 'roll');

    expect(box.value).toBe('3 S2D6');
    expect([box.selectionStart, box.selectionEnd]).toEqual([0, 0]);
  });

  it('moves a caret standing after the mark along with what it stood before', () => {
    writerOver('3 2D6', 5).prefix('S', 'roll');

    expect([box.selectionStart, box.selectionEnd]).toEqual([6, 6]);
  });

  it('puts a prefix at the start of the line the caret is on', () => {
    writerOver('first\nsecond', 9).prefix('> ');

    expect(box.value).toBe('first\n> second');
  });

  it('writes a change of a status as a word of its own after the words before the caret', () => {
    writerOver('hello', 5).word(':HP-1', { from: 4, to: 5 });

    expect(box.value).toBe('hello :HP-1');
    expect([box.selectionStart, box.selectionEnd]).toEqual([10, 11]);
  });

  it('adds no space before a word written at the start or after a space', () => {
    writerOver('', 0).word(':HP-1');
    expect(box.value).toBe(':HP-1');

    writerOver('hello ', 6).word(':HP-1');
    expect(box.value).toBe('hello :HP-1');
  });

  it('writes text over what is selected, selecting the stretch asked for', () => {
    writerOver('say WORD now', 4, 8).insert('{名前}', { from: 1, to: 3 });

    expect(box.value).toBe('say {名前} now');
    expect([box.selectionStart, box.selectionEnd]).toEqual([5, 7]);
  });

  it('writes nothing where there is no box to write in', () => {
    const writer = chatFieldWriter(() => undefined);

    expect(() => writer.insert('text')).not.toThrow();
  });
});
