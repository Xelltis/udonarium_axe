import { CHAT_LOG_BASE_CSS, CHAT_LOG_THEME_CSS } from '@axe/domain/chat/chat-log-theme-css';

describe('the chat log stylesheets', () => {
  const sheets: [string, string][] = [['base', CHAT_LOG_BASE_CSS], ...Object.entries(CHAT_LOG_THEME_CSS)];

  it.each(sheets)('closes every escaped character in %s, so the letter after it stays a letter', (_, css) => {
    for (const escape of css.match(/\\[0-9a-f]{1,6}\s?/gi) ?? []) {
      expect(escape.length === 7 || escape.endsWith(' '), escape).toBe(true);
    }
  });
});
