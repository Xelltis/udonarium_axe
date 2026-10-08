import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ObjectChangeService, type WritingMessageEvent } from '@axe/application/sync/object-change.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { emitMessageAdded } from '@axe/core/event/domain-events';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabComponent } from '@axe/features/chat/chat-tab/chat-tab.component';
import { beMyself } from '@axe/testing/peer-context-stub';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ChatTabComponent', () => {
  let component: ChatTabComponent;
  let fixture: ComponentFixture<ChatTabComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [ChatTabComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ChatTabComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnChanges', () => {
    it('resets the messages at once when there is a panel to scroll', () => {
      const panelService = TestBed.inject(PanelService);
      const mockPanel = document.createElement('div');
      Object.defineProperty(mockPanel, 'clientHeight', { value: 400 });
      panelService.scrollablePanel = mockPanel as unknown as HTMLDivElement;

      const chatTab = new ChatTab();
      chatTab.initialize();

      const spy = vi.spyOn(component, 'resetMessages' as never);
      fixture.componentRef.setInput('chatTab', chatTab);
      fixture.detectChanges();

      expect(spy).toHaveBeenCalled();
    });

    it('resets them on a microtask when there is none', async () => {
      const panelService = TestBed.inject(PanelService);
      const mockPanel = document.createElement('div');
      panelService.scrollablePanel = mockPanel as unknown as HTMLDivElement;
      fixture.detectChanges();

      panelService.scrollablePanel = null!;

      const chatTab = new ChatTab();
      chatTab.initialize();

      const spy = vi.spyOn(component, 'resetMessages' as never);
      fixture.componentRef.setInput('chatTab', chatTab);
      fixture.detectChanges();

      expect(spy).not.toHaveBeenCalled();
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(spy).toHaveBeenCalled();
    });
  });

  it('asks for no change detector', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((component as any).changeDetector).toBeUndefined();
  });

  it('reads the messages without throwing when there is no tab', () => {
    fixture.componentRef.setInput('chatTab', null);
    expect(() => {
      const _msgs = component.chatMessages;
    }).not.toThrow();
  });

  describe('moving the bottom on a new message', () => {
    let chatTab: ChatTab;
    let panelService: PanelService;
    // A helper that reaches the private fields without losing the types.
    type InternalComponent = { bottomIndex: number };
    const internal = () => component as unknown as InternalComponent;

    beforeEach(() => {
      panelService = TestBed.inject(PanelService);
      const mockPanel = document.createElement('div');
      Object.defineProperty(mockPanel, 'clientHeight', { value: 400 });
      panelService.scrollablePanel = mockPanel as unknown as HTMLDivElement;

      chatTab = new ChatTab();
      chatTab.initialize();
      fixture.componentRef.setInput('chatTab', chatTab);
      fixture.detectChanges();
    });

    it('widens to a new message while it is at the bottom', () => {
      // one message puts the bottom at the first
      const msg0 = new ChatMessage();
      msg0.initialize();
      chatTab.appendChild(msg0);
      emitMessageAdded({ tabIdentifier: chatTab.identifier, messageIdentifier: msg0.identifier });
      // which leaves it at the first

      // a second message arrives
      const msg1 = new ChatMessage();
      msg1.initialize();
      chatTab.appendChild(msg1);
      emitMessageAdded({ tabIdentifier: chatTab.identifier, messageIdentifier: msg1.identifier });

      // and the bottom moves to it
      expect(internal().bottomIndex).toBe(1);
    });

    it('leaves the bottom alone while it is scrolled up', () => {
      // ten messages put the bottom at the last
      for (let i = 0; i < 10; i++) {
        const m = new ChatMessage();
        m.initialize();
        chatTab.appendChild(m);
        emitMessageAdded({ tabIdentifier: chatTab.identifier, messageIdentifier: m.identifier });
      }
      // then it is dragged back to the middle, as scrolling up would
      internal().bottomIndex = 4;

      // a new message arrives
      const newMsg = new ChatMessage();
      newMsg.initialize();
      chatTab.appendChild(newMsg);
      emitMessageAdded({ tabIdentifier: chatTab.identifier, messageIdentifier: newMsg.identifier });

      // and the bottom stays where it was
      expect(internal().bottomIndex).toBe(4);
    });

    it('still updates for a message older than the top of the view', () => {
      // one message is added and read, which settles the top timestamp
      type InternalFull = { bottomIndex: number; needUpdate: boolean; topPlacedAt: number };
      const internalFull = () => component as unknown as InternalFull;

      const msg0 = new ChatMessage();
      msg0.initialize();
      msg0.setAttribute('timestamp', 1000);
      chatTab.appendChild(msg0);
      emitMessageAdded({ tabIdentifier: chatTab.identifier, messageIdentifier: msg0.identifier });

      // settling it
      const _ignored = component.chatMessages;
      expect(internalFull().topPlacedAt).toBe(1000);
      internalFull().needUpdate = false; // getter で false になっているはずだが明示的に確認

      // an older message arrives
      const msg1 = new ChatMessage();
      msg1.initialize();
      msg1.setAttribute('timestamp', 500);
      chatTab.appendChild(msg1);
      emitMessageAdded({ tabIdentifier: chatTab.identifier, messageIdentifier: msg1.identifier });

      // and the view still updates
      expect(internalFull().needUpdate).toBe(true);
    });

    it('still updates for a line above one that was opened and brought to the end', async () => {
      // The opened line keeps the old time it was said at, so a window bounded by time would
      // read as empty and swallow every change to the lines above it.
      const flush = async () => {
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        await new Promise<void>((resolve) => queueMicrotask(resolve));
      };

      beMyself('me');
      const secret = chatTab.addMessage({ from: 'me', name: 'ダイス', text: '→ 6', timestamp: 1000, tag: 'secret' });
      const said = chatTab.addMessage({ from: 'me', name: 'アリス', text: 'そのあと', timestamp: 2000 });
      TestBed.inject(ChatMessageService).discloseMessage(secret);
      await flush();

      // settling the window over both, with the opened line last
      const settled = component.chatMessages;
      expect(chatTab.chatMessages[chatTab.chatMessages.length - 1]).toBe(secret);

      said.text = 'そのあと（直した）';
      await flush();

      // a fresh slice, which is what redrawing the window looks like from outside
      expect(component.chatMessages).not.toBe(settled);
    });

    it('redraws when a line is placed past the end of what is drawn', async () => {
      const flush = async () => {
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        await new Promise<void>((resolve) => queueMicrotask(resolve));
      };

      beMyself('me');
      const secret = chatTab.addMessage({ from: 'me', name: 'ダイス', text: '→ 6', timestamp: 1000, tag: 'secret' });
      chatTab.addMessage({ from: 'me', name: 'アリス', text: 'そのあと', timestamp: 2000 });
      await flush();

      // settling the window over both, which bounds it by the times they were said at
      const settled = component.chatMessages;

      TestBed.inject(ChatMessageService).discloseMessage(secret);
      await flush();

      expect(chatTab.chatMessages[chatTab.chatMessages.length - 1]).toBe(secret);
      expect(component.chatMessages).not.toBe(settled);
    });

    it('widens to an older message while it is at the bottom', () => {
      // one message settles both the bottom and the top timestamp
      type InternalFull = { bottomIndex: number; topPlacedAt: number };
      const internalFull = () => component as unknown as InternalFull;

      const msg0 = new ChatMessage();
      msg0.initialize();
      msg0.setAttribute('timestamp', 1000);
      chatTab.appendChild(msg0);
      emitMessageAdded({ tabIdentifier: chatTab.identifier, messageIdentifier: msg0.identifier });

      const _ignored = component.chatMessages;
      expect(internalFull().topPlacedAt).toBe(1000);
      expect(internalFull().bottomIndex).toBe(0);

      // an older message arrives
      const msg1 = new ChatMessage();
      msg1.initialize();
      msg1.setAttribute('timestamp', 500);
      chatTab.appendChild(msg1);
      emitMessageAdded({ tabIdentifier: chatTab.identifier, messageIdentifier: msg1.identifier });

      // and the bottom moves on because it was at the bottom
      expect(internalFull().bottomIndex).toBe(1);
    });

    it('draws no more than a reader at the bottom needs when many lines arrive at once', () => {
      type Range = { topIndex: number; bottomIndex: number };
      const range = () => component as unknown as Range;
      for (let i = 0; i < 300; i++) {
        const message = new ChatMessage();
        message.initialize();
        chatTab.appendChild(message);
        emitMessageAdded({ tabIdentifier: chatTab.identifier, messageIdentifier: message.identifier });
      }

      const drawn = component.chatMessages;

      expect(range().bottomIndex).toBe(299);
      expect(drawn.length).toBeLessThanOrEqual(150);
      expect(drawn[drawn.length - 1]).toBe(chatTab.chatMessages[299]);
    });

    describe('on iOS, which never narrows the lines while it scrolls', () => {
      type InternalIOS = {
        isIOS: boolean;
        topIndex: number;
        bottomIndex: number;
        trimRenderedRangeOnIOS: () => void;
      };
      const ios = () => component as unknown as InternalIOS;

      function renderEveryLineOf(count: number): void {
        for (let i = 0; i < count; i++) {
          chatTab.addMessage({ from: 'reader', name: '読者', text: `${i}`, timestamp: 1000 + i });
        }
        ios().isIOS = true;
        ios().topIndex = 0;
        ios().bottomIndex = count - 1;
      }

      it('lets go of the lines far above once the reader rests at the bottom', () => {
        renderEveryLineOf(300);

        ios().trimRenderedRangeOnIOS();

        expect(ios().bottomIndex).toBe(299);
        expect(ios().bottomIndex - ios().topIndex + 1).toBeLessThanOrEqual(150);
      });

      it('keeps the lines a reader scrolled far up is reading when a new one arrives', () => {
        renderEveryLineOf(300);
        Object.defineProperty(panelService.scrollablePanel!, 'scrollHeight', { value: 20000 });
        const message = new ChatMessage();
        message.initialize();
        chatTab.appendChild(message);

        emitMessageAdded({ tabIdentifier: chatTab.identifier, messageIdentifier: message.identifier });

        expect(ios().topIndex).toBe(0);
        expect(ios().bottomIndex).toBe(300);
      });

      it('keeps them for a reader scrolled away from the bottom', () => {
        renderEveryLineOf(300);
        Object.defineProperty(panelService.scrollablePanel!, 'scrollHeight', { value: 20000 });

        ios().trimRenderedRangeOnIOS();

        expect(ios().topIndex).toBe(0);
      });
    });
  });

  describe('the typing bubble', () => {
    let chatTab: ChatTab;

    beforeEach(() => {
      const panelService = TestBed.inject(PanelService);
      const mockPanel = document.createElement('div');
      Object.defineProperty(mockPanel, 'clientHeight', { value: 400 });
      panelService.scrollablePanel = mockPanel as unknown as HTMLDivElement;

      chatTab = new ChatTab();
      chatTab.initialize();
      fixture.componentRef.setInput('chatTab', chatTab);
      fixture.detectChanges();
    });

    it('adds a speaker to those typing', () => {
      const speaker = GameCharacter.create('入力中の冒険者', 1, '');
      const objectChange = TestBed.inject(ObjectChangeService) as unknown as {
        _writingMessage$: { emit(event: WritingMessageEvent): void };
      };

      objectChange._writingMessage$.emit({
        tabIdentifier: chatTab.identifier,
        sendFrom: 'remote-peer',
        isSendFromSelf: false,
        speakerIdentifier: speaker.identifier,
      });
      fixture.detectChanges();

      const speakers = fixture.componentInstance.writingSpeakers();
      expect(speakers.length).toBe(1);
      expect(speakers[0].name).toBe('入力中の冒険者');
    });

    it('takes them off once their message arrives', () => {
      const speaker = GameCharacter.create('発言者', 1, '');
      const objectChange = TestBed.inject(ObjectChangeService) as unknown as {
        _writingMessage$: { emit(event: WritingMessageEvent): void };
      };

      objectChange._writingMessage$.emit({
        tabIdentifier: chatTab.identifier,
        sendFrom: 'remote-peer',
        isSendFromSelf: false,
        speakerIdentifier: speaker.identifier,
      });

      const message = new ChatMessage();
      message.initialize();
      message.sendFrom = speaker.identifier;
      chatTab.appendChild(message);
      emitMessageAdded({ tabIdentifier: chatTab.identifier, messageIdentifier: message.identifier });
      fixture.detectChanges();

      expect(fixture.componentInstance.writingSpeakers().length).toBe(0);
    });
  });

  describe('bringing a line far up the log into view', () => {
    let chatTab: ChatTab;

    const drawn = () =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('chat-message')).map(
        (line) => line.dataset['messageId']
      );

    beforeEach(() => {
      beMyself('reader');
      const mockPanel = document.createElement('div');
      Object.defineProperty(mockPanel, 'clientHeight', { value: 300 });
      TestBed.inject(PanelService).scrollablePanel = mockPanel as unknown as HTMLDivElement;
      chatTab = new ChatTab();
      chatTab.initialize();
      for (let i = 0; i < 120; i++) {
        chatTab.addMessage({ from: 'someone', name: '語り手', text: `${i}行目`, timestamp: i + 1 });
      }
      fixture.componentRef.setInput('chatTab', chatTab);
      fixture.detectChanges();
    });

    afterEach(() => chatTab.destroy());

    it('draws a line that was not drawn, and hands back its element', async () => {
      const target = chatTab.chatMessages[3];
      expect(drawn()).not.toContain(target.identifier);

      const shown = component.reveal(target);
      fixture.detectChanges();
      const element = await shown;

      expect(element?.dataset['messageId']).toBe(target.identifier);
      expect(drawn()).toContain(target.identifier);
      expect(drawn()).not.toContain(chatTab.chatMessages[119].identifier);
    });

    it('hands back a line already drawn without drawing others', async () => {
      const target = chatTab.chatMessages[119];
      const before = drawn();

      const shown = component.reveal(target);
      fixture.detectChanges();
      const element = await shown;

      expect(element?.dataset['messageId']).toBe(target.identifier);
      expect(drawn()).toEqual(before);
    });

    it('hands back nothing for a line in another tab, or one said to somebody else', async () => {
      const other = new ChatTab();
      other.initialize();
      const elsewhere = other.addMessage({ from: 'someone', name: '語り手', text: '別のタブ', timestamp: 1 });
      const whispered = chatTab.addMessage({
        from: 'someone',
        to: 'another',
        name: '語り手',
        text: '内緒',
        timestamp: 999,
      });

      expect(await component.reveal(elsewhere)).toBeNull();
      expect(await component.reveal(whispered)).toBeNull();
      other.destroy();
    });

    it('stops drawing a line once it is deleted, and hands back nothing for it', async () => {
      const target = chatTab.chatMessages[119];
      expect(drawn()).toContain(target.identifier);

      target.pseudoDelete(5000);
      await Promise.resolve();
      fixture.detectChanges();

      expect(drawn()).not.toContain(target.identifier);
      expect(await component.reveal(target)).toBeNull();
    });

    it('stops drawing a line the reader deleted themselves too', async () => {
      const mine = chatTab.addMessage({ from: 'reader', name: '自分', text: '言い間違い', timestamp: 999 });
      fixture.detectChanges();
      expect(drawn()).toContain(mine.identifier);

      mine.pseudoDelete(5000);
      await Promise.resolve();
      fixture.detectChanges();

      expect(drawn()).not.toContain(mine.identifier);
    });
  });
});
