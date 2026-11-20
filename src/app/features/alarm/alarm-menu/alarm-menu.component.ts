import { afterNextRender, ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlarmService } from '@axe/application/alarm/alarm.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { closeWhenOffTheTable } from '@axe/application/ui/close-when-off-the-table';
import { PanelService } from '@axe/application/ui/panel.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { Network } from '@axe/core/network/network';
import { clampAlarmSeconds } from '@axe/domain/alarm/alarm';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { connectedPeerIdsOf } from '@axe/domain/peer/peer-face';
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
  private readonly alarms = inject(AlarmService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly snackbar = inject(SnackbarService);

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
  /** The peer ids of the rows, followed as seats come and go. */
  protected readonly peerIds = computed(() => {
    this.objectChange.networkVersion();
    return this.peerList.map((peer) => peer.peerId);
  });

  constructor() {
    closeWhenOffTheTable();
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
   * Sets the alarm for the chosen peers through {@link AlarmService.set}, which announces it in chat
   * and starts it, and closes the panel once it is set; where it was not set, a notice says why. The
   * time is clamped first.
   */
  send() {
    this.changeAlarmTime();
    const refusal = this.alarms.set({
      title: this.alarmTitle,
      seconds: this.alarmTime,
      to: this.selectedList(),
      sound: this.isSound,
      popup: this.isPopUp,
    });
    if (refusal === null) this.panelService.close();
    else this.snackbar.show(this.t(`feature.alarm.refused.${refusal}`));
  }

  /**
   * Clamps the alarm time to between none and an hour, as {@link clampAlarmSeconds} does; runs when
   * the time box changes and again before sending.
   */
  changeAlarmTime() {
    this.alarmTime = clampAlarmSeconds(this.alarmTime);
  }
}
