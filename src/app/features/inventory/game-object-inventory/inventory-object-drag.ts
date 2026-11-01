import { signal } from '@angular/core';
import { capturePointer, releasePointer } from '@axe/core/input/pointer-capture';
import { GameObject } from '@axe/core/sync/game-object';
import { GameCharacter } from '@axe/domain/character/game-character';
import { inventoryTabFromElement } from '@axe/features/inventory/game-object-inventory/inventory-folder-drag';
import { folderPathFromElement } from '@axe/ui/folder-tree/folder-drop';

export interface ObjectDragHost {
  /** Whether this reader may file pieces into folders on the tab being shown. */
  canFile(): boolean;
  /** Whether this reader may move pieces to another tab by letting them go over it. */
  canMove(): boolean;
  /** Whether a piece dragged out of the panel can be handed to the game master's bar. */
  canHandOver(): boolean;
  /** The tab on view, which is where the pieces already are and so no place to move them. */
  currentTab(): string;
  /** The pieces that travel with this one, which is the whole selection when it is one of them. */
  travellingWith(character: GameCharacter): ReadonlySet<string>;
  /** Whether an element belongs to this panel rather than another one showing the same room. */
  ownsElement(element: Element): boolean;
  handOverBegin(character: GameCharacter): void;
  handOverEnd(accepted: boolean): void;
  /** Draws the piece beside the pointer, with how many travel along with it. */
  ghostBegin(character: GameCharacter, count: number, x: number, y: number): void;
  ghostMove(x: number, y: number): void;
  ghostEnd(): void;
  fileInto(identifiers: ReadonlySet<string>, folderPath: string): void;
  moveTo(identifiers: ReadonlySet<string>, tab: string): void;
}

interface Pending {
  character: GameCharacter;
  row: HTMLElement;
  /** The field the press landed in, which keeps the pointer until the pointer leaves it. */
  field: HTMLElement | null;
  startX: number;
  startY: number;
  dragging: boolean;
  withNpcBar: boolean;
  withFolders: boolean;
  withTabs: boolean;
  /**
   * Whether the row is drawn in the main window, the only one the picture beside the pointer is
   * drawn in. The game master's bar stands there too, so a row in a window of its own hands nothing
   * over.
   */
  withGhost: boolean;
}

/** How far the pointer travels before a press counts as a drag rather than a click. */
const DRAG_SLACK_PX = 6;

/**
 * What a press is meant for itself: a button, a choice, and a gauge, whose drag is how its value is
 * set. A press on any of these never picks the row up.
 */
const UNGRABBABLE_SELECTOR = 'button, select, input[type="range"], input[type="checkbox"], input[type="radio"]';

/** A field typed into, in which pressing and moving selects text until the pointer leaves it. */
const FIELD_SELECTOR = 'input, textarea';

export class InventoryObjectDrag {
  private pending: Pending | null = null;
  private suppressClick = false;

  readonly draggingIdentifiers = signal<ReadonlySet<string>>(new Set());
  readonly dropFolderPath = signal<string | null>(null);
  readonly dropTab = signal<string | null>(null);

  constructor(private readonly host: ObjectDragHost) {}

  /** Whether the piece is one of those being dragged. */
  isDragging(gameObject: GameObject): boolean {
    return this.draggingIdentifiers().has(gameObject.identifier);
  }

  /**
   * Whether the drag is over the folder heading with this path, which marks it as the drop target.
   */
  isDropFolder(folderPath: string): boolean {
    return this.dropFolderPath() === folderPath;
  }

  /** Whether the drag is over this tab, which marks it as the place the pieces would move to. */
  isDropTab(tab: string): boolean {
    return this.dropTab() === tab;
  }

  /** The click that ends a drag is not a click on the row, and is swallowed once. */
  takeSuppressedClick(): boolean {
    const suppressed = this.suppressClick;
    this.suppressClick = false;
    return suppressed;
  }

  /**
   * Whether pressing this piece's row can start a drag of it.
   *
   * Only a character is dragged, and only when it has somewhere to go: folders to file it into,
   * other tabs to move it to, or the game master's bar to hand it over to. Arming a drag costs the
   * click that follows it, so a row with nowhere to drop is never armed.
   */
  canDrag(gameObject: GameObject): gameObject is GameCharacter {
    return (
      gameObject instanceof GameCharacter && (this.host.canHandOver() || this.host.canFile() || this.host.canMove())
    );
  }

  /**
   * Arms a drag when a character's row is pressed with the primary button, capturing the pointer.
   *
   * A press in one of the row's fields arms one too, but leaves the pointer to the field, where
   * moving selects text as ever; a finger's press there is left to scroll the list. Presses on the
   * row's buttons, choices and gauges are left alone, and so is any press with nowhere to drop: no
   * folders to file into, no tab to move to and no game master's bar to hand over to.
   */
  down(event: PointerEvent, gameObject: GameObject): void {
    if (event.button !== 0 || !this.canDrag(gameObject)) return;
    const target = event.target as HTMLElement;
    if (target.closest(UNGRABBABLE_SELECTOR)) return;
    const field = target.closest<HTMLElement>(FIELD_SELECTOR);
    if (field && event.pointerType === 'touch') return;

    const row = event.currentTarget as HTMLElement;
    const inMainWindow = (row.ownerDocument ?? document) === document;
    this.pending = {
      character: gameObject,
      row,
      field,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      withNpcBar: this.host.canHandOver() && inMainWindow,
      withFolders: this.host.canFile(),
      withTabs: this.host.canMove(),
      withGhost: inMainWindow,
    };
    if (!field) capturePointer(row, event.pointerId);
  }

  /**
   * Follows the pointer during an armed press.
   *
   * Past a few pixels the press becomes a drag of the piece and whatever travels with it, starting
   * a hand-over to the game master's bar where allowed; a press in a field waits for the pointer to
   * leave the field, then takes the pointer and lets go of the field. That press is not captured,
   * so its release can land outside the row unseen; a move with the button up drops it. From then
   * on it tracks the folder or the tab under the pointer.
   */
  move(event: PointerEvent): void {
    const pending = this.pending;
    if (!pending) return;
    if (pending.field && !pending.dragging && (event.buttons & 1) === 0) {
      this.cancel();
      return;
    }
    if (!pending.dragging) {
      if (Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) < DRAG_SLACK_PX) return;
      if (pending.field) {
        if (isOver(pending.field, event)) return;
        capturePointer(pending.row, event.pointerId);
        pending.field.blur();
        pending.field.ownerDocument.getSelection()?.removeAllRanges();
      }
      pending.dragging = true;
      this.draggingIdentifiers.set(this.host.travellingWith(pending.character));
      if (pending.withNpcBar) this.host.handOverBegin(pending.character);
      if (pending.withGhost) {
        this.host.ghostBegin(pending.character, this.draggingIdentifiers().size, event.clientX, event.clientY);
      }
    } else if (pending.withGhost) {
      this.host.ghostMove(event.clientX, event.clientY);
    }
    const under = this.elementUnder(event);
    this.dropTab.set(pending.withTabs ? this.tabOf(under) : null);
    this.dropFolderPath.set(pending.withFolders && this.dropTab() === null ? this.folderPathOf(under) : null);
  }

  /**
   * Calls the drag off when the row lets go of the pointer, and not when a field inside it does: a
   * press begun in a field may have been held by the field until the row took the pointer over, and
   * the field's letting go reaches the row on its way up.
   */
  lostCapture(event: PointerEvent): void {
    if (event.target !== event.currentTarget) return;
    this.cancel();
  }

  /**
   * A row can be taken out from under the pointer, and then no release ever arrives. A drag under
   * way is called off: nothing is handed over and nothing is drawn beside the pointer any more.
   */
  cancel(): void {
    if (this.pending?.dragging) {
      if (this.pending.withNpcBar) this.host.handOverEnd(false);
      if (this.pending.withGhost) this.host.ghostEnd();
    }
    this.pending = null;
    this.draggingIdentifiers.set(new Set());
    this.dropFolderPath.set(null);
    this.dropTab.set(null);
  }

  /**
   * Ends the press and drops whatever was dragged.
   *
   * Released over another tab, the pieces move there; over a folder, they are filed into it.
   * Otherwise a hand-over is accepted only over the game master's bar. After a real drag the click
   * that follows is swallowed.
   */
  up(event: PointerEvent): void {
    const pending = this.pending;
    const folderPath = this.dropFolderPath();
    const tab = this.dropTab();
    const dragged = this.draggingIdentifiers();
    this.pending = null;
    this.draggingIdentifiers.set(new Set());
    this.dropFolderPath.set(null);
    this.dropTab.set(null);
    if (!pending) return;
    releasePointer(event.currentTarget, event.pointerId);
    if (!pending.dragging) return;
    this.suppressClick = true;
    if (pending.withGhost) this.host.ghostEnd();

    if (tab !== null && pending.withTabs) {
      if (pending.withNpcBar) this.host.handOverEnd(false);
      this.host.moveTo(dragged, tab);
      return;
    }

    if (folderPath !== null && pending.withFolders) {
      if (pending.withNpcBar) this.host.handOverEnd(false);
      this.host.fileInto(dragged, folderPath);
      return;
    }

    if (pending.withNpcBar) this.host.handOverEnd(!!this.elementUnder(event)?.closest('.npc-bar-dropzone'));
  }

  /**
   * What lies under the pointer, looked up in the document the row is drawn in, which is another
   * window's when the panel has been taken out into one.
   */
  private elementUnder(event: PointerEvent): Element | null {
    const doc = (event.currentTarget as Element | null)?.ownerDocument ?? document;
    return doc.elementFromPoint(event.clientX, event.clientY);
  }

  /** Two inventory panels can be open, so only a folder drawn by this one counts as a target. */
  private folderPathOf(element: Element | null): string | null {
    if (!element || !this.host.ownsElement(element)) return null;
    return folderPathFromElement(element);
  }

  /** The tab under the pointer, when it is one of this panel's and not the one on view. */
  private tabOf(element: Element | null): string | null {
    if (!element || !this.host.ownsElement(element)) return null;
    const tab = inventoryTabFromElement(element);
    return tab !== null && tab !== this.host.currentTab() ? tab : null;
  }
}

function isOver(element: Element, event: PointerEvent): boolean {
  const box = element.getBoundingClientRect();
  return (
    event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom
  );
}
