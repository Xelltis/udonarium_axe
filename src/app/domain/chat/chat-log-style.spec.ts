import { readFileSync } from 'node:fs';

import { CHAT_LOG_STYLES, isChatLogStyle, isRichChatLogStyle } from '@axe/domain/chat/chat-log-style';
import { CHAT_LOG_THEME_CSS } from '@axe/domain/chat/chat-log-theme-css';

describe('the chat log styles', () => {
  it.each(['ja', 'en', 'ko'])('names and describes every style in %s', (lang) => {
    const dictionary = JSON.parse(readFileSync(`src/assets/i18n/${lang}.json`, 'utf-8'));
    const styles = dictionary.feature.chat.log.styles as Record<string, { name?: string; description?: string }>;

    for (const style of CHAT_LOG_STYLES) {
      expect(styles[style]?.name, style).toBeTruthy();
      expect(styles[style]?.description, style).toBeTruthy();
    }
  });

  it('gives every dressed style a stylesheet of its own', () => {
    const sheets = CHAT_LOG_STYLES.filter(isRichChatLogStyle).map((style) => CHAT_LOG_THEME_CSS[style]);

    expect(sheets.every((sheet) => sheet.length > 0)).toBe(true);
    expect(new Set(sheets).size).toBe(sheets.length);
  });

  it('knows a style it offers and no other', () => {
    expect(isChatLogStyle('washi')).toBe(true);
    expect(isChatLogStyle('vaporwave')).toBe(false);
    expect(isChatLogStyle(null)).toBe(false);
  });
});
