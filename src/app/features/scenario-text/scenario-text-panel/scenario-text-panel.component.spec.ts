import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { ScenarioText } from '@axe/domain/scenario-text/scenario-text';
import { ScenarioTextPanelComponent } from '@axe/features/scenario-text/scenario-text-panel/scenario-text-panel.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ScenarioTextPanelComponent', () => {
  let fixture: ComponentFixture<ScenarioTextPanelComponent>;
  let main: ChatTab;

  function open(role: PeerRole): HTMLElement {
    PeerCursor.myCursor.role = role;
    fixture = TestBed.createComponent(ScenarioTextPanelComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  async function redraw(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const titles = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('[data-testid="scenario-text-row"]')).map((row) =>
      row.getAttribute('data-text-title')
    );

  function textOf(title: string, words: string, order = 0): ScenarioText {
    const text = new ScenarioText();
    text.title = title;
    text.text = words;
    text.order = order;
    text.initialize();
    return text;
  }

  beforeEach(() => {
    localStorage.clear();
    PeerCursor.createMyCursor();
    TestBed.configureTestingModule({ imports: [ScenarioTextPanelComponent], providers: [...TEST_PROVIDERS] });
    main = new ChatTab();
    main.name = 'メイン';
    main.initialize();
    ChatTabList.instance.addChatTab(main);
  });

  afterEach(() => {
    fixture?.destroy();
    PeerCursor.myCursor = null!;
    vi.useRealTimers();
  });

  it('tells a player that the texts are the game master’s, and shows them none', () => {
    textOf('真相', '犯人は執事');

    const root = open(PeerRole.Player);

    expect(root.textContent).toContain('シナリオテキストはGMだけが使えます');
    expect(root.textContent).not.toContain('犯人は執事');
  });

  it('says a text in the chat from the button on its row, and marks it as said', async () => {
    textOf('導入', '**雨**が降っている');
    const root = open(PeerRole.GameMaster);

    root.querySelector<HTMLButtonElement>('[data-testid="scenario-text-row-send"]')!.click();
    await redraw();

    const said = main.children.at(-1) as unknown as { name: string; text: string };
    expect([said.name, said.text]).toEqual(['導入', '**雨**が降っている']);
    expect(root.querySelector('[data-testid="scenario-text-sent"]')).not.toBeNull();
  });

  it('writes a new text, sharing the words a moment after the last key', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const root = open(PeerRole.GameMaster);

    root.querySelector<HTMLButtonElement>('[data-testid="scenario-text-create"]')!.click();
    await redraw();
    const box = root.querySelector<HTMLTextAreaElement>('[data-testid="scenario-text-editor"] textarea')!;
    box.value = '扉の向こうに';
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const [text] = ScenarioText.all();
    expect(text.title).toBe('テキスト1');
    expect(text.text).toBe('');
    vi.advanceTimersByTime(400);
    expect(text.text).toBe('扉の向こうに');
  });

  it('finds the texts whose title or words hold what is searched for', async () => {
    textOf('導入', '雨が降っている', 1);
    textOf('真相', '犯人は執事', 2);
    const root = open(PeerRole.GameMaster);

    const search = root.querySelector<HTMLInputElement>('[data-testid="scenario-text-search"]')!;
    search.value = '執事';
    search.dispatchEvent(new Event('input'));
    await redraw();

    expect(titles(root)).toEqual(['真相']);
  });
});
