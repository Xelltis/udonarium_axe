import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { clamp } from '@axe/core/util/clamp';
import { debounce } from '@axe/core/util/debounce';
import { Card } from '@axe/domain/card/card';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { setPopupMaxHeight, setPopupWidth } from '@axe/features/character/game-character-sheet/sheet-popup-size';
import { SheetSaveButtonsComponent } from '@axe/features/character/game-character-sheet/sheet-save-buttons.component';
import { GameDataElementComponent } from '@axe/features/data-element/game-data-element/game-data-element.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The form a card's sheet is made of: its buttons, the pictures of its two faces, its name, size and
 * face text, how large its popup opens, and its game data.
 *
 * The fields write straight to the card. Switching editing, choosing a picture, adding game data,
 * copying and saving are left to the sheet. The form stands where the sheet puts it, as the
 * component itself takes up no box.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'sheet-card-form',
  templateUrl: './sheet-card-form.component.html',
  host: { class: 'contents' },
  imports: [FormsModule, GameDataElementComponent, SafePipe, SheetSaveButtonsComponent, TranslocoModule],
})
export class SheetCardFormComponent {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);

  /** The card the form edits. */
  readonly card = input.required<Card>();
  /** Whether the sheet is being edited, which opens the card's game data to change. */
  readonly isEdit = input(false);
  /** Whether the sheet is saving the card, which keeps the save button busy. */
  readonly saving = input(false);
  /** How far the save has got, as a percentage. */
  readonly percent = input(0);

  /** The button that switches editing was pressed. */
  readonly editToggled = output<void>();
  /** A face's picture was pressed to be changed. */
  readonly imagePick = output<'front' | 'back'>();
  /** The button that adds game data was pressed. */
  readonly addPressed = output<void>();
  /** The copy button was pressed. */
  readonly copyPressed = output<void>();
  /** The save button was pressed. */
  readonly savePressed = output<void>();

  private readonly writeFaceTextSoon = debounce(() => this.flushCardOwnFaceText(), 66);
  private pendingCardFaceText: { card: Card; value: string } | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.flushCardOwnFaceText());
  }

  /** The card as it stands now, so the form is drawn again when the card changes, here or in the room. */
  protected current(): Card {
    const card = this.card();
    this.objectChange.versionOf(card.identifier)();
    return card;
  }

  /** The card's name for its name field, re-read when the card changes. */
  cardOwnName(c: Card): string {
    this.objectChange.versionOf(c.identifier)();
    return c.name;
  }

  /** Renames the card from its name field. */
  setCardOwnName(c: Card, event: Event): void {
    c.name = (event.target as HTMLInputElement).value;
  }

  /** The card's width in grid squares, for its size field. */
  cardOwnSize(c: Card): number {
    this.objectChange.versionOf(c.identifier)();
    return c.size;
  }

  /**
   * Sets the card's width from its size field, rounded and held between 1 and 20 grid squares;
   * anything not a number is ignored.
   */
  setCardOwnSize(c: Card, event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    if (!Number.isFinite(value)) return;
    c.size = clamp(Math.round(value), 1, 20);
  }

  /**
   * Whether this user may read and edit the text on the card's face.
   *
   * Anyone allowed to see hidden things always may. Everyone else may only when the card shows its
   * face to them and nobody else is peeking at it.
   */
  canReadCardFace(c: Card): boolean {
    this.objectChange.versionOf(c.identifier)();
    if (PeerCursor.myCursor) this.objectChange.versionOf(PeerCursor.myCursor.identifier)();
    const isOwnedByAnotherUser = c.hasOwner && !c.isMine;
    return this.rolePermission.canSeeHidden() || (!isOwnedByAnotherUser && c.isVisible);
  }

  /** The text on the card's face, or an empty string for a user who may not read it. */
  cardOwnFaceText(c: Card): string {
    this.objectChange.versionOf(c.identifier)();
    return this.canReadCardFace(c) ? c.faceText : '';
  }

  /**
   * Takes the text typed into the card's face field, writing it to the card after a short pause.
   *
   * Each keystroke restarts the pause, so the room receives the text once typing settles. Ignored
   * for a user who may not read the face.
   */
  setCardOwnFaceText(c: Card, event: Event): void {
    if (!this.canReadCardFace(c)) return;
    this.pendingCardFaceText = { card: c, value: (event.target as HTMLTextAreaElement).value };
    this.writeFaceTextSoon();
  }

  /**
   * Writes face text still waiting on its pause to the card at once, when the field loses focus,
   * the sheet turns to another piece or the form is taken away.
   */
  flushCardOwnFaceText(): void {
    this.writeFaceTextSoon.cancel();
    const pending = this.pendingCardFaceText;
    this.pendingCardFaceText = null;
    if (pending && this.canReadCardFace(pending.card)) pending.card.faceText = pending.value;
  }

  /** The font size of the card's face text, or the default for a user who may not read it. */
  cardOwnFaceFontSize(c: Card): number {
    this.objectChange.versionOf(c.identifier)();
    return this.canReadCardFace(c) ? c.faceFontSize : Card.DEFAULT_FACE_FONT_SIZE;
  }

  /**
   * Sets the font size of the card's face text from its field; ignored for a user who may not read
   * the face or for anything not a number.
   */
  setCardOwnFaceFontSize(c: Card, event: Event): void {
    if (!this.canReadCardFace(c)) return;
    const value = (event.target as HTMLInputElement).valueAsNumber;
    if (Number.isFinite(value)) c.faceFontSize = value;
  }

  /** The colour of the card's face text, or the default for a user who may not read it. */
  cardOwnFaceFontColor(c: Card): string {
    this.objectChange.versionOf(c.identifier)();
    return this.canReadCardFace(c) ? c.faceFontColor : Card.DEFAULT_FACE_FONT_COLOR;
  }

  /**
   * Sets the colour of the card's face text from its colour field; ignored for a user who may not
   * read the face.
   */
  setCardOwnFaceFontColor(c: Card, event: Event): void {
    if (!this.canReadCardFace(c)) return;
    c.faceFontColor = (event.target as HTMLInputElement).value;
  }

  /** Applies the hover popup width from its number field. */
  protected onChkPopWidth(event: Event): void {
    setPopupWidth(this.card(), (event.target as HTMLInputElement).valueAsNumber);
  }

  /** Applies the hover popup's greatest height from its number field. */
  protected onChkPopMaxHeight(event: Event): void {
    setPopupMaxHeight(this.card(), (event.target as HTMLInputElement).valueAsNumber);
  }
}
