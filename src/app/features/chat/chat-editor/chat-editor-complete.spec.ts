import {
  type ChatCompletionWords,
  chatTriggerOptions,
  findChatTrigger,
} from '@axe/features/chat/chat-editor/chat-editor-complete';

describe('chat-editor-complete', () => {
  const words: ChatCompletionWords = {
    statuses: ['HP', 'MP'],
    variables: ['攻撃'],
    portraits: ['笑顔'],
    effects: ['爆炎'],
    buffs: ['加護', 'tough'],
    cutIns: ['登場'],
  };

  it('finds a reference being written, with what is typed after its brace', () => {
    expect(findChatTrigger('2d6+{H')).toEqual({ kind: 'reference', from: 4, query: 'H' });
    expect(findChatTrigger('t{')).toEqual({ kind: 'reference', from: 0, query: '' });
  });

  it('finds a status or a buff only after a mark that starts a word', () => {
    expect(findChatTrigger('攻撃 st:H')).toEqual({ kind: 'status', from: 3, query: 'H' });
    expect(findChatTrigger('12:3')).toBeNull();
    expect(findChatTrigger('&+!加')).toEqual({ kind: 'buff', from: 0, query: '加' });
  });

  it('finds an effect, and a portrait or cut-in after an at mark that starts a word', () => {
    expect(findChatTrigger('《')).toEqual({ kind: 'effect', from: 0, query: '' });
    expect(findChatTrigger('やあ @笑')).toEqual({ kind: 'tail', from: 3, query: '笑' });
    expect(findChatTrigger('mail@example')).toBeNull();
  });

  it('finds nothing in words of chat', () => {
    expect(findChatTrigger('こんにちは')).toBeNull();
    expect(findChatTrigger('{HP} ')).toBeNull();
  });

  it('offers the names for what is being written, those starting with what is typed first', () => {
    expect(chatTriggerOptions({ kind: 'reference', from: 0, query: '' }, words)).toEqual(['HP', 'MP', '攻撃']);
    expect(chatTriggerOptions({ kind: 'tail', from: 0, query: '' }, words)).toEqual(['笑顔', '登場']);
    expect(chatTriggerOptions({ kind: 'effect', from: 0, query: 'v' }, words)).toEqual(['vs']);
    expect(chatTriggerOptions({ kind: 'buff', from: 0, query: 'ou' }, words)).toEqual(['tough']);
  });

  it('offers after a colon only the statuses a change can name, keeping the rest to references', () => {
    const spaced = { ...words, statuses: ['HP', 'Max HP', 'HP-max'] };
    expect(chatTriggerOptions({ kind: 'status', from: 0, query: '' }, spaced)).toEqual(['HP']);
    expect(chatTriggerOptions({ kind: 'reference', from: 0, query: '' }, spaced)).toContain('Max HP');
  });

  describe('round commands', () => {
    const withTurns: ChatCompletionWords = { ...words, turnCommands: ['T', '手番', 'TE', '手番終了', 'RS'] };

    it('tells an ampersand that opens the line, where a round command is read', () => {
      expect(findChatTrigger('&')).toEqual({ kind: 'buff', from: 0, query: '', opensLine: true });
      expect(findChatTrigger('  &T')).toEqual({ kind: 'buff', from: 2, query: 'T', opensLine: true });
      expect(findChatTrigger('攻撃 &T')).toEqual({ kind: 'buff', from: 3, query: 'T' });
      expect(findChatTrigger('&+T')).toEqual({ kind: 'buff', from: 0, query: 'T' });
      expect(findChatTrigger('s&T')).toEqual({ kind: 'buff', from: 0, query: 'T' });
    });

    it('offers the commands after the buffs where the ampersand opens the line', () => {
      expect(chatTriggerOptions({ kind: 'buff', from: 0, query: '', opensLine: true }, withTurns)).toEqual([
        '加護',
        'tough',
        'T',
        '手番',
        'TE',
        '手番終了',
        'RS',
      ]);
      expect(chatTriggerOptions({ kind: 'buff', from: 0, query: 't', opensLine: true }, withTurns)).toEqual([
        'tough',
        'T',
        'TE',
      ]);
    });

    it('offers no command in the middle of a line, nor where none is told', () => {
      expect(chatTriggerOptions({ kind: 'buff', from: 3, query: '' }, withTurns)).toEqual(['加護', 'tough']);
      expect(chatTriggerOptions({ kind: 'buff', from: 0, query: '', opensLine: true }, words)).toEqual([
        '加護',
        'tough',
      ]);
    });
  });
});
