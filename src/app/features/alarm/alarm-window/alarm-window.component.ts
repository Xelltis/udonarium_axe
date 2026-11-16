import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'alarm-window',
  templateUrl: './alarm-window.component.html',
  imports: [TranslocoModule],
})
export class AlarmWindowComponent {
  time!: string;
  title!: string;
}
