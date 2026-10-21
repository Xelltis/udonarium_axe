import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { operatorContactText } from '@axe/core/network/server/operator-contact';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The room server operator's contact, shown under a ban or a stop as a link that opens apart from
 * the app: a page over https, or a mail address.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'operator-contact',
  templateUrl: './operator-contact.component.html',
  host: { class: 'block' },
  imports: [TranslocoModule],
})
export class OperatorContactComponent {
  /** The contact as the server gave it, already read to be a page over https or a mail address. */
  readonly contact = input.required<string>();

  protected readonly text = computed(() => operatorContactText(this.contact()));
}
