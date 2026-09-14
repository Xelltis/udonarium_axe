import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { ObjectStore } from '@axe/core/sync/object-store';
import { draftOfSlot, HotbarSlotDraft } from '@axe/domain/hotbar/hotbar-draft';
import { encodeHotbarPayload } from '@axe/domain/hotbar/hotbar-payload';
import { holdsHotbarCell, HotbarCell } from '@axe/domain/hotbar/hotbar-size';
import { HotbarSlot } from '@axe/domain/hotbar/hotbar-slot';

/**
 * A reader's own bar of slots.
 *
 * It is a shared object rather than a note in the browser, which is what carries it between
 * the windows one reader has open and brings it back after a reload. It is left out of the
 * room file all the same: a bar belongs to whoever built it, not to the table, and a room
 * passed around would otherwise carry everyone's. Keeping one across games is what saving it
 * to a file is for.
 */
@SyncObject('hotbar')
export class Hotbar extends ObjectNode {
  /**
   * Whose bar the one on screen is.
   *
   * The reader is named by something of their own that is there from the moment the page
   * loads, rather than by the id a connection hands out: a slot written before the room is
   * joined belongs on the bar all the same. The application settles what that name is.
   *
   * This is the one thing here that lives as long as the session does, and it is here
   * because a bar read in from a file arrives through the serializer, which carries no
   * services with it. Nothing else about the reader belongs in the domain: anything that
   * needs more of them should be asked for by the caller and passed in.
   */
  static ownerId = '';

  /** One bar per reader, under an identifier every window of theirs agrees on. */
  static identifierFor(ownerId: string): string {
    return `Hotbar_${ownerId}`;
  }

  /**
   * The bar belonging to the given reader, or null when they have none or no id is given.
   *
   * A bar under the agreed identifier is found first; failing that, any bar naming that owner.
   */
  static forUser(ownerId: string): Hotbar | null {
    if (ownerId.length < 1) return null;

    const held = ObjectStore.instance.get(Hotbar.identifierFor(ownerId));
    if (held instanceof Hotbar) return held;
    return ObjectStore.instance.getObjects<Hotbar>(Hotbar).find((hotbar) => hotbar.ownerUserId === ownerId) ?? null;
  }

  /** The given reader's bar, made and added to the store when they have none. Null only when no id is given. */
  static ensureForUser(ownerId: string): Hotbar | null {
    if (ownerId.length < 1) return null;

    const held = Hotbar.forUser(ownerId);
    if (held) return held;

    const hotbar = new Hotbar(Hotbar.identifierFor(ownerId));
    hotbar.ownerUserId = ownerId;
    hotbar.initialize();
    return hotbar;
  }

  /** The reader's own bar, made the moment they first put something on it. */
  static mine(): Hotbar | null {
    return Hotbar.forUser(Hotbar.ownerId);
  }

  /** The bar of the reader on this page, made when there is none. Null while no reader is named yet. */
  static ensureMine(): Hotbar | null {
    return Hotbar.ensureForUser(Hotbar.ownerId);
  }

  /** Whose bar this is, by the id that outlives a reconnection. */
  @SyncVar() ownerUserId: string = '';

  /**
   * What stood on the bar before a file was read into it.
   *
   * Reading a bar in is a wholesale replacement, and a file dropped by mistake would
   * otherwise take an evening's work with it. It is kept for as long as the page is open,
   * which is as long as the mistake is worth undoing.
   */
  private displaced: { cell: HotbarCell; draft: HotbarSlotDraft }[] | null = null;

  /** Whether a file read has set aside slots that can still be put back. */
  get hasDisplaced(): boolean {
    return this.displaced !== null;
  }

  /**
   * Empties the bar and keeps what was on it, for putting straight back.
   *
   * What is kept is what the reader built, not what a file put there: reading a second file
   * before undoing the first would otherwise leave the evening's work with no way back, the
   * bar having been emptied twice and only the last emptying remembered.
   */
  displace(): void {
    const standing = this.slots.map((slot) => ({
      cell: { page: slot.pageNo, slotIndex: slot.slotNo },
      draft: draftOfSlot(slot),
    }));
    if (this.displaced === null) this.displaced = standing;
    for (const slot of this.slots) slot.destroy();
  }

  /** Puts back what the last file read displaced, and says whether there was anything. */
  restoreDisplaced(): boolean {
    const held = this.displaced;
    if (!held) return false;

    this.displaced = null;
    for (const slot of this.slots) slot.destroy();
    for (const { cell, draft } of held) this.put(cell.page, cell.slotIndex, draft);
    return true;
  }

  /** Every filled slot on the bar, across all pages. Empty cells have no slot. */
  get slots(): HotbarSlot[] {
    const slots: HotbarSlot[] = [];
    for (const child of this.children) if (child instanceof HotbarSlot) slots.push(child);
    return slots;
  }

  /** The filled slots on one page. */
  slotsOn(page: number): HotbarSlot[] {
    return this.slots.filter((slot) => slot.pageNo === page);
  }

  /** The slot in the given cell, or null when that cell is empty. */
  slotAt(page: number, slotIndex: number): HotbarSlot | null {
    return this.slots.find((slot) => slot.isAt(page, slotIndex)) ?? null;
  }

  /**
   * Writes a draft into the given cell, filling the slot there or making one, and shares the change.
   *
   * Null when the cell is outside the bar.
   */
  put(page: number, slotIndex: number, draft: HotbarSlotDraft): HotbarSlot | null {
    if (!this.holds(page, slotIndex)) return null;

    const slot = this.slotAt(page, slotIndex) ?? this.createSlot(page, slotIndex);
    if (!slot) return null;

    slot.kind = draft.kind;
    slot.value = draft.value;
    slot.valueName = draft.valueName;
    slot.characterIdentifier = draft.characterIdentifier;
    slot.characterName = draft.characterName;
    slot.label = draft.label;
    slot.icon = draft.icon;
    slot.color = draft.color;
    slot.payload = encodeHotbarPayload(draft.payload);
    slot.update();
    return slot;
  }

  /** Destroys the slot in the given cell and hands it back, or null when the cell was already empty. */
  clear(page: number, slotIndex: number): HotbarSlot | null {
    const slot = this.slotAt(page, slotIndex);
    if (!slot) return null;
    slot.destroy();
    return slot;
  }

  /**
   * Moves the slot in one cell to another, swapping places with any slot already there.
   *
   * False when the destination is outside the bar or the source cell is empty. Moving a slot
   * onto its own cell counts as done.
   */
  move(from: HotbarCell, to: HotbarCell): boolean {
    if (!this.holds(to.page, to.slotIndex)) return false;
    const held = this.slotAt(from.page, from.slotIndex);
    if (!held) return false;
    if (from.page === to.page && from.slotIndex === to.slotIndex) return true;

    const standing = this.slotAt(to.page, to.slotIndex);
    if (standing) {
      standing.page = from.page;
      standing.slotIndex = from.slotIndex;
      standing.update();
    }
    held.page = to.page;
    held.slotIndex = to.slotIndex;
    held.update();
    return true;
  }

  private holds(page: number, slotIndex: number): boolean {
    return holdsHotbarCell({ page, slotIndex });
  }

  private createSlot(page: number, slotIndex: number): HotbarSlot | null {
    const slot = new HotbarSlot();
    slot.page = page;
    slot.slotIndex = slotIndex;
    slot.initialize();
    return this.appendChild(slot);
  }
}
