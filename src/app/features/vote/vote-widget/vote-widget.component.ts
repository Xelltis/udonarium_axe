import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nList, encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { WIDGET_VOTE } from '@axe/application/ui/widget-place';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerFace, peerFaceOf } from '@axe/domain/peer/peer-face';
import { Vote } from '@axe/domain/vote/vote';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';
import { WidgetPlaceDirective } from '@axe/ui/directives/widget-place.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'vote-widget',
  templateUrl: './vote-widget.component.html',
  imports: [TextTooltipDirective, DraggableDirective, WidgetPlaceDirective, SafePipe, TranslocoModule],
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
    const counts = { voted: vote.votedTotalNum(), total: vote.voteAnswer.length };
    const text = encodeI18nList(
      [
        this.prefixOf(vote),
        vote.isSecret
          ? encodeI18nMessage('feature.vote.secretAnswered', counts)
          : encodeI18nMessage('feature.vote.voteResult', { choice, ...counts }),
      ],
      ''
    );
    this.chatMessageService.sendSystemMessageAsLastSpeaker(text, vote.chatTabIdentifier);
  }

  /** The words a line about a vote opens with, as a roll call or a vote. */
  private prefixOf(vote: Vote): string {
    return encodeI18nMessage(vote.isRollCall ? 'feature.vote.rollCallPrefix' : 'feature.vote.votePrefix');
  }

  protected abstain(): void {
    const vote = this.vote();
    if (!vote || this.isAnswered()) return;
    vote.voting(null, PeerCursor.myCursor.peerId);
    const counts = { voted: vote.votedTotalNum(), total: vote.voteAnswer.length };
    const text = encodeI18nList(
      [
        this.prefixOf(vote),
        encodeI18nMessage(vote.isSecret ? 'feature.vote.secretAnswered' : 'feature.vote.abstainResult', counts),
      ],
      ''
    );
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

  /** How the seat a row is for is shown. */
  protected faceOf(peerId: string): PeerFace {
    return peerFaceOf(peerId);
  }
}
