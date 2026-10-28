import { chatCompletionSource, type ChatCompletionWords } from '@axe/features/chat/chat-editor/chat-editor-complete';
import { CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';

describe('chatCompletionSource', () => {
  const words: ChatCompletionWords = {
    statuses: ['HP', 'MP'],
    variables: ['攻撃'],
    portraits: ['笑顔'],
    effects: ['爆炎'],
    buffs: ['加護', 'tough'],
    diceExamples: ['CC<=50', 'CBR(50,60)'],
  };
  const source = chatCompletionSource(() => words);

  function complete(text: string): { typed: string; labels: string[]; applied: string[] } | null {
    const state = EditorState.create({ doc: text, selection: { anchor: text.length } });
    const result = source(new CompletionContext(state, text.length, false)) as CompletionResult | null;
    if (!result) return null;
    return {
      typed: text.slice(result.from),
      labels: result.options.map((option) => option.label),
      applied: result.options.map((option) => String(option.apply)),
    };
  }

  it('offers the statuses and variables inside a reference, closing it', () => {
    expect(complete('2d6+{')).toEqual({ typed: '', labels: ['HP', 'MP', '攻撃'], applied: ['HP}', 'MP}', '攻撃}'] });
    expect(complete('t{H')?.typed).toBe('H');
  });

  it('offers the statuses after a colon that starts a word, secret or aimed', () => {
    expect(complete('攻撃 st:H')).toMatchObject({ typed: 'H', labels: ['HP', 'MP'] });
    expect(complete('12:3')).toBeNull();
  });

  it('offers the buffs the speaker has after an ampersand, past its marks', () => {
    expect(complete('&+!加')).toMatchObject({ typed: '加', labels: ['加護', 'tough'] });
    expect(complete('t&to')).toMatchObject({ typed: 'to' });
  });

  it('offers the portraits after an at mark, and the effects inside the brackets', () => {
    expect(complete('やあ @')?.labels).toEqual(['笑顔', 'hide']);
    expect(complete('《')).toEqual({ typed: '', labels: ['爆炎'], applied: ['爆炎》'] });
  });

  it('offers the commands of the game system for the first word of a line', () => {
    expect(complete('C')).toMatchObject({ typed: 'C', labels: ['CC<=50', 'CBR(50,60)'] });
    expect(complete('攻撃 C')).toBeNull();
  });

  it('offers nothing in words of chat', () => {
    expect(complete('こんにちは')).toBeNull();
    expect(complete('mail@example')).toBeNull();
  });
});
