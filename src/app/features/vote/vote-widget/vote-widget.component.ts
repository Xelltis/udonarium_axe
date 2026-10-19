import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { WIDGET_VOTE } from '@axe/application/ui/widget-place';
import { ImageFile } from '@axe/core/storage/image-file';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { Vote } from '@axe/domain/vote/vote';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { WidgetPlaceDirective } from '@axe/ui/directives/widget-place.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-vote-widget',
  templateUrl: './vote-widget.component.html',
  imports: [DraggableDirective, WidgetPlaceDirective, SafePipe, TranslocoModule],
})
export class VoteWidgetComponent {
  private readonly chatMessageService = inject(ChatMessageService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  protected readonly widgetName = WIDGET_VOTE;
  protected readonly fallback = (el: HTMLElement) => ({
    left: Math.max(8, (window.innerWidth - el.offsetWidth) / 2),
    top: Math.max(8, window.innerHeight - el.offsetHeight - 96),
  });
  private readonly destroyRef = inject(DestroyRef);
  private readonly t = inject(TRANSLATE_FN);

  protected readonly isCollapsed = signal(false);

  protected readonly vote = computed(
    () => {
      this.objectChange.versionOf('Vote')();
      const vote = this.objectStore.get<Vote>('Vote');
      if (!vote) return null;
      for (const peerId of vote.targetPeerId) {
        const cursor = PeerCursor.findByPeerId(peerId);
        if (cursor) this.objectChange.versionOf(cursor.identifier)();
      }
      return vote;
    },
    { equal: () => false }
  );

  protected readonly isShown = computed(() => {
    const vote = this.vote();
    if (!vote || !PeerCursor.myCursor) return false;
    if (vote.initTimeStamp <= 0 || vote.isFinish) return false;
    return vote.chkToMe() || vote.isChair();
  });

  protected readonly isTarget = computed(() => {
    const vote = this.vote();
    return vote != null && PeerCursor.myCursor != null && vote.chkToMe();
  });

  /** Whether who answered what may be shown, which a secret vote holds back until it closes. */
  protected readonly answersShown = computed(() => this.vote()?.answersShown() ?? true);

  protected readonly isAnswered = computed(() => {
    const vote = this.vote();
    return vote != null && PeerCursor.myCursor != null && vote.isVoteEnd(PeerCursor.myCursor.peerId);
  });

  constructor() {
    this.objectChange.startVote$.subscribe(() => this.isCollapsed.set(false), this.destroyRef);
  }

  protected toggleCollapsed(): void {
    this.isCollapsed.update((collapsed) => !collapsed);
  }

  protected voteSend(choice: string): void {
    const vote = this.vote();
    if (!vote || this.isAnswered()) return;
    vote.voting(choice, PeerCursor.myCursor.peerId);
    const prefix = vote.isRollCall ? this.t('feature.vote.rollCallPrefix') : this.t('feature.vote.votePrefix');
    const counts = { voted: vote.votedTotalNum(), total: vote.voteAnswer.length };
    const text =
      prefix +
      (vote.isSecret
        ? this.t('feature.vote.secretAnswered', counts)
        : this.t('feature.vote.voteResult', { choice, ...counts }));
    this.chatMessageService.sendSystemMessageAsLastSpeaker(text, vote.chatTabIdentifier);
  }

  protected abstain(): void {
    const vote = this.vote();
    if (!vote || this.isAnswered()) return;
    vote.voting(null, PeerCursor.myCursor.peerId);
    const prefix = vote.isRollCall ? this.t('feature.vote.rollCallPrefix') : this.t('feature.vote.votePrefix');
    const counts = { voted: vote.votedTotalNum(), total: vote.voteAnswer.length };
    const text = prefix + this.t(vote.isSecret ? 'feature.vote.secretAnswered' : 'feature.vote.abstainResult', counts);
    this.chatMessageService.sendSystemMessageAsLastSpeaker(text, vote.chatTabIdentifier);
  }

  protected finishByChair(): void {
    this.vote()?.finishByChair();
  }

  /**
   * Whether a peer's answer is kept from view: a secret vote that is still open shows only that
   * somebody has answered, except to the one who gave the answer.
   */
  protected answerHidden(peerId: string, answer: number): boolean {
    return !this.answersShown() && answer !== -1 && peerId !== PeerCursor.myCursor?.peerId;
  }

  protected findPeerName(peerId: string): string {
    return PeerCursor.findByPeerId(peerId)?.name ?? '';
  }

  protected findPeerLastControlName(peerId: string): string {
    return PeerCursor.findByPeerId(peerId)?.lastControlCharacterName ?? '';
  }

  protected findPeerImage(peerId: string): ImageFile | null {
    return PeerCursor.findByPeerId(peerId)?.image ?? null;
  }

  protected findPeerLastControlImage(peerId: string): ImageFile | null {
    return PeerCursor.findByPeerId(peerId)?.lastControlImage ?? null;
  }
}
