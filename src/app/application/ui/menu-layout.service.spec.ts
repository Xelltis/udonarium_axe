import { TestBed } from '@angular/core/testing';
import { MenuLayoutService } from '@axe/application/ui/menu-layout.service';
import { DEFAULT_MENU_LAYOUTS } from '@axe/domain/ui/builtin-menu-layouts';
import { MenuLayout } from '@axe/domain/ui/menu-layout';

describe('MenuLayoutService', () => {
  const KEY = 'axe.menu.fab';

  function fresh(): MenuLayoutService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(MenuLayoutService);
  }

  beforeEach(() => {
    localStorage.removeItem(KEY);
  });

  afterEach(() => {
    localStorage.removeItem(KEY);
    vi.restoreAllMocks();
  });

  it('draws a menu the way it came on a screen that has never said otherwise', () => {
    const menus = fresh();

    expect(menus.isArranged('fab')).toBe(false);
    expect(
      menus
        .layoutOf('fab')()
        .nodes.map((node) => node.id)
    ).toEqual(DEFAULT_MENU_LAYOUTS.fab.nodes.map((node) => node.id));
  });

  it('keeps what a screen arranged, and hands it back on the next visit', () => {
    const menus = fresh();
    const mine: MenuLayout = { nodes: [{ id: 'a', command: 'chat' }] };

    menus.save('fab', mine);

    expect(menus.layoutOf('fab')().nodes).toHaveLength(1);
    expect(
      fresh()
        .layoutOf('fab')()
        .nodes.map((node) => node.id)
    ).toEqual(['a']);
  });

  it('keeps a menu somebody emptied empty, rather than handing back the way it came', () => {
    const menus = fresh();

    menus.save('fab', { nodes: [] });

    expect(menus.isArranged('fab')).toBe(true);
    expect(fresh().layoutOf('fab')().nodes).toEqual([]);
  });

  it('puts a menu back the way it came, and forgets it was ever arranged', () => {
    const menus = fresh();
    menus.save('fab', { nodes: [] });

    menus.reset('fab');

    expect(menus.isArranged('fab')).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(menus.layoutOf('fab')().nodes.length).toBe(DEFAULT_MENU_LAYOUTS.fab.nodes.length);
  });

  it('keeps each menu apart from the others', () => {
    const menus = fresh();

    menus.save('gmToolbar', { nodes: [] });

    expect(menus.layoutOf('gmToolbar')().nodes).toEqual([]);
    expect(menus.layoutOf('fab')().nodes.length).toBeGreaterThan(0);
    localStorage.removeItem('axe.menu.gmToolbar');
  });

  it('draws the way it came where what was kept cannot be read', () => {
    localStorage.setItem(KEY, 'not an arrangement');

    expect(fresh().layoutOf('fab')().nodes.length).toBe(DEFAULT_MENU_LAYOUTS.fab.nodes.length);
  });

  it('still arranges the menu for this visit where the browser refuses to keep it', () => {
    const menus = fresh();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('site data blocked');
    });

    expect(() => menus.save('fab', { nodes: [] })).not.toThrow();
    expect(menus.layoutOf('fab')().nodes).toEqual([]);
  });

  it('hands back a menu of its own each time, so changing one does not change the way it came', () => {
    const menus = fresh();
    const drawn = menus.layoutOf('fab')();

    expect(drawn.nodes[0]).not.toBe(DEFAULT_MENU_LAYOUTS.fab.nodes[0]);
  });
});
