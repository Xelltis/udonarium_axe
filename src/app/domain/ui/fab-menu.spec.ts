import { FAB_ENTRIES } from '@axe/domain/ui/fab-menu';
import { ROOM_PANELS } from '@axe/domain/ui/room-panel';

describe('the menu the room is reached through', () => {
  it('names every entry once, and gives each an icon to be found by', () => {
    const keys = FAB_ENTRIES.map((entry) => entry.key);

    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of FAB_ENTRIES) expect(entry.icon.length).toBeGreaterThan(0);
  });

  it('opens only panels the room knows about', () => {
    for (const entry of FAB_ENTRIES) {
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
      'images',
      'jukebox',
      'cutIn',
      'visualNovel',
      'tabletopDisplay',
      'replay',
      'zipLoad',
    ]);
  });
});
