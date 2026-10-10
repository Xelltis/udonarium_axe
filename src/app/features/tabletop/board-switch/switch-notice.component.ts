import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SwitchNoticeService } from '@axe/application/ui/switch-notice.service';

/** The word beside the pointer about a press on painted ground that came to nothing. */
@Component({
  selector: 'app-switch-notice',
  templateUrl: './switch-notice.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class SwitchNoticeComponent {
  protected readonly notices = inject(SwitchNoticeService);
}
