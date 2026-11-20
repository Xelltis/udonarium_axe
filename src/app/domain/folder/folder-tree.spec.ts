import {
  buildFolderTree,
  collectFolderPaths,
  descendantFolderPaths,
  type FolderNode,
  folderSiblingsOf,
  numberInOrder,
  withFolderInOrder,
  withMovedInFolder,
} from '@axe/domain/folder/folder-tree';

interface Item {
  name: string;
  folder: string;
}

function item(name: string, folder = ''): Item {
  return { name, folder };
}

function treeOf(...items: Item[]) {
  return buildFolderTree(items, (entry) => entry.folder);
}

function findNode(nodes: readonly FolderNode<Item>[], path: string): FolderNode<Item> {
  const found = tryFind(nodes, path);
  if (!found) throw new Error(`no folder at ${path}`);
  return found;
}

function tryFind(nodes: readonly FolderNode<Item>[], path: string): FolderNode<Item> | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    const found = tryFind(node.children, path);
    if (found) return found;
  }
  return null;
}

describe('buildFolderTree()', () => {
  it('leaves what has no folder loose', () => {
    const tree = treeOf(item('ゴブリン'), item('村長', '第1話'));

    expect(tree.loose.map((entry) => entry.name)).toEqual(['ゴブリン']);
    expect(tree.roots.map((node) => node.path)).toEqual(['第1話']);
  });

  it('puts what shares a folder together', () => {
    const tree = treeOf(item('ゴブリンA', '第1話'), item('ゴブリンB', '第1話'));

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].items.map((entry) => entry.name)).toEqual(['ゴブリンA', 'ゴブリンB']);
  });

  it('opens a level for every step of the path', () => {
    const tree = treeOf(item('ゴブリン', '第1話/洞窟/最奥'));

    expect(collectFolderPaths(tree)).toEqual(['第1話', '第1話/洞窟', '第1話/洞窟/最奥']);
  });

  it('opens the levels in between even with nothing of their own in them', () => {
    const tree = treeOf(item('ゴブリン', '第1話/洞窟'));

    expect(tree.roots[0].items).toEqual([]);
    expect(tree.roots[0].children[0].items.map((entry) => entry.name)).toEqual(['ゴブリン']);
  });

  it('counts what sits below a folder as well as in it', () => {
    const tree = treeOf(item('村長', '第1話'), item('ゴブリンA', '第1話/洞窟'), item('ゴブリンB', '第1話/洞窟'));

    expect(findNode(tree.roots, '第1話').totalCount).toBe(3);
    expect(findNode(tree.roots, '第1話/洞窟').totalCount).toBe(2);
  });

  it('reads the numbers in folder names as numbers', () => {
    const tree = treeOf(item('a', '第10話'), item('b', '第2話'), item('c', '第1話'));

    expect(tree.roots.map((node) => node.name)).toEqual(['第1話', '第2話', '第10話']);
  });

  it('keeps the order it was handed inside a folder, so the sorting still stands', () => {
    const tree = treeOf(item('3番目', '第1話'), item('1番目', '第1話'), item('2番目', '第1話'));

    expect(tree.roots[0].items.map((entry) => entry.name)).toEqual(['3番目', '1番目', '2番目']);
  });

  it('normalizes a rough path before grouping by it', () => {
    const tree = treeOf(item('a', ' 第1話 / 洞窟 '), item('b', '第1話//洞窟'));

    expect(collectFolderPaths(tree)).toEqual(['第1話', '第1話/洞窟']);
    expect(findNode(tree.roots, '第1話/洞窟').items).toHaveLength(2);
  });

  it('opens a folder it was told about even with nothing in it', () => {
    const tree = buildFolderTree([item('ゴブリン')], (entry) => entry.folder, ['第1話']);

    expect(tree.roots.map((node) => node.path)).toEqual(['第1話']);
    expect(tree.roots[0].totalCount).toBe(0);
    expect(tree.loose).toHaveLength(1);
  });

  it('opens every level of a folder it was told about', () => {
    const tree = buildFolderTree([], (entry: Item) => entry.folder, ['第1話/洞窟']);

    expect(collectFolderPaths(tree)).toEqual(['第1話', '第1話/洞窟']);
  });

  it('puts what is in a folder into the one it was told about rather than beside it', () => {
    const tree = buildFolderTree([item('ゴブリン', '第1話')], (entry) => entry.folder, ['第1話']);

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].totalCount).toBe(1);
  });

  it('opens no folder at all when nothing is in one', () => {
    const tree = treeOf(item('ゴブリン'), item('村長'));

    expect(tree.roots).toEqual([]);
    expect(tree.loose).toHaveLength(2);
  });
});

describe('descendantFolderPaths()', () => {
  it('names the folder and everything under it', () => {
    const tree = treeOf(item('a', '第1話/洞窟/最奥'), item('b', '第1話/村'));

    expect(descendantFolderPaths(findNode(tree.roots, '第1話')).sort()).toEqual([
      '第1話',
      '第1話/村',
      '第1話/洞窟',
      '第1話/洞窟/最奥',
    ]);
  });
});

describe('withFolderInOrder()', () => {
  it('puts one folder’s things in the order given, where they stood together, the rest left alone', () => {
    const list = [item('a', '村'), item('b'), item('c', '村'), item('d', '洞窟'), item('e', '村')];
    const [a, b, c, d, e] = list;

    expect(withFolderInOrder(list, (entry) => entry.folder, '村', [e, a, c])).toEqual([e, b, a, d, c]);
  });
});

describe('withMovedInFolder()', () => {
  const filed = (name: string, folderName = '') => ({ name, folderName, order: 0 });

  it('moves a thing to a place among the others of its folder, the rest left where they stand', () => {
    const list = [filed('a', '村'), filed('b'), filed('c', '村'), filed('d', '洞窟'), filed('e', ' 村 ')];
    const [a, b, c, d, e] = list;

    expect(folderSiblingsOf(list, a)).toEqual([a, c, e]);
    expect(withMovedInFolder(list, e, 0)).toEqual([e, b, a, d, c]);
    expect(withMovedInFolder(list, a, Infinity)).toEqual([c, b, e, d, a]);
    expect(withMovedInFolder(list, c, -3)).toEqual([c, b, a, d, e]);
  });

  it('numbers the list from 1, writing only the numbers that change', () => {
    const list = [filed('a'), filed('b'), filed('c')];
    list[1].order = 2;
    const written: string[] = [];
    const watched = list.map((each) =>
      Object.defineProperty({ ...each }, 'order', {
        get: () => each.order,
        set: (value: number) => {
          written.push(each.name);
          each.order = value;
        },
      })
    );

    numberInOrder(watched);

    expect(list.map((each) => each.order)).toEqual([1, 2, 3]);
    expect(written).toEqual(['a', 'c']);
  });
});
