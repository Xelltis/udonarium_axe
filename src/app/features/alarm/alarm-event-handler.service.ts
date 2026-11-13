import { DestroyRef, inject, Injectable } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { AlarmWindowComponent } from '@axe/features/alarm/alarm-window/alarm-window.component';

@Injectable({ providedIn: 'root' })
export class AlarmEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly panelService = inject(PanelService);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly t = inject(TRANSLATE_FN);

  constructor() {
    this.objectChange.alarmTimeUp$.subscribe((event) => {
      this.chatMessageService.sendSystemMessageAsLastSpeaker(
        encodeI18nMessage('feature.alarm.timeUpMessage', {
          seconds: event.seconds,
          target: event.target,
          title: event.title,
        })
      );
    }, this.destroyRef);
    this.objectChange.alarmPop$.subscribe((event) => {
      this.openAlarmPanel(event.title, String(event.time));
    }, this.destroyRef);
  }

  private openAlarmPanel(title: string, time: string): void {
    const winW = 200;
    const winH = 80;
    const marginW = Math.max(0, window.innerWidth - winW);
    const marginH = Math.max(0, window.innerHeight - winH - 25);

    const option: PanelOption = {
      title: this.t('feature.alarm.alarmTitlePrefix', { title }),
      width: winW,
      height: winH + 25,
      left: marginW * 0.5,
      top: marginH * 0.5,
    };

    const component = this.panelService.open(AlarmWindowComponent, option);
    component.title = title;
    component.time = time;
  }
}
