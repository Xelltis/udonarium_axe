import { TranslateFn } from '@axe/application/i18n/translate.token';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import { Network } from '@axe/core/index';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

interface InventoryContextMenuCallbacks {
  showDetail: (character: GameCharacter) => void;
  showChatPalette: (character: GameCharacter) => void;
  showRemoteController: (character: GameCharacter) => void;
  focusOnTable: (gameObject: TabletopObject) => void;
  cloneGameObject: (gameObject: TabletopObject) => void;
  deleteGameObject: (gameObject: TabletopObject) => void;
  setFolder: (gameObject: TabletopObject, folderPath: string) => void;
  createFolder: (gameObject: TabletopObject) => void;
}

export interface InventoryFolderAssignCallbacks {
  setFolder: (folderPath: string) => void;
  createFolder: () => void;
}

/**
 * The menu for filing pieces into a folder.
 *
 * Each known folder gets an entry, with the current one marked, followed by a new folder entry and
 * a remove-from-folder entry. The removal is left out when the pieces are already unfiled; a null
 * current path stands for several pieces at once and always offers it.
 */
export function buildInventoryFolderAssignMenu(
  currentPath: string | null,
  folderPaths: readonly string[],
  callbacks: InventoryFolderAssignCallbacks,
  t: TranslateFn
): ContextMenuAction[] {
  const actions: ContextMenuAction[] = folderPaths.map((folderPath) => ({
    name: `${currentPath === folderPath ? '◉' : '○'} ${folderPath}`,
    action: () => callbacks.setFolder(folderPath),
  }));

  if (actions.length > 0) actions.push(ContextMenuSeparator);
  actions.push({
    name: t('feature.inventory.contextMenu.newFolder'),
    action: () => callbacks.createFolder(),
  });
  if (currentPath == null || currentPath.length > 0) {
    actions.push({
      name: t('feature.inventory.contextMenu.removeFromFolder'),
      action: () => callbacks.setFolder(''),
    });
  }

  return actions;
}

export interface InventoryFolderContextMenuCallbacks {
  renameFolder: () => void;
  createSubfolder: () => void;
  deleteFolder: () => void;
  selectFolder: () => void;
  collapseAll: () => void;
  expandAll: () => void;
}

/**
 * The context menu of a folder heading in the inventory.
 *
 * Rename, new subfolder and delete appear only for a named folder and a seat that may edit, and
 * the subfolder entry is dropped at the depth limit. Selecting the folder's pieces appears while
 * picking several; collapsing and expanding every folder are always offered.
 */
export function buildInventoryFolderContextMenu(
  folderPath: string,
  isMultiMove: boolean,
  callbacks: InventoryFolderContextMenuCallbacks,
  t: TranslateFn,
  canNest = true,
  canEdit = true
): ContextMenuAction[] {
  const actions: ContextMenuAction[] = [];

  // Every one of these ends in a handler that turns back at the same check, so offering them to
  // someone who may not edit the table gives an entry that answers with nothing at all.
  if (canEdit && folderPath.length > 0) {
    actions.push({
      name: t('feature.inventory.contextMenu.renameFolder'),
      action: () => callbacks.renameFolder(),
    });
    if (canNest) {
      actions.push({
        name: t('feature.inventory.contextMenu.newSubfolder'),
        action: () => callbacks.createSubfolder(),
      });
    }
    actions.push({
      name: t('feature.inventory.contextMenu.deleteFolder'),
      action: () => callbacks.deleteFolder(),
    });
    actions.push(ContextMenuSeparator);
  }

  if (isMultiMove) {
    actions.push({
      name: t('feature.inventory.contextMenu.selectFolder'),
      action: () => callbacks.selectFolder(),
    });
    actions.push(ContextMenuSeparator);
  }

  actions.push({ name: t('feature.inventory.contextMenu.collapseAll'), action: () => callbacks.collapseAll() });
  actions.push({ name: t('feature.inventory.contextMenu.expandAll'), action: () => callbacks.expandAll() });

  return actions;
}

/**
 * The context menu of a piece's row in the inventory.
 *
 * It opens the sheet, finds the piece on the table when it is there, and outside the graveyard
 * opens the chat palette and remote controller and hides or shows the row in the inventory. It
 * then offers the folder submenu, a move to each other location, delete for a piece in the
 * graveyard, and copy.
 */
export function buildInventoryObjectContextMenu(
  gameObject: TabletopObject,
  inventoryService: GameObjectInventoryService,
  callbacks: InventoryContextMenuCallbacks,
  t: TranslateFn,
  /** Null where folders do not apply, which leaves the submenu out rather than offering an empty one. */
  folderPaths: readonly string[] | null = null
): ContextMenuAction[] {
  const actions: ContextMenuAction[] = [];

  actions.push({
    name: t('feature.character.contextMenu.showDetail'),
    action: () => callbacks.showDetail(gameObject as GameCharacter),
  });

  if (gameObject.location.name === 'table') {
    actions.push({
      name: t('feature.inventory.contextMenu.showOnTable'),
      action: () => callbacks.focusOnTable(gameObject),
    });
  }

  if (gameObject.location.name !== 'graveyard') {
    actions.push({
      name: t('feature.character.contextMenu.showChatPalette'),
      action: () => callbacks.showChatPalette(gameObject as GameCharacter),
    });
    actions.push({
      name: t('feature.character.contextMenu.showRemoteController'),
      action: () => callbacks.showRemoteController(gameObject as GameCharacter),
    });
    const character = gameObject as GameCharacter;
    actions.push(
      character.hideInventory
        ? {
            name: t('feature.character.contextMenu.hideInventoryOn'),
            action: () => {
              character.hideInventory = false;
              inventoryService.notifyInventoryUpdate();
              SoundEffect.play(PresetSound.sweep);
            },
          }
        : {
            name: t('feature.character.contextMenu.hideInventoryOff'),
            action: () => {
              character.hideInventory = true;
              inventoryService.notifyInventoryUpdate();
              SoundEffect.play(PresetSound.sweep);
            },
          }
    );
  }

  if (folderPaths) {
    actions.push({
      name: t('feature.inventory.contextMenu.folder'),
      subActions: buildInventoryFolderAssignMenu(
        (gameObject as GameCharacter).folderName ?? '',
        folderPaths,
        {
          setFolder: (folderPath) => callbacks.setFolder(gameObject, folderPath),
          createFolder: () => callbacks.createFolder(gameObject),
        },
        t
      ),
    });
  }

  actions.push(ContextMenuSeparator);
  for (const location of inventoryLocations(t)) {
    if (gameObject.location.name === location.name) continue;
    actions.push({
      name: location.alias,
      action: () => {
        gameObject.setLocation(location.name);
        SoundEffect.play(PresetSound.piecePut);
      },
    });
  }

  if (gameObject.location.name === 'graveyard') {
    actions.push({
      name: t('feature.tabletop.contextMenu.delete'),
      action: () => {
        callbacks.deleteGameObject(gameObject);
        SoundEffect.play(PresetSound.sweep);
      },
    });
  }

  actions.push(ContextMenuSeparator);
  actions.push({
    name: t('feature.tabletop.contextMenu.copy'),
    action: () => {
      callbacks.cloneGameObject(gameObject);
      SoundEffect.play(PresetSound.piecePut);
    },
  });

  return actions;
}

interface MultiMoveContextMenuCallbacks {
  multiMove: (location: string) => void;
  toggleMultiMove: () => void;
  multiDelete: () => void;
}

/**
 * The menu for the pieces picked in multi-select.
 *
 * It offers a move to each location other than the tab on view, and delete when that tab is the
 * graveyard. Each entry leaves multi-select once it has run.
 */
export function buildInventoryMultiMoveContextMenu(
  selectedTab: string,
  callbacks: MultiMoveContextMenuCallbacks,
  t: TranslateFn
): ContextMenuAction[] {
  const actions: ContextMenuAction[] = [];

  for (const location of inventoryLocations(t)) {
    if (selectedTab === location.name) continue;
    actions.push({
      name: location.alias,
      action: () => {
        callbacks.multiMove(location.name);
        callbacks.toggleMultiMove();
        SoundEffect.play(PresetSound.piecePut);
      },
    });
  }

  if (selectedTab === 'graveyard') {
    actions.push({
      name: t('feature.inventory.contextMenu.multiDelete'),
      action: () => {
        callbacks.multiDelete();
        callbacks.toggleMultiMove();
        SoundEffect.play(PresetSound.sweep);
      },
    });
  }

  return actions;
}

function inventoryLocations(t: TranslateFn): Array<{ name: string; alias: string }> {
  return [
    { name: 'table', alias: t('feature.inventory.contextMenu.moveTable') },
    { name: 'common', alias: t('feature.inventory.contextMenu.moveCommon') },
    { name: Network.peerId, alias: t('feature.inventory.contextMenu.movePersonal') },
    { name: 'graveyard', alias: t('feature.inventory.contextMenu.moveGraveyard') },
  ];
}
