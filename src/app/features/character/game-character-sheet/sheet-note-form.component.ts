import { afterNextRender, ChangeDetectionStrategy, Component, inject, Injector, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { clamp } from '@axe/core/util/clamp';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { setPopupMaxHeight, setPopupWidth } from '@axe/features/character/game-character-sheet/sheet-popup-size';
import { SheetSaveButtonsComponent } from '@axe/features/character/game-character-sheet/sheet-save-buttons.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { formatNoteText } from '@axe/ui/text-decoration/format-note-text';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The form a note's sheet is made of: its buttons, its title and body with how the body is drawn,
 * its size on the table, how large its popup opens, and its picture.
 *
 * The fields write straight to the note. Choosing a picture, copying and saving are left to the
 * sheet. The form stands where the sheet puts it, as the component itself takes up no box.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'sheet-note-form',
  templateUrl: './sheet-note-form.component.html',
  host: { class: 'contents' },
  imports: [FormsModule, SafePipe, SheetSaveButtonsComponent, TranslocoModule],
})
export class SheetNoteFormComponent {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly injector = inject(Injector);

  /** The note the form edits. */
  readonly note = input.required<TextNote>();
  /** The note's picture, shown at the foot of the form where it has one. */
  readonly imageFile = input.required<ImageFile>();
  /** Whether the sheet is saving the note, which keeps the save button busy. */
  readonly saving = input(false);
  /** How far the save has got, as a percentage. */
  readonly percent = input(0);

  /** The button that changes the note's picture was pressed. */
  readonly imagePick = output<void>();
  /** The copy button was pressed. */
  readonly copyPressed = output<void>();
  /** The save button was pressed. */
  readonly savePressed = output<void>();

  /** The note as it stands now, so the form is drawn again when the note changes, here or in the room. */
  protected current(): TextNote {
    const note = this.note();
    this.objectChange.versionOf(note.identifier)();
    return note;
  }

  /** The note's title for its title field, re-read when the note changes. */
  protected textNoteTitle(note: TextNote): string {
    this.objectChange.versionOf(note.identifier)();
    return note.title;
  }

  /** Sets the note's title from its title field. */
  protected setTextNoteTitle(note: TextNote, event: Event): void {
    this.setNoteCommonValue(note, 'title', (event.target as HTMLInputElement).value);
  }

  /** The note's body text for its text area, re-read when the note changes. */
  protected textNoteText(note: TextNote): string {
    this.objectChange.versionOf(note.identifier)();
    return note.text;
  }

  /** Sets the note's body text from its text area. */
  protected setTextNoteText(note: TextNote, event: Event): void {
    note.text = (event.target as HTMLTextAreaElement).value;
  }

  /** Whether the note's body is drawn with formatting, for its switch. */
  protected textNoteFormatted(note: TextNote): boolean {
    this.objectChange.versionOf(note.identifier)();
    return note.isFormatted;
  }

  /** Draws the note's body with formatting, or as it was typed; the body itself stays as it is. */
  protected setTextNoteFormatted(note: TextNote, formatted: boolean): void {
    note.isFormatted = formatted;
  }

  /** The note's body drawn with formatting, for the preview under its text area. */
  protected textNoteFormattedHtml(note: TextNote): string {
    this.objectChange.versionOf(note.identifier)();
    return formatNoteText(note.text);
  }

  /** The note's width, for its width field. */
  protected textNoteWidth(note: TextNote): number {
    this.objectChange.versionOf(note.identifier)();
    return note.width;
  }

  /**
   * Sets the note's width in grid cells from its field, rounded and held between 1 and 24; anything
   * not a number is ignored.
   */
  protected setTextNoteWidth(note: TextNote, event: Event): void {
    this.setNoteCommonNumber(note, 'width', event, 1, 24);
  }

  /** The note's height, for its height field. */
  protected textNoteHeight(note: TextNote): number {
    this.objectChange.versionOf(note.identifier)();
    return note.height;
  }

  /**
   * Sets the note's height in grid cells from its field, rounded and held between 1 and 24; anything
   * not a number is ignored.
   */
  protected setTextNoteHeight(note: TextNote, event: Event): void {
    this.setNoteCommonNumber(note, 'height', event, 1, 24);
  }

  /** The note's font size, for its font size field. */
  protected textNoteFontSize(note: TextNote): number {
    this.objectChange.versionOf(note.identifier)();
    return note.fontSize;
  }

  /**
   * Sets the note's font size from its field, rounded and held between 6 and 64; anything not a
   * number is ignored.
   */
  protected setTextNoteFontSize(note: TextNote, event: Event): void {
    this.setNoteCommonNumber(note, 'fontsize', event, 6, 64);
  }

  /** The note's altitude above the table, for its altitude field. */
  protected textNoteAltitude(note: TextNote): number {
    this.objectChange.versionOf(note.identifier)();
    return note.altitude;
  }

  /**
   * Sets the note's altitude from its field, held between -20 and 20; anything not a number is
   * ignored.
   */
  protected setTextNoteAltitude(note: TextNote, event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    if (!Number.isFinite(value)) return;
    note.altitude = clamp(value, -20, 20);
  }

  /**
   * Asks the note to fit its height to its content again once the limit height checkbox's change
   * has been drawn.
   */
  protected clickLimitHeight(): void {
    const identifier = this.note().identifier;
    afterNextRender(() => this.uiSignalService.requestNoteResize(identifier), { injector: this.injector });
  }

  /** Applies the hover popup width from its number field. */
  protected onChkPopWidth(event: Event): void {
    setPopupWidth(this.note(), (event.target as HTMLInputElement).valueAsNumber);
  }

  /** Applies the hover popup's greatest height from its number field. */
  protected onChkPopMaxHeight(event: Event): void {
    setPopupMaxHeight(this.note(), (event.target as HTMLInputElement).valueAsNumber);
  }

  private setNoteCommonValue(note: TextNote, name: string, value: string | number): void {
    const el = note.commonDataElement?.getFirstElementByName(name);
    if (el) el.value = value;
  }

  private setNoteCommonNumber(note: TextNote, name: string, event: Event, min: number, max: number): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    if (!Number.isFinite(value)) return;
    this.setNoteCommonValue(note, name, clamp(Math.round(value), min, max));
  }
}
