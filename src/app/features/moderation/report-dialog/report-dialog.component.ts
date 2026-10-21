import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ReportService, ReportSubject } from '@axe/application/moderation/report.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { MAX_REPORT_REASON_LENGTH } from '@axe/core/network/server/server-protocol';
import { TranslocoModule } from '@jsverse/transloco';

/** Why a report did not go, by the word for it. */
type ReportTrouble = 'unsupported' | 'rateLimited' | 'refused' | 'failed';

/**
 * Asks the reader why they report a picture, a sound or the room to the room server's operator, sends
 * it, and shows the id the report was taken under. Resolves with that id, or null when nothing was sent.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'report-dialog',
  templateUrl: './report-dialog.component.html',
  host: { class: 'block' },
  imports: [FormsModule, TranslocoModule],
})
export class ReportDialogComponent {
  private readonly t = inject(TRANSLATE_FN);
  private readonly modalService = inject(ModalService);
  private readonly panelService = inject(PanelService);
  private readonly reports = inject(ReportService);

  private readonly reasonInput = viewChild<ElementRef<HTMLTextAreaElement>>('reasonInput');

  protected readonly maxLength = MAX_REPORT_REASON_LENGTH;
  protected readonly subject: ReportSubject;
  protected readonly reason = signal('');
  protected readonly isSending = signal(false);
  protected readonly trouble = signal<ReportTrouble | null>(null);
  protected readonly takenId = signal<string | null>(null);
  protected readonly canSend = computed(() => {
    const length = this.reason().trim().length;
    return !this.isSending() && 0 < length && length <= MAX_REPORT_REASON_LENGTH;
  });

  constructor() {
    this.subject = (this.modalService.option as ReportSubject | undefined) ?? { target: 'room', name: '' };
    queueMicrotask(
      () => (this.modalService.title = this.panelService.title = this.t('feature.moderation.report.title'))
    );
    afterNextRender(() => this.reasonInput()?.nativeElement.focus());
  }

  protected async send(): Promise<void> {
    if (!this.canSend()) return;
    this.isSending.set(true);
    this.trouble.set(null);
    try {
      const result = await this.reports.send(this.subject, this.reason());
      if (typeof result === 'object') this.takenId.set(result.id);
      else this.trouble.set(result === 'rate-limited' ? 'rateLimited' : result);
    } finally {
      this.isSending.set(false);
    }
  }

  protected close(): void {
    this.modalService.resolve(this.takenId());
  }
}
