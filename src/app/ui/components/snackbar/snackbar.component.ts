import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Z_BOTTOM_SHEET } from '@axe/application/ui/bottom-sheet.service';
import { KeyboardInsetService } from '@axe/application/ui/keyboard-inset.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { TranslocoModule } from '@jsverse/transloco';

/** Where a notice stands: above the sheets it may be about, and below the menus. */
export const Z_SNACKBAR = Z_BOTTOM_SHEET + 10;

/**
 * The notice at the bottom of the screen, with its one action and a close button.
 *
 * It keeps above the on-screen keyboard and the home bar, and is read out by a screen reader as it
 * appears without taking the focus.
 */
@Component({
  selector: 'ui-snackbar',
  templateUrl: './snackbar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule],
})
export class SnackbarComponent {
  protected readonly snackbar = inject(SnackbarService);
  protected readonly keyboardInset = inject(KeyboardInsetService).inset;
  protected readonly zIndex = Z_SNACKBAR;
}
