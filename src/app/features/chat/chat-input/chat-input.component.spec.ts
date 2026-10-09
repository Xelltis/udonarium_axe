import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TabletopDisplayService } from '@axe/application/tabletop/tabletop-display.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage } from '@axe/domain/chat/chat-message';
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

    const slider = () =>
      fixture.nativeElement.querySelector(
        '[data-testid="chat-input-portraits"] input[type="range"]'
      ) as HTMLInputElement | null;

    async function speakAs(character: GameCharacter): Promise<void> {
      component.sendFrom = character.identifier;
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('runs through the portraits of a speaker with several, beside the colours', async () => {
      await speakAs(withPortraits(3));

      expect(slider()?.max).toBe('2');
      expect(slider()?.closest('[data-testid="chat-input-colors"]')).not.toBeNull();
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

  describe('packed down for a panel', () => {
    function find(selector: string): Element | null {
      return (fixture.nativeElement as HTMLElement).querySelector(selector);
    }

    function textBox(): HTMLTextAreaElement {
      return find('textarea[name="chat-input-text"]') as HTMLTextAreaElement;
    }

    it('shows the colours with the dice bot, and no button to fold them, by default', () => {
      fixture.detectChanges();

      expect(find('ng-select[name="game-type"]')).not.toBeNull();
      expect(find('[data-testid="chat-input-colors"]')).not.toBeNull();
      expect(find('[data-testid="chat-input-tools"]')).toBeNull();
    });

    it('folds the colours behind a button, keeping the dice bot in view', () => {
      fixture.componentRef.setInput('dense', true);
      fixture.detectChanges();

      expect(find('ng-select[name="game-type"]')).not.toBeNull();
      expect(find('[data-testid="chat-input-colors"]')).toBeNull();

      (find('[data-testid="chat-input-tools"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(find('[data-testid="chat-input-colors"]')).not.toBeNull();
    });

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
    const button = () =>
      fixture.nativeElement.querySelector('[data-testid="chat-my-dice"]') as HTMLButtonElement | null;
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
      await fixture.whenStable();
      expect(button()).not.toBeNull();
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
      const box = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>('textarea.chat-input')!;
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

    it('offers the ticker only where this screen runs one, and marks the line when it is asked to', async () => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="chat-send-to-ticker"]')).toBeNull();

      TestBed.inject(TabletopDisplayService).set({ multiAngleTickerEnabled: true });
      fixture.detectChanges();
      // The room runs one, but this seat is in perspective and has no band of its own.
      expect(fixture.nativeElement.querySelector('[data-testid="chat-send-to-ticker"]')).toBeNull();

      TestBed.inject(ViewModePreferenceService).choose('flat');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="chat-send-to-ticker"]')).toBeTruthy();

      component.toggleTickerSend();
      component.text = 'ラウンド開始';
      const outgoing = sent();

      component.sendChat(null);

      expect((await outgoing).toTicker).toBe(true);
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

    it('opens the stamps beside the send button, and sends the one picked as a line, leaving the box alone', async () => {
      fixture.componentRef.setInput('canSpeak', true);
      fixture.detectChanges();
      component.text = '書きかけ';
      const toggle = vi.spyOn(TestBed.inject(StampPickerService), 'toggle').mockImplementation(() => undefined);
      const emitted: Outgoing[] = [];
      component.chat.subscribe((value) => emitted.push(value));

      const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '[data-testid="chat-input-stamp"]'
      )!;
      button.click();
      expect(toggle).toHaveBeenCalledWith(button, expect.any(Function));
      toggle.mock.calls[0][1]('seal:ok');

      expect(emitted).toEqual([
        expect.objectContaining({ stamp: 'seal:ok', gameSystem: null, replyTo: '', toTicker: false }),
      ]);
      expect(emitted[0].text.length).toBeGreaterThan(0);
      expect(component.text).toBe('書きかけ');
    });

    it('sends no stamp this version does not know', () => {
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
