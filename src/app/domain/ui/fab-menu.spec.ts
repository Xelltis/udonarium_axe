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
      'tableSetting',
      'inventory',
      'media',
      'visualNovel',
      'tabletopDisplay',
      'skin',
    ]);
  });

  it('gathers the images, the music and the cut-ins under media', () => {
    const media = FAB_ENTRIES.find((entry) => entry.key === 'media');

    expect(media?.action).toEqual({ kind: 'submenu', submenu: 'media' });
    expect(FAB_SUBMENUS.media.map((entry) => entry.key)).toEqual(['images', 'jukebox', 'cutIn']);
  });

  it('opens a menu only from the drawer itself, never from inside another menu', () => {
    for (const entry of Object.values(FAB_SUBMENUS).flat()) expect(entry.action.kind).not.toBe('submenu');
  });
});
