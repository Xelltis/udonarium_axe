import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ContextMenuAction, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { IPeerContext } from '@axe/core/network/peer-context';
import { resetPeerContextProvider, setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { VisualNovelBacklogComponent } from '@axe/features/visual-novel/visual-novel-backlog/visual-novel-backlog.component';
import { VisualNovelPlaybackService } from '@axe/features/visual-novel/visual-novel-playback.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('VisualNovelBacklogComponent', () => {
  let component: VisualNovelBacklogComponent;
  let fixture: ComponentFixture<VisualNovelBacklogComponent>;
  let tab: ChatTab;
  let nextTimestamp = 1000;
  let nextImageId = 0;

  const TEST_USER_ID = 'vn-backlog-user';

  function addMessage(text: string, name = 'アリス', extra: Record<string, unknown> = {}): void {
    tab.addMessage({
      from: TEST_USER_ID,
      name,
      text,
      timestamp: nextTimestamp++,
      ...extra,
    });
  }

  function addImage(): string {
    return ImageStorage.instance.add(`test://vn-log/image-${nextImageId++}.png`).identifier;
  }

  function createComponent(): void {
    fixture = TestBed.createComponent(VisualNovelBacklogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    setPeerContextProvider({
      peerContext: { userId: TEST_USER_ID } as IPeerContext,
      peerContexts: [],
      peerIds: [],
      peerId: 'vn-backlog-peer',
    });
    PeerCursor.createMyCursor();
    TestBed.configureTestingModule({
      imports: [VisualNovelBacklogComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    tab = ChatTabList.instance.addChatTab('テストタブ');
    TestBed.inject(VisualNovelPlaybackService).setChatTab(tab.identifier);
  });

  afterEach(() => {
    fixture?.destroy();
    tab?.destroy();
    vi.restoreAllMocks();
    resetPeerContextProvider();
  });

  it('keeps a logged line parted into its body and its suffix', () => {
    addMessage('やあ 〔叫び・ゆれ〕');
    createComponent();

    const entry = component.entries()[0];
    expect(entry.text).toBe('やあ');
    expect(entry.suffix).toBe('〔叫び・ゆれ〕');
  });

  it('narrows by a word in the body or the name', () => {
    addMessage('森の奥へ進む', 'アリス');
    addMessage('宿屋で休む', 'ボブ');
    createComponent();

    expect(component.filteredEntries()).toHaveLength(2);
    component.filter.set('宿屋');
    expect(component.filteredEntries()).toHaveLength(1);
    expect(component.filteredEntries()[0].message.name).toBe('ボブ');
    component.filter.set('アリス');
    expect(component.filteredEntries()).toHaveLength(1);
  });

  it('saves an edit to the body, the effect or the place', () => {
    addMessage('やあ 〔叫び〕', 'アリス', { imageIdentifier: addImage(), imagePos: 2 });
    createComponent();

    const entry = component.entries()[0];
    expect(entry.message.changeable).toBe(true);

    component.startEditEntry(entry);
    expect(component.editText()).toBe('やあ');
    expect(component.editShape()).toBe('shout');
    // Where it was sent from is not a place chosen for this line.
    expect(component.editSlot()).toBe(-1);

    component.editText.set('こんばんは');
    component.editShape.set('thought');
    component.editSlot.set(7);
    component.saveEditEntry();

    const message = TestBed.inject(VisualNovelPlaybackService).messages()[0];
    // Editing a line said before the staging was kept apart moves it out of the body.
    expect(message.text).toBe('こんばんは');
    expect(message.vnEmote).toBe('shape:thought');
    expect(message.vnPortraitPos).toBe(7);
    expect(message.imagePos).toBe(2);
    expect(message.fixd).toBe(true);
    expect(component.editingIdentifier()).toBe('');
  });

  it('adds and removes a flip', () => {
    addMessage('ふりむく 〔反転〕', 'アリス', { imageIdentifier: addImage() });
    createComponent();

    component.startEditEntry(component.entries()[0]);
    expect(component.editFlipped()).toBe(true);
    component.editFlipped.set(false);
    component.saveEditEntry();

    expect(TestBed.inject(VisualNovelPlaybackService).messages()[0].text).toBe('ふりむく');
  });

  describe('the menu held on a line', () => {
    function pressOn(target: Element): MouseEvent {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event;
    }

    function openMenu() {
      vi.spyOn(TestBed.inject(PointerDeviceService), 'isAllowedToOpenContextMenu', 'get').mockReturnValue(true);
      return vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);
    }

    it('offers to edit a line the reader may change, for a screen whose pencil never shows', () => {
      const open = openMenu();
      addMessage('やあ');
      createComponent();

      const event = pressOn(fixture.nativeElement.querySelector('[data-vn-log-id]'));
      const actions = open.mock.calls[0][1] as ContextMenuAction[];
      actions[0].action?.();

      expect(event.defaultPrevented).toBe(true);
      expect(component.editingIdentifier()).toBe(component.entries()[0].message.identifier);
    });

    it('leaves a line being edited to its own text box', () => {
      const open = openMenu();
      addMessage('やあ');
      createComponent();
      component.startEditEntry(component.entries()[0]);
      fixture.detectChanges();

      pressOn(fixture.nativeElement.querySelector('[data-vn-log-id]'));

      expect(open).not.toHaveBeenCalled();
    });

    describe('with words picked out', () => {
      const strays: Element[] = [];

      afterEach(() => {
        window.getSelection()?.removeAllRanges();
        strays.splice(0).forEach((stray) => stray.remove());
      });

      function pickOut(node: Text, words: string): void {
        const range = document.createRange();
        range.setStart(node, node.data.indexOf(words));
        range.setEnd(node, node.data.indexOf(words) + words.length);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
      }

      function wordsIn(element: Element, words: string): Text {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if ((node as Text).data.includes(words)) return node as Text;
        }
        throw new Error(`"${words}" is not drawn`);
      }

      function touch(isTouch: boolean): void {
        vi.spyOn(TestBed.inject(ViewportService), 'isTouch').mockReturnValue(isTouch);
      }

      it("leaves the browser's own menu to a right click with words in the line picked out", () => {
        const open = openMenu();
        touch(false);
        addMessage('こんにちは、みなさん');
        createComponent();
        const row = fixture.nativeElement.querySelector('[data-vn-log-id]') as Element;
        pickOut(wordsIn(row, 'みなさん'), 'みなさん');

        const event = pressOn(row);

        expect(event.defaultPrevented).toBe(false);
        expect(open).not.toHaveBeenCalled();
      });

      it('still opens over a line when the words picked out lie elsewhere on the page', () => {
        const open = openMenu();
        touch(false);
        addMessage('こんにちは');
        createComponent();
        const paragraph = document.createElement('p');
        paragraph.textContent = '前の話';
        document.body.append(paragraph);
        strays.push(paragraph);
        pickOut(paragraph.firstChild as Text, '前の');

        const event = pressOn(fixture.nativeElement.querySelector('[data-vn-log-id]'));

        expect(event.defaultPrevented).toBe(true);
        expect(open).toHaveBeenCalledTimes(1);
      });

      it('still opens from a press held on a touch screen, which has no menu of its own to fall back on', () => {
        const open = openMenu();
        touch(true);
        addMessage('こんにちは、みなさん');
        createComponent();
        const row = fixture.nativeElement.querySelector('[data-vn-log-id]') as Element;
        pickOut(wordsIn(row, 'みなさん'), 'みなさん');

        const event = pressOn(row);

        expect(event.defaultPrevented).toBe(true);
        expect(open).toHaveBeenCalledTimes(1);
      });
    });
  });

  it('leaves the body alone on a cancelled edit', () => {
    addMessage('そのまま');
    createComponent();

    component.startEditEntry(component.entries()[0]);
    component.editText.set('書き換え');
    component.cancelEditEntry();

    expect(component.editingIdentifier()).toBe('');
    expect(TestBed.inject(VisualNovelPlaybackService).messages()[0].text).toBe('そのまま');
  });

  it('draws only the recent lines of a long log and loads more on request', () => {
    for (let i = 0; i < 260; i++) addMessage(`ログ${i}`);
    createComponent();

    expect(component.entries()).toHaveLength(260);
    expect(component.windowedEntries()).toHaveLength(200);
    expect(component.windowedEntries()[0].text).toBe('ログ60');
    expect(component.hiddenCount()).toBe(60);

    component.loadMoreEntries();

    expect(component.windowedEntries()).toHaveLength(260);
    expect(component.hiddenCount()).toBe(0);
  });

  it('goes to the line that was clicked', () => {
    addMessage('m1');
    addMessage('m2');
    createComponent();
    const playback = TestBed.inject(VisualNovelPlaybackService);
    playback.toLatest();
    expect(playback.currentIndex()).toBe(1);

    const rows = fixture.nativeElement.querySelectorAll('[data-vn-log-id]');
    rows[0].click();

    expect(playback.currentIndex()).toBe(0);
  });

  it('gives a line back to following the character once its place is dropped', () => {
    addMessage('やあ', 'アリス', { imageIdentifier: addImage() });
    createComponent();

    component.startEditEntry(component.entries()[0]);
    component.editSlot.set(7);
    component.saveEditEntry();
    expect(TestBed.inject(VisualNovelPlaybackService).messages()[0].vnPortraitPos).toBe(7);

    component.startEditEntry(component.entries()[0]);
    expect(component.editSlot()).toBe(7);
    component.editSlot.set(-1);
    component.saveEditEntry();

    expect(TestBed.inject(VisualNovelPlaybackService).messages()[0].vnPortraitPos).toBe(-1);
  });
});
