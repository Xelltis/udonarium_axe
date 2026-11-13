import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { decodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { emitFinishVote } from '@axe/core/event/domain-events';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { VoteEventHandlerService } from '@axe/features/vote/vote-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('VoteEventHandlerService', () => {
  let chatStub: { sendSystemMessageAsLastSpeaker: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    PeerCursor.createMyCursor();
    chatStub = { sendSystemMessageAsLastSpeaker: vi.fn() };
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.overrideProvider(ChatMessageService, { useValue: chatStub });
    TestBed.inject(VoteEventHandlerService);
  });

  afterEach(() => {
    const allObjects = ObjectStore.instance.getObjects();
    allObjects.forEach((obj) => ObjectStore.instance.delete(obj, false));
    ObjectStore.instance.clearDeleteHistory();
  });

  /** What the last-speaker line said, in this reader's language, and the tab it went to. */
  function said(): [string, string | undefined] {
    const [text, tab] = chatStub.sendSystemMessageAsLastSpeaker.mock.calls[0] as [string, string | undefined];
    return [decodeI18nMessage(text, TestBed.inject(TRANSLATE_FN)), tab];
  }

  it('puts the tally of a vote into words, choice by choice', () => {
    emitFinishVote({
      isRollCall: false,
      voteTitle: '休憩する？',
      voted: 3,
      total: 3,
      abstained: 0,
      unanswered: 0,
      tally: [
        { choice: '賛成', count: 2 },
        { choice: '反対', count: 1 },
      ],
    });

    expect(said()).toEqual(['投票終了(休憩する？) 賛成：2 反対：1', undefined]);
  });

  it('adds the abstentions and the silences to a roll call', () => {
    emitFinishVote({
      isRollCall: true,
      voteTitle: '点呼',
      voted: 3,
      total: 5,
      abstained: 1,
      unanswered: 2,
      tally: [],
      chatTabIdentifier: 'tab-main',
    });

    expect(said()).toEqual(['点呼終了(3/5) 棄権:1 未回答:2', 'tab-main']);
  });

  it('sends the tally alone when there are neither', () => {
    emitFinishVote({
      isRollCall: true,
      voteTitle: '点呼',
      voted: 2,
      total: 2,
      abstained: 0,
      unanswered: 0,
      tally: [],
      chatTabIdentifier: 'tab-main',
    });

    expect(said()).toEqual(['点呼終了(2/2)', 'tab-main']);
  });
});
