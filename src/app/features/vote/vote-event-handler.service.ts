import { DestroyRef, inject, Injectable } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nList, encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { FinishVoteEvent } from '@axe/core/event/domain-events';

@Injectable({ providedIn: 'root' })
export class VoteEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly chatMessageService = inject(ChatMessageService);

  constructor() {
    this.objectChange.finishVote$.subscribe((event) => {
      this.chatMessageService.sendSystemMessageAsLastSpeaker(this.resultText(event), event.chatTabIdentifier);
    }, this.destroyRef);
  }

  private resultText(event: FinishVoteEvent): string {
    const parts: string[] = [];
    if (event.isRollCall) {
      parts.push(encodeI18nMessage('feature.vote.rollCallFinish', { voted: event.voted, total: event.total }));
    } else {
      parts.push(encodeI18nMessage('feature.vote.voteFinish', { title: event.voteTitle }));
      for (const tally of event.tally) {
        parts.push(encodeI18nMessage('feature.vote.tallyEntry', { choice: tally.choice, count: tally.count }));
      }
    }
    if (event.abstained > 0) {
      parts.push(encodeI18nMessage('feature.vote.abstainCount', { count: event.abstained }));
    }
    if (event.unanswered > 0) {
      parts.push(encodeI18nMessage('feature.vote.unansweredCount', { count: event.unanswered }));
    }
    return encodeI18nList(parts, ' ');
  }
}
