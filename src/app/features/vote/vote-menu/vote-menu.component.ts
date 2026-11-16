import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { Network } from '@axe/core/network/network';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { connectedPeerIdsOf } from '@axe/domain/peer/peer-face';
import { Vote } from '@axe/domain/vote/vote';
import { UiPeerPickListComponent } from '@axe/ui/components/peer-pick-list/peer-pick-list.component';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'vote-menu',
  templateUrl: './vote-menu.component.html',
  imports: [FormsModule, TranslocoModule, UiPeerPickListComponent],
})
export class VoteMenuComponent {
  private readonly panelService = inject(PanelService);
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly t = inject(TRANSLATE_FN);

  /** The peer ids ticked in the list, in the order they were ticked. */
  protected readonly checkedPeers = signal<readonly string[]>([]);
  chatTabidentifier = '';
  networkService = Network.instance;
  voteContentsText = '';
  voteTitle = this.t('feature.vote.voteTitlePlaceholder');
  isRollCall = true;
  /** Whether a vote keeps its answers hidden until it closes. A roll call ignores it. */
  isSecret = false;
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

  /** The peer ids of the rows, followed as seats come and go. */
  protected readonly peerIds = computed(() => {
    this.objectChange.networkVersion();
    return this.peerList.map((peer) => peer.peerId);
  });

  constructor() {
    this.setDefaultCheck();
  }

  /** Ticks every connected peer and unticks those who have dropped out, which is how the list starts. */
  setDefaultCheck() {
    this.checkedPeers.set(connectedPeerIdsOf(this.peerList.map((peer) => peer.peerId)));
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
    const sendList = [...this.checkedPeers()];
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
   * spaces, or a default choice when the field is empty, and says in its announcement when its
   * answers are hidden until it closes.
   */
  send() {
    if (PeerCursor.isMyselfKeptOffTable) return;
    const vote = this.vote;
    let voteTitle: string;
    let choicesInput: string = this.voteContentsText.trim();
    let startMessage: string;

    if (this.isRollCall) {
      choicesInput = this.t('feature.vote.rollCallReady');
      startMessage = encodeI18nMessage('feature.vote.rollCallStart');
      voteTitle = this.t('feature.vote.rollCall');
    } else {
      choicesInput = choicesInput.length === 0 ? this.t('feature.vote.rollCallDefault') : choicesInput;
      startMessage = encodeI18nMessage(this.isSecret ? 'feature.vote.voteStartSecret' : 'feature.vote.voteStart', {
        title: this.voteTitle,
      });
      voteTitle = this.voteTitle;
    }
    const choices = choicesInput.split(/\s+/i);
    const peerList = this.selectedList();

    vote.makeVote(
      PeerCursor.myCursor.peerId,
      voteTitle,
      peerList,
      choices,
      this.isRollCall,
      this.chatTabidentifier,
      this.isSecret
    );
    vote.startVote();
    this.chatMessageService.sendSystemMessageAsLastSpeaker(startMessage, this.chatTabidentifier);
    this.panelService.close();
  }

  /** Switches the menu between a roll call and a vote, from the type radio buttons. */
  onChangeType(value: string) {
    this.isRollCall = value === 'rollcall';
  }
}
