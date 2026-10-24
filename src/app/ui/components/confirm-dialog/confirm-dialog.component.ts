import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ConfirmDialogOption } from '@axe/application/ui/confirm-option';
import { ModalService } from '@axe/application/ui/modal.service';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * Asks a yes-or-no question in a modal.
 *
 * The answer can be given from the keyboard as it opens: the focus is on OK, or on cancel when what
 * is asked is dangerous, so Enter takes the safe answer there; Escape cancels. Once answered, the
 * focus goes back to whatever held it before.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'confirm-dialog',
  templateUrl: './confirm-dialog.component.html',
  host: { class: 'block text-ui-text', '(keydown.escape)': 'onEscape($event)' },
  imports: [TranslocoModule],
})
export class ConfirmDialogComponent {
  private readonly modalService = inject(ModalService);
  private readonly t = inject(TRANSLATE_FN);

  readonly option: ConfirmDialogOption;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly cancelButton = viewChild.required<ElementRef<HTMLButtonElement>>('cancelButton');
  private readonly okButton = viewChild<ElementRef<HTMLButtonElement>>('okButton');

  constructor() {
    const raw = this.modalService.option as Partial<ConfirmDialogOption> | undefined;
    this.option = {
      message: raw?.message ?? '',
      title: raw?.title,
      okLabel: raw?.okLabel,
      cancelLabel: raw?.cancelLabel,
      danger: raw?.danger ?? false,
    };
    queueMicrotask(() => {
      this.modalService.title = this.option.title ?? this.t('common.dialog.confirmTitle');
    });

    let opener: HTMLElement | null = null;
    afterNextRender(() => {
      opener = this.host.nativeElement.ownerDocument.activeElement as HTMLElement | null;
      const first = this.option.danger ? this.cancelButton() : (this.okButton() ?? this.cancelButton());
      first.nativeElement.focus();
    });
    inject(DestroyRef).onDestroy(() => {
      if (opener?.isConnected && opener !== opener.ownerDocument.body) opener.focus();
    });
  }

  /** Cancels from Escape, keeping the key from the table behind, where it would clear the selection. */
  protected onEscape(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.cancel();
  }

  /** Confirms from the OK button, closing the dialog with true. */
  ok(): void {
    this.modalService.resolve(true);
  }

  /** Declines from the cancel button, closing the dialog with false. */
  cancel(): void {
    this.modalService.resolve(false);
  }
}
