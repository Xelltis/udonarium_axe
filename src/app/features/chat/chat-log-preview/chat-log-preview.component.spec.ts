import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CHAT_LOG_STYLE_STORAGE_KEY } from '@axe/application/chat/chat-log-style-preference.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import {
  CHAT_LOG_PREVIEW_LIMIT,
  ChatLogPreviewComponent,
} from '@axe/features/chat/chat-log-preview/chat-log-preview.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ChatLogPreviewComponent', () => {
  let fixture: ComponentFixture<ChatLogPreviewComponent>;
  let component: ChatLogPreviewComponent;
  let saveData: SaveDataService;
  const tabs: ChatTab[] = [];

  function addTab(name: string, lines: number): ChatTab {
    const tab = ChatTabList.instance.addChatTab(name);
    for (let i = 0; i < lines; i++) {
      tab.addMessage({
        from: 'someone',
        name: '誰か',
        text: `line-${String(i).padStart(3, '0')}`,
        timestamp: 1000 + i,
      });
    }
    tabs.push(tab);
    return tab;
  }

  async function shown(): Promise<string> {
    fixture.detectChanges();
    await vi.waitFor(() => expect(component.html()).not.toBe(''));
    return component.html();
  }

  beforeEach(() => {
    localStorage.removeItem(CHAT_LOG_STYLE_STORAGE_KEY);
    TestBed.configureTestingModule({ imports: [ChatLogPreviewComponent], providers: [...TEST_PROVIDERS] });
    saveData = TestBed.inject(SaveDataService);
    vi.spyOn(saveData, 'prepareChatLogImages').mockResolvedValue({ resolver: () => '', registryScript: '' });
    fixture = TestBed.createComponent(ChatLogPreviewComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    for (const tab of tabs.splice(0)) tab.destroy();
    localStorage.removeItem(CHAT_LOG_STYLE_STORAGE_KEY);
    vi.restoreAllMocks();
  });

  it('shows the tab in the style picked, and keeps the choice', async () => {
    component.tab.set(addTab('メイン', 3));
    component.choose('neon');

    const html = await shown();

    expect(html).toContain('data-style="neon"');
    expect(html).toContain('line-002');
    expect(component.style()).toBe('neon');
    expect(localStorage.getItem(CHAT_LOG_STYLE_STORAGE_KEY)).toBe('neon');
  });

  it('follows another pick without loading the tab again', async () => {
    component.tab.set(addTab('メイン', 1));
    await shown();

    component.choose('washi');

    expect(component.html()).toContain('data-style="washi"');
    expect(saveData.prepareChatLogImages).toHaveBeenCalledOnce();
  });

  it('keeps to the latest lines of a long tab and says so', async () => {
    component.tab.set(addTab('メイン', CHAT_LOG_PREVIEW_LIMIT + 10));
    component.choose('messenger');

    const html = await shown();

    expect(html).not.toContain('line-009');
    expect(html).toContain('line-010');
    expect(html).toContain(`line-0${CHAT_LOG_PREVIEW_LIMIT + 9}`);
    expect(component.note()).not.toBe('');
  });

  it('shows a sample conversation for a tab that holds nothing', async () => {
    component.tab.set(addTab('空', 0));
    component.choose('parchment');

    const html = await shown();

    expect(html).toContain('<article');
    expect(html).toContain('class="msg roll crit"');
    expect(component.note()).not.toBe('');
  });

  it('shows every tab together when asked to', async () => {
    addTab('一つ目', 1);
    component.tab.set(addTab('二つ目', 1));
    component.choose('neon');
    component.chooseScope('all');

    const html = await shown();

    expect(html).toContain('class="tabs"');
    expect(html).toContain('<span class="tg">一つ目</span>');
  });

  it('saves the whole tab in the style on show', async () => {
    const tab = addTab('メイン', CHAT_LOG_PREVIEW_LIMIT + 10);
    component.tab.set(tab);
    component.choose('eerie');
    const spy = vi.spyOn(saveData, 'saveChatLog').mockResolvedValue(undefined);

    await component.save();

    expect(spy).toHaveBeenCalledWith('eerie', 'tab', [tab], 'メイン');
  });

  it('saves every tab when they are all on show', async () => {
    component.tab.set(addTab('メイン', 1));
    component.chooseScope('all');
    const spy = vi.spyOn(saveData, 'saveChatLog').mockResolvedValue(undefined);

    await component.save();

    expect(spy.mock.calls[0][1]).toBe('all');
    expect(spy.mock.calls[0][2]).toEqual(TestBed.inject(ChatMessageService).chatTabs);
  });

  it('keeps to the one tab while the system tab is on show', () => {
    const systemTab = ChatTabList.instance.ensureSystemTab();
    tabs.push(systemTab);
    component.tab.set(systemTab);
    component.chooseScope('all');

    expect(component.effectiveScope()).toBe('tab');
  });
});
