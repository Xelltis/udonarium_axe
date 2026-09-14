import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Alarm } from '@axe/domain/alarm/alarm';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-alarm-window',
  templateUrl: './alarm-window.component.html',
  imports: [TranslocoModule],
})
export class AlarmWindowComponent {
  private readonly modalService = inject(ModalService);
  private readonly panelService = inject(PanelService);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly objectStore = inject(ObjectStore);

  private timestamp = 0;
  /** The room's one shared alarm, looked up in the object store under its fixed identifier. */
  get alarm(): Alarm {
    return this.objectStore.get<Alarm>('Alarm')!;
  }

  constructor() {
    this.timestamp = this.alarm.initTimeStamp;
  }

  time!: string;
  title!: string;
}
