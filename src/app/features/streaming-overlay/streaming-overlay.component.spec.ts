import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatClockService } from '@axe/application/chat/chat-clock.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { StreamingOverlayComponent } from '@axe/features/streaming-overlay/streaming-overlay.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

interface FakeMessage {
  identifier: string;
  name: string;
  text: string;
  timestamp: number;
  index: number;
  messColor: string;
  isDicebot: boolean;
  isDirect: boolean;
  isSecret: boolean;
  isDisplayable: boolean;
}

function message(overrides: Partial<FakeMessage> = {}): FakeMessage {
  return {
    identifier: 'm1',
    name: 'アリス',
    text: 'こんばんは',
    timestamp: 1000,
    index: 1000,
    messColor: '',
    isDicebot: false,
    isDirect: false,
    isSecret: false,
    isDisplayable: true,
    ...overrides,
  };
}

function tab(name: string, messages: FakeMessage[], overrides: Record<string, unknown> = {}) {
  return {
    identifier: name,
    name,
    isSystemTab: false,
    plCanView: true,
    plCanSpeak: true,
    guestCanView: true,
    guestCanSpeak: false,
    chatMessages: messages,
    ...overrides,
  };
}

describe('StreamingOverlayComponent', () => {
  let fixture: ComponentFixture<StreamingOverlayComponent>;
  let chatTabs: unknown[];
  let role: PeerRole;
  let turn: { phase: string; round: number; currentIdentifier: string };
  let objectChange: ObjectChangeService;

  function lines(): string[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="overlay-line"]')].map(
      (element) => element.textContent?.trim() ?? ''
    );
  }

  async function setup(): Promise<void> {
    PeerCursor.myCursor = { identifier: 'viewer-cursor', userId: 'viewer', role } as PeerCursor;

    // The chat service comes last among the shared providers, so it is replaced through the override.
    TestBed.configureTestingModule({
      imports: [StreamingOverlayComponent],
      providers: [...TEST_PROVIDERS, { provide: TurnOrderService, useValue: turn }],
    });
    TestBed.overrideProvider(ChatMessageService, { useValue: { chatTabs } });
    TestBed.overrideProvider(ChatClockService, { useValue: { now: () => 2000 } });
    await TestBed.compileComponents();

    objectChange = TestBed.inject(ObjectChangeService);
    fixture = TestBed.createComponent(StreamingOverlayComponent);
    fixture.detectChanges();
  }

  beforeEach(() => {
    role = PeerRole.Guest;
    turn = { phase: 'idle', round: 0, currentIdentifier: '' };
    chatTabs = [tab('メイン', [message({ identifier: 'a', text: 'やあ' })])];
  });

  afterEach(() => {
    PeerCursor.myCursor = null as unknown as PeerCursor;
  });

  it('shows the recent exchanges', async () => {
    await setup();

    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toContain('やあ');
    expect(lines()[0]).toContain('アリス');
  });

  it('draws a line with its ruby and the chat’s decorations, not their marks', async () => {
    chatTabs = [tab('メイン', [message({ identifier: 'a', text: '**大成功**だ|竜《ドラゴン》' })])];
    await setup();

    const line = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="overlay-line"]')!;
    expect(line.querySelector('.chat-deco-bold')?.textContent).toBe('大成功');
    expect(line.querySelector('ruby rt')?.textContent).toBe('ドラゴン');
    expect(lines()[0]).not.toContain('**');
  });

  it('leaves out a tab a spectator cannot see', async () => {
    chatTabs = [
      tab('メイン', [message({ identifier: 'a', text: '見える' })]),
      tab('GM 用', [message({ identifier: 'b', text: '見えない' })], { guestCanView: false }),
    ];
    await setup();

    expect(lines().join()).toContain('見える');
    expect(lines().join()).not.toContain('見えない');
  });

  it('keeps the notices of the system tab off the stream', async () => {
    chatTabs = [tab('システム', [message({ identifier: 'a', text: '退室しました' })], { isSystemTab: true })];
    await setup();

    expect(lines()).toEqual([]);
  });

  it('keeps a private line off it', async () => {
    chatTabs = [tab('メイン', [message({ identifier: 'a', text: 'ないしょ', isDirect: true })])];
    await setup();

    expect(lines()).toEqual([]);
  });

  it('shows no turn while nobody has one', async () => {
    await setup();

    expect(fixture.nativeElement.querySelector('[data-testid="overlay-turn"]')).toBeNull();
  });

  it('shows the round once somebody does', async () => {
    turn = { phase: 'roundStart', round: 3, currentIdentifier: '' };
    await setup();

    expect(fixture.nativeElement.querySelector('[data-testid="overlay-turn"]')?.textContent).toContain('3');
  });

  it('shows a line that arrives later', async () => {
    const messages = [message({ identifier: 'a', text: 'やあ' })];
    chatTabs = [tab('メイン', messages)];
    await setup();
    expect(lines()).toHaveLength(1);

    messages.push(message({ identifier: 'b', text: 'こんばんは', timestamp: 1500, index: 1500 }));
    objectChange.notifyChanged('メイン');
    fixture.detectChanges();

    expect(lines().join()).toContain('こんばんは');
  });

  it('keeps a hidden roll off the stream', async () => {
    chatTabs = [tab('メイン', [message({ identifier: 'a', text: '＜秘密＞ 1D100 → 3', isSecret: true })])];
    await setup();

    expect(lines()).toEqual([]);
  });

  it('does not show an untranslated key as it stands', async () => {
    chatTabs = [tab('メイン', [message({ identifier: 'a', name: '@i18n:common.chat.systemName:{}', text: '開始' })])];
    await setup();

    expect(lines()[0]).not.toContain('@i18n:');
  });
});
