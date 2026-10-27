import { TestBed } from '@angular/core/testing';
import { ActiveChatTabService } from '@axe/application/chat/active-chat-tab.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { Coin } from '@axe/domain/coin/coin';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { CoinFlipService } from '@axe/features/coin/coin-flip.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CoinFlipService', () => {
  let service: CoinFlipService;
  let sendSystemMessage: ReturnType<typeof vi.fn>;
  const created: { destroy(): void }[] = [];

  function makeCoin(): Coin {
    const coin = Coin.create('コイン');
    coin.location.name = 'table';
    created.push(coin);
    return coin;
  }

  beforeEach(() => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.userId = 'me';
    PeerCursor.myCursor.name = 'わたし';
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(CoinFlipService);
    sendSystemMessage = vi
      .spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessage')
      .mockReturnValue(null as unknown as ChatMessage) as unknown as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of created.splice(0)) object.destroy();
    for (const cursor of ObjectStore.instance.getObjects<PeerCursor>(PeerCursor)) cursor.destroy();
  });

  it('announces the face before the coin has finished spinning', () => {
    const coin = makeCoin();
    const flips: { identifier: string; face: string }[] = [];
    TestBed.inject(ObjectChangeService).flipCoin$.subscribe((event) => flips.push(event));

    const face = service.flip(coin);

    expect(flips).toEqual([{ identifier: coin.identifier, face }]);
  });

  it('leaves the result on the coin', () => {
    const coin = makeCoin();

    const face = service.flip(coin);

    expect(['front', 'back']).toContain(face);
    expect(coin.face).toBe(face);
  });

  it('waits for the coin to land before saying so in chat', () => {
    vi.useFakeTimers();
    const coin = makeCoin();

    const face = service.flip(coin);
    expect(sendSystemMessage).not.toHaveBeenCalled();

    vi.runAllTimers();
    vi.useRealTimers();

    expect(sendSystemMessage).toHaveBeenCalledOnce();
    const text = sendSystemMessage.mock.calls[0][0] as string;
    expect(text).toContain('わたし');
    expect(text).toContain('コイン');
    expect(text).toContain(service.faceLabel(face));
  });

  it('says nothing when the coin is gone before it lands', () => {
    vi.useFakeTimers();
    const coin = makeCoin();

    service.flip(coin);
    coin.destroy();
    vi.runAllTimers();
    vi.useRealTimers();

    expect(sendSystemMessage).not.toHaveBeenCalled();
  });

  it('labels the faces heads and tails', () => {
    expect(service.faceLabel('front')).toBe('表');
    expect(service.faceLabel('back')).toBe('裏');
  });

  describe('where the result goes', () => {
    it('reports into the tab being read', () => {
      // Heads or tails is a two-sided die, and it has to land where the person who threw it is reading.
      vi.useFakeTimers();
      try {
        const tab = new ChatTab();
        tab.name = '雑談';
        tab.initialize();
        created.push(tab);
        TestBed.inject(ActiveChatTabService).set(tab.identifier);
        const toTab = vi
          .spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessageToTab')
          .mockReturnValue(null as unknown as ChatMessage);

        service.flip(makeCoin());
        vi.runAllTimers();

        expect(toTab).toHaveBeenCalledOnce();
        expect(toTab.mock.calls[0][0]).toBe(tab);
        expect(sendSystemMessage).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('falls back to the old destination with no window open', () => {
      vi.useFakeTimers();
      try {
        service.flip(makeCoin());
        vi.runAllTimers();

        expect(sendSystemMessage).toHaveBeenCalledOnce();
      } finally {
        vi.useRealTimers();
      }
    });

    it('signs the result with whoever threw it', () => {
      vi.useFakeTimers();
      try {
        const tab = new ChatTab();
        tab.initialize();
        created.push(tab);
        TestBed.inject(ActiveChatTabService).set(tab.identifier);
        const toTab = vi
          .spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessageToTab')
          .mockReturnValue(null as unknown as ChatMessage);

        service.flip(makeCoin());
        vi.runAllTimers();

        expect(toTab.mock.calls[0][3]).toBe(PeerCursor.myCursor.userId);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
