import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { ChatSearchBarComponent } from '@axe/features/chat/chat-search/chat-search-bar.component';
import { CHAT_SEARCH_CURRENT_ATTRIBUTE } from '@axe/features/chat/chat-search/chat-search-marks';
import { beMyself } from '@axe/testing/peer-context-stub';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ChatSearchBarComponent', () => {
  let fixture: ComponentFixture<ChatSearchBarComponent>;
  let component: ChatSearchBarComponent;
  let tab: ChatTab;
  let log: HTMLElement;
  let reveal: ReturnType<typeof vi.fn<(message: ChatMessage) => Promise<HTMLElement | null>>>;

  const root = () => fixture.nativeElement as HTMLElement;
  const box = () => root().querySelector<HTMLInputElement>('[data-testid="chat-search-input"]')!;
  const count = () => root().querySelector('[data-testid="chat-search-count"]')?.textContent?.trim() ?? '';
  const revealed = () => reveal.mock.calls.at(-1)?.[0];

  function say(text: string, extra: Record<string, string> = {}): ChatMessage {
    return tab.addMessage({ from: 'someone', name: '語り手', text, timestamp: tab.chatMessages.length + 1, ...extra });
  }

  async function type(text: string): Promise<void> {
    box().value = text;
    box().dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function press(key: string, init: KeyboardEventInit = {}): Promise<KeyboardEvent> {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    box().dispatchEvent(event);
    await fixture.whenStable();
    return event;
  }

  async function open(role: PeerRole = PeerRole.Player): Promise<void> {
    TestBed.configureTestingModule({ imports: [ChatSearchBarComponent], providers: [...TEST_PROVIDERS] });
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = role;
    fixture = TestBed.createComponent(ChatSearchBarComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('tab', tab);
    fixture.componentRef.setInput('log', log);
    fixture.componentRef.setInput('reveal', reveal);
    await fixture.whenStable();
  }

  beforeEach(() => {
    beMyself('reader');
    tab = new ChatTab();
    tab.initialize();
    log = document.createElement('div');
    document.body.appendChild(log);
    reveal = vi.fn(async () => null);
  });

  afterEach(() => {
    fixture?.destroy();
    tab.destroy();
    log.remove();
  });

  it('finds every line holding what is typed and goes to the newest of them', async () => {
    say('ゴブリンが現れた');
    say('何もない');
    const newest = say('ゴブリンを倒した');
    await open();
    const t = TestBed.inject(TRANSLATE_FN);

    await type('ゴブリン');

    expect(component.hits()).toHaveLength(2);
    expect(revealed()).toBe(newest);
    expect(count()).toBe(t('feature.chat.search.count', { current: 2, total: 2 }));
  });

  it('goes to an earlier line on Enter and a later one on Shift+Enter, round at either end', async () => {
    const first = say('松明');
    const second = say('松明');
    const third = say('松明');
    await open();
    await type('松明');

    expect((await press('Enter')).defaultPrevented).toBe(true);
    expect(revealed()).toBe(second);
    await press('Enter');
    expect(revealed()).toBe(first);
    await press('Enter');
    expect(revealed()).toBe(third);
    await press('Enter', { shiftKey: true });
    expect(revealed()).toBe(first);
    expect(component.position()).toBe(0);
  });

  it('moves with its arrow buttons as with Enter and Shift+Enter', async () => {
    const first = say('松明');
    const second = say('松明');
    await open();
    await type('松明');

    root().querySelector<HTMLButtonElement>('[data-testid="chat-search-older"]')!.click();
    await fixture.whenStable();
    expect(revealed()).toBe(first);
    root().querySelector<HTMLButtonElement>('[data-testid="chat-search-newer"]')!.click();
    await fixture.whenStable();
    expect(revealed()).toBe(second);
  });

  it('says so when nothing holds what is typed, and offers no way to move', async () => {
    say('何もない');
    await open();
    const t = TestBed.inject(TRANSLATE_FN);

    await type('ドラゴン');

    expect(count()).toBe(t('feature.chat.search.none'));
    expect(root().querySelector<HTMLButtonElement>('[data-testid="chat-search-older"]')!.disabled).toBe(true);
    expect(reveal).not.toHaveBeenCalled();
  });

  it('stays on the line it stands on as new lines come, counting them', async () => {
    say('松明');
    const second = say('松明');
    await open();
    await type('松明');
    await press('Enter');
    const standing = revealed();

    say('松明をもう一本');
    await fixture.whenStable();

    expect(component.hits()).toHaveLength(3);
    expect(component.hits()[component.position()]).toBe(standing);
    expect(standing).not.toBe(second);
  });

  it('cannot find the words of somebody else’s secret roll, which the game master can', async () => {
    say('隠しダイス → 6', { tag: 'secret' });
    await open(PeerRole.Player);
    await type('隠しダイス');
    expect(component.hits()).toHaveLength(0);

    fixture.destroy();
    TestBed.resetTestingModule();
    await open(PeerRole.GameMaster);
    await type('隠しダイス');
    expect(component.hits()).toHaveLength(1);
  });

  it('asks to close on Escape', async () => {
    await open();
    const closed = vi.fn();
    component.closed.subscribe(closed);

    await press('Escape');

    expect(closed).toHaveBeenCalled();
  });

  it('picks out the line it lands on, and lets go of it once closed', async () => {
    const line = say('松明');
    const drawn = document.createElement('chat-message');
    drawn.dataset['messageId'] = line.identifier;
    log.appendChild(drawn);
    await open();

    await type('松明');
    await Promise.resolve();
    expect(drawn.hasAttribute(CHAT_SEARCH_CURRENT_ATTRIBUTE)).toBe(true);

    fixture.destroy();
    expect(drawn.hasAttribute(CHAT_SEARCH_CURRENT_ATTRIBUTE)).toBe(false);
  });
});
