import { afterNextRender, ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { Network } from '@axe/core/index';
import { ImageFile } from '@axe/core/storage/image-file';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Alarm } from '@axe/domain/alarm/alarm';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-alarm-menu',
  templateUrl: './alarm-menu.component.html',
  imports: [FormsModule, SafePipe, TranslocoModule],
})
export class AlarmMenuComponent {
  private readonly modalService = inject(ModalService);
  private readonly panelService = inject(PanelService);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly saveDataService = inject(SaveDataService);
  private readonly objectStore = inject(ObjectStore);
  private readonly t = inject(TRANSLATE_FN);

  protected checkedPeers = new Set<string>();
  networkService = Network;
  voteContentsText = '';
  alarmTitle = this.t('feature.alarm.defaultTitle');
  alarmTime = 60;
  isRollCall = true;
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

  constructor() {
    queueMicrotask(() => (this.modalService.title = this.panelService.title = this.t('feature.alarm.panelTitle')));
    afterNextRender(() => {
      this.setDefaultCheck();
    });
  }

  /**
   * Whether a peer has dropped out of the room, counting a peer with no cursor as dropped.
   *
   * A dropped peer's row is dimmed and left unticked when the list starts.
   */
  isPeerIsDisConnect(peerId: string): boolean {
    const cursor = PeerCursor.findByPeerId(peerId);
    return cursor ? cursor.isDisConnect : true;
  }

  /**
   * Ticks every connected peer and unticks the rest, which is how the list starts once the panel
   * has rendered.
   */
  setDefaultCheck() {
    this.checkedPeers.clear();
    for (const peer of this.peerList) {
      if (!this.isPeerIsDisConnect(peer.peerId)) {
        this.checkedPeers.add(peer.peerId);
      }
    }
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
    const sendList = [...this.checkedPeers];
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
    this.changeAlarmTime();

    const alarm = this.alarm;
    const alarmTitle = this.alarmTitle;
    let startMessage: string;
    let target: string;
    const peerIdList = this.selectedList();

    startMessage = this.t('feature.alarm.setMessage', { seconds: this.alarmTime });

    if (this.peerList.length + 1 == this.selectedNum()) {
      target = this.t('feature.alarm.targetAll');
    } else {
      target = ' >';
      for (const peerId of peerIdList) {
        target += this.findPeerName(peerId) + ' ';
      }
    }
    startMessage += target;

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

  /**
   * Sets whether this is a roll call from a type picker's value, where only `'rollcall'` counts as
   * one.
   */
  onChangeType(value: string) {
    this.isRollCall = value === 'rollcall';
  }

  /** Ticks or unticks a peer as a target when the user clicks the peer's row. */
  voteBlockClick(id: string) {
    if (this.checkedPeers.has(id)) {
      this.checkedPeers.delete(id);
    } else {
      this.checkedPeers.add(id);
    }
  }

  /** The user id of the peer with this peer id, or an empty string when the peer has no cursor. */
  findUserId(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    return peerCursor ? peerCursor.userId : '';
  }

  /**
   * A peer's player name, shown on its row and listed in the chat line; empty when the peer has no
   * cursor.
   */
  findPeerName(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    return peerCursor ? peerCursor.name : '';
  }

  /**
   * The name of the character a peer last controlled, or empty when there is none or the peer has
   * no cursor.
   */
  findPeerLastControlName(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    return peerCursor ? peerCursor.lastControlCharacterName : '';
  }

  /**
   * A peer's own avatar image, or null when there is none, in which case the row shows a
   * placeholder icon.
   */
  findPeerImage(peerId: string): ImageFile | null {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    return peerCursor ? peerCursor.image : null;
  }

  /**
   * The image of the character a peer last controlled, shown at the end of its row; null when there
   * is none.
   */
  findPeerLastControlImage(peerId: string): ImageFile | null {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    return peerCursor ? peerCursor.lastControlImage : null;
  }
}
