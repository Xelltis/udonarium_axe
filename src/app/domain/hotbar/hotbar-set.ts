import { Logger } from '@axe/core/logging/logger';
import { SyncObject } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { InnerXml, ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Hotbar } from '@axe/domain/hotbar/hotbar';
import { HotbarSlotDraft } from '@axe/domain/hotbar/hotbar-draft';
import { parseHotbarPayload } from '@axe/domain/hotbar/hotbar-payload';
import { holdsHotbarCell } from '@axe/domain/hotbar/hotbar-size';
import { HotbarSlot } from '@axe/domain/hotbar/hotbar-slot';
import { toHotbarSlotKind } from '@axe/domain/hotbar/hotbar-slot-kind';

/**
 * Carrying a bar out of one room and into another.
 *
 * A game is played with one system and its own pieces, and the next is played with others,
 * so a reader keeps a bar per game and reads in the one the evening calls for. It is the
 * holder for handing the slots on rather than the bar itself: what comes back in belongs to
 * whoever read it, not to whoever wrote it, and the bar it lands in is emptied first so the
 * file is what the reader gets.
 */
@SyncObject('hotbar-set')
export class HotbarSet extends ObjectNode implements InnerXml {
  private members: readonly HotbarSlot[] = [];

  /** A holder for saving the slots the bar has now to a file. */
  static of(hotbar: Hotbar): HotbarSet {
    const set = new HotbarSet();
    set.members = [...hotbar.slots];
    return set;
  }

  // GameObject Lifecycle
  /** Takes the holder straight back out of the store, so it is never shared with the room. */
  override onStoreAdded() {
    super.onStoreAdded();
    ObjectStore.instance.remove(this);
  }

  /** The slots to write out, as they stood when the holder was made. */
  override innerXml(): string {
    return this.members.map((slot) => ObjectSerializer.instance.toXml(slot)).join('');
  }

  /**
   * Reads the slots from a file onto the reader's own bar, making the bar if there is none yet.
   *
   * What stood on the bar is set aside first so the read can be undone. Nothing happens when no
   * reader is named yet, or when the file holds no slot the bar can take; both are logged.
   */
  override parseInnerXml(element: Element) {
    const hotbar = Hotbar.ensureMine();
    if (!hotbar) {
      // Nobody is named as the reader yet, which means the bar was never brought up at all.
      Logger.warn('[Hotbar] 読み手が決まっていないため、ホットバーを読み込めませんでした');
      return;
    }

    // Read first, replace after: a file holding nothing readable leaves the bar as it was,
    // rather than emptying it and handing back nothing in its place.
    const read = Array.from(element.children)
      .filter((child) => child.nodeName === HotbarSlot.aliasName)
      .map((child) => readSlot(child))
      .filter((slot): slot is { page: number; slotIndex: number; draft: HotbarSlotDraft } => slot !== null);
    if (read.length < 1) {
      Logger.warn('[Hotbar] 読み取れるスロットが無いため、ホットバーはそのままにしました');
      return;
    }

    hotbar.displace();
    for (const slot of read) hotbar.put(slot.page, slot.slotIndex, slot.draft);
  }
}

/**
 * A slot is read off the file rather than made from it.
 *
 * What comes out of a file carries the identifiers it was saved with, and the same file read
 * twice would ask for them twice over. The bar makes its own slots instead, so a file may be
 * read as often as the reader likes.
 */
function readSlot(element: Element): { page: number; slotIndex: number; draft: HotbarSlotDraft } | null {
  const attribute = (name: string): string => element.getAttribute(name) ?? '';
  const kind = toHotbarSlotKind(attribute('kind'));
  const cell = { page: toCoordinate(attribute('page')), slotIndex: toCoordinate(attribute('slotIndex')) };
  // A file naming a sixth page, or naming no cell at all, holds nothing this bar can take.
  if (!holdsHotbarCell(cell)) return null;

  return {
    page: cell.page,
    slotIndex: cell.slotIndex,
    draft: {
      kind,
      value: element.textContent ?? '',
      valueName: attribute('valueName'),
      characterIdentifier: attribute('characterIdentifier'),
      characterName: attribute('characterName'),
      label: attribute('label'),
      icon: attribute('icon'),
      color: attribute('color'),
      payload: parseHotbarPayload(kind, attribute('payload')),
    },
  };
}

function toCoordinate(value: string): number {
  const held = Number(value);
  return Number.isFinite(held) && held >= 0 ? Math.floor(held) : 0;
}
