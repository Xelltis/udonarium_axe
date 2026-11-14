import { afterNextRender, ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nList, encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { Network } from '@axe/core/network/network';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Alarm } from '@axe/domain/alarm/alarm';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { connectedPeerIdsOf, peerFaceOf } from '@axe/domain/peer/peer-face';
import { UiPeerPickListComponent } from '@axe/ui/components/peer-pick-list/peer-pick-list.component';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'alarm-menu',
  templateUrl: './alarm-menu.component.html',
  imports: [FormsModule, TranslocoModule, UiPeerPickListComponent],
})
export class AlarmMenuComponent {
  private readonly panelService = inject(PanelService);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly t = inject(TRANSLATE_FN);

  /** The peer ids ticked in the list, in the order they were ticked. */
  protected readonly checkedPeers = signal<readonly string[]>([]);
  networkService = Network.instance;
  alarmTitle = this.t('feature.alarm.defaultTitle');
  alarmTime = 60;
  includSelf = true;
  isSound = true;
  isPopUp = true;

  /**
   * The other peers in the room, one row each in the target list; the local peer is not among them.
   */
  get peerList() {
    return this.networkService.peerContexts;
  }
  /** The local peer's cursor, added to the targets when the include-self box is ticked. */
  get myPeer(): PeerCursor {
    return PeerCursor.myCursor;
  }
  /** The room's shared alarm object, which an alarm set from this panel is written to. */
  get alarm(): Alarm {
    return this.objectStore.get<Alarm>('Alarm')!;
  }

  /** The peer ids of the rows, followed as seats come and go. */
  protected readonly peerIds = computed(() => {
    this.objectChange.networkVersion();
    return this.peerList.map((peer) => peer.peerId);
  });

  constructor() {
    afterNextRender(() => {
      this.setDefaultCheck();
    });
  }

  /** Ticks every connected peer and unticks those who have dropped out, which is how the list starts. */
  setDefaultCheck() {
    this.checkedPeers.set(connectedPeerIdsOf(this.peerList.map((peer) => peer.peerId)));
  }

  /**
   * How many peers the alarm will go to, the local peer included when ticked; the set button is
   * disabled at zero.
   */
  selectedNum(): number {
    return this.selectedList().length;
  }

  /**
   * The peer ids the alarm will go to: the ticked peers, then the local peer when include-self is
   * ticked.
   */
  selectedList(): string[] {
    const sendList = [...this.checkedPeers()];
    if (this.includSelf) {
      sendList.push(this.myPeer.peerId);
    }
    return sendList;
  }

  /**
   * Sets the alarm for the chosen peers, announces it in chat, starts it, and closes the panel.
   *
   * The time is clamped first. The chat line lists every target by name, or says it went to
   * everyone when every peer and the local one are included.
   */
  send() {
    if (PeerCursor.isMyselfKeptOffTable) return;
    this.changeAlarmTime();

    const alarm = this.alarm;
    const alarmTitle = this.alarmTitle;
    let target: string;
    const peerIdList = this.selectedList();

    if (this.peerList.length + 1 === this.selectedNum()) {
      target = encodeI18nMessage('feature.alarm.targetAll');
    } else {
      target = ' >';
      for (const peerId of peerIdList) {
        target += peerFaceOf(peerId).name + ' ';
      }
    }
    const startMessage = encodeI18nList(
      [encodeI18nMessage('feature.alarm.setMessage', { seconds: this.alarmTime }), target],
      ''
    );

    alarm.makeAlarm(this.alarmTime, alarmTitle, peerIdList, this.myPeer.peerId, target, this.isSound, this.isPopUp);
    this.chatMessageService.sendSystemMessageAsLastSpeaker(startMessage);
    alarm.startAlarm();
    this.panelService.close();
  }

  /**
   * Clamps the alarm time to between 0 and 3600 seconds; runs when the time box changes and again
   * before sending.
   */
  changeAlarmTime() {
    if (this.alarmTime <= 0) this.alarmTime = 0;
    if (this.alarmTime >= 3600) this.alarmTime = 3600;
  }
}
