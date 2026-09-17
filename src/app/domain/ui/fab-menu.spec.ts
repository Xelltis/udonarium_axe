import { FAB_ENTRIES, FAB_SUBMENUS } from '@axe/domain/ui/fab-menu';
import { ROOM_PANELS } from '@axe/domain/ui/room-panel';

describe('the menu the room is reached through', () => {
  const everyEntry = [...FAB_ENTRIES, ...Object.values(FAB_SUBMENUS).flat()];

  it('names every entry once, in the drawer or in a menu of it, and gives each an icon to be found by', () => {
    const keys = everyEntry.map((entry) => entry.key);

    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of everyEntry) expect(entry.icon.length).toBeGreaterThan(0);
  });

  it('opens only panels the room knows about', () => {
    for (const entry of everyEntry) {
      if (entry.action.kind !== 'panel') continue;
      expect(ROOM_PANELS).toContain(entry.action.panel);
    }
  });

  it('stands in the order the entries are reached for', () => {
    expect(FAB_ENTRIES.map((entry) => entry.key)).toEqual([
      'peerMenu',
      'chat',
      'roomSettings',
      'table',
      'gameResources',
      'media',
    ]);
  });

  it('gathers the images, the music, the cut-ins and the effects under media, the effects for those playing', () => {
    const media = FAB_ENTRIES.find((entry) => entry.key === 'media');

    expect(media?.action).toEqual({ kind: 'submenu', submenu: 'media' });
    expect(FAB_SUBMENUS.media.map((entry) => entry.key)).toEqual(['images', 'jukebox', 'cutIn', 'effectLibrary']);
    expect(FAB_SUBMENUS.media.find((entry) => entry.key === 'effectLibrary')?.audience).toBe('playing');
  });

  it('gathers what builds and shows the table under one entry, its building tools for the game master alone', () => {
    const table = FAB_ENTRIES.find((entry) => entry.key === 'table');

    expect(table?.action).toEqual({ kind: 'submenu', submenu: 'table' });
    expect(FAB_SUBMENUS.table.map((entry) => entry.key)).toEqual([
      'tableSetting',
      'mapEditor',
      'dungeonGenerator',
      'tabletopDisplay',
      'visualNovel',
    ]);
    expect(FAB_SUBMENUS.table.filter((entry) => entry.audience === 'gameMaster').map((entry) => entry.key)).toEqual([
      'mapEditor',
      'dungeonGenerator',
    ]);
  });

  it('gathers what the game is played with, keeping the buffs and the hand from someone watching', () => {
    const resources = FAB_ENTRIES.find((entry) => entry.key === 'gameResources');

    expect(resources?.action).toEqual({ kind: 'submenu', submenu: 'gameResources' });
    expect(FAB_SUBMENUS.gameResources.map((entry) => entry.key)).toEqual([
      'inventory',
      'buffManager',
      'statusAilment',
      'diceTableSetting',
      'hand',
    ]);
    expect(
      FAB_SUBMENUS.gameResources.filter((entry) => entry.audience === 'playing').map((entry) => entry.key)
    ).toEqual(['buffManager', 'hand']);
    expect(FAB_SUBMENUS.gameResources.find((entry) => entry.key === 'hand')?.action).toEqual({ kind: 'handRail' });
  });

  it('names each entry by a key of its own, borrowing the panel title where the drawer has none', () => {
    expect(FAB_ENTRIES.find((entry) => entry.key === 'chat')?.labelKey).toBe('app.fab.chat');
    expect(FAB_SUBMENUS.table.find((entry) => entry.key === 'mapEditor')?.labelKey).toBe('feature.mapEditor.title');
  });

  it('opens a menu only from the drawer itself, never from inside another menu', () => {
    for (const entry of Object.values(FAB_SUBMENUS).flat()) expect(entry.action.kind).not.toBe('submenu');
  });

  it('draws every entry of the drawer and of its menus with an icon of its own', () => {
    const icons = everyEntry.map((entry) => entry.icon);

    expect(new Set(icons).size).toBe(icons.length);
  });

  it('shows the table entry as a table, and the tabletop display as a screen laid on it', () => {
    expect(FAB_ENTRIES.find((entry) => entry.key === 'table')?.icon).toBe('table_restaurant');
    expect(FAB_SUBMENUS.table.find((entry) => entry.key === 'tabletopDisplay')?.icon).toBe('tablet');
  });
});
