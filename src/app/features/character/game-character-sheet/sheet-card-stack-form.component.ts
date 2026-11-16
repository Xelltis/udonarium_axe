import { ChangeDetectionStrategy, Component, inject, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { CardStack } from '@axe/domain/card/card-stack';
import { CardStackCardListComponent } from '@axe/features/card/card-stack-card-list/card-stack-card-list.component';
import { setPopupMaxHeight, setPopupWidth } from '@axe/features/character/game-character-sheet/sheet-popup-size';
import { SheetSaveButtonsComponent } from '@axe/features/character/game-character-sheet/sheet-save-buttons.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The form a deck's sheet is made of: its copy and save buttons, and two tabs, the cards it holds
 * and its settings.
 *
 * The fields write straight to the deck; copying and saving are left to the sheet. The form stands
 * where the sheet puts it, as the component itself takes up no box.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'sheet-card-stack-form',
  templateUrl: './sheet-card-stack-form.component.html',
  host: { class: 'contents' },
  imports: [CardStackCardListComponent, FormsModule, SafePipe, SheetSaveButtonsComponent, TranslocoModule],
})
export class SheetCardStackFormComponent {
  private readonly objectChange = inject(ObjectChangeService);

  /** The deck the form edits. */
  readonly cardStack = input.required<CardStack>();
  /** The tab on view, shared with the sheet, which goes back to the cards when its piece changes. */
  readonly activeTab = model<'sheet' | 'settings'>('sheet');
  /** The deck's picture, shown beside its name. */
  readonly imageFile = input.required<ImageFile>();
  /** Whether the sheet is saving the deck, which keeps the save button busy. */
  readonly saving = input(false);
  /** How far the save has got, as a percentage. */
  readonly percent = input(0);

  /** The copy button was pressed. */
  readonly copyPressed = output<void>();
  /** The save button was pressed. */
  readonly savePressed = output<void>();

  /** The deck as it stands now, so the form is drawn again when the deck changes, here or in the room. */
  protected current(): CardStack {
    const stack = this.cardStack();
    this.objectChange.versionOf(stack.identifier)();
    return stack;
  }

  /** The deck's name for its name field, re-read when the deck changes. */
  protected cardStackName(stack: CardStack): string {
    this.objectChange.versionOf(stack.identifier)();
    return stack.name;
  }

  /** Renames the deck from its name field. */
  protected setCardStackName(stack: CardStack, event: Event): void {
    stack.name = (event.target as HTMLInputElement).value;
  }

  /** Applies the hover popup width from its number field. */
  protected onChkPopWidth(event: Event): void {
    setPopupWidth(this.cardStack(), (event.target as HTMLInputElement).valueAsNumber);
  }

  /** Applies the hover popup's greatest height from its number field. */
  protected onChkPopMaxHeight(event: Event): void {
    setPopupMaxHeight(this.cardStack(), (event.target as HTMLInputElement).valueAsNumber);
  }
}
