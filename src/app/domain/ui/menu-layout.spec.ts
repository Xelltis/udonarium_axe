import { DEFAULT_MENU_LAYOUTS, defaultMenuLayout } from '@axe/domain/ui/builtin-menu-layouts';
import { MENU_SURFACES, menuCommandFits, menuCommandOf, MenuSurface } from '@axe/domain/ui/menu-command';
import {
  encodeMenuLayout,
  isMenuGroup,
  isMenuSurface,
  MenuGroup,
  MenuItem,
  menuItemsOf,
  parseMenuLayout,
} from '@axe/domain/ui/menu-layout';

describe('how a menu is arranged', () => {
  describe('writing it down and reading it back', () => {
    it('brings back what it wrote', () => {
      const written = encodeMenuLayout(DEFAULT_MENU_LAYOUTS.fab);

      const read = parseMenuLayout(written);

      expect(read).toBeTruthy();
      expect(read!.nodes.map((node) => node.id)).toEqual(DEFAULT_MENU_LAYOUTS.fab.nodes.map((node) => node.id));
    });

    it('keeps the name and mark somebody gave an entry', () => {
      const read = parseMenuLayout('[{"id":"a","command":"chat","label":"おしゃべり","icon":"forum"}]');

      expect(read!.nodes[0]).toEqual({ id: 'a', command: 'chat', label: 'おしゃべり', icon: 'forum' });
    });

    it('answers nothing at all for text that is not an arrangement', () => {
      expect(parseMenuLayout('{')).toBeNull();
      expect(parseMenuLayout('"a menu"')).toBeNull();
      expect(parseMenuLayout('{"nodes":[]}')).toBeNull();
    });

    it('reads an arrangement somebody emptied as empty rather than as nothing said', () => {
      expect(parseMenuLayout('[]')).toEqual({ nodes: [] });
    });

    it('leaves out an entry naming no command, and keeps the rest', () => {
      const read = parseMenuLayout('[{"id":"a"},{"id":"b","command":"chat"},7,null]');

      expect(read!.nodes.map((node) => node.id)).toEqual(['b']);
    });

    it('keeps an entry naming a command this version has never heard of', () => {
      // Dropping it here would lose it for good; a menu drops it as it draws instead.
      const read = parseMenuLayout('[{"id":"a","command":"somethingLater"}]');

      expect(read!.nodes).toHaveLength(1);
    });

    it('names an entry after its command where it was written without a name of its own', () => {
      expect(parseMenuLayout('[{"command":"chat"}]')!.nodes[0].id).toBe('chat');
    });

    it('flattens a small menu found inside a small menu, since one level is as deep as it goes', () => {
      const read = parseMenuLayout(
        '[{"id":"g","icon":"folder","items":[{"id":"h","icon":"folder","items":[]},{"id":"i","command":"chat"}]}]'
      );

      const group = read!.nodes[0] as MenuGroup;
      expect(isMenuGroup(group)).toBe(true);
      expect(group.items.map((item) => item.command)).toEqual(['chat']);
    });
  });

  describe('menuItemsOf', () => {
    it('gathers what is inside the small menus along with what is not', () => {
      const commands = menuItemsOf(DEFAULT_MENU_LAYOUTS.fab).map((item) => item.command);

      expect(commands).toContain('peerMenu');
      expect(commands).toContain('mapEditor');
    });
  });

  describe('isMenuSurface', () => {
    it('knows the three menus and nothing else', () => {
      expect(isMenuSurface('fab')).toBe(true);
      expect(isMenuSurface('gmToolbar')).toBe(true);
      expect(isMenuSurface('sideboard')).toBe(false);
    });
  });

  describe('the way the menus come', () => {
    it('names only commands this version has', () => {
      for (const surface of MENU_SURFACES as readonly MenuSurface[]) {
        for (const item of menuItemsOf(DEFAULT_MENU_LAYOUTS[surface])) {
          expect(menuCommandOf(item.command), `${surface}/${item.command}`).toBeTruthy();
        }
      }
    });

    it('puts every command on a menu it fits', () => {
      for (const surface of MENU_SURFACES as readonly MenuSurface[]) {
        for (const item of menuItemsOf(DEFAULT_MENU_LAYOUTS[surface])) {
          expect(menuCommandFits(menuCommandOf(item.command)!, surface), `${surface}/${item.command}`).toBe(true);
        }
      }
    });

    it('names every entry of a menu apart from every other', () => {
      for (const surface of MENU_SURFACES as readonly MenuSurface[]) {
        const ids = DEFAULT_MENU_LAYOUTS[surface].nodes.map((node) => node.id);
        expect(new Set(ids).size, surface).toBe(ids.length);
      }
    });

    it('draws the drawer as it has always been drawn, with the guide to its buttons last', () => {
      expect(DEFAULT_MENU_LAYOUTS.fab.nodes.map((node) => node.id)).toEqual([
        'peerMenu',
        'chat',
        'roomSettings',
        'table',
        'gameResources',
        'media',
        'saveLoad',
        'widgets',
        'display',
        'buttonGuide',
      ]);
    });

    it('puts the inventory on both toolbars, next to the lists each already leads with', () => {
      const commands = (surface: 'gmToolbar' | 'plToolbar') =>
        DEFAULT_MENU_LAYOUTS[surface].nodes.map((node) => (node as MenuItem).command);

      expect(commands('gmToolbar').slice(0, 4)).toEqual(['objectList', 'npcBar', 'partyList', 'inventory']);
      expect(commands('plToolbar').slice(0, 2)).toEqual(['ownedCharacters', 'inventory']);
    });

    it('holds the table tools it always held, in the order it held them', () => {
      const table = DEFAULT_MENU_LAYOUTS.fab.nodes.find((node) => node.id === 'table') as MenuGroup;

      expect(table.items.map((item) => item.command)).toEqual([
        'tableSetting',
        'mapEditor',
        'dungeonGenerator',
        'tabletopDisplay',
        'visualNovel',
      ]);
    });

    it('hands out a copy, so arranging one screen does not arrange every screen', () => {
      const mine = defaultMenuLayout('fab');
      const yours = defaultMenuLayout('fab');

      expect(mine.nodes).not.toBe(yours.nodes);
      expect(mine.nodes[0]).not.toBe(DEFAULT_MENU_LAYOUTS.fab.nodes[0]);
      expect(mine.nodes.map((node) => node.id)).toEqual(yours.nodes.map((node) => node.id));
    });
  });
});
