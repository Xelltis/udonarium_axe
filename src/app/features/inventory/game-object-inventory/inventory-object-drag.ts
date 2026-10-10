import { signal } from '@angular/core';
import { GameObject } from '@axe/core/sync/game-object';
import { GameCharacter } from '@axe/domain/character/game-character';
import { folderPathFromElement } from '@axe/features/inventory/game-object-inventory/inventory-folder-drag';

export interface ObjectDragHost {
  /** Whether this reader may file pieces into folders on the tab being shown. */
  canFile(): boolean;
  /** Whether a piece dragged out of the panel can be handed to the game master's bar. */
  canHandOver(): boolean;
  /** The pieces that travel with this one, which is the whole selection when it is one of them. */
  travellingWith(character: GameCharacter): ReadonlySet<string>;
  /** Whether a point is over this panel rather than another one showing the same room. */
  ownsPoint(x: number, y: number): boolean;
  handOverBegin(character: GameCharacter, x: number, y: number): void;
  handOverMove(x: number, y: number): void;
  handOverEnd(accepted: boolean): void;
  fileInto(identifiers: ReadonlySet<string>, folderPath: string): void;
}

interface Pending {
  character: GameCharacter;
  startX: number;
  startY: number;
  dragging: boolean;
  withNpcBar: boolean;
  withFolders: boolean;
}

/** How far the pointer travels before a press counts as a drag rather than a click. */
const DRAG_SLACK_PX = 6;

export class InventoryObjectDrag {
  private pending: Pending | null = null;
  private suppressClick = false;

  readonly draggingIdentifiers = signal<ReadonlySet<string>>(new Set());
  readonly dropFolderPath = signal<string | null>(null);

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

  /** The click that ends a drag is not a click on the row, and is swallowed once. */
  takeSuppressedClick(): boolean {
    const suppressed = this.suppressClick;
    this.suppressClick = false;
    return suppressed;
  }

  /**
   * Whether pressing this piece's row can start a drag of it.
   *
   * Only a character is dragged, and only when it has somewhere to go: folders to file it into or
   * the game master's bar to hand it over to. Arming a drag costs the click that follows it, so a
   * row with nowhere to drop is never armed.
   */
  canDrag(gameObject: GameObject): gameObject is GameCharacter {
    return gameObject instanceof GameCharacter && (this.host.canHandOver() || this.host.canFile());
  }

  /**
   * Arms a drag when a character's row is pressed with the primary button, capturing the pointer.
   *
   * Presses on the row's buttons and inputs are left alone, and so is any press with nowhere to
   * drop: no folders to file into and no game master's bar to hand over to.
   */
  down(event: PointerEvent, gameObject: GameObject): void {
    if (event.button !== 0 || !this.canDrag(gameObject)) return;
    if ((event.target as HTMLElement).closest('button, input')) return;

    this.pending = {
      character: gameObject,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      withNpcBar: this.host.canHandOver(),
      withFolders: this.host.canFile(),
    };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  /**
   * Follows the pointer during an armed press.
   *
   * Past a few pixels the press becomes a drag of the piece and whatever travels with it, starting
   * a hand-over to the game master's bar where allowed. From then on it tracks the folder heading
   * under the pointer.
   */
  move(event: PointerEvent): void {
    const pending = this.pending;
    if (!pending) return;
    if (!pending.dragging) {
      if (Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) < DRAG_SLACK_PX) return;
      pending.dragging = true;
      this.draggingIdentifiers.set(this.host.travellingWith(pending.character));
      if (pending.withNpcBar) this.host.handOverBegin(pending.character, event.clientX, event.clientY);
    } else if (pending.withNpcBar) {
      this.host.handOverMove(event.clientX, event.clientY);
    }
    this.dropFolderPath.set(pending.withFolders ? this.folderPathUnder(event.clientX, event.clientY) : null);
  }

  /** A row can be taken out from under the pointer, and then no release ever arrives. */
  cancel(): void {
    this.pending = null;
    this.draggingIdentifiers.set(new Set());
    this.dropFolderPath.set(null);
  }

  /**
   * Ends the press and drops whatever was dragged.
   *
   * Released over a folder heading, the pieces are filed into it. Otherwise a hand-over is accepted
   * only over the game master's bar. After a real drag the click that follows is swallowed.
   */
  up(event: PointerEvent): void {
    const pending = this.pending;
    const folderPath = this.dropFolderPath();
    const dragged = this.draggingIdentifiers();
    this.pending = null;
    this.draggingIdentifiers.set(new Set());
    this.dropFolderPath.set(null);
    if (!pending) return;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    if (!pending.dragging) return;
    this.suppressClick = true;

    if (folderPath !== null && pending.withFolders) {
      if (pending.withNpcBar) this.host.handOverEnd(false);
      this.host.fileInto(dragged, folderPath);
      return;
    }

    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (pending.withNpcBar) this.host.handOverEnd(!!target?.closest('.npc-bar-dropzone'));
  }

  /** Two inventory panels can be open, so only a heading drawn by this one counts as a target. */
  private folderPathUnder(x: number, y: number): string | null {
    if (!this.host.ownsPoint(x, y)) return null;
    return folderPathFromElement(document.elementFromPoint(x, y));
  }
}
