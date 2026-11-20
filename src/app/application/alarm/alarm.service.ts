import { inject, Injectable } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nList, encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { getPeerContexts } from '@axe/core/network/peer-context-source';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Alarm, clampAlarmSeconds } from '@axe/domain/alarm/alarm';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { peerFaceOf } from '@axe/domain/peer/peer-face';

/** Why an alarm was not set: the seat only watches, it would ring for nobody, or the room has none. */
export type AlarmRefusal = 'guest' | 'noSeat' | 'missing';

/** What setting the alarm takes. */
export interface AlarmCall {
  /** What it is for; the usual title where empty. */
  readonly title: string;
  /** How long it counts down, held to between none and an hour. */
  readonly seconds: number;
  /** The seats it rings for, by peer id. */
  readonly to: readonly string[];
  /** Whether it rings and is said in chat when up. */
  readonly sound: boolean;
  /** Whether it pops up when up. */
  readonly popup: boolean;
}

/**
 * Setting the room's alarm, which the alarm menu and the AI link both go through. A seat that only
 * watches sets none.
 */
@Injectable({ providedIn: 'root' })
export class AlarmService {
  private readonly objectStore = inject(ObjectStore);
  private readonly permission = inject(RolePermissionService);
  private readonly chat = inject(ChatMessageService);
  private readonly t = inject(TRANSLATE_FN);

  /** The room's one alarm, or null before the room has made it. */
  get alarm(): Alarm | null {
    return this.objectStore.get<Alarm>('Alarm');
  }

  /** Whether this reader may set the alarm, which every role but a guest may. */
  maySet(): boolean {
    return this.permission.canEditTabletop();
  }

  /**
   * Sets the alarm for the seats given, says so in chat, naming them or saying it rings for everyone,
   * and starts it counting down here. Why it was not set, or null where it was.
   */
  set(call: AlarmCall): AlarmRefusal | null {
    const alarm = this.alarm;
    if (!this.maySet()) return 'guest';
    if (!alarm) return 'missing';
    const to = [...new Set(call.to)];
    if (to.length < 1) return 'noSeat';
    const seconds = clampAlarmSeconds(call.seconds);
    const title = call.title.trim() || this.t('feature.alarm.defaultTitle');
    const target =
      getPeerContexts().length + 1 === to.length
        ? encodeI18nMessage('feature.alarm.targetAll')
        : ` >${to.map((peerId) => `${peerFaceOf(peerId).name} `).join('')}`;
    const startMessage = encodeI18nList([encodeI18nMessage('feature.alarm.setMessage', { seconds }), target], '');
    alarm.makeAlarm(seconds, title, to, PeerCursor.myCursor.peerId, target, call.sound, call.popup);
    this.chat.sendSystemMessageAsLastSpeaker(startMessage);
    alarm.startAlarm();
    return null;
  }
}
