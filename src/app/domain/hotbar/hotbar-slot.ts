import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { HotbarPayload, parseHotbarPayload } from '@axe/domain/hotbar/hotbar-payload';
import { HotbarSlotKind, toHotbarSlotKind } from '@axe/domain/hotbar/hotbar-slot-kind';

@SyncObject('hotbar-slot')
export class HotbarSlot extends ObjectNode {
  @SyncVar() page: number = 0;
  /** `index` belongs to ObjectNode, where it orders children. */
  @SyncVar() slotIndex: number = 0;
  @SyncVar() kind: string = 'chat';
  @SyncVar() label: string = '';
  @SyncVar() icon: string = '';
  @SyncVar() color: string = '';
  @SyncVar() payload: string = '';
  /** What the value pointed at when it was chosen, for a bar read in another room. */
  @SyncVar() valueName: string = '';
  /** Who the slot acts as. Empty means whoever is being controlled at the time. */
  @SyncVar() characterIdentifier: string = '';
  /** The name that piece went by, so a bar carried into another room can find it again. */
  @SyncVar() characterName: string = '';

  /** The page the slot sits on, as a whole number. A missing or invalid value reads as page 0. */
  get pageNo(): number {
    return toCoordinate(this.page);
  }

  /** The position of the slot on its page, as a whole number. A missing or invalid value reads as 0. */
  get slotNo(): number {
    return toCoordinate(this.slotIndex);
  }

  /** What the slot does. A stored kind this version does not know reads as a chat macro. */
  get slotKind(): HotbarSlotKind {
    return toHotbarSlotKind(this.kind);
  }

  /** The slot's value as text: the chat line, or the identifier of whatever the slot points at. */
  get argument(): string {
    return `${this.value ?? ''}`;
  }

  /** The kind-specific options, parsed afresh from the stored payload on every read. */
  get options(): HotbarPayload {
    return parseHotbarPayload(this.slotKind, this.payload);
  }

  /** Whether the slot sits in the given cell of the bar. */
  isAt(page: number, slotIndex: number): boolean {
    return this.pageNo === page && this.slotNo === slotIndex;
  }
}

/** A hand-written save file can leave an attribute out, and an absent attribute reads back as ''. */
function toCoordinate(value: number | string): number {
  const held = Number(value);
  return Number.isFinite(held) && held >= 0 ? Math.floor(held) : 0;
}
