import { FOLDER_SEPARATOR, folderSegments } from '@axe/domain/character/character-folder';

export interface FolderNode<T> {
  readonly path: string;
  readonly name: string;
  readonly depth: number;
  readonly items: T[];
  readonly children: FolderNode<T>[];
  readonly totalCount: number;
}

export interface FolderTree<T> {
  readonly roots: FolderNode<T>[];
  readonly loose: T[];
}

interface FolderBuilder<T> {
  path: string;
  name: string;
  depth: number;
  items: T[];
  children: Map<string, FolderBuilder<T>>;
}

/**
 * Arranges items into a folder tree by their folder paths.
 *
 * Declared paths open their folders even with nothing in them, and items without a path are kept
 * loose. Folders at each level are sorted by name with numbers in numeric order, and each counts
 * the items in it and in every folder below.
 */
export function buildFolderTree<T>(
  items: readonly T[],
  pathOf: (item: T) => string,
  declaredPaths: readonly string[] = []
): FolderTree<T> {
  const roots = new Map<string, FolderBuilder<T>>();
  const loose: T[] = [];

  for (const declaredPath of declaredPaths) openFolder(roots, folderSegments(declaredPath));

  for (const item of items) {
    const segments = folderSegments(pathOf(item));
    if (segments.length < 1) {
      loose.push(item);
      continue;
    }
    openFolder(roots, segments)?.items.push(item);
  }

  return { roots: settleLevel(roots), loose };
}

function openFolder<T>(roots: Map<string, FolderBuilder<T>>, segments: readonly string[]): FolderBuilder<T> | null {
  let level = roots;
  let path = '';
  let node: FolderBuilder<T> | null = null;
  for (const [depth, segment] of segments.entries()) {
    path = path.length < 1 ? segment : `${path}${FOLDER_SEPARATOR}${segment}`;
    let next = level.get(segment);
    if (!next) {
      next = { path, name: segment, depth, items: [], children: new Map() };
      level.set(segment, next);
    }
    node = next;
    level = next.children;
  }
  return node;
}

/** Every folder path in the tree, each folder before the folders inside it. */
export function collectFolderPaths<T>(tree: FolderTree<T>): string[] {
  const paths: string[] = [];
  const walk = (nodes: readonly FolderNode<T>[]) => {
    for (const node of nodes) {
      paths.push(node.path);
      walk(node.children);
    }
  };
  walk(tree.roots);
  return paths;
}

/** The folder's own path followed by the path of every folder beneath it. */
export function descendantFolderPaths<T>(node: FolderNode<T>): string[] {
  const paths = [node.path];
  for (const child of node.children) paths.push(...descendantFolderPaths(child));
  return paths;
}

function settleLevel<T>(level: Map<string, FolderBuilder<T>>): FolderNode<T>[] {
  return [...level.values()]
    .map((builder) => {
      const children = settleLevel(builder.children);
      return {
        path: builder.path,
        name: builder.name,
        depth: builder.depth,
        items: builder.items,
        children,
        totalCount: builder.items.length + children.reduce((sum, child) => sum + child.totalCount, 0),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, 'ja', { numeric: true }));
}
