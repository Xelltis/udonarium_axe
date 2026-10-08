import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ChatPreferencesService } from '@axe/application/chat/chat-preferences.service';
import { ChatSpeakerService } from '@axe/application/chat/chat-speaker.service';
import { ChatTickerSelectionService } from '@axe/application/chat/chat-ticker-selection.service';
import { ObjectChangeService, ObjectDeleteEvent } from '@axe/application/sync/object-change.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { EventChannel } from '@axe/core/event/event-channel';
import { childrenChanged$, objectChanged$ } from '@axe/core/sync/object-event-extension';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { DataElement, DataElementFieldType } from '@axe/domain/data/data-element';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { ChatTabComponent } from '@axe/features/chat/chat-tab/chat-tab.component';
import { ChatWindowComponent } from '@axe/features/chat/chat-window/chat-window.component';
import { expectPanelDragRecovery, PanelDragTestHostComponent } from '@axe/testing/panel-drag-recovery';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ChatWindowComponent', () => {
  let component: ChatWindowComponent;
  let fixture: ComponentFixture<ChatWindowComponent>;
  let objectChange: ObjectChangeService;

  beforeEach(async () => {
    PeerCursor.createMyCursor();
    TestBed.configureTestingModule({
      imports: [ChatWindowComponent, PanelDragTestHostComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ChatWindowComponent);
    component = fixture.componentInstance;
    objectChange = TestBed.inject(ObjectChangeService);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('leaves the speaker alone when a second window opens', () => {
    const speaker = TestBed.inject(ChatSpeakerService);
    const character = GameCharacter.create('術者', 1, '');
    component.sendFrom = character.identifier;
    expect(speaker.current()).toBe(character);

    TestBed.createComponent(ChatWindowComponent);

    expect(speaker.current()).toBe(character);
    character.destroy();
  });

  it('tells the room who it speaks as once the reader chooses', () => {
    const speaker = TestBed.inject(ChatSpeakerService);
    const character = GameCharacter.create('術者', 1, '');

    component.sendFrom = character.identifier;

    expect(speaker.identifier()).toBe(character.identifier);
    character.destroy();
  });

  it('injects a change detector', () => {
    const cdr = fixture.debugElement.injector.get(ChangeDetectorRef);
    expect(cdr).toBeTruthy();
  });

  it('lets the panel take the pointer again once the drag ends', async () => {
    await expectPanelDragRecovery(ChatWindowComponent);
  });

  it('sends a line round the screen when it was marked for the ticker', () => {
    const tab = ChatTabList.instance.addChatTab('卓上');
    try {
      component.chatTabidentifier = tab.identifier;
      fixture.detectChanges();
      const shown = vi.spyOn(TestBed.inject(ChatTickerSelectionService), 'showMessage');

      component.sendChat({
        text: '第一ラウンド',
        gameSystem: null as never,
        sendFrom: PeerCursor.myCursor.identifier,
        sendTo: '',
        portraitIndex: 0,
        messColor: '#000000',
        replyTo: '',
        quoteOf: '',
        toTicker: true,
      });

      expect(shown).toHaveBeenCalledTimes(1);
    } finally {
      tab.destroy();
    }
  });

  it('leaves an ordinary line off the ticker', () => {
    const tab = ChatTabList.instance.addChatTab('普通');
    try {
      component.chatTabidentifier = tab.identifier;
      fixture.detectChanges();
      const shown = vi.spyOn(TestBed.inject(ChatTickerSelectionService), 'showMessage');

      component.sendChat({
        text: 'こんばんは',
        gameSystem: null as never,
        sendFrom: PeerCursor.myCursor.identifier,
        sendTo: '',
        portraitIndex: 0,
        messColor: '#000000',
        replyTo: '',
        quoteOf: '',
        toTicker: false,
      });

      expect(shown).not.toHaveBeenCalled();
    } finally {
      tab.destroy();
    }
  });

  describe('who is typing', () => {
    function log(): HTMLElement {
      return fixture.nativeElement.querySelector('[data-testid="chat-log-scroll"]') as HTMLElement;
    }

    let tab: ChatTab;

    beforeEach(() => {
      tab = ChatTabList.instance.addChatTab('話している卓');
      component.chatTabidentifier = tab.identifier;
      fixture.detectChanges();
    });

    // A tab left standing here is a tab the tests after it are answered for, and the one that
    // walks the strip counts what it finds.
    afterEach(() => {
      tab.destroy();
    });

    function typing(names: string[]): void {
      const speakers = names.map((name, at) => ({
        peerId: `peer-${at}`,
        name,
        imageFile: GameCharacter.create(name, 1, '').imageFile,
      }));
      component.chatTabRef()?.writingSpeakers.set(speakers);
      fixture.detectChanges();
    }

    it('holds the strip open whether or not anybody is typing', () => {
      typing([]);
      const quiet = log().style.paddingBottom;

      typing(['somebody']);

      expect(log().style.paddingBottom).toBe(quiet);
      expect(quiet).toBe(`${component.writingStripPx}px`);
    });

    it('hangs it over the log rather than under it, so no line the reader is on moves', () => {
      typing(['somebody']);
      const strip = fixture.nativeElement.querySelector('[data-testid="writing-strip"]') as HTMLElement;

      expect(strip).not.toBeNull();
      expect(strip.className).toContain('absolute');
      expect(strip.style.height).toBe(`${component.writingStripPx}px`);
    });

    it('shows nothing at all while nobody is typing', () => {
      typing([]);

      expect(fixture.nativeElement.querySelector('[data-testid="writing-strip"]')).toBeNull();
    });

    it('names the first two and counts the rest', () => {
      typing(['one', 'two', 'three', 'four']);
      const words = (fixture.nativeElement as HTMLElement).textContent ?? '';

      expect(words).toContain('one');
      expect(words).toContain('two');
      expect(words).not.toContain('three');
    });
  });

  describe('saying how many lines the tab holds', () => {
    const made: ChatTab[] = [];

    // Cleared here rather than at the end of each test: a test that fails leaves its tabs
    // behind otherwise, and the tests after it are answered for a room they never made.
    afterEach(() => {
      for (const tab of made.splice(0)) tab.destroy();
      TestBed.inject(ChatPreferencesService).setShowMessageCount(false);
    });

    /** A tab with a few lines in it, as the window would find on opening. */
    function tabWith(lines: number): ChatTab {
      const tab = ChatTabList.instance.addChatTab('雑談');
      for (let line = 0; line < lines; line++) {
        tab.addMessage({ from: 'p1', text: `${line}` });
      }
      made.push(tab);
      return tab;
    }

    function titleOf(): string {
      return TestBed.inject(PanelService).title;
    }

    it('says nothing about the count until the reader asks', () => {
      const tab = tabWith(3);
      fixture.detectChanges();
      component.chatTabidentifier = tab.identifier;

      expect(titleOf()).not.toContain('3');
    });

    it('carries the count beside the title once asked', () => {
      const tab = tabWith(3);
      TestBed.inject(ChatPreferencesService).setShowMessageCount(true);
      fixture.detectChanges();
      component.chatTabidentifier = tab.identifier;
      TestBed.tick();

      expect(titleOf()).toContain('3');
    });

    it('counts again as a line arrives', () => {
      const tab = tabWith(1);
      TestBed.inject(ChatPreferencesService).setShowMessageCount(true);
      fixture.detectChanges();
      component.chatTabidentifier = tab.identifier;
      TestBed.tick();

      tab.addMessage({ from: 'p1', text: 'もう一言' });
      TestBed.tick();

      expect(titleOf()).toContain('2');
    });

    it('counts the tab it is showing rather than every tab in the room', () => {
      const shown = tabWith(2);
      tabWith(5);
      TestBed.inject(ChatPreferencesService).setShowMessageCount(true);
      fixture.detectChanges();
      component.chatTabidentifier = shown.identifier;
      TestBed.tick();

      expect(titleOf()).toContain('2');
      expect(titleOf()).not.toContain('5');
    });
  });

  describe('noticing a change of chat tab', () => {
    it('moves off a tab that is no longer there when the list changes', () => {
      fixture.detectChanges();
      const invalidId = 'non-existent-tab-id';
      const priv = component as unknown as { _chatTabidentifier: { (): string; set(v: string): void } };
      priv._chatTabidentifier.set(invalidId);

      const chatTabList = ChatTabList.instance;
      objectChanged$.emit({
        identifier: chatTabList.identifier,
        aliasName: chatTabList.aliasName,
        isSendFromSelf: false,
      });

      expect(priv._chatTabidentifier()).not.toBe(invalidId);
    });

    it('moves off the open tab once it is deleted', () => {
      fixture.detectChanges();
      const oldIdentifier = 'non-existent-tab-id';
      const priv = component as unknown as { _chatTabidentifier: { (): string; set(v: string): void } };
      priv._chatTabidentifier.set(oldIdentifier);

      (objectChange as unknown as { _objectDeleted$: EventChannel<ObjectDeleteEvent> })._objectDeleted$.emit({
        aliasName: 'chat-tab',
        identifier: oldIdentifier,
        isSendFromSelf: true,
      });

      expect(priv._chatTabidentifier()).not.toBe(oldIdentifier);
    });

    it('scrolls to the bottom after moving on an update', () => {
      fixture.detectChanges();
      const spy = vi.spyOn(component, 'scrollToBottom');
      const invalidId = 'non-existent-tab-id';
      const priv = component as unknown as { _chatTabidentifier: { set(v: string): void } };
      priv._chatTabidentifier.set(invalidId);

      const chatTabList = ChatTabList.instance;
      objectChanged$.emit({
        identifier: chatTabList.identifier,
        aliasName: chatTabList.aliasName,
        isSendFromSelf: false,
      });

      expect(spy).toHaveBeenCalledWith(true);
    });

    it('scrolls to the bottom after moving on a delete', () => {
      fixture.detectChanges();
      const spy = vi.spyOn(component, 'scrollToBottom');
      const oldIdentifier = 'non-existent-tab-id';
      const priv = component as unknown as { _chatTabidentifier: { set(v: string): void } };
      priv._chatTabidentifier.set(oldIdentifier);

      (objectChange as unknown as { _objectDeleted$: EventChannel<ObjectDeleteEvent> })._objectDeleted$.emit({
        aliasName: 'chat-tab',
        identifier: oldIdentifier,
        isSendFromSelf: true,
      });

      expect(spy).toHaveBeenCalledWith(true);
    });
  });

  describe('chatTabsVersion signal', () => {
    it('exposes the tab version as a computed signal', () => {
      expect(typeof component.chatTabsVersion).toBe('function');
    });

    it('returns the tabs from it', () => {
      fixture.detectChanges();
      const tabs = component.chatTabsVersion();
      expect(Array.isArray(tabs)).toBe(true);
    });

    it('bumps the version it depends on when the children change', () => {
      fixture.detectChanges();
      const objectChange = TestBed.inject(ObjectChangeService);
      const tabs = component.chatTabsVersion();
      if (tabs.length === 0) return; // タブなしは検証スキップ

      const tabId = tabs[0].identifier;
      const before = objectChange.versionOf(tabId)();

      childrenChanged$.emit({ identifier: tabId });

      const after = objectChange.versionOf(tabId)();
      expect(after).toBe(before + 1);
    });

    it('says it changed after scrolling to the bottom', async () => {
      fixture.detectChanges();
      const objectChange = TestBed.inject(ObjectChangeService);
      const spy = vi.spyOn(objectChange, 'notifyChanged');

      // a scrollable panel is set, so the scroll does not return early
      const panelEl = document.createElement('div');
      const priv = component as unknown as { panelService: { scrollablePanel: HTMLDivElement | null } };
      priv.panelService.scrollablePanel = panelEl;

      vi.useFakeTimers();
      try {
        component.scrollToBottom(true);
        vi.runOnlyPendingTimers();
      } finally {
        vi.useRealTimers();
      }

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('being looked at again after standing behind another panel', () => {
    it('takes the log back to the bottom when that is where it was', () => {
      fixture.detectChanges();
      const priv = component as unknown as {
        panelService: { scrollablePanel: HTMLDivElement | null; activated$: { emit: () => void } };
      };
      priv.panelService.scrollablePanel = document.createElement('div');
      const scrolled = vi.spyOn(component, 'scrollToBottom');

      priv.panelService.activated$.emit();

      expect(scrolled).toHaveBeenCalledWith(true);
    });

    it('measures how far from the bottom it is when it was reading further up', () => {
      fixture.detectChanges();
      const priv = component as unknown as {
        panelService: { scrollablePanel: HTMLDivElement | null; activated$: { emit: () => void } };
        isNearBottom: { set(value: boolean): void };
      };
      priv.panelService.scrollablePanel = document.createElement('div');
      priv.isNearBottom.set(false);
      const scrolled = vi.spyOn(component, 'scrollToBottom');

      priv.panelService.activated$.emit();

      expect(scrolled).not.toHaveBeenCalled();
      expect(component.isNearBottom()).toBe(true);
    });
  });

  describe('scrolling while it is not following', () => {
    /**
     * It does not fire the scroll while it is not following and is not forced.
     * Firing it resets the messages and puts the bottom index at the end while the scroll
     * itself does not move, so the container slides down against its end alignment and is
     * pushed off the screen, leaving a blank.
     */
    it('does not scroll while it is not following and is not forced', async () => {
      const { ChatPreferencesService } = await import('@axe/application/chat/chat-preferences.service');
      const prefs = TestBed.inject(ChatPreferencesService);
      prefs.setAutoFollowScroll(false);
      try {
        fixture.detectChanges();
        const panelEl = document.createElement('div');
        Object.defineProperty(panelEl, 'scrollHeight', { value: 1000, configurable: true });
        const priv = component as unknown as {
          panelService: { scrollablePanel: HTMLDivElement | null; scrollToBottom$: { emit: () => void } };
          isAutoScroll: boolean;
        };
        priv.panelService.scrollablePanel = panelEl;
        priv.isAutoScroll = true; // 「ボトム付近」状態を強制
        const emitSpy = vi.spyOn(priv.panelService.scrollToBottom$, 'emit');

        component.scrollToBottom(false);

        expect(emitSpy).not.toHaveBeenCalled();
      } finally {
        prefs.setAutoFollowScroll(true);
      }
    });

    it('scrolls while it is following', async () => {
      const { ChatPreferencesService } = await import('@axe/application/chat/chat-preferences.service');
      const prefs = TestBed.inject(ChatPreferencesService);
      prefs.setAutoFollowScroll(true);

      fixture.detectChanges();
      const panelEl = document.createElement('div');
      Object.defineProperty(panelEl, 'scrollHeight', { value: 1000, configurable: true });
      const priv = component as unknown as {
        panelService: { scrollablePanel: HTMLDivElement | null; scrollToBottom$: { emit: () => void } };
        isAutoScroll: boolean;
      };
      priv.panelService.scrollablePanel = panelEl;
      priv.isAutoScroll = true;
      const emitSpy = vi.spyOn(priv.panelService.scrollToBottom$, 'emit');

      component.scrollToBottom(false);

      expect(emitSpy).toHaveBeenCalled();
    });

    it('scrolls when it is forced, however it is following', async () => {
      const { ChatPreferencesService } = await import('@axe/application/chat/chat-preferences.service');
      const prefs = TestBed.inject(ChatPreferencesService);
      prefs.setAutoFollowScroll(false);
      try {
        fixture.detectChanges();
        const panelEl = document.createElement('div');
        Object.defineProperty(panelEl, 'scrollHeight', { value: 1000, configurable: true });
        const priv = component as unknown as {
          panelService: { scrollablePanel: HTMLDivElement | null; scrollToBottom$: { emit: () => void } };
        };
        priv.panelService.scrollablePanel = panelEl;
        const emitSpy = vi.spyOn(priv.panelService.scrollToBottom$, 'emit');

        component.scrollToBottom(true); // 「ボトムに戻る」ボタン相当

        expect(emitSpy).toHaveBeenCalled();
      } finally {
        prefs.setAutoFollowScroll(true);
      }
    });

    it('counts itself away from the bottom once the messages pile up beneath it', async () => {
      const { ChatPreferencesService } = await import('@axe/application/chat/chat-preferences.service');
      const prefs = TestBed.inject(ChatPreferencesService);
      prefs.setAutoFollowScroll(false);
      try {
        fixture.detectChanges();
        const panelEl = document.createElement('div');
        Object.defineProperty(panelEl, 'scrollHeight', { value: 1000, configurable: true });
        Object.defineProperty(panelEl, 'clientHeight', { value: 500, configurable: true });
        panelEl.scrollTop = 100;
        const priv = component as unknown as { panelService: { scrollablePanel: HTMLDivElement | null } };
        priv.panelService.scrollablePanel = panelEl;
        component.isNearBottom.set(true);

        component.onAddMessage();

        expect(component.isNearBottom()).toBe(false);
      } finally {
        prefs.setAutoFollowScroll(true);
      }
    });

    it('counts itself near the bottom while it is', async () => {
      const { ChatPreferencesService } = await import('@axe/application/chat/chat-preferences.service');
      const prefs = TestBed.inject(ChatPreferencesService);
      prefs.setAutoFollowScroll(false);
      try {
        fixture.detectChanges();
        const panelEl = document.createElement('div');
        Object.defineProperty(panelEl, 'scrollHeight', { value: 1000, configurable: true });
        Object.defineProperty(panelEl, 'clientHeight', { value: 500, configurable: true });
        panelEl.scrollTop = 499;
        const priv = component as unknown as { panelService: { scrollablePanel: HTMLDivElement | null } };
        priv.panelService.scrollablePanel = panelEl;
        component.isNearBottom.set(false);

        component.onAddMessage();

        expect(component.isNearBottom()).toBe(true);
      } finally {
        prefs.setAutoFollowScroll(true);
      }
    });
  });

  describe('following only from the very bottom', () => {
    function setPanel(scrollTop: number) {
      const panelEl = document.createElement('div');
      Object.defineProperty(panelEl, 'scrollHeight', { value: 1000, configurable: true });
      Object.defineProperty(panelEl, 'clientHeight', { value: 500, configurable: true });
      panelEl.scrollTop = scrollTop;
      const priv = component as unknown as { panelService: { scrollablePanel: HTMLDivElement | null } };
      priv.panelService.scrollablePanel = panelEl;
      return priv;
    }

    it('starts following from the bottom', () => {
      fixture.detectChanges();
      const priv = setPanel(500) as unknown as { isAutoScroll: boolean };
      priv.isAutoScroll = false;

      component.checkAutoScroll();

      expect(priv.isAutoScroll).toBe(true);
    });

    it('does not follow from even a line above it', () => {
      fixture.detectChanges();
      const priv = setPanel(470) as unknown as { isAutoScroll: boolean };
      priv.isAutoScroll = true;

      component.checkAutoScroll();

      expect(priv.isAutoScroll).toBe(false);
    });

    it('clears the unread badge on returning to the bottom', () => {
      fixture.detectChanges();
      const priv = setPanel(500) as unknown as { onScrollPositionChange: () => void };
      component.newMessageCount.set(3);
      component.hasNewMessage.set(true);

      priv.onScrollPositionChange();

      expect(component.newMessageCount()).toBe(0);
      expect(component.hasNewMessage()).toBe(false);
    });

    it('keeps the badge while it is reading above it', () => {
      fixture.detectChanges();
      const priv = setPanel(470) as unknown as { onScrollPositionChange: () => void };
      component.newMessageCount.set(3);
      component.hasNewMessage.set(true);

      priv.onScrollPositionChange();

      expect(component.newMessageCount()).toBe(3);
      expect(component.hasNewMessage()).toBe(true);
      expect(component.isNearBottom()).toBe(true);
    });
  });

  describe('finding words in the tab', () => {
    const searchBox = () =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('[data-testid="chat-search-input"]');

    function controlF(target: EventTarget): KeyboardEvent {
      const event = new KeyboardEvent('keydown', {
        key: 'f',
        code: 'KeyF',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(event);
      return event;
    }

    beforeEach(() => {
      document.body.appendChild(fixture.nativeElement);
      fixture.detectChanges();
    });

    afterEach(() => {
      component.stopListeningForSearch();
      (fixture.nativeElement as HTMLElement).remove();
    });

    it('opens on Ctrl+F inside the window, in place of the browser’s find, with the caret in it', async () => {
      const event = controlF(fixture.nativeElement);
      await fixture.whenStable();

      expect(event.defaultPrevented).toBe(true);
      expect(searchBox()).not.toBeNull();
      expect(document.activeElement).toBe(searchBox());
    });

    it('puts the caret back in the box on Ctrl+F while it is open', async () => {
      component.openSearch();
      await fixture.whenStable();
      (fixture.nativeElement as HTMLElement).focus();

      controlF(fixture.nativeElement);
      await fixture.whenStable();

      expect(document.activeElement).toBe(searchBox());
    });

    it('closes on Escape and hands the keyboard back to the window', async () => {
      component.openSearch();
      await fixture.whenStable();

      searchBox()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await fixture.whenStable();

      expect(component.searchOpen()).toBe(false);
      expect(searchBox()).toBeNull();
      expect((fixture.nativeElement as HTMLElement).contains(document.activeElement)).toBe(true);
    });

    it('opens on Ctrl+F from elsewhere while the pointer is over the window, and not once it has left', async () => {
      fixture.nativeElement.dispatchEvent(new Event('pointerenter'));
      const over = controlF(document.body);
      await fixture.whenStable();
      expect(over.defaultPrevented).toBe(true);
      expect(component.searchOpen()).toBe(true);

      component.closeSearch();
      fixture.nativeElement.dispatchEvent(new Event('pointerleave'));
      const away = controlF(document.body);
      await fixture.whenStable();
      expect(away.defaultPrevented).toBe(false);
      expect(component.searchOpen()).toBe(false);
    });

    it('opens and closes from its button', async () => {
      const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '[data-testid="chat-search-toggle"]'
      )!;

      button.click();
      await fixture.whenStable();
      expect(searchBox()).not.toBeNull();
      expect(button.getAttribute('aria-pressed')).toBe('true');

      button.click();
      await fixture.whenStable();
      expect(searchBox()).toBeNull();
    });
  });

  describe('going back to a marked line', () => {
    const tabs: ChatTab[] = [];
    const byTestId = (id: string) =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(`[data-testid="${id}"]`);

    function addTab(name: string): ChatTab {
      const tab = ChatTabList.instance.addChatTab(name);
      tabs.push(tab);
      return tab;
    }

    beforeEach(() => {
      document.body.appendChild(fixture.nativeElement);
      fixture.detectChanges();
    });

    afterEach(() => {
      for (const tab of tabs.splice(0)) tab.destroy();
      (fixture.nativeElement as HTMLElement).remove();
      vi.restoreAllMocks();
    });

    it('opens the list from its button in place of the search, and closes it again', async () => {
      component.openSearch();
      await fixture.whenStable();

      byTestId('chat-bookmarks-toggle')!.click();
      await fixture.whenStable();
      expect(component.searchOpen()).toBe(false);
      expect(byTestId('chat-bookmarks')).not.toBeNull();
      expect(byTestId('chat-bookmarks-empty')).not.toBeNull();

      byTestId('chat-bookmarks-close')!.click();
      await fixture.whenStable();
      expect(byTestId('chat-bookmarks')).toBeNull();
    });

    it('closes the list when the search is opened', async () => {
      component.toggleBookmarks();
      await fixture.whenStable();

      component.openSearch();
      await fixture.whenStable();

      expect(component.bookmarksOpen()).toBe(false);
    });

    it('counts the marks on its button', async () => {
      const tab = addTab('メイン');
      tab.addMessage({ from: 'someone', name: 'ノア', text: '証言A', timestamp: 1000 }).bookmark(1000);
      await fixture.whenStable();

      expect(byTestId('chat-bookmarks-toggle-count')?.textContent?.trim()).toBe('1');
    });

    it('turns to the tab of the line, draws the log around it and lights it up', async () => {
      const here = addTab('メイン');
      const there = addTab('雑談');
      const line = there.addMessage({ from: 'someone', name: 'ノア', text: '証言A', timestamp: 1000 });
      line.bookmark(1000);
      component.chatTabidentifier = here.identifier;
      fixture.detectChanges();
      const drawn = document.createElement('chat-message');
      const reveal = vi.spyOn(ChatTabComponent.prototype, 'reveal').mockResolvedValue(drawn);
      component.toggleBookmarks();
      await fixture.whenStable();

      byTestId('chat-bookmark-open')!.click();
      await vi.waitFor(() => expect(reveal).toHaveBeenCalledWith(line));

      expect(component.chatTabidentifier).toBe(there.identifier);
      expect(component.bookmarksOpen()).toBe(false);
      await vi.waitFor(() => expect(drawn.classList.contains('chat-message-highlight')).toBe(true));
    });
  });

  describe('moving between tabs by keyboard', () => {
    function pressControlArrow(direction: number): void {
      const event = new KeyboardEvent('keydown', {
        key: direction < 0 ? 'ArrowLeft' : 'ArrowRight',
        ctrlKey: true,
        bubbles: true,
      });
      fixture.nativeElement.dispatchEvent(event);
      fixture.detectChanges();
    }

    let tabs: ChatTab[];

    beforeEach(() => {
      tabs = [ChatTabList.instance.addChatTab('一枚目'), ChatTabList.instance.addChatTab('二枚目')];
      component.chatTabidentifier = tabs[0].identifier;
      fixture.detectChanges();
    });

    afterEach(() => {
      tabs.forEach((tab) => tab.destroy());
    });

    it('listens on the window, so the shortcut does not depend on the input being there', () => {
      pressControlArrow(1);

      expect(component.chatTabidentifier).toBe(tabs[1].identifier);
    });

    it('keeps hold of the keyboard on a tab that shows no input', () => {
      Object.defineProperty(component, 'canSpeakCurrentTab', { value: () => false });

      component.switchTabByKey(new KeyboardEvent('keydown'), 1);

      expect(component.chatTabidentifier).toBe(tabs[1].identifier);
      expect(document.activeElement).toBe(fixture.nativeElement);
    });

    it('walks only the tabs the strip shows', () => {
      PeerCursor.myCursor.role = PeerRole.Player;
      tabs[1].plCanView = false;
      objectChange.notifyChanged(tabs[1].identifier);
      fixture.detectChanges();

      component.chatTabSwitchRelative(1);

      expect(component.chatTabidentifier).toBe(tabs[0].identifier);
    });
  });

  describe('filling in the references of a line', () => {
    let tab: ChatTab;
    let character: GameCharacter;
    let sent: { text: string; attachments: string[] | undefined }[];
    let mark: GameCharacter | null;

    function speak(text: string, sendFrom: string): void {
      component.sendChat({
        text,
        gameSystem: null as never,
        sendFrom,
        sendTo: '',
        portraitIndex: 0,
        messColor: '#000000',
        replyTo: '',
        quoteOf: '',
        toTicker: false,
      });
    }

    beforeEach(() => {
      tab = ChatTabList.instance.addChatTab('参照');
      component.chatTabidentifier = tab.identifier;
      fixture.detectChanges();

      character = new GameCharacter();
      character.initialize();
      character.createDataElements();
      const detail = DataElement.create('detail', '');
      const status = DataElement.create('ステータス', '');
      status.appendChild(DataElement.create('HP', '13'));
      detail.appendChild(status);
      character.rootDataElement?.appendChild(detail);

      sent = [];
      mark = null;
      vi.spyOn(TestBed.inject(ChatMessageService), 'sendMessage').mockImplementation(((...args: unknown[]) => {
        sent.push({ text: args[1] as string, attachments: args[8] as string[] | undefined });
        return null as never;
      }) as never);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      mark?.destroy();
      character.destroy();
      tab.destroy();
    });

    it('reads the sheet of the piece the line is spoken as', () => {
      speak('2d6+{HP}', character.identifier);

      expect(sent[0].text).toBe('2d6+13');
    });

    it('leaves the line alone when it is spoken as yourself', () => {
      speak('2d6+{HP}', PeerCursor.myCursor.identifier);

      expect(sent[0].text).toBe('2d6+{HP}');
    });

    it('reads the sheet of the piece the line is aimed at, spoken as yourself', () => {
      mark = GameCharacter.create('対象', 1, '');
      mark.status.setValue('HP', 'now', 7);
      mark.setLocation('table');
      mark.targeted = true;

      speak('t:HP-t{HP}', PeerCursor.myCursor.identifier);

      expect(sent[0].text).toBe('t:HP-7 [対象]');
    });

    it('sends on the picture a reference stands for', () => {
      const detail = character.rootDataElement?.getFirstElementByName('detail');
      detail?.appendChild(DataElement.create('立ち絵', 'portrait-id', { fieldType: DataElementFieldType.IMAGE }));

      speak('{立ち絵}', character.identifier);

      expect(sent[0].attachments).toEqual(['portrait-id']);
    });
  });
});
