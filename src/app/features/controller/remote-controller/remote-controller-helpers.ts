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

export function getInventoryTags(
  gameCharacter: GameCharacter,
  inventoryService: RemoteControllerInventoryContext | GameObjectInventoryService
): (DataElement | null)[] {
  const inventory = getInventory(gameCharacter.location.name, inventoryService);
  return inventory.dataElementMap.get(gameCharacter.identifier) ?? [];
}

export function getGameObjects(
  inventoryType: string,
  inventoryService: RemoteControllerInventoryContext | GameObjectInventoryService
): TabletopObject[] {
  const inventory = getInventory(inventoryType, inventoryService);
  return inventory.tabletopObjects.filter((obj) => !(obj as GameCharacter).hideInventory);
}

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
