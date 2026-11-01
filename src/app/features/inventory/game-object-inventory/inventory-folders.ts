import { computed, signal, untracked } from '@angular/core';
import { TranslateFn } from '@axe/application/i18n/translate.token';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { Network } from '@axe/core/network/network';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
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
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import {
  type InventoryRow,
  PERSONAL_INVENTORY_TAB,
} from '@axe/features/inventory/game-object-inventory/inventory-list';

/** What a tab has folded up before anything on it has been. */
const NO_FOLDERS: ReadonlySet<string> = new Set();

/** What the folders read of the inventory panel they file the pieces of. */
export interface InventoryFoldersHost {
  /** The tab on view. */
  selectTab(): string;
  /** The rows of the tab on view the reader may see. */
  visibleRows(): readonly InventoryRow[];
  /** Those of them the search and the hidden filter leave. */
  filteredRows(): readonly InventoryRow[];
  /** Whether a search is running, which opens every folder. */
  hasQuery(): boolean;
  /** Whether this reader may file pieces and keep folders, which takes being able to edit the table. */
  canEdit(): boolean;
  /** Adds pieces to the multi-select picks. */
  pick(identifiers: readonly string[]): void;
}

/**
 * The folders an inventory panel files its pieces into: which are kept, which are folded up in this
 * panel, which name is being edited, and the filing, renaming and deleting of them.
 *
 * A piece carries its folder in its own name for it, kept for every peer. The folders themselves
 * are kept with the room, except on the personal tab, whose folders this device keeps; the two may
 * share a name without being the same folder. What is folded up belongs to the panel, tab by tab.
 */
export class InventoryFolders {
  constructor(
    private readonly host: InventoryFoldersHost,
    private readonly inventory: GameObjectInventoryService,
    private readonly objectStore: ObjectStore,
    private readonly confirm: ConfirmService,
    private readonly t: TranslateFn
  ) {}

  /**
   * What is folded up, tab by tab: a tab files folders of its own, and one may share a name with a
   * folder on another without being that folder.
   */
  private readonly collapsedByTab = signal<ReadonlyMap<string, ReadonlySet<string>>>(new Map());

  /** The folders folded up on the tab in view. */
  readonly collapsedFolders = computed<ReadonlySet<string>>(
    () => this.collapsedByTab().get(this.host.selectTab()) ?? NO_FOLDERS
  );

  /** Changes what is folded up on the tab in view, leaving the other tabs as they are. */
  private updateCollapsed(change: (current: ReadonlySet<string>) => ReadonlySet<string>): void {
    const tab = this.host.selectTab();
    this.collapsedByTab.update((byTab) => new Map(byTab).set(tab, change(byTab.get(tab) ?? NO_FOLDERS)));
  }

  /**
   * Folders sort out what is kept between scenes. The table is the board in play, ordered by turn,
   * and the graveyard is what has already left it, so neither is filed.
   */
  readonly foldersApply = computed<boolean>(() => {
    const inventoryType = this.host.selectTab();
    return inventoryType !== 'table' && inventoryType !== 'graveyard';
  });

  /**
   * Whether the tab on view keeps its folders for the room rather than for this device. Anything
   * that is not the table, the graveyard or this peer's own list reads the shared one, so the test
   * has to be the same as the one that picks the inventory, not a single name.
   */
  private readonly isSharedTab = computed<boolean>(
    () => this.foldersApply() && this.host.selectTab() !== PERSONAL_INVENTORY_TAB
  );

  /** The folders the tab on view keeps, whether or not anything is filed in them. */
  readonly declaredFolderPaths = computed<string[]>(() => {
    if (!this.foldersApply()) return [];
    if (!this.isSharedTab()) return this.inventory.personalFolderPaths();
    this.inventory.inventoryVersion();
    return this.inventory.folderPaths;
  });

  private setDeclaredFolderPaths(folderPaths: string[]): void {
    if (this.isSharedTab()) {
      this.inventory.folderPaths = folderPaths;
      return;
    }
    this.inventory.setPersonalFolderPaths(folderPaths);
  }

  /** The rows the search leaves, filed into the tab's folders. */
  readonly folderTree = computed<FolderTree<InventoryRow>>(() =>
    buildFolderTree(this.host.filteredRows(), (row) => row.folderPath, this.declaredFolderPaths())
  );

  /** Whether the tab on view has any folder, kept or filed into. */
  readonly hasFolders = computed<boolean>(
    () => this.declaredFolderPaths().length > 0 || this.host.visibleRows().some((row) => row.folderPath.length > 0)
  );

  /** Whether the tab on view is drawn as a tree of its folders. */
  readonly showTree = computed<boolean>(() => this.foldersApply() && this.hasFolders());

  /** Every folder the tab on view knows of, the ones holding others among them, in order. */
  readonly knownFolderPaths = computed<string[]>(() => {
    const paths = new Set<string>();
    for (const declared of this.declaredFolderPaths()) {
      for (const path of ancestorFolderPaths(declared)) paths.add(path);
    }
    for (const row of this.host.visibleRows()) {
      for (const path of ancestorFolderPaths(row.folderPath)) paths.add(path);
    }
    return [...paths].sort((left, right) => left.localeCompare(right, 'ja', { numeric: true }));
  });

  /** A folder at the depth limit has no room for another level beneath it. */
  canNestInside(folderPath: string): boolean {
    return folderSegments(folderPath).length < MAX_FOLDER_DEPTH;
  }

  /** Whether a folder is folded up; nothing is while a search is running. */
  isFolderCollapsed(path: string): boolean {
    if (this.host.hasQuery()) return false;
    return this.collapsedFolders().has(path);
  }

  /** Folds or unfolds a folder in this panel; ignored while a search is running. */
  toggleFolder(path: string): void {
    if (this.host.hasQuery()) return;
    this.updateCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }

  /** The tabs this panel has already folded up for a reader who asked it to. */
  private readonly foldedOnOpen = new Set<string>();

  /**
   * Folds up every folder on the tab in view the first time it is looked at with any, leaving the
   * unfiled group open: the pieces in no folder are the ones a reader folding the folders away was
   * trying to get a look at.
   *
   * Folded as the list first arrives rather than as the panel is made: what there is to fold is not
   * known until the room has been read, and a panel folded before then folds nothing. Each tab files
   * its own folders, so each is folded the first time it is looked at. Not while a search is
   * running, which leaves out every folder with nothing in it that matches. Nor is a tab with no
   * folders yet counted as done: a room arriving piece by piece may bring its loose pieces before
   * its filed ones, so the first folders to turn up are folded whoever made them.
   */
  foldOnOpen(): void {
    if (!this.foldersApply() || this.host.hasQuery()) return;
    const tab = this.host.selectTab();
    if (this.foldedOnOpen.has(tab)) return;
    const tree = this.folderTree();
    if (tree.roots.length < 1) return;
    this.foldedOnOpen.add(tab);
    untracked(() => this.updateCollapsed((current) => new Set([...current, ...collectFolderPaths(tree)])));
  }

  /**
   * Counts the tab in view as folded up already, once the reader files something on it: a tab that
   * had no folders when it was first looked at would otherwise fold up the first one made there,
   * and the pieces just filed into it with it.
   */
  private leaveFoldedAsFiled(): void {
    this.foldedOnOpen.add(this.host.selectTab());
  }

  /** Folds up every folder, and the unfiled group with them; ignored while a search is running. */
  collapseAllFolders(): void {
    // A search opens every folder, so folding them now would only settle on the few that
    // survived the filter and show itself once the search is cleared.
    if (this.host.hasQuery()) return;
    const tree = this.folderTree();
    const paths = collectFolderPaths(tree);
    if (tree.loose.length > 0) paths.push('');
    this.updateCollapsed(() => new Set(paths));
  }

  /** Unfolds every folder on the tab in view. */
  expandAllFolders(): void {
    this.updateCollapsed(() => NO_FOLDERS);
  }

  /**
   * Files a character into a folder, which is kept on the character for every peer; ignored for a
   * seat that may not edit the table.
   */
  setFolder(gameObject: TabletopObject, folderPath: string): void {
    this.setFolderOf([gameObject.identifier], folderPath);
  }

  /** Makes a new numbered folder, files the piece into it and opens its name for editing. */
  createFolderFor(gameObject: TabletopObject): void {
    this.createFolderOf([gameObject.identifier]);
  }

  /**
   * Makes a new, empty numbered folder at the top or inside another, and opens its name for
   * editing.
   *
   * Does nothing inside a folder at the depth limit. On the personal tab the folder is kept on this
   * device; on the others it is kept with the room.
   */
  createFolder(parentPath = ''): void {
    if (parentPath.length > 0 && !this.canNestInside(parentPath)) return;
    this.createFolderOf([], parentPath);
  }

  /** The folder whose name is open for editing, or null for none. */
  readonly editingFolder = signal<string | null>(null);

  /** Whether the folder's name is open for editing. */
  isEditingFolder(folderPath: string): boolean {
    return this.editingFolder() === folderPath;
  }

  /**
   * Unfolds a folder and opens its name for editing; ignored for the unfiled group and for a seat
   * that may not edit the table.
   */
  startFolderRename(folderPath: string): void {
    if (!this.host.canEdit() || folderPath.length < 1) return;
    this.updateCollapsed((current) => {
      const next = new Set(current);
      next.delete(folderPath);
      return next;
    });
    this.editingFolder.set(folderPath);
  }

  /** Closes the folder name editor without renaming anything. */
  cancelFolderRename(): void {
    this.editingFolder.set(null);
  }

  /** Leaving the field is never a trap: a name that cannot be taken is dropped rather than held. */
  commitFolderRename(folderPath: string, name: string, dropOnFailure = false): void {
    if (this.editingFolder() !== folderPath) return;
    if (this.renameFolder(folderPath, name) || dropOnFailure) this.editingFolder.set(null);
  }

  /**
   * Makes a new numbered folder at the top or inside another, files the pieces into it and opens
   * its name for editing; ignored for a seat that may not edit the table.
   */
  createFolderOf(identifiers: readonly string[], parentPath = ''): void {
    if (!this.host.canEdit()) return;
    this.leaveFoldedAsFiled();
    const path = this.unusedFolderPath(parentPath);
    this.declareFolder(path);
    if (identifiers.length > 0) this.setFolderOf(identifiers, path);
    this.updateCollapsed((current) => {
      const next = new Set(current);
      for (const ancestor of ancestorFolderPaths(path)) next.delete(ancestor);
      return next;
    });
    this.editingFolder.set(path);
  }

  private unusedFolderPath(parentPath: string): string {
    const parent = normalizeFolderPath(parentPath);
    const prefix = parent.length > 0 ? `${parent}${FOLDER_SEPARATOR}` : '';
    // Numbered across the whole tree rather than among siblings: the free number under
    // フォルダ1 is 1, and a フォルダ1 inside フォルダ1 is a worse name than a number that skips.
    const taken = new Set(this.knownFolderPaths().map((path) => folderSegments(path).at(-1)));
    let index = 1;
    while (taken.has(this.t('feature.inventory.panel.defaultFolderName', { index }))) index++;
    return normalizeFolderPath(prefix + this.t('feature.inventory.panel.defaultFolderName', { index }));
  }

  private declareFolder(folderPath: string): void {
    const declared = this.declaredFolderPaths();
    if (declared.includes(folderPath)) return;
    this.setDeclaredFolderPaths([...declared, folderPath]);
    this.inventory.notifyInventoryUpdate();
  }

  private undeclareFoldersUnder(folderPath: string): void {
    const declared = this.declaredFolderPaths();
    const kept = declared.filter((entry) => !isDescendantFolderPath(entry, folderPath));
    if (kept.length === declared.length) return;
    this.setDeclaredFolderPaths(kept);
  }

  /** Renames a folder and every folder inside it; false where the name cannot be taken, so the caller can leave the editor open on it. */
  renameFolder(folderPath: string, name: string): boolean {
    if (!this.host.canEdit()) return false;
    const segments = folderSegments(folderPath);
    const renamed = normalizeFolderPath([...segments.slice(0, -1), name].join(FOLDER_SEPARATOR));
    if (renamed.length < 1) return false;
    if (renamed === folderPath) return true;
    // Renaming into a deeper place would push the levels below past the limit, where they would be
    // cut off and folders that held different characters would silently become one.
    const deepest = this.deepestDepthUnder(folderPath);
    if (folderSegments(renamed).length + deepest - segments.length > MAX_FOLDER_DEPTH) return false;

    for (const character of this.charactersUnder(folderPath)) {
      character.folderName = rewriteFolderPath(normalizeFolderPath(character.folderName), folderPath, renamed);
    }
    this.setDeclaredFolderPaths([
      ...new Set(this.declaredFolderPaths().map((entry) => rewriteFolderPath(entry, folderPath, renamed))),
    ]);
    this.updateCollapsed(
      (current) => new Set([...current].map((entry) => rewriteFolderPath(entry, folderPath, renamed)))
    );
    this.inventory.notifyInventoryUpdate();
    return true;
  }

  private deepestDepthUnder(folderPath: string): number {
    let deepest = folderSegments(folderPath).length;
    for (const path of [...this.declaredFolderPaths(), ...this.host.visibleRows().map((row) => row.folderPath)]) {
      if (!isDescendantFolderPath(path, folderPath)) continue;
      deepest = Math.max(deepest, folderSegments(path).length);
    }
    return deepest;
  }

  /**
   * Removes a folder and every folder inside it.
   *
   * The pieces filed there become unfiled rather than deleted, and the user is asked first when
   * there are any. Does nothing for a seat that may not edit the table.
   */
  async deleteFolder(folderPath: string): Promise<void> {
    if (!this.host.canEdit()) return;
    const characters = this.charactersUnder(folderPath);
    if (characters.length > 0) {
      const asked = await this.confirm.ask({
        message: this.t('feature.inventory.contextMenu.confirmDeleteFolder', {
          name: folderPath,
          count: characters.length,
        }),
        okLabel: this.t('common.button.delete'),
        danger: true,
      });
      if (!asked) return;
    }
    this.undeclareFoldersUnder(folderPath);
    this.setFolderOf(
      characters.map((character) => character.identifier),
      ''
    );
    this.inventory.notifyInventoryUpdate();
  }

  /**
   * Adds every listed piece in a folder and the folders inside it to the multi-select picks; an
   * empty path takes the unfiled group.
   */
  selectFolder(folderPath: string): void {
    const rows =
      folderPath.length < 1
        ? this.folderTree().loose
        : this.host.filteredRows().filter((row) => isDescendantFolderPath(row.folderPath, folderPath));
    this.host.pick(rows.map((row) => row.identifier));
  }

  /**
   * A character carries one folder name wherever it stands, so a rename has to reach it even
   * while it is on the table. Scoping this to the tab on view would leave those behind, and the
   * folder would come back the moment the character does.
   *
   * It stops at the edge of the scope on view, though. A folder kept for this device and one kept
   * for the room are separate folders that only share a name, so a rename of one must not empty
   * the other.
   */
  private charactersUnder(folderPath: string): GameCharacter[] {
    const shared = this.isSharedTab();
    return this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((character) => (character.location.name === Network.peerId) !== shared)
      .filter((character) => isDescendantFolderPath(normalizeFolderPath(character.folderName), folderPath));
  }

  /** Files pieces into a folder, or out of every folder for the empty path; ignored for a seat that may not edit the table. */
  setFolderOf(identifiers: Iterable<string>, folderPath: string): void {
    if (!this.host.canEdit()) return;
    this.leaveFoldedAsFiled();
    const normalized = normalizeFolderPath(folderPath);
    for (const identifier of identifiers) {
      const character = this.objectStore.get<GameCharacter>(identifier);
      if (character instanceof GameCharacter) character.folderName = normalized;
    }
    this.inventory.notifyInventoryUpdate();
  }
}
