import { inject, Injectable } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nList, encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canRoleEdit } from '@axe/domain/peer/peer-role';
import { Vote } from '@axe/domain/vote/vote';

/**
 * Why a vote was not started, answered or ended: the seat only watches, nobody would be asked, there
 * is no vote being answered, the seat was not asked, it has answered already, the answer is not one of
 * the choices, or the seat is not in the chair.
 */
export type VoteRefusal =
  'guest' | 'missing' | 'noSeat' | 'closed' | 'notAsked' | 'answered' | 'notOffered' | 'notChair';

/** What starting a vote or a roll call takes. */
export interface VoteCall {
  readonly rollCall: boolean;
  /** What a vote asks; a roll call goes under its own title. */
  readonly title: string;
  /** The choices of a vote, two of the usual answers where none are given. */
  readonly choices: readonly string[];
  /** The seats asked, by peer id. */
  readonly asked: readonly string[];
  /** Whether who answered what stays hidden until it is over; never for a roll call. */
  readonly secret: boolean;
  /** The chat tab it is said in, by identifier; the system tab where empty. */
  readonly tabIdentifier: string;
}

/** The words of a choice text, as the choices of a vote are written apart. */
function wordsOf(text: string): string[] {
  return text
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
}

/**
 * Starting, answering and ending the room's vote and roll call, which the vote menu, the vote widget
 * and the AI link all go through. A seat that only watches starts none and answers none.
 */
@Injectable({ providedIn: 'root' })
export class VoteService {
  private readonly objectStore = inject(ObjectStore);
  private readonly permission = inject(RolePermissionService);
  private readonly chat = inject(ChatMessageService);
  private readonly t = inject(TRANSLATE_FN);

  /** The room's one vote, or null before the room has made it. */
  get vote(): Vote | null {
    return this.objectStore.get<Vote>('Vote');
  }

  /** Whether this reader may start a vote or a roll call, which every role but a guest may. */
  mayCall(): boolean {
    return this.permission.canEditTabletop();
  }

  /**
   * Whether a seat may be asked, which is whether it may answer: any seat but a guest's. A seat not
   * known yet is asked, and counts as having left if it never comes.
   */
  mayBeAsked(peerId: string): boolean {
    const seat = PeerCursor.findByPeerId(peerId);
    return !seat || canRoleEdit(seat.role);
  }

  /**
   * Starts a vote or roll call with this reader in the chair, opens it on every screen and says so in
   * chat. Only the seats that may answer are asked. Why it was not started, or null where it was.
   */
  start(call: VoteCall): VoteRefusal | null {
    const vote = this.vote;
    if (!this.mayCall()) return 'guest';
    if (!vote) return 'missing';
    const asked = [...new Set(call.asked)].filter((peerId) => this.mayBeAsked(peerId));
    if (asked.length < 1) return 'noSeat';
    const given = call.choices.map((choice) => choice.trim()).filter((choice) => choice.length > 0);
    const title = call.rollCall
      ? this.t('feature.vote.rollCall')
      : call.title.trim() || this.t('feature.vote.voteTitlePlaceholder');
    const choices = call.rollCall
      ? wordsOf(this.t('feature.vote.rollCallReady'))
      : given.length > 0
        ? given
        : wordsOf(this.t('feature.vote.rollCallDefault'));
    const startMessage = call.rollCall
      ? encodeI18nMessage('feature.vote.rollCallStart')
      : encodeI18nMessage(call.secret ? 'feature.vote.voteStartSecret' : 'feature.vote.voteStart', { title });
    vote.makeVote(PeerCursor.myCursor.peerId, title, asked, choices, call.rollCall, call.tabIdentifier, call.secret);
    vote.startVote();
    this.chat.sendSystemMessageAsLastSpeaker(startMessage, call.tabIdentifier);
    return null;
  }

  /** Why this reader may not answer the vote now, or null where it may. */
  answerRefusal(): VoteRefusal | null {
    const vote = this.vote;
    if (!this.permission.canEditTabletop()) return 'guest';
    if (!vote?.isOpen()) return 'closed';
    if (!vote.chkToMe()) return 'notAsked';
    if (vote.isVoteEnd(PeerCursor.myCursor?.peerId ?? '')) return 'answered';
    return null;
  }

  /** Whether this reader may answer the vote now: asked, not yet answered, and no guest. */
  mayAnswer(): boolean {
    return this.answerRefusal() === null;
  }

  /**
   * Answers the vote with one of its choices, or abstains where the choice is null, and says in chat
   * that this seat answered, and what where the vote shows it. Why it was not answered, or null.
   */
  answer(choice: string | null): VoteRefusal | null {
    const refusal = this.answerRefusal();
    const vote = this.vote;
    if (refusal || !vote) return refusal ?? 'closed';
    if (choice !== null && !vote.choices.includes(choice)) return 'notOffered';
    vote.voting(choice, PeerCursor.myCursor.peerId);
    const counts = { voted: vote.votedTotalNum(), total: vote.voteAnswer.length };
    const prefix = encodeI18nMessage(vote.isRollCall ? 'feature.vote.rollCallPrefix' : 'feature.vote.votePrefix');
    const said =
      choice === null
        ? encodeI18nMessage(vote.isSecret ? 'feature.vote.secretAnswered' : 'feature.vote.abstainResult', counts)
        : vote.isSecret
          ? encodeI18nMessage('feature.vote.secretAnswered', counts)
          : encodeI18nMessage('feature.vote.voteResult', { choice, ...counts });
    this.chat.sendSystemMessageAsLastSpeaker(encodeI18nList([prefix, said], ''), vote.chatTabIdentifier);
    return null;
  }

  /**
   * Ends the vote early and has the result said, as its chair may; a chair made a guest on a room
   * server may not, as the server would take it back. Why it was not ended, or null.
   */
  finish(): VoteRefusal | null {
    const vote = this.vote;
    if (!vote?.isOpen()) return 'closed';
    if (!vote.isChair()) return 'notChair';
    if (PeerCursor.isMyselfKeptOffTable) return 'guest';
    vote.finishByChair();
    return null;
  }
}
