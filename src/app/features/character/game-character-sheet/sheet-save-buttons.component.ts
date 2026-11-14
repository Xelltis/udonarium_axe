import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The copy and save buttons a sheet ends its toolbar with, for every kind of object but a character.
 *
 * The save button is busy, and shows how far the save has come, while one is running. The buttons
 * stand in the row the sheet puts them in, as the component itself takes up no box.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'sheet-save-buttons',
  templateUrl: './sheet-save-buttons.component.html',
  host: { class: 'contents' },
  imports: [TranslocoModule],
})
export class SheetSaveButtonsComponent {
  /** Whether a save is running, which keeps the save button from being pressed again. */
  readonly saving = input(false);
  /** How far the running save has come, from 0 to 100. */
  readonly percent = input(0);
  /** The copy button was pressed. */
  readonly copyPressed = output<void>();
  /** The save button was pressed. */
  readonly savePressed = output<void>();
}
