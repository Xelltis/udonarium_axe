import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { trackEvery } from '@axe/application/sync/track-every';
import { closeWhenOffTheTable } from '@axe/application/ui/close-when-off-the-table';
import { PanelService } from '@axe/application/ui/panel.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { VoteService } from '@axe/application/vote/vote.service';
import { Network } from '@axe/core/network/network';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { connectedPeerIdsOf } from '@axe/domain/peer/peer-face';
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
  private readonly votes = inject(VoteService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly snackbar = inject(SnackbarService);

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

  /** Every peer connected to the room that may be asked, which is any but a guest's, one row each. */
  get peerList() {
    return this.networkService.peerContexts.filter((peer) => this.votes.mayBeAsked(peer.peerId));
  }
  /** This user's own cursor. */
  get myPeer(): PeerCursor {
    return PeerCursor.myCursor;
  }
  /** The peer ids of the rows, followed as seats come and go and as their roles change. */
  protected readonly peerIds = computed(
    () => {
      this.objectChange.networkVersion();
      trackEvery(this.objectChange, PeerCursor.aliasName);
      return this.peerList.map((peer) => peer.peerId);
    },
    { equal: (a, b) => a.length === b.length && a.every((peerId, index) => peerId === b[index]) }
  );

  constructor() {
    closeWhenOffTheTable();
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
   * The peer ids the vote will be sent to: the ticked peers that may still be asked, and this user
   * when they chose to include themselves.
   */
  selectedList(): string[] {
    const sendList = this.checkedPeers().filter((peerId) => this.votes.mayBeAsked(peerId));
    if (this.includSelf) {
      sendList.push(this.myPeer.peerId);
    }
    return sendList;
  }

  /**
   * Starts a roll call or vote for the chosen users through {@link VoteService.start}, which announces
   * it in the chat tab, and closes the menu once it has started; where it was not started, a notice
   * says why (a guest, the room's vote not here yet, nobody left to ask).
   *
   * A vote takes its choices from the choices field split on spaces.
   */
  send() {
    const refusal = this.votes.start({
      rollCall: this.isRollCall,
      title: this.voteTitle,
      choices: this.voteContentsText.split(/\s+/),
      asked: this.selectedList(),
      secret: this.isSecret,
      tabIdentifier: this.chatTabidentifier,
    });
    if (refusal === null) this.panelService.close();
    else
      this.snackbar.show(
        this.t(`feature.vote.refused.${refusal === 'guest' || refusal === 'missing' ? refusal : 'noSeat'}`)
      );
  }

  /** Switches the menu between a roll call and a vote, from the type radio buttons. */
  onChangeType(value: string) {
    this.isRollCall = value === 'rollcall';
  }
}
