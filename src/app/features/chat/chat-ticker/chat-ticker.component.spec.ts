import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  CHAT_TICKER_SELECTION_EVENT_NAME,
  ChatTickerSelectionService,
} from '@axe/application/chat/chat-ticker-selection.service';
import { localDispatch } from '@axe/core/network/network-messaging';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { ChatTickerComponent } from '@axe/features/chat/chat-ticker/chat-ticker.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ChatTickerComponent', () => {
  let fixture: ComponentFixture<ChatTickerComponent>;
  let component: ChatTickerComponent;
  const messages: ChatMessage[] = [];
  let table: GameTable;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [ChatTickerComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();

    table = new GameTable();
    table.initialize();
    TableSelecter.instance.viewTableIdentifier = table.identifier;
    fixture = TestBed.createComponent(ChatTickerComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    for (const message of messages.splice(0)) message.destroy();
    table.destroy();
  });

  /** The table is read through a version signal, which only counts once the change has gone round. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  function select(identifier: string, name: string, text: string): ChatMessage {
    const message = new ChatMessage(identifier);
    message.initialize();
    message.name = name;
    message.text = text;
    messages.push(message);
    localDispatch(CHAT_TICKER_SELECTION_EVENT_NAME, { messageIdentifier: message.identifier });
    return message;
  }

  function currentText(): string {
    const internal = component as unknown as { currentText: () => string };
    return internal.currentText();
  }

  it('replaces the ticker immediately on every line sent to it', () => {
    select('ticker-first', '案内役', '最初の案内');
    expect(currentText()).toBe('案内役：最初の案内　◆');

    select('ticker-second', '案内役', '次の案内');
    expect(currentText()).toBe('案内役：次の案内　◆');
  });

  it('temporarily replaces the ticker with any selected public message', () => {
    // Instantiates the listener before dispatching the room event.
    expect(TestBed.inject(ChatTickerSelectionService)).toBeTruthy();

    select('manual-first', '騎士', '北門を守る');
    expect(currentText()).toBe('騎士：北門を守る　◆');

    const internal = component as unknown as { cycleStartedAt: number | null };
    internal.cycleStartedAt = 123;
    select('manual-second', '魔術師', '詠唱を開始');
    expect(currentText()).toBe('魔術師：詠唱を開始　◆');
    expect(internal.cycleStartedAt).toBeNull();
  });

  it('lets the next line sent to it take over the one before', () => {
    select('manual-before-post', '斥候', '橋を確認中');
    expect(currentText()).toContain('橋を確認中');

    select('ticker-after-manual', '案内役', 'ラウンド開始');
    expect(currentText()).toBe('案内役：ラウンド開始　◆');
  });

  it('shows nothing until this screen is running a ticker, and then at the speed it asked for', async () => {
    table.mode2d = true;
    table.multiAngleTickerEnabled = false;
    table.multiAngleTickerPixelsPerSecond = 88;
    await settle();

    select('while-hidden', 'GM', '待機してください');
    expect(currentText()).toBe('GM：待機してください　◆');
    expect(component.isVisible()).toBe(false);

    table.multiAngleTickerEnabled = true;
    await settle();

    expect(component.isVisible()).toBe(true);
    const internal = component as unknown as { pixelsPerSecond: () => number };
    expect(internal.pixelsPerSecond()).toBe(88);
  });

  it('draws larger text when the table asks for a larger font scale', async () => {
    const internal = component as unknown as { fontSizePx: () => number };
    table.multiAngleFontScale = 'small';
    await settle();
    const small = internal.fontSizePx();
    expect(small).toBe(18);

    table.multiAngleFontScale = 'large';
    await settle();
    expect(internal.fontSizePx()).toBeGreaterThan(small);
  });
});
