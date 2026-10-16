import { readFileSync } from 'node:fs';

import { PeerRole } from '@axe/domain/peer/peer-role';
import {
  KEYBOARD_SHORTCUTS,
  keyboardShortcutsOf,
  SHORTCUT_SCOPES,
  shortcutKeysText,
  shortcutProbesOf,
  shortcutSheetSections,
  ShortcutSituation,
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

describe('the sections of the cheat sheet', () => {
  const onTheTable: ShortcutSituation = {
    firstPerson: false,
    openScopes: [],
    grid: 'square',
    role: PeerRole.GameMaster,
  };

  function scopesOf(situation: ShortcutSituation) {
    return shortcutSheetSections(situation).map((section) => section.scope);
  }

  function idsIn(situation: ShortcutSituation, scope: string) {
    return shortcutSheetSections(situation)
      .find((section) => section.scope === scope)
      ?.shortcuts.map((shortcut) => shortcut.id);
  }

  it('lists the table’s keys on the table', () => {
    expect(scopesOf(onTheTable)).toEqual(['tabletop', 'selection', 'hotbar', 'chat', 'global']);
  });

  it('puts the first person view’s keys in place of the table’s while it is showing', () => {
    expect(scopesOf({ ...onTheTable, firstPerson: true })).toEqual(['firstPerson', 'hotbar', 'chat', 'global']);
  });

  it('puts an open editor first, the latest ahead', () => {
    expect(scopesOf({ ...onTheTable, openScopes: ['mapEditor', 'whiteBoard'] }).slice(0, 3)).toEqual([
      'mapEditor',
      'whiteBoard',
      'tabletop',
    ]);
  });

  it('never lists novel mode, which shows its own keys', () => {
    expect(scopesOf({ ...onTheTable, openScopes: ['visualNovel'] })).not.toContain('visualNovel');
  });

  it('keeps a game master’s lines from a player', () => {
    const player = { ...onTheTable, role: PeerRole.Player, openScopes: ['mapEditor' as const] };
    expect(scopesOf(player)).not.toContain('mapEditor');
    expect(idsIn(player, 'tabletop')).toContain('disclosure');
    expect(idsIn({ ...onTheTable, role: PeerRole.Guest }, 'tabletop')).not.toContain('disclosure');
  });

  it('lists a guest none of the hotbar, nor rotating or settling what an effect falls on', () => {
    const guest = { ...onTheTable, role: PeerRole.Guest };

    expect(scopesOf(guest)).not.toContain('hotbar');
    expect(idsIn(guest, 'selection')).not.toContain('snap');
    expect(idsIn(guest, 'tabletop')).not.toContain('enter');
    expect(scopesOf(onTheTable)).toContain('hotbar');
    expect(idsIn(onTheTable, 'selection')).toContain('snap');
    expect(idsIn(onTheTable, 'tabletop')).toContain('enter');
  });

  it('lists a guest in the first person view only looking around and aiming, which is all it may do there', () => {
    const guest = { ...onTheTable, role: PeerRole.Guest, firstPerson: true };

    expect(idsIn(guest, 'firstPerson')).toEqual(['target', 'clearTargets', 'escape', 'look']);
    expect(idsIn({ ...guest, role: PeerRole.Player }, 'firstPerson')).toContain('door');
  });

  it('lists the moves of the grid being looked at', () => {
    const square = { ...onTheTable, firstPerson: true };
    expect(idsIn(square, 'firstPerson')).toContain('move');
    expect(idsIn(square, 'firstPerson')).not.toContain('slantBack');
    expect(idsIn({ ...square, grid: 'hex' }, 'firstPerson')).toEqual(
      expect.arrayContaining(['frontBack', 'slantFront', 'slantBack'])
    );
    expect(idsIn({ ...square, grid: 'hex' }, 'firstPerson')).not.toContain('move');
  });
});
