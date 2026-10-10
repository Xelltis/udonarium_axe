import { MenuLayout } from '@axe/domain/ui/menu-layout';
import { encodeMenuLayoutFile, parseMenuLayoutFile } from '@axe/domain/ui/menu-layout-file';

describe('carrying an arrangement to another screen', () => {
  const fab: MenuLayout = { nodes: [{ id: 'chat', command: 'chat' }] };
  const bar: MenuLayout = { nodes: [{ id: 'darkness', command: 'darkness' }] };

  it('brings back what it wrote', () => {
    const read = parseMenuLayoutFile(encodeMenuLayoutFile({ fab, gmToolbar: bar }));

    expect(read!.fab!.nodes.map((node) => node.id)).toEqual(['chat']);
    expect(read!.gmToolbar!.nodes.map((node) => node.id)).toEqual(['darkness']);
  });

  it('leaves out a menu the screen never arranged', () => {
    const read = parseMenuLayoutFile(encodeMenuLayoutFile({ fab }));

    expect(read!.fab).toBeTruthy();
    expect(read).not.toHaveProperty('gmToolbar');
  });

  it('carries a menu somebody emptied as empty', () => {
    const read = parseMenuLayoutFile(encodeMenuLayoutFile({ fab: { nodes: [] } }));

    expect(read!.fab!.nodes).toEqual([]);
  });

  it('answers nothing for a file that is not one of ours', () => {
    expect(parseMenuLayoutFile('{')).toBeNull();
    expect(parseMenuLayoutFile('[]')).toBeNull();
    expect(parseMenuLayoutFile('{"axeMenus":1}')).toBeNull();
  });

  it('answers nothing for a file naming no menu, rather than emptying every menu', () => {
    expect(parseMenuLayoutFile('{"axeMenus":1,"layouts":{}}')).toBeNull();
    expect(parseMenuLayoutFile('{"axeMenus":1,"layouts":{"sideboard":[]}}')).toBeNull();
  });

  it('hands over the menus it can read where one of them it cannot', () => {
    const read = parseMenuLayoutFile('{"axeMenus":1,"layouts":{"fab":[{"command":"chat"}],"gmToolbar":"broken"}}');

    expect(read!.fab!.nodes).toHaveLength(1);
    expect(read).not.toHaveProperty('gmToolbar');
  });

  it('writes a stamp saying what shape the file is', () => {
    expect(JSON.parse(encodeMenuLayoutFile({ fab }))).toMatchObject({ axeMenus: 1 });
  });
});
