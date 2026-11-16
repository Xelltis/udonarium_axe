import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage, ChatMessageTargetContext } from '@axe/domain/chat/chat-message';
import { ChatOutgoing } from '@axe/domain/chat/chat-outgoing';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TurnState } from '@axe/domain/tabletop/turn-state';
import { ChatSendService } from '@axe/features/chat/chat-send.service';
import { ChatTickerSelectionService } from '@axe/features/chat/chat-ticker-selection.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ChatSendService', () => {
  let service: ChatSendService;
  let tab: ChatTab;
  let sendMessage: ReturnType<typeof vi.spyOn>;
  let sendStamp: ReturnType<typeof vi.spyOn>;
  let showOnTicker: ReturnType<typeof vi.spyOn>;
  const made: GameCharacter[] = [];

  function piece(name: string, palette = ''): GameCharacter {
    const character = GameCharacter.create(name, 1, '');
    character.chatPalette?.setPalette(palette);
    made.push(character);
    return character;
  }

  function marked(name: string): GameCharacter {
    const character = piece(name);
    character.targeted = true;
    return character;
  }

  function line(overrides: Partial<ChatOutgoing> = {}): ChatOutgoing {
    return {
      text: 'こんにちは',
      gameSystem: null,
      sendFrom: PeerCursor.myCursor.identifier,
      sendTo: '',
      portraitIndex: 0,
      messColor: '#112233',
      replyTo: '',
      quoteOf: '',
      toTicker: false,
      ...overrides,
    };
  }

  /** What went to the chat for the line last sent: its words, and what it was worked out against. */
  function sent(): { text: string; contexts: ChatMessageTargetContext[] } {
    const args = sendMessage.mock.calls.at(-1)!;
    return { text: args[1] as string, contexts: args[7] as ChatMessageTargetContext[] };
  }

  beforeEach(() => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(ChatSendService);
    const chat = TestBed.inject(ChatMessageService);
    sendMessage = vi.spyOn(chat, 'sendMessage').mockReturnValue({ identifier: 'sent-line' } as ChatMessage);
    sendStamp = vi.spyOn(chat, 'sendStamp').mockReturnValue(undefined as never);
    showOnTicker = vi
      .spyOn(TestBed.inject(ChatTickerSelectionService), 'showMessage')
      .mockImplementation(() => undefined);
    tab = new ChatTab();
    tab.initialize();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const character of made.splice(0)) character.destroy();
    tab.destroy();
  });

  it('sends a line aimed at nobody as it is, worked out against the speaker alone', () => {
    marked('相手A');

    service.send(tab, line({ text: 'こんにちは' }));

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0]).toBe(tab);
    expect(sent()).toEqual({ text: 'こんにちは', contexts: [{ text: 'こんにちは', object: null }] });
  });

  it('fills in what the line refers to from the piece spoken as', () => {
    const speaker = piece('術者', '//威力=7');

    service.send(tab, line({ text: '2d6+{威力} 攻撃', sendFrom: speaker.identifier }));

    expect(sent().text).toBe('2d6+7 攻撃');
  });

  it('hands on who the line is from and to, its colours, and what it answers and quotes', () => {
    service.send(
      tab,
      line({
        sendTo: 'somebody',
        portraitIndex: 2,
        messColor: '#abcdef',
        messBubbleLight: '#ffffff',
        replyTo: 'answered',
        quoteOf: 'quoted',
        targetNumber: 13,
      })
    );

    const args = sendMessage.mock.calls[0];
    expect(args.slice(3, 7)).toEqual([PeerCursor.myCursor.identifier, 'somebody', 2, '#abcdef']);
    expect(args.slice(9, 12)).toEqual(['answered', 'quoted', { light: '#ffffff', dark: '' }]);
    expect(args[14]).toBe(13);
  });

  it('sends a line aimed at the marked pieces once for each of them on the table', () => {
    marked('相手A');
    marked('相手B');
    piece('見ているだけ');
    const away = marked('墓地の相手');
    away.setLocation('graveyard');

    service.send(tab, line({ text: '攻撃 t:HP-5' }));

    expect(sent().text).toBe('攻撃 t:HP-5 [相手A]\n攻撃 t:HP-5 [相手B]');
    expect(sent().contexts.map((context) => context.object?.name)).toEqual(['相手A', '相手B']);
  });

  it('says there is nobody to aim at where a line is aimed and nothing is marked', () => {
    piece('見ているだけ');

    service.send(tab, line({ text: '攻撃 t:HP-5' }));

    expect(sent()).toEqual({ text: TestBed.inject(TRANSLATE_FN)('feature.chat.window.noTarget'), contexts: [] });
  });

  it('sends nothing for a reader who may not speak in the tab', () => {
    PeerCursor.myCursor.role = PeerRole.Player;
    tab.plCanSpeak = false;

    service.send(tab, line({ toTicker: true }));

    expect(sendMessage).not.toHaveBeenCalled();
    expect(sendStamp).not.toHaveBeenCalled();
    expect(showOnTicker).not.toHaveBeenCalled();
  });

  it('sends nothing without a tab to send to', () => {
    service.send(null, line({ toTicker: true }));

    expect(sendMessage).not.toHaveBeenCalled();
    expect(showOnTicker).not.toHaveBeenCalled();
  });

  it('shows the line on the ticker as well only where it is marked for it', () => {
    service.send(tab, line());
    expect(showOnTicker).not.toHaveBeenCalled();

    service.send(tab, line({ toTicker: true }));

    expect(showOnTicker).toHaveBeenCalledTimes(1);
    expect(showOnTicker).toHaveBeenCalledWith('sent-line');
  });

  it('sends a stamp with nothing said as a line of its own, and one with words under them', () => {
    const stamp = { id: 'roll:critical', words: 'クリティカル' };

    service.send(tab, line({ text: '', stamp }));
    expect(sendStamp).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalled();

    service.send(tab, line({ text: 'やった', stamp }));

    expect(sendStamp).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][13]).toEqual(stamp);
  });

  describe('a line that opens with a round command', () => {
    const rounds: number[] = [];

    beforeEach(() => {
      rounds.length = 0;
      TestBed.inject(TurnOrderService).reset();
      TurnState.instance.history = '[]';
      sendMessage.mockImplementation(() => {
        rounds.push(TurnState.instance.round);
        return { identifier: `sent-line-${rounds.length}` } as ChatMessage;
      });
    });

    afterEach(() => {
      TestBed.inject(TurnOrderService).reset();
      TurnState.instance.history = '[]';
    });

    it('says the command, moves the round, and then says the rest as a line of its own', () => {
      const speaker = piece('術者', '//威力=7');

      service.send(tab, line({ text: '&RS 2d6+{威力} 攻撃', sendFrom: speaker.identifier }));

      expect(sendMessage.mock.calls.map((call: unknown[]) => call[1])).toEqual(['&RS', '2d6+7 攻撃']);
      expect(rounds).toEqual([0, 1]);
      expect(sendMessage.mock.calls[1][7]).toEqual([{ text: '2d6+7 攻撃', object: null }]);
    });

    it('aims the rest at the marked pieces, and the command at nobody', () => {
      marked('相手A');
      marked('相手B');

      service.send(tab, line({ text: '&RS 攻撃 t:HP-5' }));

      expect(sendMessage.mock.calls.map((call: unknown[]) => call[1])).toEqual([
        '&RS',
        '攻撃 t:HP-5 [相手A]\n攻撃 t:HP-5 [相手B]',
      ]);
    });

    it('keeps the stamp, what is answered and quoted, and the ticker for the last line said', () => {
      const stamp = { id: 'roll:critical', words: 'クリティカル' };

      service.send(tab, line({ text: '&RS 始めます', stamp, replyTo: 'answered', quoteOf: 'quoted', toTicker: true }));

      const [command, rest] = sendMessage.mock.calls;
      expect([command[9], command[10], command[13]]).toEqual(['', '', undefined]);
      expect([rest[9], rest[10], rest[13]]).toEqual(['answered', 'quoted', stamp]);
      expect(showOnTicker).toHaveBeenCalledTimes(1);
      expect(showOnTicker).toHaveBeenCalledWith('sent-line-2');
    });

    it('carries them on the command where nothing follows it', () => {
      service.send(tab, line({ text: '&RS', replyTo: 'answered', toTicker: true }));

      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(sendMessage.mock.calls[0][9]).toBe('answered');
      expect(showOnTicker).toHaveBeenCalledWith('sent-line-1');
    });

    it('reads no command in the middle of a line', () => {
      service.send(tab, line({ text: '始めます &RS' }));

      expect(sendMessage.mock.calls.map((call: unknown[]) => call[1])).toEqual(['始めます &RS']);
      expect(TurnState.instance.round).toBe(0);
    });
  });
});
