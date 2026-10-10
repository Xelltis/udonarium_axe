import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ConfirmDialogOption } from '@axe/application/ui/confirm-option';
import { ModalService } from '@axe/application/ui/modal.service';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'confirm-dialog',
  templateUrl: './confirm-dialog.component.html',
  host: { class: 'block text-ui-text' },
  imports: [TranslocoModule],
})
export class ConfirmDialogComponent {
  private readonly modalService = inject(ModalService);
  private readonly t = inject(TRANSLATE_FN);

  readonly option: ConfirmDialogOption;

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
