import { readFileSync } from 'node:fs';

import {
  CHARACTER_PANELS,
  panelLabelKey,
  ROOM_PANELS,
  roomPanelNamed,
  toCharacterPanelName,
} from '@axe/domain/ui/room-panel';

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

describe('roomPanelNamed', () => {
  it('reads a panel asked for by its own name as that panel, with no half of it meant', () => {
    expect(roomPanelNamed('aiLink')).toEqual({ panel: 'aiLink' });
    expect(roomPanelNamed('chatWindow')).toEqual({ panel: 'chatWindow' });
  });

  it('reads the name the game master’s panel used to go by as that half of the AI link panel', () => {
    expect(roomPanelNamed('aiGm')).toEqual({ panel: 'aiLink', half: 'gm' });
  });

  it('calls every panel of the room, by whichever name, what the panel it asks for is called', () => {
    for (const name of ROOM_PANELS) {
      expect(panelLabelKey(name), name).toBe(panelLabelKey(roomPanelNamed(name).panel));
      expect(panelLabelKey(name), name).toEqual(expect.any(String));
    }
  });
});
