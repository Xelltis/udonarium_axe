import { readFileSync } from 'node:fs';

import {
  KEYBOARD_SHORTCUTS,
  keyboardShortcutsOf,
  SHORTCUT_SCOPES,
  shortcutKeysText,
  shortcutProbesOf,
} from '@axe/domain/ui/keyboard-shortcuts';

function dictionary(language: string): Record<string, unknown> {
  return JSON.parse(readFileSync(`src/assets/i18n/${language}.json`, 'utf-8'));
}

function lookup(tree: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    return typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined;
  }, tree);
}

describe('the list of keys', () => {
  it('tells every line of a scope apart', () => {
    for (const scope of SHORTCUT_SCOPES) {
      const ids = keyboardShortcutsOf(scope).map((shortcut) => shortcut.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('has something in every scope', () => {
    for (const scope of SHORTCUT_SCOPES) {
      expect(keyboardShortcutsOf(scope).length).toBeGreaterThan(0);
    }
  });

  it('gives every line a key or a pointer action to write', () => {
    for (const shortcut of KEYBOARD_SHORTCUTS) {
      expect(shortcut.keys.length > 0 || shortcut.pointer != null).toBe(true);
    }
  });

  for (const language of ['ja', 'en', 'ko']) {
    it(`names every line and every scope in ${language}`, () => {
      const tree = dictionary(language);
      const missing = [
        ...KEYBOARD_SHORTCUTS.map((shortcut) => shortcut.labelKey),
        ...SHORTCUT_SCOPES.map((scope) => `feature.keyboard.scope.${scope}`),
        'feature.keyboard.pointer.click',
        'feature.keyboard.pointer.drag',
      ].filter((key) => typeof lookup(tree, key) !== 'string');

      expect(missing).toEqual([]);
    });
  }

  it('writes the keys held together with a plus, and each way of doing it apart', () => {
    expect(shortcutKeysText({ keys: [['Shift', 'T']] })).toBe('Shift+T');
    expect(shortcutKeysText({ keys: [['←'], ['↑']] })).toBe('← / ↑');
    expect(shortcutKeysText({ keys: [] })).toBe('');
  });

  it('keeps novel mode’s list as it always read', () => {
    expect(keyboardShortcutsOf('visualNovel').map((shortcut) => shortcutKeysText(shortcut))).toEqual([
      'Enter / Space / → / ↓',
      '← / ↑',
      'Ctrl',
      'Home / End',
      'A',
      'L',
      'S',
      'Esc',
    ]);
  });

  it('only offers a probe where there is a handler to hold it to', () => {
    expect(shortcutProbesOf('selection')).toEqual([]);
    expect(shortcutProbesOf('tabletop').map((shortcut) => shortcut.id)).toEqual([
      'target',
      'clearTargets',
      'disclosure',
    ]);
  });
});
