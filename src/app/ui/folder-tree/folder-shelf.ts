import { signal } from '@angular/core';
import {
  ancestorFolderPaths,
  FOLDER_SEPARATOR,
  folderSegments,
  isDescendantFolderPath,
  MAX_FOLDER_DEPTH,
  normalizeFolderPath,
  rewriteFolderPath,
} from '@axe/domain/folder/folder-path';
import { buildFolderTree, collectFolderPaths, type FolderTree } from '@axe/domain/folder/folder-tree';

/** Something filed in a folder by the path it keeps. */
export interface FiledThing {
  readonly identifier: string;
  folderName: string;
}

/** What a shelf of folders works on: the things filed, the folders kept empty, and who may change them. */
export interface FolderShelfHost<T extends FiledThing> {
  /** Everything that may be filed, in the order it is listed. */
  items(): readonly T[];
  /** The folders made with nothing filed in them yet, as they are kept. */
  declared(): readonly string[];
  setDeclared(paths: readonly string[]): void;
  canEdit(): boolean;
  /** The name a new folder is given, numbered. */
  defaultFolderName(index: number): string;
  /** Asks before a folder holding things is deleted, those things going back to no folder. */
  confirmDelete(path: string, count: number): Promise<boolean>;
}

/**
 * Folders for a list of things, as the inventory files its characters: each thing keeps the path
 * of its folder, such as `第1話/村`, at most four deep, and folders made with nothing in them yet
 * are kept beside the things. Folding a folder is this screen's alone.
 */
export class FolderShelf<T extends FiledThing> {
  /** The folders folded on this screen. */
  readonly collapsed = signal<ReadonlySet<string>>(new Set());
  /** The folder whose name is open for editing, or null for none. */
  readonly editing = signal<string | null>(null);

  constructor(private readonly host: FolderShelfHost<T>) {}

  /** The things arranged in their folders, with the folders kept empty. */
  tree(items: readonly T[] = this.host.items()): FolderTree<T> {
    return buildFolderTree(items, (item) => item.folderName, this.host.declared());
  }

  /** Every folder there is, each before the folders inside it. */
  knownPaths(): string[] {
    return collectFolderPaths(this.tree());
  }

  isCollapsed(path: string): boolean {
    return this.collapsed().has(path);
  }

  toggle(path: string): void {
    this.collapsed.update((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }

  /**
   * Makes a new numbered folder at the top or inside another and opens its name for editing.
   * Answers its path, or null where it may not be made: for a reader who may not change the
   * folders, or inside a folder already as deep as folders go.
   */
  createFolder(parentPath = ''): string | null {
    if (!this.host.canEdit()) return null;
    const parent = normalizeFolderPath(parentPath);
    if (folderSegments(parent).length >= MAX_FOLDER_DEPTH) return null;
    const prefix = parent.length > 0 ? `${parent}${FOLDER_SEPARATOR}` : '';
    const taken = new Set(this.knownPaths().map((path) => folderSegments(path).at(-1)));
    let index = 1;
    while (taken.has(this.host.defaultFolderName(index))) index++;
    const path = normalizeFolderPath(prefix + this.host.defaultFolderName(index));
    this.host.setDeclared([...this.host.declared(), path]);
    this.collapsed.update((current) => {
      const next = new Set(current);
      for (const ancestor of ancestorFolderPaths(path)) next.delete(ancestor);
      return next;
    });
    this.editing.set(path);
    return path;
  }

  startRename(path: string): void {
    if (this.host.canEdit() && path.length > 0) this.editing.set(path);
  }

  cancelRename(): void {
    this.editing.set(null);
  }

  /** Leaving the field is never a trap: a name that cannot be taken is dropped rather than held. */
  commitRename(path: string, name: string, dropOnFailure = false): void {
    if (this.editing() !== path) return;
    if (this.renameFolder(path, name) || dropOnFailure) this.editing.set(null);
  }

  /**
   * Renames a folder and every folder inside it, refiling what is in them; false where the name
   * cannot be taken, empty or pushing the folders inside past the deepest a folder goes.
   */
  renameFolder(path: string, name: string): boolean {
    if (!this.host.canEdit()) return false;
    const segments = folderSegments(path);
    const renamed = normalizeFolderPath([...segments.slice(0, -1), name].join(FOLDER_SEPARATOR));
    if (renamed.length < 1) return false;
    if (renamed === path) return true;
    const deepest = Math.max(
      segments.length,
      ...this.knownPaths()
        .filter((known) => isDescendantFolderPath(known, path))
        .map((known) => folderSegments(known).length)
    );
    if (folderSegments(renamed).length + deepest - segments.length > MAX_FOLDER_DEPTH) return false;
    for (const item of this.itemsUnder(path)) {
      item.folderName = rewriteFolderPath(normalizeFolderPath(item.folderName), path, renamed);
    }
    this.host.setDeclared([...new Set(this.host.declared().map((entry) => rewriteFolderPath(entry, path, renamed)))]);
    this.collapsed.update((current) => new Set([...current].map((entry) => rewriteFolderPath(entry, path, renamed))));
    return true;
  }

  /**
   * Removes a folder and every folder inside it. What was filed there goes back to no folder rather
   * than being deleted, and the reader is asked first when there is any.
   */
  async deleteFolder(path: string): Promise<void> {
    if (!this.host.canEdit()) return;
    const items = this.itemsUnder(path);
    if (items.length > 0 && !(await this.host.confirmDelete(path, items.length))) return;
    if (!this.host.canEdit()) return;
    this.host.setDeclared(this.host.declared().filter((entry) => !isDescendantFolderPath(entry, path)));
    for (const item of this.itemsUnder(path)) item.folderName = '';
  }

  /** Files things into a folder, or into none for an empty path. */
  fileInto(items: readonly T[], path: string): void {
    if (!this.host.canEdit()) return;
    const folder = normalizeFolderPath(path);
    for (const item of items) {
      if (normalizeFolderPath(item.folderName) !== folder) item.folderName = folder;
    }
  }

  private itemsUnder(path: string): T[] {
    return this.host.items().filter((item) => isDescendantFolderPath(normalizeFolderPath(item.folderName), path));
  }
}
