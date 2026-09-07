import { readFileSync } from 'node:fs';

import { CHARACTER_PANELS, panelLabelKey, ROOM_PANELS, toCharacterPanelName } from '@axe/domain/ui/room-panel';

describe('the panels that can be opened by name', () => {
  it('reads an unknown name as a chat palette, as an older slot meant', () => {
    expect(toCharacterPanelName('no-such-panel')).toBe('chatPalette');
    expect(toCharacterPanelName(null)).toBe('chatPalette');
    expect(toCharacterPanelName('jukebox')).toBe('chatPalette');
    expect(toCharacterPanelName('sheet')).toBe('sheet');
  });

  it('names every panel exactly once', () => {
    const names = [...CHARACTER_PANELS, ...ROOM_PANELS];
    expect(new Set(names).size).toBe(names.length);
  });

  it('has a word for every panel in every language', () => {
    for (const lang of ['ja', 'en', 'ko']) {
      const dictionary = JSON.parse(readFileSync(`src/assets/i18n/${lang}.json`, 'utf-8')) as Record<string, unknown>;
      for (const panel of [...CHARACTER_PANELS, ...ROOM_PANELS]) {
        const held = panelLabelKey(panel)
          .split('.')
          .reduce<unknown>((held, key) => (held as Record<string, unknown>)?.[key], dictionary);
        expect(typeof held, `${lang}: ${panelLabelKey(panel)}`).toBe('string');
      }
    }
  });
});
