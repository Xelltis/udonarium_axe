import { DEFAULT_MENU_LAYOUTS } from '@axe/domain/ui/builtin-menu-layouts';
import { canIconFontDraw, ICON_FONT_NAMES, searchIconNames } from '@axe/domain/ui/icon-font';
import { MENU_COMMANDS, MENU_SURFACES } from '@axe/domain/ui/menu-command';
import { isMenuGroup } from '@axe/domain/ui/menu-layout';

describe('the marks the bundled font can draw', () => {
  it('holds the whole catalogue, each name once', () => {
    expect(ICON_FONT_NAMES.length).toBeGreaterThan(2000);
    expect(new Set(ICON_FONT_NAMES).size).toBe(ICON_FONT_NAMES.length);
  });

  it('says whether it has a mark of that name', () => {
    expect(canIconFontDraw('map')).toBe(true);
    expect(canIconFontDraw('person_play')).toBe(false);
  });

  it('can draw every mark a menu comes with, rather than drawing the name as text', () => {
    const asked = new Set(MENU_COMMANDS.map((command) => command.icon));
    for (const surface of MENU_SURFACES) {
      for (const node of DEFAULT_MENU_LAYOUTS[surface].nodes) if (isMenuGroup(node)) asked.add(node.icon);
    }

    expect([...asked].filter((name) => !canIconFontDraw(name))).toEqual([]);
  });

  describe('searching it', () => {
    it('offers nothing until something is typed', () => {
      expect(searchIconNames('')).toEqual([]);
      expect(searchIconNames('   ')).toEqual([]);
    });

    it('puts a name that starts with what was typed before one that merely holds it', () => {
      const found = searchIconNames('map');

      expect(found).toContain('map');
      expect(found).toContain('zoom_in_map');
      expect(found.indexOf('maps_ugc')).toBeLessThan(found.indexOf('zoom_in_map'));
    });

    it('reads a space or a hyphen as the underscore the names are written with', () => {
      expect(searchIconNames('table restaurant')).toContain('table_restaurant');
      expect(searchIconNames('table-restaurant')).toContain('table_restaurant');
    });

    it('hands back no more than it was asked for', () => {
      expect(searchIconNames('a', 12)).toHaveLength(12);
    });

    it('answers nothing where no mark goes by that name', () => {
      expect(searchIconNames('notamarkanywhere')).toEqual([]);
    });
  });
});
