import { TestBed } from '@angular/core/testing';
import * as domainEvents from '@axe/core/event/domain-events';
import { Network } from '@axe/core/network/network';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { Vote } from '@axe/domain/vote/vote';

describe('Vote', () => {
  let vote: Vote;
  const savedMyCursor = PeerCursor.myCursor;

  beforeEach(() => {
    TestBed.configureTestingModule({});

    vote = new Vote();
    vote.initialize();

    PeerCursor.myCursor = { peerId: 'my-peer-id', voteAnswer: -1, voteId: -1 } as unknown as PeerCursor;
  });

  afterEach(() => {
    PeerCursor.myCursor = savedMyCursor;
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('how it starts', () => {
    it('starts unstamped', () => {
      expect(vote.initTimeStamp).toBe(0);
    });

    it('starts untitled', () => {
      expect(vote.voteTitle).toBe('');
    });

    it('starts asking nobody', () => {
      expect(vote.targetPeerId).toEqual([]);
    });

    it('starts with no choices', () => {
      expect(vote.choices).toEqual([]);
    });

    it('starts with no chair', () => {
      expect(vote.chairId).toBe('');
    });

    it('starts as a vote rather than a roll call', () => {
      expect(vote.isRollCall).toBe(false);
    });

    it('starts with its answers in the open', () => {
      expect(vote.isSecret).toBe(false);
    });

    it('starts unfinished', () => {
      expect(vote.isFinish).toBe(false);
    });

    it('starts unnumbered', () => {
      expect(vote.voteId).toBe(0);
    });
  });

  describe('makeVote()', () => {
    it('takes every field', () => {
      vote.makeVote('chair-1', '投票テスト', ['peer-1', 'peer-2'], ['賛成', '反対'], false);

      expect(vote.chairId).toBe('chair-1');
      expect(vote.voteTitle).toBe('投票テスト');
      expect(vote.targetPeerId).toEqual(['peer-1', 'peer-2']);
      expect(vote.choices).toEqual(['賛成', '反対']);
      expect(vote.isRollCall).toBe(false);
    });

    it('counts the vote up', () => {
      expect(vote.voteId).toBe(0);
      vote.makeVote('c', 'v1', [], [], false);
      expect(vote.voteId).toBe(1);
      vote.makeVote('c', 'v2', [], [], false);
      expect(vote.voteId).toBe(2);
    });

    it('stamps it with the moment it started', () => {
      const before = Date.now();
      vote.makeVote('c', 'v', [], [], false);
      const after = Date.now();

      expect(vote.initTimeStamp).toBeGreaterThanOrEqual(before);
      expect(vote.initTimeStamp).toBeLessThanOrEqual(after);
    });

    it('makes it a roll call when asked', () => {
      vote.makeVote('c', '点呼', ['p1'], [], true);
      expect(vote.isRollCall).toBe(true);
    });

    it('puts the finished flag back as a new one starts', () => {
      vote.isFinish = true;

      vote.makeVote('c', '再点呼', ['p1'], ['準備完了'], true);

      expect(vote.isFinish).toBe(false);
    });

    it('keeps the answers in the open unless asked to hide them', () => {
      vote.makeVote('c', '投票', ['p1'], ['賛成', '反対'], false);

      expect(vote.isSecret).toBe(false);
      expect(vote.answersShown()).toBe(true);
    });

    it('hides the answers of a secret vote until it is over', () => {
      vote.makeVote('c', '投票', ['p1'], ['賛成', '反対'], false, 'tab-main', true);

      expect(vote.isSecret).toBe(true);
      expect(vote.answersShown()).toBe(false);

      vote.isFinish = true;
      expect(vote.answersShown()).toBe(true);
    });

    it('never hides the answers of a roll call', () => {
      vote.makeVote('c', '点呼', ['p1'], ['準備完了'], true, 'tab-main', true);

      expect(vote.isSecret).toBe(false);
      expect(vote.answersShown()).toBe(true);
    });

    it('opens the answers again for the next vote unless it is secret too', () => {
      vote.makeVote('c', '投票', ['p1'], ['賛成', '反対'], false, 'tab-main', true);

      vote.makeVote('c', '投票', ['p1'], ['賛成', '反対'], false);

      expect(vote.isSecret).toBe(false);
    });

    it('remembers the tab it started in', () => {
      vote.makeVote('c', '点呼', ['p1'], ['準備完了'], true, 'tab-main');

      expect(vote.chatTabIdentifier).toBe('tab-main');
    });

    it('remembers none when none is given', () => {
      vote.chatTabIdentifier = 'tab-old';

      vote.makeVote('c', '点呼', ['p1'], ['準備完了'], true);

      expect(vote.chatTabIdentifier).toBe('');
    });
  });

  describe('voteAnswerByPeerId()', () => {
    it('counts somebody who is not there as an abstention', () => {
      vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue(null!);
      expect(vote.voteAnswerByPeerId('nonexistent')).toBe(-2);
    });

    it('counts somebody on another vote as not having answered', () => {
      vote.voteId = 5;
      vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({
        voteId: 3,
        voteAnswer: 0,
        isDisConnect: false,
      } as unknown as PeerCursor);
      expect(vote.voteAnswerByPeerId('peer-1')).toBe(-1);
    });

    it('returns the answer of somebody on this one', () => {
      vote.voteId = 5;
      vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({
        voteId: 5,
        voteAnswer: 2,
        isDisConnect: false,
      } as unknown as PeerCursor);
      expect(vote.voteAnswerByPeerId('peer-1')).toBe(2);
    });

    it('returns the answer of somebody who has dropped but had answered', () => {
      vote.voteId = 5;
      vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({
        voteId: 5,
        voteAnswer: 0,
        isDisConnect: true,
      } as unknown as PeerCursor);
      expect(vote.voteAnswerByPeerId('peer-1')).toBe(0);
    });

    it('counts one who dropped without answering as an abstention', () => {
      vote.voteId = 5;
      vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({
        voteId: 0,
        voteAnswer: -1,
        isDisConnect: true,
      } as unknown as PeerCursor);
      expect(vote.voteAnswerByPeerId('peer-1')).toBe(-2);
    });

    it('returns an abstention as one', () => {
      vote.voteId = 1;
      vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({ voteId: 1, voteAnswer: -2 } as unknown as PeerCursor);
      expect(vote.voteAnswerByPeerId('peer-1')).toBe(-2);
    });
  });

  describe('voteAnswer (getter)', () => {
    it('returns the answer of everybody asked', () => {
      vote.targetPeerId = ['peer-1', 'peer-2'];
      vote.voteId = 1;

      const findSpy = vi.spyOn(PeerCursor, 'findByPeerId');
      findSpy.mockImplementation((peerId: string) => {
        if (peerId === 'peer-1') return { voteId: 1, voteAnswer: 0 } as unknown as PeerCursor;
        if (peerId === 'peer-2') return { voteId: 1, voteAnswer: 1 } as unknown as PeerCursor;
        return null!;
      });

      expect(vote.voteAnswer).toEqual([0, 1]);
    });

    it('returns nothing when nobody was asked', () => {
      vote.targetPeerId = [];
      expect(vote.voteAnswer).toEqual([]);
    });
  });

  describe('chkToMe()', () => {
    it('is true when you were asked', () => {
      vote.targetPeerId = ['other-peer', 'my-peer-id'];
      expect(vote.chkToMe()).toBe(true);
    });

    it('is false when you were not', () => {
      vote.targetPeerId = ['other-peer'];
      expect(vote.chkToMe()).toBe(false);
    });

    it('is false when nobody was', () => {
      vote.targetPeerId = [];
      expect(vote.chkToMe()).toBe(false);
    });
  });

  describe('indexToChoice()', () => {
    beforeEach(() => {
      vote.choices = ['賛成', '反対', '棄権'];
    });

    it('returns the choice at an index it has', () => {
      expect(vote.indexToChoice(0)).toBe('賛成');
      expect(vote.indexToChoice(1)).toBe('反対');
      expect(vote.indexToChoice(2)).toBe('棄権');
    });

    it('returns nothing for a negative one', () => {
      expect(vote.indexToChoice(-1)).toBe('');
      expect(vote.indexToChoice(-2)).toBe('');
    });

    it('returns nothing for one out of range', () => {
      expect(vote.indexToChoice(3)).toBe('');
      expect(vote.indexToChoice(100)).toBe('');
    });
  });

  describe('votedTotalNum()', () => {
    it('counts the answers and the abstentions together', () => {
      vote.targetPeerId = ['p1', 'p2', 'p3'];
      vote.voteId = 1;

      vi.spyOn(PeerCursor, 'findByPeerId').mockImplementation((peerId: string) => {
        if (peerId === 'p1') return { voteId: 1, voteAnswer: 0 } as unknown as PeerCursor;
        if (peerId === 'p2') return { voteId: 1, voteAnswer: -2 } as unknown as PeerCursor;
        // voteId does not match, so not voted (-1)
        if (peerId === 'p3') return { voteId: 0, voteAnswer: 0 } as unknown as PeerCursor;
        return null!;
      });

      expect(vote.votedTotalNum()).toBe(2); // p1 (voted) + p2 (abstained)
    });

    it('counts none while nobody has answered', () => {
      vote.targetPeerId = ['p1', 'p2'];
      vote.voteId = 1;
      vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({ voteId: 0, voteAnswer: 0 } as unknown as PeerCursor);

      expect(vote.votedTotalNum()).toBe(0);
    });
  });

  describe('votedNumByIndex()', () => {
    it('counts the answers matching one choice', () => {
      vote.targetPeerId = ['p1', 'p2', 'p3'];
      vote.voteId = 1;

      vi.spyOn(PeerCursor, 'findByPeerId').mockImplementation((peerId: string) => {
        if (peerId === 'p1') return { voteId: 1, voteAnswer: 0 } as unknown as PeerCursor;
        if (peerId === 'p2') return { voteId: 1, voteAnswer: 0 } as unknown as PeerCursor;
        if (peerId === 'p3') return { voteId: 1, voteAnswer: 1 } as unknown as PeerCursor;
        return null!;
      });

      expect(vote.votedNumByIndex(0)).toBe(2);
      expect(vote.votedNumByIndex(1)).toBe(1);
      expect(vote.votedNumByIndex(2)).toBe(0);
    });

    it('counts the abstentions', () => {
      vote.targetPeerId = ['p1', 'p2'];
      vote.voteId = 1;

      vi.spyOn(PeerCursor, 'findByPeerId').mockImplementation((peerId: string) => {
        if (peerId === 'p1') return { voteId: 1, voteAnswer: -2 } as unknown as PeerCursor;
        if (peerId === 'p2') return { voteId: 1, voteAnswer: 0 } as unknown as PeerCursor;
        return null!;
      });

      expect(vote.votedNumByIndex(-2)).toBe(1);
    });
  });

  describe('votedNumByChoice()', () => {
    it('counts the votes for a choice by its name', () => {
      vote.choices = ['賛成', '反対'];
      vote.targetPeerId = ['p1', 'p2', 'p3'];
      vote.voteId = 1;

      vi.spyOn(PeerCursor, 'findByPeerId').mockImplementation((peerId: string) => {
        if (peerId === 'p1') return { voteId: 1, voteAnswer: 0 } as unknown as PeerCursor;
        if (peerId === 'p2') return { voteId: 1, voteAnswer: 1 } as unknown as PeerCursor;
        if (peerId === 'p3') return { voteId: 1, voteAnswer: 0 } as unknown as PeerCursor;
        return null!;
      });

      expect(vote.votedNumByChoice('賛成')).toBe(2);
      expect(vote.votedNumByChoice('反対')).toBe(1);
    });
  });

  describe('isVoteEnd()', () => {
    it('is true once somebody has answered', () => {
      vote.targetPeerId = ['peer-1'];
      vote.voteId = 3;

      vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({ voteId: 3, voteAnswer: 0 } as unknown as PeerCursor);

      expect(vote.isVoteEnd('peer-1')).toBe(true);
    });

    it('is false until they have', () => {
      vote.targetPeerId = ['peer-1'];
      vote.voteId = 3;

      vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({ voteId: 2, voteAnswer: 0 } as unknown as PeerCursor);

      expect(vote.isVoteEnd('peer-1')).toBe(false);
    });

    it('is false for somebody who was not asked', () => {
      vote.targetPeerId = ['peer-1'];
      vote.voteId = 3;

      expect(vote.isVoteEnd('non-target')).toBe(false);
    });

    it('counts somebody who is not there as gone', () => {
      vote.targetPeerId = ['peer-1'];
      vote.voteId = 3;

      vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue(null!);

      expect(vote.isVoteEnd('peer-1')).toBe(true);
    });
  });

  describe('voting()', () => {
    it('records your answer on your own cursor', () => {
      vote.choices = ['賛成', '反対'];
      vote.voteId = 1;
      vote.chairId = 'other-chair';

      vote.voting('反対', 'my-peer-id');

      expect(PeerCursor.myCursor.voteAnswer).toBe(1);
      expect(PeerCursor.myCursor.voteId).toBe(1);
    });

    it('records an abstention for no answer', () => {
      vote.choices = ['賛成', '反対'];
      vote.voteId = 1;
      vote.chairId = 'other-chair';

      vote.voting(null, 'my-peer-id');

      expect(PeerCursor.myCursor.voteAnswer).toBe(-2);
      expect(PeerCursor.myCursor.voteId).toBe(1);
    });
  });

  describe('startVote()', () => {
    it('ends the old vote and starts the new one', () => {
      let endOldVoteCalled = false;
      let startVoteCalled = false;
      const cleanups = [
        domainEvents.endOldVote$.subscribe(() => {
          endOldVoteCalled = true;
        }),
        domainEvents.startVote$.subscribe(() => {
          startVoteCalled = true;
        }),
      ];

      vote.startVote();

      expect(endOldVoteCalled).toBe(true);
      expect(startVoteCalled).toBe(true);
      cleanups.forEach((off) => off());
    });
  });

  describe('apply()', () => {
    it('starts the vote when the stamp changes', () => {
      const startVoteSpy = vi.spyOn(vote, 'startVote').mockImplementation(() => {});
      vi.spyOn(vote, 'chkFinishVote').mockImplementation(() => {});
      vote.initTimeStamp = 100;

      const context = vote.toContext();
      context.syncData = { ...context.syncData, initTimeStamp: 200 };

      vote.apply(context);

      expect(startVoteSpy).toHaveBeenCalled();
    });

    it('starts none while it stays the same', () => {
      const startVoteSpy = vi.spyOn(vote, 'startVote').mockImplementation(() => {});
      vi.spyOn(vote, 'chkFinishVote').mockImplementation(() => {});
      vote.initTimeStamp = 100;

      const context = vote.toContext();

      vote.apply(context);

      expect(startVoteSpy).not.toHaveBeenCalled();
    });

    it('checks whether the vote is over after each sync', () => {
      const chkFinishSpy = vi.spyOn(vote, 'chkFinishVote').mockImplementation(() => {});
      vi.spyOn(vote, 'startVote').mockImplementation(() => {});

      const context = vote.toContext();
      vote.apply(context);

      expect(chkFinishSpy).toHaveBeenCalled();
    });
  });

  describe('chkFinishVote()', () => {
    it('finishes the vote for the chair once everybody has answered', () => {
      vi.useFakeTimers();
      vote.chairId = 'my-peer-id';
      vote.targetPeerId = ['peer-1'];
      vote.voteId = 1;
      vote.choices = ['賛成', '反対'];
      vote.isRollCall = false;
      vote.voteTitle = 'テスト投票';

      vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({ voteId: 1, voteAnswer: 0 } as unknown as PeerCursor);
      const finishEvents: domainEvents.FinishVoteEvent[] = [];
      const sub = domainEvents.finishVote$.subscribe((e) => finishEvents.push(e));

      vote.chkFinishVote();
      vi.advanceTimersByTime(10);

      expect(finishEvents).toHaveLength(1);
      expect(finishEvents[0]).toEqual(
        expect.objectContaining({
          isRollCall: false,
          voteTitle: 'テスト投票',
          voted: 1,
          total: 1,
          tally: [
            { choice: '賛成', count: 1 },
            { choice: '反対', count: 0 },
          ],
        })
      );
      sub();
      vi.useRealTimers();
    });

    it('finishes it for nobody else', () => {
      vi.useFakeTimers();
      vote.chairId = 'other-peer-id';
      vote.targetPeerId = ['peer-1'];
      vote.voteId = 1;

      vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({ voteId: 1, voteAnswer: 0 } as unknown as PeerCursor);
      const finishEvents: domainEvents.FinishVoteEvent[] = [];
      const sub = domainEvents.finishVote$.subscribe((e) => finishEvents.push(e));

      vote.chkFinishVote();
      vi.advanceTimersByTime(10);

      expect(finishEvents).toHaveLength(0);
      sub();
      vi.useRealTimers();
    });

    it('counts somebody who dropped as abstaining and finishes', () => {
      vi.useFakeTimers();
      vote.chairId = 'my-peer-id';
      vote.targetPeerId = ['peer-1'];
      vote.voteId = 1;
      vote.choices = ['準備完了'];
      vote.isRollCall = true;

      vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({
        voteId: 0,
        voteAnswer: -1,
        isDisConnect: true,
      } as unknown as PeerCursor);
      const finishEvents: domainEvents.FinishVoteEvent[] = [];
      const sub = domainEvents.finishVote$.subscribe((e) => finishEvents.push(e));

      vote.chkFinishVote();
      vi.advanceTimersByTime(10);

      expect(finishEvents).toHaveLength(1);
      sub();
      vi.useRealTimers();
    });

    it('finishes a vote once and no more', () => {
      vi.useFakeTimers();
      vote.chairId = 'my-peer-id';
      vote.targetPeerId = ['peer-1'];
      vote.voteId = 1;
      vote.choices = ['準備完了'];
      vote.isRollCall = true;

      vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({ voteId: 1, voteAnswer: 0 } as unknown as PeerCursor);
      const finishEvents: domainEvents.FinishVoteEvent[] = [];
      const sub = domainEvents.finishVote$.subscribe((e) => finishEvents.push(e));

      vote.chkFinishVote();
      vi.advanceTimersByTime(10);
      vote.chkFinishVote();
      vi.advanceTimersByTime(10);

      expect(finishEvents).toHaveLength(1);
      sub();
      vi.useRealTimers();
    });
  });

  describe('a chair made a guest on a room server', () => {
    it('leaves it open, since the server would take the finish back and the result be said again', () => {
      vi.useFakeTimers();
      vote.chairId = 'my-peer-id';
      vote.targetPeerId = ['peer-1'];
      vote.voteId = 1;
      vote.choices = ['準備完了'];
      (PeerCursor.myCursor as { role: PeerRole }).role = PeerRole.Guest;
      vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
      vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({ voteId: 1, voteAnswer: 0 } as unknown as PeerCursor);
      const finishEvents: domainEvents.FinishVoteEvent[] = [];
      const sub = domainEvents.finishVote$.subscribe((e) => finishEvents.push(e));

      vote.chkFinishVote();
      vote.finishByChair();
      vi.advanceTimersByTime(10);
      expect(vote.isFinish).toBe(false);
      expect(finishEvents).toHaveLength(0);

      vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue(null);
      vote.chkFinishVote();
      vi.advanceTimersByTime(10);
      expect(finishEvents).toHaveLength(1);
      sub();
      vi.useRealTimers();
    });
  });

  describe('finishByChair()', () => {
    it('lets the chair close it with answers outstanding', () => {
      vi.useFakeTimers();
      vote.chairId = 'my-peer-id';
      vote.targetPeerId = ['peer-1', 'peer-2'];
      vote.voteId = 1;
      vote.choices = ['準備完了'];
      vote.isRollCall = true;
      vote.chatTabIdentifier = 'tab-main';

      vi.spyOn(PeerCursor, 'findByPeerId').mockImplementation((peerId: string) =>
        peerId === 'peer-1'
          ? ({ voteId: 1, voteAnswer: 0, isDisConnect: false } as unknown as PeerCursor)
          : ({ voteId: 0, voteAnswer: -1, isDisConnect: false } as unknown as PeerCursor)
      );
      const finishEvents: domainEvents.FinishVoteEvent[] = [];
      const sub = domainEvents.finishVote$.subscribe((e) => finishEvents.push(e));

      vote.finishByChair();
      vi.advanceTimersByTime(10);

      expect(vote.isFinish).toBe(true);
      expect(finishEvents).toHaveLength(1);
      expect(finishEvents[0]).toEqual(
        expect.objectContaining({ voted: 1, total: 2, unanswered: 1, chatTabIdentifier: 'tab-main' })
      );
      sub();
      vi.useRealTimers();
    });

    it('lets nobody else close it', () => {
      vote.chairId = 'other-peer-id';
      vote.targetPeerId = ['peer-1'];

      vote.finishByChair();

      expect(vote.isFinish).toBe(false);
    });
  });

  describe('counts you into your own roll call', () => {
    it('returns the answer of somebody marked as dropped who had answered', () => {
      // takes your own answer over the dropped mark when the vote matches
      vote.voteId = 1;
      vi.spyOn(PeerCursor, 'findByPeerId').mockImplementation((peerId: string) => {
        if (peerId === 'my-peer-id') return { voteId: 1, voteAnswer: 0, isDisConnect: true } as unknown as PeerCursor;
        return null!;
      });
      expect(vote.voteAnswerByPeerId('my-peer-id')).toBe(0);
    });

    it('returns your real answer while you are connected', () => {
      // your cursor is created connected, which is what makes this work
      vote.voteId = 1;
      vi.spyOn(PeerCursor, 'findByPeerId').mockImplementation((peerId: string) => {
        if (peerId === 'my-peer-id') return { voteId: 1, voteAnswer: 0, isDisConnect: false } as unknown as PeerCursor;
        return null!;
      });
      expect(vote.voteAnswerByPeerId('my-peer-id')).toBe(0);
    });

    it('counts you as having answered your own roll call', () => {
      // voting from a cursor marked as connected lines the vote numbers up and ends it
      //
      const myCursor = {
        peerId: 'my-peer-id',
        voteAnswer: -1,
        voteId: -1,
        isDisConnect: false,
      } as unknown as PeerCursor;
      PeerCursor.myCursor = myCursor;

      vote.choices = ['準備完了'];
      vote.voteId = 1;
      vote.targetPeerId = ['my-peer-id'];
      vote.chairId = 'other-chair';

      vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue(myCursor);

      vote.voting('準備完了', 'my-peer-id');

      expect(myCursor.voteAnswer).toBe(0);
      expect(myCursor.voteId).toBe(1);
      expect(vote.isVoteEnd('my-peer-id')).toBe(true);
    });
  });
});
