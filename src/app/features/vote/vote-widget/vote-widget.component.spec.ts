import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { emitStartVote } from '@axe/core/event/domain-events';
import { objectChanged$ } from '@axe/core/sync/object-event-extension';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { Vote } from '@axe/domain/vote/vote';
import { VoteWidgetComponent } from '@axe/features/vote/vote-widget/vote-widget.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

interface ComponentInternals {
  isCollapsed: { set: (value: boolean) => void };
  toggleCollapsed: () => void;
  abstain: () => void;
  voteSend: (choice: string) => void;
  finishByChair: () => void;
}

describe('VoteWidgetComponent', () => {
  let fixture: ComponentFixture<VoteWidgetComponent>;
  let internals: ComponentInternals;
  let chatStub: { sendSystemMessageAsLastSpeaker: ReturnType<typeof vi.fn> };
  let vote: Vote;
  let myCursor: PeerCursor;

  function widget(): HTMLElement | null {
    return fixture.nativeElement.querySelector('[data-testid="vote-widget"]');
  }

  function create() {
    fixture = TestBed.createComponent(VoteWidgetComponent);
    internals = fixture.componentInstance as unknown as ComponentInternals;
    fixture.detectChanges();
  }

  function notifyVoteChanged() {
    objectChanged$.emit({ identifier: vote.identifier, aliasName: vote.aliasName, isSendFromSelf: false });
  }

  beforeEach(async () => {
    localStorage.clear();
    ObjectStore.instance.clearDeleteHistory();
    chatStub = { sendSystemMessageAsLastSpeaker: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [VoteWidgetComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    TestBed.overrideProvider(ChatMessageService, { useValue: chatStub });

    myCursor = PeerCursor.createMyCursor();
    myCursor.peerId = 'my-peer-id';
    vote = new Vote('Vote');
    vote.initialize();
    vote.initTimeStamp = 1;
    vote.voteId = 1;
    vote.voteTitle = '点呼';
    vote.isRollCall = true;
    vote.choices = ['準備完了'];
    vote.chairId = 'chair-peer-id';
    vote.targetPeerId = ['my-peer-id'];
    vote.chatTabIdentifier = 'tab-main';
    vi.spyOn(PeerCursor, 'findByPeerId').mockImplementation((peerId: string) =>
      peerId === 'my-peer-id' ? myCursor : null!
    );
  });

  afterEach(() => {
    const allObjects = ObjectStore.instance.getObjects();
    allObjects.forEach((obj) => ObjectStore.instance.delete(obj, false));
    ObjectStore.instance.clearDeleteHistory();
    PeerCursor.myCursor = null!;
    vi.restoreAllMocks();
  });

  it('shows the widget to somebody being asked', () => {
    create();

    expect(widget()).not.toBeNull();
  });

  it('shows nothing to anybody else', () => {
    vote.targetPeerId = ['other-peer-id'];
    create();

    expect(widget()).toBeNull();
  });

  it('goes away once the vote is over', () => {
    create();
    expect(widget()).not.toBeNull();

    vote.isFinish = true;
    notifyVoteChanged();
    fixture.detectChanges();

    expect(widget()).toBeNull();
  });

  it('stays, and counts as no abstention, when it is folded away', () => {
    create();

    internals.toggleCollapsed();
    fixture.detectChanges();

    expect(widget()).not.toBeNull();
    expect(vote.isVoteEnd('my-peer-id')).toBe(false);
    expect(chatStub.sendSystemMessageAsLastSpeaker).not.toHaveBeenCalled();
  });

  it('unfolds when a new vote starts', () => {
    create();
    internals.toggleCollapsed();
    fixture.detectChanges();

    emitStartVote();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="vote-widget-abstain"]')).not.toBeNull();
  });

  it('answers into the tab the vote started in', () => {
    create();

    internals.voteSend('準備完了');

    expect(vote.isVoteEnd('my-peer-id')).toBe(true);
    expect(chatStub.sendSystemMessageAsLastSpeaker).toHaveBeenCalledWith(expect.any(String), 'tab-main');
  });

  it('records an abstention only when it is chosen', () => {
    create();

    internals.abstain();

    expect(myCursor.voteAnswer).toBe(-2);
    expect(chatStub.sendSystemMessageAsLastSpeaker).toHaveBeenCalledWith(expect.any(String), 'tab-main');
  });

  it('lets the chair close the vote with answers outstanding', () => {
    vote.chairId = 'my-peer-id';
    create();

    internals.finishByChair();

    expect(vote.isFinish).toBe(true);
  });

  it('lets nobody else close it', () => {
    create();

    internals.finishByChair();

    expect(vote.isFinish).toBe(false);
  });

  describe('a vote whose answers are hidden until it closes', () => {
    const other = { peerId: 'other-peer-id', name: 'ほかの人', voteId: 1, voteAnswer: 0 } as unknown as PeerCursor;

    function answers(): string[] {
      return [...fixture.nativeElement.querySelectorAll('[data-testid="vote-widget-answer"]')].map((badge: Element) =>
        badge.textContent!.trim()
      );
    }

    beforeEach(() => {
      vote.voteTitle = '方針';
      vote.isRollCall = false;
      vote.isSecret = true;
      vote.choices = ['賛成', '反対'];
      vote.targetPeerId = ['my-peer-id', 'other-peer-id'];
      vi.spyOn(PeerCursor, 'findByPeerId').mockImplementation((peerId: string) =>
        peerId === 'my-peer-id' ? myCursor : peerId === 'other-peer-id' ? other : null!
      );
    });

    it('shows how many have answered, but not who chose what or how many chose each', () => {
      create();

      expect(fixture.nativeElement.querySelector('[data-testid="vote-widget-choice-count"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="vote-widget-abstain-count"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="vote-widget-secret"]')).not.toBeNull();
      expect(answers()).toEqual(['未投票', '回答済み']);
    });

    it('still shows the one who answered their own answer', () => {
      create();

      internals.voteSend('反対');
      notifyVoteChanged();
      fixture.detectChanges();

      expect(answers()).toEqual(['反対', '回答済み']);
    });

    it('tells the chat only that somebody answered', () => {
      create();

      internals.voteSend('反対');

      const text = chatStub.sendSystemMessageAsLastSpeaker.mock.calls[0][0] as string;
      expect(text).toContain('回答しました');
      expect(text).not.toContain('反対');
    });

    it('does not tell the chat that somebody abstained either', () => {
      create();

      internals.abstain();

      const text = chatStub.sendSystemMessageAsLastSpeaker.mock.calls[0][0] as string;
      expect(text).toContain('回答しました');
      expect(text).not.toContain('棄権');
    });

    it('shows everything as before when the vote is not secret', () => {
      vote.isSecret = false;
      create();

      expect(fixture.nativeElement.querySelector('[data-testid="vote-widget-choice-count"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="vote-widget-secret"]')).toBeNull();
      expect(answers()).toEqual(['未投票', '賛成']);
    });
  });
});
