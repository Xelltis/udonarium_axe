import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { ObjectInventory } from '@axe/application/inventory/object-inventory';
import { Network } from '@axe/core/index';
import { GameCharacter } from '@axe/domain/character/game-character';
import { isChangeableElementType } from '@axe/domain/character/status-accessor';
import { DataElement, DataElementRole, DataElementType } from '@axe/domain/data/data-element';
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

export interface ResourceChoice {
  /** What the item is called, which is what an operation is written against. */
  name: string;
  /** Whether it has a maximum as well as a value, which is two buttons rather than one. */
  isResource: boolean;
}

export interface ControllableResources {
  /** The items the room shows of everybody, in the order the room lists them. */
  tagged: ResourceChoice[];
  /** Everything else the pieces carry, in the order their sheets read. */
  others: ResourceChoice[];
}

/**
 * What can be operated on across these pieces.
 *
 * An item is operated on by name, so the pieces being worked on are what decides the buttons:
 * one that only somebody else carries is still theirs to move, and one written onto a sheet
 * mid-session is there to press as soon as it exists.
 *
 * A name the same sheet carries twice is left out. Nothing can say which of the two is meant,
 * so a button for it would do nothing at all.
 */
export function controllableResourcesOf(
  characters: readonly GameCharacter[],
  dataTags: readonly string[]
): ControllableResources {
  const found = new Map<string, boolean>();
  for (const character of characters) {
    for (const [name, isResource] of controllableNamesOf(character)) {
      found.set(name, (found.get(name) ?? false) || isResource);
    }
  }

  const taggedNames: string[] = [];
  for (const tag of dataTags) {
    const name = tag.trim();
    if (found.has(name) && !taggedNames.includes(name)) taggedNames.push(name);
  }

  const tagged = taggedNames.map((name) => ({ name, isResource: found.get(name) === true }));
  const others = [...found]
    .filter(([name]) => !taggedNames.includes(name))
    .map(([name, isResource]) => ({ name, isResource }));
  return { tagged, others };
}

function controllableNamesOf(character: GameCharacter): Map<string, boolean> {
  const detail = character.detailDataElement;
  const names = new Map<string, boolean>();
  if (!detail) return names;

  const timesNamed = new Map<string, number>();
  const walk = (element: DataElement): void => {
    for (const child of element.children) {
      const name = child.name.trim();
      timesNamed.set(name, (timesNamed.get(name) ?? 0) + 1);
      if (
        name.length > 0 &&
        child.fieldRole === DataElementRole.FIELD &&
        isChangeableElementType(child.type) &&
        !names.has(name)
      ) {
        names.set(name, child.type === DataElementType.NUMBER_RESOURCE);
      }
      walk(child);
    }
  };
  walk(detail);

  for (const name of [...names.keys()]) {
    if (timesNamed.get(name) !== 1) names.delete(name);
  }
  return names;
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
