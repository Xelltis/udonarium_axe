import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { readableMessageName, readableMessageText } from '@axe/features/visual-novel/visual-novel-message';

describe('what a line says in novel mode', () => {
  const translate = (key: string, params?: Record<string, unknown>) =>
    key === 'common.chat.logClearedBy' ? `${params?.['user']} がログを消しました` : key;

  function message(text: string, name: string, tag = ''): ChatMessage {
    const chat = new ChatMessage();
    chat.initialize();
    chat.value = text;
    chat.name = name;
    chat.tag = tag;
    return chat;
  }

  afterEach(() => {
    /* messages are made in the store, and the store is cleared between files */
  });

  it('reads what the room says of itself in the reader"s language', () => {
    const line = message(encodeI18nMessage('common.chat.logClearedBy', { user: 'GM' }), '', 'system-message');

    expect(readableMessageText(line, translate)).toBe('GM がログを消しました');
    line.destroy();
  });

  it('reads the name such a line is spoken under', () => {
    const line = message('', encodeI18nMessage('common.chat.systemName'), 'system-message');

    expect(readableMessageName(line, translate)).toBe('common.chat.systemName');
    line.destroy();
  });

  it('reads packed words a person speaks, as a vote or an alarm speaks them, under that person"s name', () => {
    const line = message(encodeI18nMessage('common.chat.logClearedBy', { user: 'いたずら' }), 'アリス');

    expect(readableMessageText(line, translate)).toBe('いたずら がログを消しました');
    expect(readableMessageName(line, translate)).toBe('アリス');
    line.destroy();
  });

  it('says nothing of nothing', () => {
    expect(readableMessageText(null, translate)).toBe('');
    expect(readableMessageName(undefined, translate)).toBe('');
  });
});
