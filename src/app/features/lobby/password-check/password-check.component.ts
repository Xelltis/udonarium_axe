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
  /** The room's peer to check the password against, for a SkyWay room. */
  peerContext?: PeerContext;
  /** Whether the room server checks the password, so the dialog only takes it down. */
  checkedByServer?: boolean;
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
  private readonly checkedByServer: boolean;
  readonly title: string;

  constructor() {
    const option = this.modalService.option as Partial<PasswordCheckOptions> | undefined;
    this.targetPeerContext = option?.peerContext ?? PeerContext.parse('???');
    this.checkedByServer = option?.checkedByServer === true;
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
   * when it matches and saying it is wrong when it does not. For a room server, which checks it as
   * the room is joined, it closes with the password as typed.
   */
  async submit() {
    if (this.checkedByServer || (await this.targetPeerContext.verifyPassword(this.password()))) {
      this.modalService.resolve(this.password());
      return;
    }
    this.help.set(this.t('feature.lobby.passwordCheck.passwordWrong'));
  }
}
