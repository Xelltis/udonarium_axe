import { inject, Injectable } from '@angular/core';
import { ConfirmDialogOption } from '@axe/application/ui/confirm-option';
import { ModalService } from '@axe/application/ui/modal.service';
import { CONFIRM_DIALOG_COMPONENT } from '@axe/application/ui/overlay-components';

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly modalService = inject(ModalService);
  private readonly dialogComponent = inject(CONFIRM_DIALOG_COMPONENT);

  /**
   * Asks the reader a yes-or-no question, resolving true only on an explicit yes.
   *
   * The question opens in the confirm dialog through the modal service, and a dismissed dialog
   * answers false. Until a dialog component has been registered it falls back to the browser's own
   * `window.confirm`.
   */
  ask(option: ConfirmDialogOption | string): Promise<boolean> {
    const asked = typeof option === 'string' ? { message: option } : option;
    if (!this.dialogComponent) return Promise.resolve(window.confirm(asked.message));
    return this.modalService
      .open<unknown>(this.dialogComponent, asked)
      .then((answer) => answer === true)
      .catch(() => false);
  }
}
