import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CharacterMacroService } from '@axe/application/chat/character-macro.service';
import { ChatLintService } from '@axe/application/chat/chat-lint.service';
import { ChatPreferencesService } from '@axe/application/chat/chat-preferences.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { childrenChanged$ } from '@axe/core/sync/object-event-extension';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { CHAT_EDITOR_LOADER, type ChatEditorModule } from '@axe/features/chat/chat-editor/chat-editor-loader';
import { ChatPaletteComponent } from '@axe/features/chat/chat-palette/chat-palette.component';
import { ChatTickerSelectionService } from '@axe/features/chat/chat-ticker-selection.service';
import { expectPanelDragRecovery, PanelDragTestHostComponent } from '@axe/testing/panel-drag-recovery';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { TranslocoService } from '@jsverse/transloco';
import GameSystemClass from 'bcdice/lib/game_system';

describe('ChatPaletteComponent', () => {
  let component: ChatPaletteComponent;
  let fixture: ComponentFixture<ChatPaletteComponent>;
  const createdChars: GameCharacter[] = [];

  beforeEach(async () => {
    PeerCursor.createMyCursor();
    TestBed.configureTestingModule({
      imports: [ChatPaletteComponent, PanelDragTestHostComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ChatPaletteComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    for (const char of createdChars) {
      ObjectStore.instance.remove(char);
    }
    createdChars.length = 0;
    // The tab list outlives the fixture, so a tab left behind turns up in whatever runs next.
    for (const tab of [...ChatTabList.instance.chatTabs]) tab.destroy();
  });

  function createChar(name: string): GameCharacter {
    const char = GameCharacter.create(name, 1, '');
    createdChars.push(char);
    return char;
  }

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  it('lets the panel take the pointer again once the drag ends', async () => {
    await expectPanelDragRecovery(ChatPaletteComponent, {
      beforeOpen: () => {
        if (ChatTabList.instance.chatTabs.length < 1) {
          ChatTabList.instance.addChatTab('テストタブ');
        }
      },
      initialize: (opened) => {
        opened.character.set(createChar('テスト'));
      },
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

    it('bumps the version when the children change', () => {
      fixture.detectChanges();
      const objectChange = TestBed.inject(ObjectChangeService);
      const tabs = component.chatTabsVersion();
      if (tabs.length === 0) return;

      const tabId = tabs[0].identifier;
      const before = objectChange.versionOf(tabId)();

      childrenChanged$.emit({ identifier: tabId });

      expect(objectChange.versionOf(tabId)()).toBe(before + 1);
    });
  });

  describe('speaking a line', () => {
    it('carries the bubble the sender picked, as the chat window does', () => {
      const speaker = createChar('術者');
      const tab = ChatTabList.instance.addChatTab('テストタブ');
      component.character.set(speaker);
      component.chatTabidentifier.set(tab.identifier);
      const send = vi.spyOn(TestBed.inject(CharacterMacroService), 'send').mockReturnValue(null);

      component.sendChat({
        text: 'こんにちは',
        gameSystem: null as unknown as GameSystemClass,
        sendFrom: speaker.identifier,
        sendTo: '',
        portraitIndex: 0,
        messColor: '#112233',
        messBubbleLight: '#ffeeee',
        messBubbleDark: '#332211',
        replyTo: '',
        quoteOf: '',
        toTicker: false,
      });

      expect(send.mock.calls[0][2]).toEqual(
        expect.objectContaining({ bubbles: { light: '#ffeeee', dark: '#332211' } })
      );
    });
  });

  describe('sending a stamp', () => {
    it('sends one with nothing said as a line of its own, past the macros, as the chat window does', () => {
      const speaker = createChar('術者');
      const tab = ChatTabList.instance.addChatTab('テストタブ');
      component.character.set(speaker);
      component.chatTabidentifier.set(tab.identifier);
      const macro = vi.spyOn(TestBed.inject(CharacterMacroService), 'send').mockReturnValue(null);
      const stamp = vi.spyOn(component.chatMessageService, 'sendStamp').mockReturnValue(null);

      component.sendChat({
        text: '',
        gameSystem: null,
        sendFrom: speaker.identifier,
        sendTo: '',
        portraitIndex: 0,
        messColor: '#112233',
        replyTo: '',
        quoteOf: '',
        toTicker: false,
        stamp: { id: 'seal:ok', words: '［了解］' },
      });

      expect(macro).not.toHaveBeenCalled();
      expect(stamp.mock.calls[0].slice(1, 4)).toEqual(['seal:ok', '［了解］', speaker.identifier]);
    });

    it('sends one with words under them, through the macros', () => {
      const speaker = createChar('術者');
      const tab = ChatTabList.instance.addChatTab('テストタブ');
      component.character.set(speaker);
      component.chatTabidentifier.set(tab.identifier);
      const macro = vi.spyOn(TestBed.inject(CharacterMacroService), 'send').mockReturnValue(null);
      const stamp = vi.spyOn(component.chatMessageService, 'sendStamp').mockReturnValue(null);
      const crit = { id: 'roll:critical', words: '［クリティカル!］' };

      component.sendChat({
        text: '2d6 いくぞ',
        gameSystem: null,
        sendFrom: speaker.identifier,
        sendTo: '',
        portraitIndex: 0,
        messColor: '#112233',
        replyTo: '',
        quoteOf: '',
        toTicker: false,
        stamp: crit,
      });

      expect(stamp).not.toHaveBeenCalled();
      expect(macro).toHaveBeenCalledWith(speaker, '2d6 いくぞ', expect.objectContaining({ stamp: crit }));
    });
  });

  describe('sending a line to the ticker', () => {
    it('shows the line on the ticker where the switch is on, as the chat window does', () => {
      const speaker = createChar('術者');
      const tab = ChatTabList.instance.addChatTab('テストタブ');
      component.character.set(speaker);
      component.chatTabidentifier.set(tab.identifier);
      const said = { identifier: 'said-line' } as ChatMessage;
      vi.spyOn(TestBed.inject(CharacterMacroService), 'send').mockReturnValue(said);
      const shown = vi
        .spyOn(TestBed.inject(ChatTickerSelectionService), 'showMessage')
        .mockImplementation(() => undefined);

      component.sendChat({
        text: 'こんにちは',
        gameSystem: null as unknown as GameSystemClass,
        sendFrom: speaker.identifier,
        sendTo: '',
        portraitIndex: 0,
        messColor: '#112233',
        replyTo: '',
        quoteOf: '',
        toTicker: true,
      });

      expect(shown).toHaveBeenCalledWith('said-line');
    });
  });

  describe('the menu on a palette line', () => {
    function press(kind: 'command' | 'heading' | 'variable'): MouseEvent {
      const event = new MouseEvent('contextmenu', { clientX: 10, clientY: 10, cancelable: true });
      vi.spyOn(event, 'preventDefault');
      component.onPaletteRowMenu({ text: '2d6+3 攻撃', kind, lineIndex: 0 }, event);
      return event;
    }

    it('offers a line that is actually said', () => {
      const open = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);

      press('command');

      expect(open).toHaveBeenCalled();
    });

    it('leaves a heading or a setting line to the browser', () => {
      const open = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);

      const heading = press('heading');
      const variable = press('variable');

      expect(open).not.toHaveBeenCalled();
      expect(heading.preventDefault).not.toHaveBeenCalled();
      expect(variable.preventDefault).not.toHaveBeenCalled();
    });

    it('leaves the browser its own menu for a guest, who is offered nothing', () => {
      vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(false);
      const open = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);

      const event = press('command');

      expect(open).not.toHaveBeenCalled();
      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  it('checks its lines against the room’s default dice bot where the palette keeps the plain one', () => {
    const watch = vi.spyOn(TestBed.inject(ChatLintService), 'watch');
    const palette = TestBed.createComponent(ChatPaletteComponent);
    const char = createChar('術者');
    char.chatPalette!.dicebot = 'DiceBot';
    palette.componentInstance.character.set(char);
    palette.detectChanges();
    TestBed.tick();
    const source = watch.mock.calls[0][0];
    expect(source.path).toBe('palette');
    const before = Config.instance.defaultDiceBot;
    try {
      Config.instance.defaultDiceBot = 'Cthulhu7th';
      TestBed.inject(ObjectChangeService).notifyChanged('Config');

      expect(source.gameType()).toBe('Cthulhu7th');
    } finally {
      Config.instance.defaultDiceBot = before;
    }
  });

  describe('rewriting the palette', () => {
    let char: GameCharacter;

    beforeEach(() => {
      char = createChar('術者');
      char.chatPalette!.setPalette('2d6 攻撃');
      char.chatPalette!.dicebot = 'DiceBot';
      component.character.set(char);
    });

    function editButton(): HTMLButtonElement | null {
      return (fixture.nativeElement as HTMLElement).querySelector('[data-action="edit-palette"]');
    }

    function beGuest(): void {
      PeerCursor.myCursor.role = PeerRole.Guest;
      TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
    }

    it('is offered to a player', () => {
      fixture.detectChanges();

      expect(editButton()).not.toBeNull();
    });

    it('is not offered to a guest, nor opened by asking', () => {
      beGuest();
      fixture.detectChanges();
      component.toggleEditMode();

      expect(editButton()).toBeNull();
      expect(component.isEdit()).toBe(false);
    });

    it('leaves a guest choosing a dice bot to roll with without writing it to the character', () => {
      beGuest();

      component.gameType = 'Cthulhu7th';

      expect(component.gameType).toBe('Cthulhu7th');
      expect(char.chatPalette!.dicebot).toBe('DiceBot');
    });

    it('closes an edit a player made a guest had open, writing none of it back', () => {
      fixture.detectChanges();
      component.toggleEditMode();
      component.editPalette.set('1d100 書き換え');

      beGuest();
      TestBed.tick();

      expect(component.isEdit()).toBe(false);
      expect(char.chatPalette!.value).toBe('2d6 攻撃');
    });
  });

  describe('a palette parted into tabs', () => {
    function speakerWithTabs(name = '術者'): GameCharacter {
      const speaker = createChar(name);
      speaker.chatPalette!.setPalette('1d100 目星\n◆◆戦闘\n◆攻撃\n2d6+3 攻撃\n◆◆探索\nCC<=50');
      component.character.set(speaker);
      return speaker;
    }

    const root = () => fixture.nativeElement as HTMLElement;
    const tabs = () => [...root().querySelectorAll<HTMLElement>('[data-testid="palette-tab"]')];
    const drawnLines = () =>
      [...root().querySelectorAll<HTMLElement>('[data-line]')].map((line) => line.textContent?.trim() ?? '');

    it('shows the tabs, the lines before the first under their own, and only the open tab’s lines', () => {
      speakerWithTabs();
      fixture.detectChanges();

      expect(tabs().map((tab) => tab.textContent?.trim())).toEqual(['メイン', '戦闘', '探索']);
      expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
      expect(drawnLines()).toEqual(['1d100 目星']);

      tabs()[1].click();
      fixture.detectChanges();

      expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
      expect(drawnLines().join('|')).toContain('2d6+3 攻撃');
      expect(drawnLines().join('|')).not.toContain('CC<=50');
      expect(component.paletteHeadings().map((row) => row.headingName)).toEqual(['攻撃']);
    });

    it('lets another tab be opened after a jump to a heading in one', () => {
      speakerWithTabs();
      fixture.detectChanges();
      const id = (component as unknown as { _timeId: string })._timeId;
      TestBed.inject(UiSignalService).requestJumpIndex(id, 2);
      TestBed.tick();
      fixture.detectChanges();
      expect(tabs()[1].getAttribute('aria-selected')).toBe('true');

      tabs()[2].click();
      TestBed.tick();
      fixture.detectChanges();

      expect(tabs()[2].getAttribute('aria-selected')).toBe('true');
      expect(drawnLines()).toEqual(['CC<=50']);

      tabs()[0].click();
      TestBed.tick();
      fixture.detectChanges();

      expect(drawnLines()).toEqual(['1d100 目星']);
    });

    it('opens the tab it was left on when the character comes back to the panel', () => {
      const speaker = speakerWithTabs();
      fixture.detectChanges();
      tabs()[2].click();

      component.character.set(createChar('別人'));
      fixture.detectChanges();
      component.character.set(speaker);
      fixture.detectChanges();

      expect(drawnLines()).toEqual(['CC<=50']);
    });

    it('finds lines in every tab when searched', () => {
      speakerWithTabs();
      component.searchQuery.set('50');

      expect(component.searchResults().map((result) => [result.heading, result.row.text])).toEqual([
        ['探索', 'CC<=50'],
      ]);
    });

    it('opens the tab a search result stands in when it is picked', () => {
      speakerWithTabs();
      fixture.detectChanges();
      component.searchQuery.set('50');

      component.pickSearchResult(component.searchResults()[0]);
      fixture.detectChanges();

      expect(tabs()[2].getAttribute('aria-selected')).toBe('true');
      expect(drawnLines()).toEqual(['CC<=50']);
      expect(component.selectedLine()).toBe(5);
    });

    it('shows no tabs on a palette without any', () => {
      const speaker = createChar('術者');
      speaker.chatPalette!.setPalette('◆戦闘\n2d6');
      component.character.set(speaker);
      fixture.detectChanges();

      expect(tabs()).toHaveLength(0);
    });
  });

  describe('reaching the headings', () => {
    function speakerWithHeadings(): void {
      const speaker = createChar('術者');
      speaker.chatPalette!.setPalette('◆戦闘\n2d6+3 攻撃\n◆技能\n1d100<=50');
      component.character.set(speaker);
    }

    function shown<T extends HTMLElement>(testId: string): T | null {
      return (fixture.nativeElement as HTMLElement).querySelector<T>(`[data-testid="${testId}"]`);
    }

    it('opens the menu from a button while the panel stands on the table', () => {
      speakerWithHeadings();
      fixture.detectChanges();

      expect(shown('palette-headings-menu')).not.toBeNull();
      expect(shown('palette-headings-list')).toBeNull();
    });

    it('lists them instead once the panel is in a window of its own', () => {
      TestBed.inject(PanelService).windowed.set(true);
      speakerWithHeadings();
      fixture.detectChanges();

      const list = shown<HTMLSelectElement>('palette-headings-list');

      expect(shown('palette-headings-menu')).toBeNull();
      expect([...(list?.options ?? [])].map((option) => option.value)).toEqual(['', '0', '2']);
    });

    it('goes to the heading picked, and offers the same one again after', () => {
      TestBed.inject(PanelService).windowed.set(true);
      speakerWithHeadings();
      fixture.detectChanges();
      const list = shown<HTMLSelectElement>('palette-headings-list')!;

      list.value = '2';
      list.dispatchEvent(new Event('change'));

      expect(component.selectedLine()).toBe(2);
      expect(list.selectedIndex).toBe(0);
    });

    it('has nothing to offer where the palette carries no heading', () => {
      TestBed.inject(PanelService).windowed.set(true);
      const speaker = createChar('術者');
      speaker.chatPalette!.setPalette('2d6+3 攻撃');
      component.character.set(speaker);
      fixture.detectChanges();

      expect(shown<HTMLSelectElement>('palette-headings-list')?.disabled).toBe(true);
    });
  });

  describe('the tabs lines are sent to', () => {
    let tabs: ChatTab[];

    function tabNames(): string[] {
      const pills = (fixture.nativeElement as HTMLElement).querySelectorAll('.chat-tab-pill');
      return [...pills].map((pill) => pill.textContent!.trim());
    }

    beforeEach(() => {
      tabs = [ChatTabList.instance.addChatTab('一枚目'), ChatTabList.instance.addChatTab('二枚目')];
      fixture = TestBed.createComponent(ChatPaletteComponent);
      component = fixture.componentInstance;
      component.character.set(createChar('術者'));
      fixture.detectChanges();
    });

    it('starts on the first tab', () => {
      expect(component.chatTabidentifier()).toBe(tabs[0].identifier);
    });

    it('moves to the first tab left where the one chosen goes', async () => {
      component.chatTabidentifier.set(tabs[1].identifier);
      tabs[1].destroy();
      await fixture.whenStable();

      expect(component.chatTabidentifier()).toBe(tabs[0].identifier);
    });

    it('moves on to the next tab as the wheel turns over them, as the chat window does', () => {
      const strip = (fixture.nativeElement as HTMLElement)
        .querySelector('.chat-tab-pill')!
        .closest('label')!.parentElement!;

      strip.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
      fixture.detectChanges();

      expect(component.chatTabidentifier()).toBe(tabs[1].identifier);
    });

    it('leaves out a tab this seat may not read, and moves off it', () => {
      component.chatTabidentifier.set(tabs[1].identifier);
      fixture.detectChanges();

      PeerCursor.myCursor.role = PeerRole.Player;
      tabs[1].plCanView = false;
      TestBed.inject(ObjectChangeService).notifyChanged(tabs[1].identifier);
      TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
      fixture.detectChanges();

      expect(tabNames()).toEqual(['一枚目']);
      expect(component.chatTabidentifier()).toBe(tabs[0].identifier);
    });

    it('shows the input as read only in a tab this seat may not speak in', () => {
      PeerCursor.myCursor.role = PeerRole.Player;
      tabs[0].plCanSpeak = false;
      TestBed.inject(ObjectChangeService).notifyChanged(tabs[0].identifier);
      TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
      fixture.detectChanges();

      const input = (fixture.nativeElement as HTMLElement).querySelector('chat-input')!;
      expect(input.querySelector('textarea[name="chat-input-text"]')).toBeNull();
    });
  });

  describe('searching the palette', () => {
    function speaker(text: string): void {
      const char = createChar('術者');
      char.chatPalette!.setPalette(text);
      component.character.set(char);
      fixture.detectChanges();
    }

    function root(): HTMLElement {
      return fixture.nativeElement as HTMLElement;
    }

    function searchBox(): HTMLInputElement | null {
      return root().querySelector<HTMLInputElement>('[data-testid="palette-search"]');
    }

    function searchFor(query: string): HTMLInputElement {
      const input = searchBox()!;
      input.value = query;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      return input;
    }

    function resultsArea(): HTMLElement | null {
      return root().querySelector<HTMLElement>('[data-testid="palette-search-results"]');
    }

    function results(): HTMLElement[] {
      return [...(resultsArea()?.querySelectorAll<HTMLElement>('[data-result-line]') ?? [])];
    }

    function press(input: HTMLInputElement, key: string): KeyboardEvent {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      input.dispatchEvent(event);
      fixture.detectChanges();
      return event;
    }

    it('shows each line as written, with nothing before or after it', () => {
      speaker('2d6+3 攻撃\n//修正=2');

      expect(root().querySelector('[data-line="0"]')!.textContent).toBe('2d6+3 攻撃');
      expect(root().querySelector('[data-line="1"]')!.textContent).toBe('//修正=2');
    });

    it('shows no results until something is searched for', () => {
      speaker('2d6+3 攻撃');

      expect(searchBox()).not.toBeNull();
      expect(resultsArea()).toBeNull();
    });

    it('lists the lines holding what is searched for right under the search box, those beginning with it first', () => {
      speaker('◆戦闘\n1d100<=50 回避\n2d6+3 攻撃\n回避ロール 1d100\n◆技能\nCCB<=60 目星');

      searchFor('回避');

      expect(results().map((row) => row.dataset['resultLine'])).toEqual(['3', '1']);
      const list = root().querySelector('[data-line="0"]')!.parentElement!;
      expect(list.compareDocumentPosition(resultsArea()!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
      expect(searchBox()!.compareDocumentPosition(resultsArea()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('puts a result clicked into the input and picks out its line in the palette, as a palette row does', () => {
      speaker('◆戦闘\n2d6+3 攻撃\n1d100<=50 回避');
      searchFor('回避');

      results()[0].click();
      fixture.detectChanges();

      expect(component.text()).toBe('1d100<=50 回避');
      expect(component.selectedLine()).toBe(2);
    });

    it('sends a result clicked twice, as a palette row does', () => {
      speaker('2d6+3 攻撃');
      const send = vi.spyOn(component.chatInputComponent(), 'sendChat').mockImplementation(() => undefined);
      searchFor('攻撃');

      results()[0].click();
      results()[0].click();

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('moves through the results with the arrows and takes one into the input with Enter, sending nothing', () => {
      speaker('攻撃 2d6\n2d6 攻撃');
      const send = vi.spyOn(component.chatInputComponent(), 'sendChat').mockImplementation(() => undefined);
      const input = searchFor('攻撃');

      press(input, 'ArrowDown');
      expect(results()[1].getAttribute('aria-selected')).toBe('true');
      const enter = press(input, 'Enter');

      expect(enter.defaultPrevented).toBe(true);
      expect(component.text()).toBe('2d6 攻撃');
      expect(component.selectedLine()).toBe(1);
      expect(send).not.toHaveBeenCalled();
    });

    it('clears the search with Escape', () => {
      speaker('2d6+3 攻撃');
      const input = searchFor('攻撃');

      press(input, 'Escape');

      expect(component.searchQuery()).toBe('');
      expect(resultsArea()).toBeNull();
    });

    it('says so when no line holds what is searched for', () => {
      speaker('2d6+3 攻撃');

      searchFor('回避');

      expect(results()).toEqual([]);
      expect(resultsArea()?.querySelector('[data-testid="palette-search-empty"]')).not.toBeNull();
    });

    it('is not offered while the palette is being edited', () => {
      speaker('2d6+3 攻撃');

      component.toggleEditMode();
      fixture.detectChanges();

      expect(searchBox()).toBeNull();
    });
  });
});

describe('ChatPaletteComponent handing its text area over to the editor', () => {
  let arrive: (module: ChatEditorModule) => void;
  let mounted: ReturnType<typeof vi.fn>;
  let char: GameCharacter;

  beforeEach(() => {
    PeerCursor.createMyCursor();
    mounted = vi.fn(() => ({
      parent: null,
      refresh: vi.fn(),
      refreshSoon: vi.fn(),
      followRoot: vi.fn(),
      destroy: vi.fn(),
      reconfigure: vi.fn(),
    }));
    const loader = () =>
      new Promise<ChatEditorModule | null>((resolve) => {
        arrive = resolve;
      });
    TestBed.configureTestingModule({
      imports: [ChatPaletteComponent],
      providers: [...TEST_PROVIDERS, { provide: CHAT_EDITOR_LOADER, useValue: loader }],
    });
    char = GameCharacter.create('術者', 1, '');
    char.chatPalette!.setPalette('2d6 攻撃\n1d100 調べる');
  });

  afterEach(() => {
    ObjectStore.instance.remove(char);
    for (const tab of [...ChatTabList.instance.chatTabs]) tab.destroy();
  });

  it('puts the editor in where the caret stood, with the keys, as it arrives while the palette is written', async () => {
    const fixture = TestBed.createComponent(ChatPaletteComponent);
    fixture.componentInstance.character.set(char);
    fixture.detectChanges();
    fixture.componentInstance.toggleEditMode();
    fixture.detectChanges();
    await fixture.whenStable();
    const area = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>(
      'textarea[name="edit-palette"]'
    )!;
    area.focus();
    area.setSelectionRange(4, 6);

    arrive({ mountChatEditor: mounted } as unknown as ChatEditorModule);
    await fixture.whenStable();
    fixture.detectChanges();
    TestBed.tick();

    expect(mounted).toHaveBeenCalledWith(
      expect.anything(),
      { text: '2d6 攻撃\n1d100 調べる', selection: { from: 4, to: 6 }, focused: true },
      expect.anything()
    );
  });

  it('puts the editor in where the caret stands as it is put in, moved after the editor arrived', async () => {
    const fixture = TestBed.createComponent(ChatPaletteComponent);
    fixture.componentInstance.character.set(char);
    fixture.detectChanges();
    fixture.componentInstance.toggleEditMode();
    fixture.detectChanges();
    await fixture.whenStable();
    const area = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>(
      'textarea[name="edit-palette"]'
    )!;
    area.focus();
    area.setSelectionRange(4, 6);

    arrive({ mountChatEditor: mounted } as unknown as ChatEditorModule);
    await Promise.resolve();
    await Promise.resolve();
    area.setSelectionRange(1, 1);
    fixture.detectChanges();
    TestBed.tick();

    expect(mounted).toHaveBeenCalledWith(
      expect.anything(),
      { text: '2d6 攻撃\n1d100 調べる', selection: { from: 1, to: 1 }, focused: true },
      expect.anything()
    );
  });

  it('colours the editor again as a picture arrives, for the stamps in it to be drawn', async () => {
    const fixture = TestBed.createComponent(ChatPaletteComponent);
    fixture.componentInstance.character.set(char);
    fixture.detectChanges();
    fixture.componentInstance.toggleEditMode();
    fixture.detectChanges();
    await fixture.whenStable();
    arrive({ mountChatEditor: mounted } as unknown as ChatEditorModule);
    await fixture.whenStable();
    fixture.detectChanges();
    TestBed.tick();
    const field = mounted.mock.results[0].value as { refreshSoon: ReturnType<typeof vi.fn> };
    field.refreshSoon.mockClear();

    TestBed.inject(ObjectChangeService).fileVersion.update((version) => version + 1);
    TestBed.tick();

    expect(field.refreshSoon).toHaveBeenCalled();
  });

  it('names the editor and its bars again as the language changes', async () => {
    const fixture = TestBed.createComponent(ChatPaletteComponent);
    fixture.componentInstance.character.set(char);
    fixture.detectChanges();
    fixture.componentInstance.toggleEditMode();
    fixture.detectChanges();
    await fixture.whenStable();
    arrive({ mountChatEditor: mounted } as unknown as ChatEditorModule);
    await fixture.whenStable();
    fixture.detectChanges();
    TestBed.tick();
    const field = mounted.mock.results[0].value as { reconfigure: ReturnType<typeof vi.fn> };
    field.reconfigure.mockClear();

    TestBed.inject(TranslocoService).setActiveLang('en');
    TestBed.tick();

    expect(field.reconfigure).toHaveBeenCalled();
  });

  it('follows the text area for no editor where the editor could not be fetched', async () => {
    const fixture = TestBed.createComponent(ChatPaletteComponent);
    fixture.componentInstance.character.set(char);
    fixture.detectChanges();
    fixture.componentInstance.toggleEditMode();
    fixture.detectChanges();
    await fixture.whenStable();
    const area = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>(
      'textarea[name="edit-palette"]'
    )!;
    const listen = vi.spyOn(area, 'addEventListener');

    arrive(null as unknown as ChatEditorModule);
    await fixture.whenStable();

    expect(listen).not.toHaveBeenCalledWith('focus', expect.anything());
  });

  it('waits for a word being made in the text area to be made before the editor takes its place', async () => {
    const fixture = TestBed.createComponent(ChatPaletteComponent);
    fixture.componentInstance.character.set(char);
    fixture.detectChanges();
    fixture.componentInstance.toggleEditMode();
    fixture.detectChanges();
    await fixture.whenStable();
    const area = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>(
      'textarea[name="edit-palette"]'
    )!;
    area.dispatchEvent(new CompositionEvent('compositionstart'));

    arrive({ mountChatEditor: mounted } as unknown as ChatEditorModule);
    await fixture.whenStable();
    TestBed.tick();
    expect(mounted).not.toHaveBeenCalled();

    area.dispatchEvent(new CompositionEvent('compositionend'));
    await new Promise((done) => setTimeout(done));
    fixture.detectChanges();
    TestBed.tick();

    expect(mounted).toHaveBeenCalledOnce();
  });

  it('takes up no caret kept for an editor that was not to be put in, when one is put in later', async () => {
    const preferences = TestBed.inject(ChatPreferencesService);
    preferences.setRichInput(false);
    try {
      const fixture = TestBed.createComponent(ChatPaletteComponent);
      fixture.componentInstance.character.set(char);
      fixture.detectChanges();
      fixture.componentInstance.toggleEditMode();
      fixture.detectChanges();
      await fixture.whenStable();
      preferences.setRichInput(true);
      TestBed.tick();
      const area = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>(
        'textarea[name="edit-palette"]'
      )!;
      area.focus();
      area.setSelectionRange(4, 6);
      preferences.setRichInput(false);
      TestBed.tick();

      arrive({ mountChatEditor: mounted } as unknown as ChatEditorModule);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(mounted).not.toHaveBeenCalled();

      preferences.setRichInput(true);
      TestBed.tick();
      fixture.detectChanges();
      TestBed.tick();

      expect(mounted).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ selection: { from: 0, to: 0 }, focused: false }),
        expect.anything()
      );
    } finally {
      preferences.setRichInput(true);
    }
  });
});
