import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatBookmarkService } from '@axe/application/chat/chat-bookmark.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { ChatBookmarkListComponent } from '@axe/features/chat/chat-bookmark/chat-bookmark-list.component';
import { beMyself } from '@axe/testing/peer-context-stub';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ChatBookmarkListComponent', () => {
  let fixture: ComponentFixture<ChatBookmarkListComponent>;
  let component: ChatBookmarkListComponent;
  let tab: ChatTab;

  const host = () => fixture.nativeElement as HTMLElement;
  const all = (id: string) => [...host().querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
  const one = (id: string) => host().querySelector<HTMLElement>(`[data-testid="${id}"]`);

  /** Changes reach the list a microtask later, as they do in the room. */
  async function settle(): Promise<void> {
    await Promise.resolve();
    fixture.detectChanges();
  }

  function marked(text: string, timestamp: number, extra: Partial<ChatMessage> = {}): ChatMessage {
    const message = tab.addMessage({ from: 'someone', name: 'ノア', text, timestamp, ...extra });
    TestBed.inject(ChatBookmarkService).add(message, 'shared');
    return message;
  }

  function keydown(target: HTMLElement, key: string): void {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }

  beforeEach(() => {
    beMyself('me');
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.Player;
    TestBed.configureTestingModule({ imports: [ChatBookmarkListComponent], providers: [...TEST_PROVIDERS] });
    tab = ChatTabList.instance.addChatTab('メイン');
    fixture = TestBed.createComponent(ChatBookmarkListComponent);
    component = fixture.componentInstance;
    document.body.appendChild(host());
  });

  afterEach(() => {
    host().remove();
    tab.destroy();
    vi.restoreAllMocks();
  });

  it('names a mark after the opening words of its line, and shows where and by whom it was said', () => {
    marked('扉の向こうから、かすかに祈りの声がした。それは古い言葉で、誰も聞いたことのない節回しだった。', 1000);
    fixture.detectChanges();

    const title = one('chat-bookmark-title')!.textContent!.trim();
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBe(41);
    expect(one('chat-bookmark-item')!.textContent).toContain('メイン · ノア');
  });

  it('shows the name the room gave a mark, with the line under it', () => {
    marked('犯人は左利きだった', 1000).renameBookmark('事件の証言A');
    fixture.detectChanges();

    expect(one('chat-bookmark-title')!.textContent!.trim()).toBe('事件の証言A');
    expect(one('chat-bookmark-item')!.textContent).toContain('犯人は左利きだった');
  });

  it('keeps the words of a secret roll from a reader who may not see them', () => {
    vi.spyOn(TestBed.inject(RolePermissionService), 'canSeeHidden', 'get').mockReturnValue(false);
    marked('1D100 → 3', 1000, { tag: 'system secret', from: 'System-BCDice', originFrom: 'someone' } as never);
    fixture.detectChanges();

    expect(one('chat-bookmark-item')!.textContent).not.toContain('→ 3');
  });

  it('renames a mark with Enter, and goes back to the line’s words when the name is emptied', async () => {
    const line = marked('犯人は左利きだった', 1000);
    fixture.detectChanges();

    one('chat-bookmark-rename')!.click();
    await fixture.whenStable();
    const input = one('chat-bookmark-rename-input') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    input.value = '事件の証言A';
    input.dispatchEvent(new Event('input'));
    keydown(input, 'Enter');
    await settle();

    expect(line.bookmarkName).toBe('事件の証言A');
    expect(one('chat-bookmark-title')!.textContent!.trim()).toBe('事件の証言A');

    one('chat-bookmark-rename')!.click();
    await fixture.whenStable();
    const again = one('chat-bookmark-rename-input') as HTMLInputElement;
    expect(again.value).toBe('事件の証言A');
    again.value = '';
    again.dispatchEvent(new Event('input'));
    keydown(again, 'Enter');
    await settle();

    expect(line.bookmarkName).toBe('');
  });

  it('puts the name back on Escape without closing the list, and closes it on a second Escape', async () => {
    const line = marked('犯人は左利きだった', 1000);
    const closed = vi.fn();
    component.closed.subscribe(closed);
    fixture.detectChanges();

    one('chat-bookmark-rename')!.click();
    await fixture.whenStable();
    const input = one('chat-bookmark-rename-input') as HTMLInputElement;
    input.value = '書きかけ';
    input.dispatchEvent(new Event('input'));
    keydown(input, 'Escape');
    await fixture.whenStable();

    expect(line.bookmarkName).toBe('');
    expect(one('chat-bookmark-rename-input')).toBeNull();
    expect(closed).not.toHaveBeenCalled();

    keydown(one('chat-bookmark-item')!, 'Escape');
    expect(closed).toHaveBeenCalledOnce();
  });

  it('takes a mark off', async () => {
    const line = marked('犯人は左利きだった', 1000);
    fixture.detectChanges();

    one('chat-bookmark-remove')!.click();
    await settle();

    expect(line.isBookmarked).toBe(false);
    expect(one('chat-bookmarks-empty')).not.toBeNull();
  });

  it('asks for the line of the mark chosen', () => {
    const line = marked('犯人は左利きだった', 1000);
    const jumped = vi.fn();
    component.jump.subscribe(jumped);
    fixture.detectChanges();

    one('chat-bookmark-open')!.click();

    expect(jumped).toHaveBeenCalledWith(line);
  });

  it('lets a guest follow the marks but offers nothing to change them with', () => {
    marked('犯人は左利きだった', 1000);
    PeerCursor.myCursor.role = PeerRole.Guest;
    fixture.detectChanges();

    expect(all('chat-bookmark-item')).toHaveLength(1);
    expect(one('chat-bookmark-rename')).toBeNull();
    expect(one('chat-bookmark-remove')).toBeNull();
  });

  describe('the reader’s own marks', () => {
    const bookmarks = () => TestBed.inject(ChatBookmarkService);

    it('are listed with the room’s, each saying whose it is, and can be shown on their own', () => {
      const line = marked('犯人は左利きだった', 1000);
      bookmarks().add(line, 'personal');
      fixture.detectChanges();

      expect(all('chat-bookmark-item').map((item) => item.dataset['kind'])).toEqual(['shared', 'personal']);
      expect(all('chat-bookmark-kind').map((kind) => kind.textContent?.trim())).toEqual([
        TestBed.inject(TRANSLATE_FN)('feature.chat.bookmark.kinds.shared'),
        TestBed.inject(TRANSLATE_FN)('feature.chat.bookmark.kinds.personal'),
      ]);

      one('chat-bookmarks-filter-personal')!.click();
      fixture.detectChanges();
      expect(all('chat-bookmark-item').map((item) => item.dataset['kind'])).toEqual(['personal']);

      one('chat-bookmarks-filter-shared')!.click();
      fixture.detectChanges();
      expect(all('chat-bookmark-item').map((item) => item.dataset['kind'])).toEqual(['shared']);
    });

    it('are renamed apart from the room’s mark on the same line', async () => {
      const line = marked('犯人は左利きだった', 1000);
      bookmarks().add(line, 'personal');
      fixture.detectChanges();
      one('chat-bookmarks-filter-personal')!.click();
      fixture.detectChanges();

      one('chat-bookmark-rename')!.click();
      await fixture.whenStable();
      const input = one('chat-bookmark-rename-input') as HTMLInputElement;
      input.value = '自分用';
      input.dispatchEvent(new Event('input'));
      keydown(input, 'Enter');
      fixture.detectChanges();

      expect(bookmarks().nameOf(line, 'personal')).toBe('自分用');
      expect(line.bookmarkName).toBe('');
    });

    it('may be renamed and taken off by a guest, whose hands are off the room’s', () => {
      const line = marked('犯人は左利きだった', 1000);
      bookmarks().add(line, 'personal');
      PeerCursor.myCursor.role = PeerRole.Guest;
      fixture.detectChanges();

      const [shared, personal] = all('chat-bookmark-item');
      expect(shared.querySelector('[data-testid="chat-bookmark-remove"]')).toBeNull();
      (personal.querySelector('[data-testid="chat-bookmark-remove"]') as HTMLElement).click();
      fixture.detectChanges();

      expect(bookmarks().isBookmarked(line, 'personal')).toBe(false);
      expect(line.isBookmarked).toBe(true);
    });

    it('say so when there are none of the kind shown', () => {
      marked('犯人は左利きだった', 1000);
      fixture.detectChanges();

      one('chat-bookmarks-filter-personal')!.click();
      fixture.detectChanges();

      expect(one('chat-bookmarks-empty')?.textContent?.trim()).toBe(
        TestBed.inject(TRANSLATE_FN)('feature.chat.bookmark.empty.personal')
      );
    });
  });
});
