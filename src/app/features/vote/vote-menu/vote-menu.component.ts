import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { Network } from '@axe/core/index';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { Vote } from '@axe/domain/vote/vote';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-vote-menu',
  templateUrl: './vote-menu.component.html',
  imports: [FormsModule, SafePipe, TranslocoModule],
})
export class VoteMenuComponent {
  private readonly modalService = inject(ModalService);
  private readonly panelService = inject(PanelService);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly saveDataService = inject(SaveDataService);
  private readonly objectStore = inject(ObjectStore);
  private readonly t = inject(TRANSLATE_FN);

  protected checkedPeers = new Set<string>();
  chatTabidentifier = '';
  networkService = Network;
  voteContentsText = '';
  voteTitle = this.t('feature.vote.voteTitlePlaceholder');
  isRollCall = true;
  includSelf = false;

  /** Every peer connected to the room, one row each in the vote menu. */
  get peerList() {
    return this.networkService.peerContexts;
  }
  /** This user's own cursor. */
  get myPeer(): PeerCursor {
    return PeerCursor.myCursor;
  }
  /** The room's single shared vote object. */
  get vote(): Vote {
    return this.objectStore.get<Vote>('Vote')!;
  }

  constructor() {
    queueMicrotask(() => (this.modalService.title = this.panelService.title = this.t('feature.vote.panelTitle')));
    this.setDefaultCheck();
  }

  /**
   * Whether a peer has dropped out of the room, or has no cursor yet; such rows are dimmed and
   * start unticked.
   */
  isPeerIsDisConnect(peerId: string): boolean {
    const cursor = PeerCursor.findByPeerId(peerId);
    return cursor ? cursor.isDisConnect : true;
  }

  /** Ticks every connected peer and unticks those who have dropped out, as the menu opens. */
  setDefaultCheck() {
    this.checkedPeers.clear();
    for (const peer of this.peerList) {
      if (!this.isPeerIsDisConnect(peer.peerId)) {
        this.checkedPeers.add(peer.peerId);
      }
    }
  }

  /** How many users the vote will be sent to, this user included when they chose to be. */
  selectedNum(): number {
    return this.selectedList().length;
  }

  /**
   * The peer ids the vote will be sent to: the ticked peers, and this user when they chose to
   * include themselves.
   */
  selectedList(): string[] {
    const sendList = [...this.checkedPeers];
    if (this.includSelf) {
      sendList.push(this.myPeer.peerId);
    }
    return sendList;
  }

  /**
   * Starts a roll call or vote for the chosen users, announces it in the chat tab and closes the
   * menu.
   *
   * A roll call asks a fixed ready answer. A vote takes its choices from the choices field split on
   * spaces, or a default choice when the field is empty.
   */
  send() {
    const vote = this.vote;
    let voteTitle: string;
    let choicesInput: string = this.voteContentsText.replace(/\s*$/i, '').replace(/^\s*/i, '');
    let startMessage: string;

    if (this.isRollCall) {
      choicesInput = this.t('feature.vote.rollCallReady');
      startMessage = this.t('feature.vote.rollCallStart');
      voteTitle = this.t('feature.vote.rollCall');
    } else {
      choicesInput = choicesInput.length == 0 ? this.t('feature.vote.rollCallDefault') : choicesInput;
      startMessage = this.t('feature.vote.voteStart', { title: this.voteTitle });
      voteTitle = this.voteTitle;
    }
    const choices = choicesInput.split(/\s+/i);
    const peerList = this.selectedList();

    vote.makeVote(PeerCursor.myCursor.peerId, voteTitle, peerList, choices, this.isRollCall, this.chatTabidentifier);
    vote.startVote();
    this.chatMessageService.sendSystemMessageAsLastSpeaker(startMessage, this.chatTabidentifier);
    this.panelService.close();
  }

  /** Switches the menu between a roll call and a vote, from the type radio buttons. */
  onChangeType(value: string) {
    this.isRollCall = value === 'rollcall';
  }

  /** Ticks or unticks a peer as a recipient, from a click on their row. */
  voteBlockClick(id: string) {
    if (this.checkedPeers.has(id)) {
      this.checkedPeers.delete(id);
    } else {
      this.checkedPeers.add(id);
    }
  }

  /** The user id of the peer's cursor, or an empty string when it has none. */
  findUserId(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    return peerCursor ? peerCursor.userId : '';
  }

  /** The name of the peer's cursor, or an empty string when it has none. */
  findPeerName(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    return peerCursor ? peerCursor.name : '';
  }

  /** The name of the character the peer last spoke as, or an empty string when there is none. */
  findPeerLastControlName(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    return peerCursor ? peerCursor.lastControlCharacterName : '';
  }

  /** The picture of the peer's cursor, or null when it has none. */
  findPeerImage(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    return peerCursor ? peerCursor.image : null;
  }

  /** The picture of the character the peer last spoke as, or null when there is none. */
  findPeerLastControlImage(peerId: string) {
    const peerCursor = PeerCursor.findByPeerId(peerId);
    return peerCursor ? peerCursor.lastControlImage : null;
  }
}
