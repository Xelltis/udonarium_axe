import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';

/**
 * Whether a dragged element may be dropped before one of the cards of a character's sheet.
 *
 * The target has to be a card at the top of that sheet, and the dragged element may not be the
 * sheet itself or anything that contains it.
 */
export function canReorderDetailElement(
  char: GameCharacter | null,
  objectStore: ObjectStore,
  draggedId: string,
  targetId: string
): boolean {
  if (!char?.detailDataElement || draggedId === targetId) return false;
  const draggedEl = objectStore.get<DataElement>(draggedId);
  const targetEl = char.detailDataElement.children.find((e) => e.identifier === targetId);
  if (!draggedEl || !targetEl) return false;
  return !draggedEl.contains(char.detailDataElement);
}

/**
 * Moves an element to just before a card of a character's sheet and tells the room.
 *
 * The element takes the role that fits its new place in the sheet, and its old and new parents are
 * both marked changed. Does nothing when the character, the element or the target cannot be found.
 */
export function reorderDetailElement(
  char: GameCharacter | null,
  objectStore: ObjectStore,
  objectChange: ObjectChangeService,
  draggedId: string,
  targetId: string
): void {
  if (!char?.detailDataElement) return;
  const draggedEl = objectStore.get<DataElement>(draggedId);
  const targetEl = char.detailDataElement.children.find((e) => e.identifier === targetId);
  if (!draggedEl || !targetEl) return;
  const oldParent = draggedEl.parent as DataElement | null;
  char.detailDataElement.insertBefore(draggedEl, targetEl);
  finishReorder(char, draggedEl, oldParent, objectChange);
}

/**
 * Moves a card of the sheet to just after another one, or to the end when that one is the last.
 *
 * A dragged card is dropped before the card it lands on, which cannot take one past the last
 * card; moving a card down from its menu has to be able to.
 */
export function reorderDetailElementAfter(
  char: GameCharacter | null,
  objectStore: ObjectStore,
  objectChange: ObjectChangeService,
  draggedId: string,
  targetId: string
): void {
  const detail = char?.detailDataElement;
  const draggedEl = objectStore.get<DataElement>(draggedId);
  if (!char || !detail || !draggedEl) return;
  const rest = detail.children.filter((element) => element !== draggedEl);
  const at = rest.findIndex((element) => element.identifier === targetId);
  if (at < 0) return;
  const next = rest[at + 1];
  if (next) {
    reorderDetailElement(char, objectStore, objectChange, draggedId, next.identifier);
    return;
  }
  const oldParent = draggedEl.parent as DataElement | null;
  detail.appendChild(draggedEl);
  finishReorder(char, draggedEl, oldParent, objectChange);
}

function finishReorder(
  char: GameCharacter,
  draggedEl: DataElement,
  oldParent: DataElement | null,
  objectChange: ObjectChangeService
): void {
  const detail = char.detailDataElement!;
  draggedEl.syncFieldRoleToHierarchy();
  oldParent?.update();
  detail.update();
  objectChange.notifyChanged(draggedEl.identifier);
  if (oldParent) objectChange.notifyChanged(oldParent.identifier);
  objectChange.notifyChanged(detail.identifier);
  char.update();
}
