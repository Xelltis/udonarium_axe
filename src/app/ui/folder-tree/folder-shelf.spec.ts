import { FolderShelf, type FolderShelfHost } from '@axe/ui/folder-tree/folder-shelf';

describe('FolderShelf', () => {
  interface Thing {
    identifier: string;
    folderName: string;
  }

  function shelfOf(things: Thing[], declared: string[] = [], options: { canEdit?: boolean; agree?: boolean } = {}) {
    const host: FolderShelfHost<Thing> & { declaredNow: string[]; asked: string[] } = {
      declaredNow: [...declared],
      asked: [],
      items: () => things,
      declared: () => host.declaredNow,
      setDeclared: (paths) => (host.declaredNow = [...paths]),
      canEdit: () => options.canEdit ?? true,
      defaultFolderName: (index) => `フォルダ${index}`,
      confirmDelete: async (path, count) => {
        host.asked.push(`${path}:${count}`);
        return options.agree ?? true;
      },
    };
    return { shelf: new FolderShelf(host), host };
  }

  it('makes a numbered folder, inside another where asked, and opens its name', () => {
    const { shelf, host } = shelfOf([{ identifier: 'a', folderName: 'フォルダ1' }]);

    expect(shelf.createFolder()).toBe('フォルダ2');
    expect(shelf.createFolder('第1話')).toBe('第1話/フォルダ3');
    expect(host.declaredNow).toEqual(['フォルダ2', '第1話/フォルダ3']);
    expect(shelf.editing()).toBe('第1話/フォルダ3');
  });

  it('makes no folder deeper than folders go, nor for a reader who may not change them', () => {
    expect(shelfOf([]).shelf.createFolder('a/b/c/d')).toBeNull();
    expect(shelfOf([], [], { canEdit: false }).shelf.createFolder()).toBeNull();
  });

  it('renames a folder and the folders inside it, refiling what is in them', () => {
    const things = [
      { identifier: 'a', folderName: '村' },
      { identifier: 'b', folderName: '村/夜' },
      { identifier: 'c', folderName: '洞窟' },
    ];
    const { shelf, host } = shelfOf(things, ['村/空き家']);

    expect(shelf.renameFolder('村', '町')).toBe(true);

    expect(things.map((thing) => thing.folderName)).toEqual(['町', '町/夜', '洞窟']);
    expect(host.declaredNow).toEqual(['町/空き家']);
  });

  it('takes no name that is empty, or that would push the folders inside past the deepest', () => {
    const things = [{ identifier: 'a', folderName: 'a/b/c/d' }];
    const { shelf } = shelfOf(things);

    expect(shelf.renameFolder('a', ' ')).toBe(false);
    expect(shelf.renameFolder('a', 'x/y')).toBe(false);
    expect(things[0].folderName).toBe('a/b/c/d');
  });

  it('deletes a folder after asking, putting what was in it back into no folder', async () => {
    const things = [
      { identifier: 'a', folderName: '村' },
      { identifier: 'b', folderName: '村/夜' },
      { identifier: 'c', folderName: '洞窟' },
    ];
    const { shelf, host } = shelfOf(things, ['村/空き家', '洞窟']);

    await shelf.deleteFolder('村');

    expect(host.asked).toEqual(['村:2']);
    expect(things.map((thing) => thing.folderName)).toEqual(['', '', '洞窟']);
    expect(host.declaredNow).toEqual(['洞窟']);
  });

  it('keeps the folder where the reader says no', async () => {
    const things = [{ identifier: 'a', folderName: '村' }];
    const { shelf } = shelfOf(things, [], { agree: false });

    await shelf.deleteFolder('村');

    expect(things[0].folderName).toBe('村');
  });

  it('files things into a folder, tidying its path, or into none', () => {
    const things = [{ identifier: 'a', folderName: '' }];
    const { shelf } = shelfOf(things);

    shelf.fileInto(things, ' 第1話／村 ');
    expect(things[0].folderName).toBe('第1話/村');

    shelf.fileInto(things, '');
    expect(things[0].folderName).toBe('');
  });

  it('folds and unfolds a folder on this screen', () => {
    const { shelf } = shelfOf([]);

    shelf.toggle('村');
    expect(shelf.isCollapsed('村')).toBe(true);
    shelf.toggle('村');
    expect(shelf.isCollapsed('村')).toBe(false);
  });
});
