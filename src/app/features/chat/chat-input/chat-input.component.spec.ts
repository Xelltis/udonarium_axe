import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopDisplayService } from '@axe/application/tabletop/tabletop-display.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { Network } from '@axe/core/network/network';
import { localDispatch } from '@axe/core/network/network-messaging';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { OPEN_STAMP_RULES, withStampsAllowed, withStampUseOn } from '@axe/domain/chat/stamp-rules';
import { DataElement } from '@axe/domain/data/data-element';
import { DiceStage } from '@axe/domain/dice/dice-3d/dice-stage';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { ChatComposeService } from '@axe/features/chat/chat-compose.service';
import { ChatInputComponent } from '@axe/features/chat/chat-input/chat-input.component';
import { StampPickerService } from '@axe/features/chat/stamp/stamp-picker.service';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

type Outgoing = Parameters<Parameters<ChatInputComponent['chat']['subscribe']>[0]>[0];

/** A panel of its own around one input, which is what a chat window is as far as this cares. */
@Component({
  selector: 'panel-host',
  imports: [ChatInputComponent],
  template: '<chat-input [canSpeak]="true"></chat-input>',
  providers: [ChatComposeService],
})
class PanelHostComponent {}

describe('ChatInputComponent', () => {
  let component: ChatInputComponent;
  let fixture: ComponentFixture<ChatInputComponent>;
  const gameSystem = { ID: 'DiceBot' } as unknown as Awaited<ReturnType<typeof DiceBot.loadGameSystemAsync>>;

  beforeEach(async () => {
    PeerCursor.createMyCursor();
    TestBed.configureTestingModule({
      imports: [ChatInputComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    vi.spyOn(DiceBot, 'gameSystemForLineAsync').mockResolvedValue(gameSystem);
    fixture = TestBed.createComponent(ChatInputComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function sent(): Promise<Outgoing> {
    return new Promise((resolve) => component.chat.subscribe(resolve));
  }

  function speaker(name: string): GameCharacter {
    const character = GameCharacter.create(name, 1, '');
    character.chatColorCode = ['#111111', '#222222', '#333333'];
    character.chatBubbleLight = ['#aaaaaa', '#bbbbbb', '#cccccc'];
    character.chatBubbleDark = ['#444444', '#555555', '#666666'];
    return character;
  }

  it('moves a whisper onto the cursor its target came back on, once the one it left is taken away', () => {
    const before = new PeerCursor('bob-before');
    before.initialize();
    before.userId = 'user-bob';
    const after = new PeerCursor('bob-after');
    after.initialize();
    after.userId = 'user-bob';
    try {
      component.sendTo = 'bob-before';

      ObjectStore.instance.remove(before);
      localDispatch('DELETE_GAME_OBJECT', { aliasName: PeerCursor.aliasName, identifier: 'bob-before' }, 'peer-b');

      expect(component.sendTo).toBe('bob-after');
    } finally {
      ObjectStore.instance.remove(after);
    }
  });

  it('sends a guest’s lines in the guest’s own colours, which their colour panel sets, not the piece’s', () => {
    const character = speaker('ヒロ');
    const role = PeerCursor.myCursor.role;
    const colors = PeerCursor.myCursor.chatColorCode;
    PeerCursor.myCursor.chatColorCode = ['#abcdef', '#abcdef', '#abcdef'];
    try {
      component.sendFrom = character.identifier;
      expect(component.chatColor(0)).toBe('#111111');

      PeerCursor.myCursor.role = PeerRole.Guest;
      expect(component.chatColor(0)).toBe('#abcdef');
    } finally {
      PeerCursor.myCursor.role = role;
      PeerCursor.myCursor.chatColorCode = colors;
      character.destroy();
    }
  });

  it('sets a guest speaking as a piece the colours of their own lines, not the piece’s', () => {
    const character = speaker('ヒロ');
    const opened: { tabletopObject?: unknown }[] = [];
    vi.spyOn(TestBed.inject(PanelService), 'open').mockImplementation(() => {
      const panel = {};
      opened.push(panel);
      return panel as never;
    });
    const role = PeerCursor.myCursor.role;
    try {
      component.sendFrom = character.identifier;
      component.showColorSetting();
      expect(opened[0].tabletopObject).toBe(character);

      vi.spyOn(TestBed.inject(PanelService), 'closeSingle').mockReturnValue(false);
      PeerCursor.myCursor.role = PeerRole.Guest;
      component.showColorSetting();
      expect(opened[1].tabletopObject).toBeNull();
    } finally {
      PeerCursor.myCursor.role = role;
      character.destroy();
      vi.restoreAllMocks();
    }
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('the portrait slider', () => {
    function withPortraits(count: number): GameCharacter {
      const character = speaker('役者');
      for (let index = character.imageDataElement!.children.length; index < count; index++) {
        character.imageDataElement!.appendChild(
          DataElement.create('imageIdentifier', `face-${index}`, { type: 'image' })
        );
      }
      return character;
    }

    const slider = () => {
      openTools();
      return fixture.nativeElement.querySelector(
        '[data-testid="chat-input-portraits"] input[type="range"]'
      ) as HTMLInputElement | null;
    };

    async function speakAs(character: GameCharacter): Promise<void> {
      component.sendFrom = character.identifier;
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('runs through the portraits of a speaker with several, under the tools button', async () => {
      await speakAs(withPortraits(3));

      expect(slider()?.max).toBe('2');
      expect(slider()?.closest('[data-testid="chat-input-tools-row"]')).not.toBeNull();
    });

    it('speaks with the portrait the knob is moved to', async () => {
      const character = withPortraits(3);
      await speakAs(character);

      slider()!.value = '2';
      slider()!.dispatchEvent(new Event('input'));

      expect(component.portraitIndex).toBe(2);
      expect(character.selectedPortraitIndex).toBe(2);
    });

    it('is left out for a speaker with only one portrait to show', async () => {
      await speakAs(withPortraits(1));

      expect(slider()).toBeNull();
    });
  });

  describe('the seats to whisper to', () => {
    it('offers on a room server this seat and the seats logged in, and no seat whose id anybody may take', () => {
      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('@authority');
      const guest = new PeerCursor();
      guest.initialize();
      guest.userId = 'guest-tab';
      guest.role = PeerRole.Guest;
      const player = new PeerCursor();
      player.initialize();
      player.userId = 'acct_player';
      player.role = PeerRole.Player;
      try {
        expect(component.otherPeers).toContain(PeerCursor.myCursor);
        expect(component.otherPeers).toContain(player);
        expect(component.otherPeers).not.toContain(guest);
      } finally {
        guest.destroy();
        player.destroy();
      }
    });

    it('keeps offering on a room server the seat already whispered to, so that it can be put back to everyone', () => {
      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('@authority');
      const guest = new PeerCursor();
      guest.initialize();
      guest.userId = 'old-account';
      guest.role = PeerRole.Guest;
      try {
        component.sendTo = guest.identifier;
        expect(component.otherPeers).toContain(guest);
      } finally {
        guest.destroy();
      }
    });

    it('offers among peers every seat', () => {
      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue(null);
      const guest = new PeerCursor();
      guest.initialize();
      guest.userId = 'guest-tab';
      guest.role = PeerRole.Guest;
      try {
        expect(component.otherPeers).toContain(guest);
      } finally {
        guest.destroy();
      }
    });
  });

  describe('the characters on offer', () => {
    it('leaves out a piece on the table this seat cannot see, but keeps the one it speaks as', () => {
      const seen = speaker('勇者');
      seen.setLocation('table');
      const unseen = speaker('闇の魔物');
      unseen.setLocation('table');
      vi.spyOn(TestBed.inject(VisionService), 'mayBeListed').mockImplementation((character) => character !== unseen);

      expect(component.gameCharacters()).toContain(seen);
      expect(component.gameCharacters()).not.toContain(unseen);

      component.sendFrom = unseen.identifier;
      expect(component.gameCharacters()).toContain(unseen);
      seen.destroy();
      unseen.destroy();
    });
  });

  /** Opens the row under the bar where the tools that do not fit in it are, where it is shut. */
  function openTools(): void {
    fixture.detectChanges();
    const tools = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="chat-input-tools"]'
    );
    if (tools && tools.getAttribute('aria-expanded') !== 'true') tools.click();
    fixture.detectChanges();
  }

  describe('the bar over the box', () => {
    const bar = () => (fixture.nativeElement as HTMLElement).querySelector('[data-testid="chat-input-bar"]')!;
    const find = (selector: string) => (fixture.nativeElement as HTMLElement).querySelector(selector);

    it('holds the speaker, the recipient, the formatting buttons, the speech colour and the dice bot in one bar', async () => {
      fixture.componentRef.setInput('canSpeak', true);
      fixture.detectChanges();
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(bar().querySelector('[data-testid="chat-toolbar"]')).not.toBeNull();
      });

      expect(bar().getAttribute('role')).toBe('toolbar');
      expect(Array.from(bar().querySelectorAll('ng-select')).map((select) => select.getAttribute('name'))).toEqual([
        'send-from',
        'send-to',
        'game-type',
      ]);
      expect(bar().querySelector('[data-testid="chat-input-color"]')).not.toBeNull();
      expect(find('[data-testid="chat-input-tools"]')).toBeNull();
    });

    it('leaves the formatting buttons out for a tab the reader may not speak in, keeping the rest', async () => {
      fixture.componentRef.setInput('canSpeak', false);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(bar().querySelector('[data-testid="chat-toolbar"]')).toBeNull();
      expect(bar().querySelectorAll('ng-select')).toHaveLength(3);
      expect(bar().querySelector('[data-testid="chat-input-color"]')).not.toBeNull();
    });

    it('speaks in the colour picked from the colour button, which then shows it', () => {
      fixture.detectChanges();
      const panel = find('[data-testid="chat-input-colors"]') as HTMLElement;
      panel.showPopover = () => undefined;
      panel.hidePopover = () => undefined;
      (find('[data-testid="chat-input-color"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      const swatches = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
          '[data-testid="chat-input-colors"] button[aria-pressed]'
        )
      );
      expect(swatches).toHaveLength(3);

      swatches[2].click();
      fixture.detectChanges();

      expect(component.colorSelectNo()).toBe(2);
      expect(
        (find('[data-testid="chat-input-color"] span') as HTMLElement).style.backgroundColor.replace(/\s/g, '')
      ).toBe((swatches[2].querySelector('span') as HTMLElement).style.backgroundColor.replace(/\s/g, ''));
    });
  });

  describe('packed down for a panel', () => {
    function find(selector: string): Element | null {
      return (fixture.nativeElement as HTMLElement).querySelector(selector);
    }

    function textBox(): HTMLTextAreaElement {
      return find('textarea[name="chat-input-text"]') as HTMLTextAreaElement;
    }

    it('starts the box a line high, leaving it to grow with what is typed', () => {
      fixture.detectChanges();
      expect(textBox().getAttribute('rows')).toBeNull();

      fixture.componentRef.setInput('dense', true);
      fixture.detectChanges();

      expect(textBox().getAttribute('rows')).toBe('1');
    });

    it('says what the panel asks for in the empty box, in place of its keys', () => {
      fixture.componentRef.setInput('placeholder', '行をクリックで入力');
      fixture.detectChanges();

      expect(textBox().placeholder).toBe('行をクリックで入力');
    });
  });

  describe('an input with no box to write in', () => {
    it('takes a reply asked of every input without reaching for its missing box', () => {
      fixture.componentRef.setInput('canSpeak', false);
      fixture.detectChanges();
      const message = new ChatMessage();
      message.initialize();

      expect(() => {
        TestBed.inject(UiSignalService).requestChatReply(message.identifier);
        fixture.detectChanges();
      }).not.toThrow();

      message.destroy();
    });
  });

  describe('two inputs, each in a panel of its own', () => {
    /** An input standing in a panel that asks it things, as a chat window does. */
    function inPanel(): { input: ChatInputComponent; asked: ChatComposeService; box: HTMLTextAreaElement } {
      const panel = TestBed.createComponent(PanelHostComponent);
      panel.detectChanges();
      const input = panel.debugElement.query((node) => node.componentInstance instanceof ChatInputComponent);
      return {
        input: input.componentInstance as ChatInputComponent,
        asked: panel.debugElement.injector.get(ChatComposeService),
        box: panel.nativeElement.querySelector('textarea') as HTMLTextAreaElement,
      };
    }

    it('answers in the panel that was asked, and leaves the other one alone', () => {
      const message = new ChatMessage();
      message.initialize();
      const one = inPanel();
      const other = inPanel();

      one.asked.requestReply(message.identifier);
      TestBed.tick();

      expect(one.input.replyTarget()).toBe(message);
      expect(other.input.replyTarget()).toBeNull();
      message.destroy();
    });

    it('quotes in the panel that was asked, and leaves the other one alone', () => {
      const message = new ChatMessage();
      message.initialize();
      const one = inPanel();
      const other = inPanel();

      other.asked.requestQuote(message.identifier);
      TestBed.tick();

      expect(other.input.quoteTarget()).toBe(message);
      expect(one.input.quoteTarget()).toBeNull();
      message.destroy();
    });

    it('puts the caret in the box of the panel that was asked', () => {
      const message = new ChatMessage();
      message.initialize();
      const one = inPanel();
      const other = inPanel();
      const asked = vi.spyOn(one.box, 'focus');
      const alone = vi.spyOn(other.box, 'focus');

      one.asked.requestReply(message.identifier);
      TestBed.tick();

      expect(asked).toHaveBeenCalled();
      expect(alone).not.toHaveBeenCalled();
      message.destroy();
    });
  });

  describe('the button to choose how this seat’s dice look', () => {
    const button = () => {
      openTools();
      return fixture.nativeElement.querySelector('[data-testid="chat-my-dice"]') as HTMLButtonElement | null;
    };
    let stageBefore: DiceStage;

    beforeEach(() => {
      stageBefore = Config.instance.diceStage;
    });

    afterEach(() => {
      Config.instance.diceStage = stageBefore;
    });

    it('is offered only while the room shows its rolls’ dice', async () => {
      Config.instance.diceStage = 'off';
      fixture.detectChanges();
      await fixture.whenStable();
      expect(button()).toBeNull();

      Config.instance.diceStage = 'frame';
      fixture.detectChanges();
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(button()).not.toBeNull();
      });
    });

    it('is not offered to a guest, who is not offered the panel', async () => {
      const role = PeerCursor.myCursor.role;
      PeerCursor.myCursor.role = PeerRole.Guest;
      try {
        Config.instance.diceStage = 'frame';
        fixture.detectChanges();
        await fixture.whenStable();
        expect(button()).toBeNull();
      } finally {
        PeerCursor.myCursor.role = role;
      }
    });

    it('opens the panel for it', async () => {
      const open = vi.spyOn(TestBed.inject(RoomPanelService), 'open').mockImplementation(() => undefined);
      Config.instance.diceStage = 'both';
      fixture.detectChanges();
      await fixture.whenStable();

      button()!.click();

      expect(open).toHaveBeenCalledWith('myDice');
    });
  });

  describe('showing who is typing', () => {
    it('keeps no fixed strip for it under the box', () => {
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.writing-info')).toBeNull();
    });
  });

  describe('sending', () => {
    it('sends as the player with the chosen colour and bubbles when nobody else is speaking', async () => {
      fixture.detectChanges();
      const me = PeerCursor.myCursor;
      me.chatColorCode = ['#101010', '#202020', '#303030'];
      me.chatBubbleLight = ['#a1a1a1', '#b1b1b1', '#c1c1c1'];
      me.chatBubbleDark = ['#414141', '#515151', '#616161'];
      component.text = 'hello';
      component.setColorNum(2);
      const outgoing = sent();

      component.sendChat(null);

      expect(await outgoing).toEqual({
        text: 'hello',
        gameSystem,
        sendFrom: me.identifier,
        sendTo: '',
        portraitIndex: 0,
        messColor: '#303030',
        messBubbleLight: '#c1c1c1',
        messBubbleDark: '#616161',
        replyTo: '',
        quoteOf: '',
        toTicker: false,
      });
      expect(component.text).toBe('');
    });

    it('empties the box when Enter comes before the typing has been drawn', async () => {
      fixture.componentRef.setInput('canSpeak', true);
      await fixture.whenStable();
      const box = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>('[data-chat-input]')!;
      const outgoing = sent();

      box.value = '雑談1';
      box.dispatchEvent(new Event('input'));
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await fixture.whenStable();

      expect((await outgoing).text).toBe('雑談1');
      expect(box.value).toBe('');
    });

    it('hands the line to the dice bot, which decides whether it must wait for the system', async () => {
      fixture.detectChanges();
      component.text = 'こんにちは';
      const outgoing = sent();

      component.sendChat(null);
      await outgoing;

      expect(DiceBot.gameSystemForLineAsync).toHaveBeenCalledWith(component.gameType, 'こんにちは');
    });

    const tickerSwitch = () => {
      openTools();
      return fixture.nativeElement.querySelector('[data-testid="chat-send-to-ticker"]');
    };

    it('offers the ticker only where this screen runs one, and marks the line when it is asked to', async () => {
      fixture.detectChanges();
      expect(tickerSwitch()).toBeNull();

      TestBed.inject(TabletopDisplayService).set({ multiAngleTickerEnabled: true });
      fixture.detectChanges();
      // The room runs one, but this seat is in perspective and has no band of its own.
      expect(tickerSwitch()).toBeNull();

      TestBed.inject(ViewModePreferenceService).choose('flat');
      fixture.detectChanges();
      expect(tickerSwitch()).toBeTruthy();

      component.toggleTickerSend();
      component.text = 'ラウンド開始';
      const outgoing = sent();

      component.sendChat(null);

      expect((await outgoing).toTicker).toBe(true);
    });

    it('offers a guest no ticker, the band being on everybody else’s screen', () => {
      TestBed.inject(TabletopDisplayService).set({ multiAngleTickerEnabled: true });
      TestBed.inject(ViewModePreferenceService).choose('flat');
      PeerCursor.myCursor.role = PeerRole.Guest;
      TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
      fixture.detectChanges();

      expect(tickerSwitch()).toBeNull();
      expect(component.showsTickerSwitch()).toBe(false);
    });

    it('sends as the character that was picked with its own colours', async () => {
      fixture.detectChanges();
      const character = speaker('アリス');
      component.sendFrom = character.identifier;
      component.setColorNum(1);
      component.text = 'やあ';
      const outgoing = sent();

      component.sendChat(null);

      expect(await outgoing).toMatchObject({
        sendFrom: character.identifier,
        messColor: '#222222',
        messBubbleLight: '#bbbbbb',
        messBubbleDark: '#555555',
      });
    });

    it('resolves the colour from whoever is speaking', () => {
      const character = speaker('アリス');
      PeerCursor.myCursor.chatColorCode = ['#101010', '#202020', '#303030'];

      component.sendFrom = PeerCursor.myCursor.identifier;
      expect(component.chatColor(0)).toBe('#101010');
      expect(component.characterChatColor(0)).toBe('#000000');

      component.sendFrom = character.identifier;
      expect(component.chatColor(0)).toBe('#111111');
      expect(component.characterChatColor(2)).toBe('#333333');
    });

    it('keeps the colour choice within the three slots', () => {
      component.setColorNum(7);
      expect(component.colorSelectNo()).toBe(2);

      component.setColorNum(-3);
      expect(component.colorSelectNo()).toBe(0);
    });

    it('opens the stamps from the bar, and sends the one picked alone as a stamp of its own with Enter', () => {
      fixture.componentRef.setInput('canSpeak', true);
      fixture.detectChanges();
      component.text = '';
      const toggle = vi.spyOn(TestBed.inject(StampPickerService), 'toggle').mockImplementation(() => undefined);
      const emitted: Outgoing[] = [];
      component.chat.subscribe((value) => emitted.push(value));

      const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '[data-testid="chat-input-bar"] [data-testid="chat-input-stamp"]'
      )!;
      button.click();
      expect(toggle).toHaveBeenCalledWith(button, 'line', expect.any(Function));
      toggle.mock.calls[0][2]('seal:ok');
      expect(emitted).toEqual([]);
      expect(component.text).toMatch(/^［.+:seal:ok］$/);

      component.sendChat(new KeyboardEvent('keydown', { key: 'Enter' }));
      component.sendChat(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(component.text).toBe('');
      expect(emitted).toEqual([
        expect.objectContaining({
          text: '',
          stamp: { id: 'seal:ok', words: expect.any(String) },
          gameSystem: null,
          replyTo: '',
          toTicker: false,
        }),
      ]);
      expect(emitted[0].stamp!.words.length).toBeGreaterThan(0);
    });

    it('puts the stamp picked in at the caret among the words, to go out inside them', async () => {
      fixture.componentRef.setInput('canSpeak', true);
      fixture.detectChanges();
      const toggle = vi.spyOn(TestBed.inject(StampPickerService), 'toggle').mockImplementation(() => undefined);
      const box = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>('[data-chat-input]')!;
      component.text = '了解です';
      box.value = '了解です';
      box.setSelectionRange(2, 2);
      const outgoing = sent();

      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLButtonElement>('[data-testid="chat-input-stamp"]')!
        .click();
      toggle.mock.calls[0][2]('seal:ok');
      const written = box.value;
      expect(written).toMatch(/^了解［.+:seal:ok］です$/);
      expect(component.text).toBe(written);

      component.sendChat(new KeyboardEvent('keydown', { key: 'Enter' }));

      const line = await outgoing;
      expect(line.text).toBe(written);
      expect(line.stamp).toBeUndefined();
    });

    it('wraps the words picked out in the plain box in the decoration chosen on the toolbar, keeps them picked out and takes them as the line', async () => {
      fixture.componentRef.setInput('canSpeak', true);
      fixture.detectChanges();
      component.text = '今日は晴れ';
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(
          (fixture.nativeElement as HTMLElement).querySelector('[data-testid="chat-toolbar-bold"]')
        ).not.toBeNull();
      });
      await fixture.whenStable();
      const box = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>('[data-chat-input]')!;
      box.value = '今日は晴れ';
      box.setSelectionRange(3, 5);

      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLButtonElement>('[data-testid="chat-toolbar-bold"]')!
        .click();

      expect(box.value).toBe('今日は**晴れ**');
      expect([box.selectionStart, box.selectionEnd]).toEqual([5, 7]);
      expect(component.text).toBe('今日は**晴れ**');
    });

    it('sends the one picked under the words in the box, as the send button sends them, and clears the box', async () => {
      fixture.componentRef.setInput('canSpeak', true);
      fixture.detectChanges();
      component.text = 'いくぞ！';
      const outgoing = sent();

      component.sendStamp('roll:critical');

      expect(component.text).toBe('');
      expect(await outgoing).toEqual(
        expect.objectContaining({
          text: 'いくぞ！',
          gameSystem,
          stamp: { id: 'roll:critical', words: expect.any(String) },
        })
      );
      expect(DiceBot.gameSystemForLineAsync).toHaveBeenCalledWith(component.gameType, 'いくぞ！');
    });

    it('offers no stamps where the room does not let them be sent, and sends none it denies', () => {
      fixture.componentRef.setInput('canSpeak', true);
      const config = Config.instance;
      config.stampRules = withStampsAllowed(OPEN_STAMP_RULES, 'line', ['roll:critical'], false);
      try {
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('[data-testid="chat-input-stamp"]')).not.toBeNull();
        const emitted = vi.fn();
        component.chat.subscribe(emitted);
        component.text = 'いくぞ！';

        component.sendStamp('roll:critical');
        expect(emitted).not.toHaveBeenCalled();
        expect(component.text).toBe('いくぞ！');

        config.stampRules = withStampUseOn(OPEN_STAMP_RULES, 'line', false);
        TestBed.inject(ObjectChangeService).notifyChanged('Config');
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('[data-testid="chat-input-stamp"]')).toBeNull();
      } finally {
        config.stampRules = OPEN_STAMP_RULES;
      }
    });

    it('sends no stamp from a seat that may not speak', () => {
      fixture.componentRef.setInput('canSpeak', false);
      fixture.detectChanges();
      component.text = 'いくぞ！';
      const emitted = vi.fn();
      component.chat.subscribe(emitted);

      component.sendStamp('roll:critical');

      expect(emitted).not.toHaveBeenCalled();
      expect(component.text).toBe('いくぞ！');
    });

    it('sends no stamp this version does not know', () => {
      fixture.componentRef.setInput('canSpeak', true);
      const emitted = vi.fn();
      component.chat.subscribe(emitted);

      component.sendStamp('sfx:from-a-newer-version');

      expect(emitted).not.toHaveBeenCalled();
    });

    it('sends on enter alone and never on another key or mid-composition', async () => {
      fixture.detectChanges();
      component.text = 'hello';
      const emitted = vi.fn();
      component.chat.subscribe(emitted);

      component.sendChat(new KeyboardEvent('keydown', { key: 'a' }));
      component.sendChat(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }));
      await Promise.resolve();
      expect(emitted).not.toHaveBeenCalled();
      expect(component.text).toBe('hello');

      component.sendChat(new KeyboardEvent('keydown', { key: 'Enter' }));
      await vi.waitFor(() => expect(emitted).toHaveBeenCalledTimes(1));
    });

    it('sends nothing while empty or while the speaker may not speak', async () => {
      fixture.componentRef.setInput('canSpeak', false);
      fixture.detectChanges();
      component.text = 'hello';
      const emitted = vi.fn();
      component.chat.subscribe(emitted);

      component.sendChat(null);
      fixture.componentRef.setInput('canSpeak', true);
      component.text = '';
      component.sendChat(null);
      await Promise.resolve();

      expect(emitted).not.toHaveBeenCalled();
    });

    it('hands enter to the completion list while one of its rows is chosen', async () => {
      fixture.componentRef.setInput('autoCompleteIndex', 3);
      fixture.detectChanges();
      component.text = 'hel';
      const emitted = vi.fn();
      const completed = vi.fn();
      component.chat.subscribe(emitted);
      component.autoCompleteDo.subscribe(completed);

      component.sendChat(null);
      await Promise.resolve();

      expect(completed).toHaveBeenCalledWith(3);
      expect(emitted).not.toHaveBeenCalled();
      expect(component.text).toBe('hel');
    });
  });
});
