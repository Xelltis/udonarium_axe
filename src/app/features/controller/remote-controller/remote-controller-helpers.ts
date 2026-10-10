import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { ObjectInventory } from '@axe/application/inventory/object-inventory';
import { Network } from '@axe/core/index';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

export interface RemoteControllerInventoryContext {
  tableInventory: ObjectInventory;
  commonInventory: ObjectInventory;
  privateInventory: ObjectInventory;
  graveyardInventory: ObjectInventory;
}

/**
 * The translation key naming an inventory tab: the table, this user's personal inventory, the
 * graveyard, or shared for anything else.
 */
export function getTabTitleKey(inventoryType: string): string {
  switch (inventoryType) {
    case 'table':
      return 'feature.controller.remote.tabTable';
    case Network.peerId:
      return 'feature.controller.remote.tabPersonal';
    case 'graveyard':
      return 'feature.controller.remote.tabGraveyard';
    default:
      return 'feature.controller.remote.tabCommon';
  }
}

/** The fixed Japanese name of an inventory tab, for places that do not go through translation. */
export function getTabTitle(inventoryType: string): string {
  switch (inventoryType) {
    case 'table':
      return 'テーブル';
    case Network.peerId:
      return '個人';
    case 'graveyard':
      return '墓場';
    default:
      return '共有';
  }
}

/**
 * The inventory behind a tab: the table, this user's personal inventory, the graveyard, or the
 * shared inventory for anything else.
 */
export function getInventory(
  inventoryType: string,
  inventoryService: RemoteControllerInventoryContext | GameObjectInventoryService
): ObjectInventory {
  switch (inventoryType) {
    case 'table':
      return inventoryService.tableInventory;
    case Network.peerId:
      return inventoryService.privateInventory;
    case 'graveyard':
      return inventoryService.graveyardInventory;
    default:
      return inventoryService.commonInventory;
  }
}

/**
 * The data elements the inventory list shows for a character, taken from the inventory it currently
 * sits in.
 */
export function getInventoryTags(
  gameCharacter: GameCharacter,
  inventoryService: RemoteControllerInventoryContext | GameObjectInventoryService
): (DataElement | null)[] {
  const inventory = getInventory(gameCharacter.location.name, inventoryService);
  return inventory.dataElementMap.get(gameCharacter.identifier) ?? [];
}

/** The pieces in an inventory tab, leaving out characters hidden from the inventory. */
export function getGameObjects(
  inventoryType: string,
  inventoryService: RemoteControllerInventoryContext | GameObjectInventoryService
): TabletopObject[] {
  const inventory = getInventory(inventoryType, inventoryService);
  return inventory.tabletopObjects.filter((obj) => !(obj as GameCharacter).hideInventory);
}

/**
 * The characters in a list that an operation of the remote controller applies to.
 *
 * With `checkedOnly` only those ticked as targets count; otherwise every one does. Characters
 * hidden from the inventory never count.
 */
export function getTargetCharacters(objectList: TabletopObject[], checkedOnly: boolean): GameCharacter[] {
  const gameCharacters: GameCharacter[] = [];
  for (const object of objectList) {
    const gameChar = object as GameCharacter;
    if (gameChar.hideInventory) continue;
    if (gameChar.targeted || !checkedOnly) {
      gameCharacters.push(gameChar);
    }
  }
  return gameCharacters;
}
