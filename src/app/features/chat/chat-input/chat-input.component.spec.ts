import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TabletopDisplayService } from '@axe/application/tabletop/tabletop-display.service';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { ChatInputComponent } from '@axe/features/chat/chat-input/chat-input.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

type Outgoing = Parameters<Parameters<ChatInputComponent['chat']['subscribe']>[0]>[0];

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
    vi.spyOn(DiceBot, 'loadGameSystemAsync').mockResolvedValue(gameSystem);
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
