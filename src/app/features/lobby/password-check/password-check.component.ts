import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { PeerContext } from '@axe/core/network/peer-context';
import { TranslocoModule } from '@jsverse/transloco';

export interface PasswordCheckOptions {
  peerContext: PeerContext;
  title?: string;
}

@Component({
  selector: 'password-check',
  templateUrl: './password-check.component.html',
  host: { class: 'block' },
  imports: [FormsModule, TranslocoModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordCheckComponent {
  private readonly t = inject(TRANSLATE_FN);
  private readonly panelService = inject(PanelService);
  private readonly modalService = inject(ModalService);

  readonly passwordInputElementRef = viewChild.required<ElementRef<HTMLInputElement>>('passwordInput');

  readonly password = signal<string>('');
  readonly help = signal('');

  private readonly targetPeerContext: PeerContext;
  readonly title: string;

  constructor() {
    const option = this.modalService.option as Partial<PasswordCheckOptions> | undefined;
    this.targetPeerContext = option?.peerContext ?? PeerContext.parse('???');
    this.title = option?.title ?? '';

    queueMicrotask(
      () =>
        (this.modalService.title = this.panelService.title =
          `${this.t('feature.lobby.passwordCheck.title')} ＜${this.title}＞`)
    );
    afterNextRender(() => {
      this.passwordInputElementRef().nativeElement.focus();
    });
  }

  /** Keeps the typed password and clears any wrong-password message. */
  onPasswordChange(value: string): void {
    this.password.set(value);
    this.help.set('');
  }

  /**
   * Checks the typed password against the room being joined, closing the dialog with the password
   * when it matches and saying it is wrong when it does not.
   */
  async submit() {
    if (await this.targetPeerContext.verifyPassword(this.password())) {
      this.modalService.resolve(this.password());
      return;
    }
    this.help.set(this.t('feature.lobby.passwordCheck.passwordWrong'));
  }
}
