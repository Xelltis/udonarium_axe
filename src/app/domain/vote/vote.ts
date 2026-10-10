import { emitEndOldVote, emitFinishVote, emitStartVote, FinishVoteEvent } from '@axe/core/event/domain-events';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject, ObjectContext } from '@axe/core/sync/game-object';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

export interface VoteContext {
  peerId: string;
}

@SyncObject('Vote')
export class Vote extends GameObject {
  @SyncVar() initTimeStamp = 0;
  @SyncVar() voteTitle = '';
  //  @SyncVar() voteAnswer: VoteContext[] = [];

  @SyncVar() targetPeerId: string[] = [];

  //  @SyncVar() lastVotePeerId = '';
  @SyncVar() choices: string[] = [];
  @SyncVar() chairId = '';
  @SyncVar() isRollCall = false;
  @SyncVar() isFinish = false;
  @SyncVar() voteId = 0;
  @SyncVar() chatTabIdentifier = '';

  /**
   * The answer a peer has given in the current vote: the index of their choice, -1 while they have
   * not answered, or -2 when they abstained, dropped out, or are no longer in the room.
   */
  voteAnswerByPeerId(peerId: string): number {
    const peer = PeerCursor.findByPeerId(peerId);
    if (peer) {
      if (peer.voteId == this.voteId) {
        return peer.voteAnswer;
      }
      if (peer.isDisConnect) {
        return -2;
      }
      return -1;
    } else {
      return -2; // 棄権扱いにする
    }
  }

  /**
   * Every asked peer's answer, in the order of `targetPeerId`, as voteAnswerByPeerId gives them.
   */
  get voteAnswer(): number[] {
    const answer: number[] = [];

    for (const peerId of this.targetPeerId) {
      answer.push(this.voteAnswerByPeerId(peerId));
    }
    return answer;
  }

  /**
   * Sets up a new vote: its chair, title, the peers asked, the choices and whether it is a roll
   * call.
   *
   * It bumps the vote id, which leaves every earlier answer behind, and stamps the start time so
   * that peers open the vote when the change reaches them.
   */
  makeVote(
    chairId: string,
    voteTitle: string,
    targetPeerId: string[],
    choices: string[],
    isRollCall: boolean,
    chatTabIdentifier = ''
  ) {
    this.isRollCall = isRollCall;
    this.chairId = chairId;
    this.choices = choices;
    this.voteTitle = voteTitle;
    this.isFinish = false;
    this.chatTabIdentifier = chatTabIdentifier;
    this.voteId++;

    this.targetPeerId = targetPeerId;
    this.initTimeStamp = Date.now();
  }

  /**
   * Whether a peer is done with this vote: asked, and either answered or gone from the room. A peer
   * who was not asked is never done.
   */
  isVoteEnd(peerId: string): boolean {
    for (const targetPeer of this.targetPeerId) {
      if (targetPeer == peerId) {
        const peer = PeerCursor.findByPeerId(peerId);
        if (!peer) return true;
        if (peer.voteId == this.voteId) return true;
      }
    }
    return false;
  }

  /**
   * Records this client's answer, or an abstention when the choice is null, then finishes the vote
   * if that was the last answer the chair was waiting for.
   *
   * The answer is kept on this client's peer cursor, which syncs it; the peer id argument is not
   * used.
   */
  voting(choice: string | null, _peerId: string) {
    if (choice) {
      PeerCursor.myCursor.voteAnswer = this.choices.indexOf(choice);
    } else {
      PeerCursor.myCursor.voteAnswer = -2;
    }
    PeerCursor.myCursor.voteId = this.voteId;

    this.chkFinishVote();
  }

  /**
   * Finishes the vote and announces the result once everyone asked has answered, when this client
   * is the chair and it has not finished already.
   */
  chkFinishVote() {
    if (this.isFinish) return;
    if (this.chairId == PeerCursor.myCursor?.peerId && this.votedTotalNum() == this.targetPeerId.length) {
      this.finish();
    }
  }

  /** Ends the vote early and announces the result. Only the chair can, and only once. */
  finishByChair() {
    if (this.isFinish) return;
    if (this.chairId != PeerCursor.myCursor?.peerId) return;
    this.finish();
  }

  /** Whether this client is the one running the vote. */
  isChair(): boolean {
    return this.chairId === PeerCursor.myCursor?.peerId;
  }

  /** How many of the peers asked have neither answered nor abstained. */
  unansweredNum(): number {
    return this.targetPeerId.length - this.votedTotalNum();
  }

  private finish() {
    this.isFinish = true;
    const result = this.result();
    setTimeout(() => {
      emitFinishVote(result);
    }, 1);
  }

  private result(): FinishVoteEvent {
    return {
      isRollCall: this.isRollCall,
      voteTitle: this.voteTitle,
      voted: this.votedTotalNum(),
      total: this.targetPeerId.length,
      abstained: this.votedNumByIndex(-2),
      unanswered: this.unansweredNum(),
      tally: this.isRollCall ? [] : this.choices.map((choice) => ({ choice, count: this.votedNumByChoice(choice) })),
      chatTabIdentifier: this.chatTabIdentifier,
    };
  }

  /** How many of the peers asked have answered, abstentions included. */
  votedTotalNum(): number {
    const answer: number[] = this.voteAnswer;
    let count = 0;
    for (const ans of answer) {
      if (ans >= 0 || ans == -2) {
        count++;
      }
    }
    return count;
  }

  /** How many peers gave this answer index, where -2 counts abstentions. */
  votedNumByIndex(index: number): number {
    const answer: number[] = this.voteAnswer;
    let count = 0;
    for (const ans of answer) {
      if (ans == index) {
        count++;
      }
    }
    return count;
  }

  /**
   * How many peers picked this choice.
   *
   * A choice that is not on the list is looked up as the index -1, which counts the peers who have
   * not answered yet.
   */
  votedNumByChoice(choice: string): number {
    const index = this.choices.indexOf(choice);
    return this.votedNumByIndex(index);
  }

  /** The choice text for an answer index, or empty for -1, -2 or any index off the list. */
  indexToChoice(index: number): string {
    if (index < 0) return '';
    if (index >= this.choices.length) return '';
    return this.choices[index];
  }

  /** Whether this client is one of the peers asked. */
  chkToMe(): boolean {
    for (const target of this.targetPeerId) {
      if (PeerCursor.myCursor.peerId == target) return true;
    }
    return false;
  }

  /**
   * Announces on this client that any earlier vote is over and this one has begun, so the vote
   * panels open.
   */
  startVote() {
    emitEndOldVote();
    emitStartVote();
  }

  /**
   * Applies a synced update, starting the vote on this client when the update carries a new start
   * time, then checks whether the vote can now finish.
   */
  override apply(context: ObjectContext) {
    const initTimeStamp = this.initTimeStamp;
    super.apply(context);

    if (initTimeStamp !== this.initTimeStamp) {
      this.startVote();
    }

    this.chkFinishVote();
  }
}
