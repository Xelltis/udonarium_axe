import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { ChatSendService } from '@axe/features/chat/chat-send.service';
import { ChatStreamComponent } from '@axe/features/chat/chat-stream/chat-stream.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

/** The button of that icon the window puts in the panel bar. */
function control(icon: string) {
  const found = TestBed.inject(PanelService)
    .headerControls()
    .find((each) => each.icon === icon);
  if (!found) throw new Error(`no ${icon} in the panel bar`);
  return found;
}

describe('ChatStreamComponent', () => {
  let fixture: ComponentFixture<ChatStreamComponent>;
  let component: ChatStreamComponent;
  let tab: ChatTab;

  beforeEach(async () => {
    PeerCursor.createMyCursor();
    TestBed.configureTestingModule({
      imports: [ChatStreamComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    tab = ChatTabList.instance.addChatTab('メインタブ');
    fixture = TestBed.createComponent(ChatStreamComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture?.destroy();
    tab?.destroy();
  });

  it('shows the lines of the tab it was opened on', () => {
    tab.addMessage({ from: 'alice', name: 'アリス', text: 'なんだって！？', timestamp: 1000 });
    component.tabIdentifier.set(tab.identifier);
    fixture.detectChanges();

    expect(component.chatTab()).toBe(tab);
    expect(fixture.nativeElement.textContent).toContain('なんだって！？');
  });

  it('shows no sample lines on a tab with nothing said in it, which would pass for real ones over the table', () => {
    component.tabIdentifier.set(tab.identifier);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('chat-message')).toHaveLength(0);
  });

  it('offers the buttons that hover over a line, as the chat window does', () => {
    tab.addMessage({ from: 'alice', name: 'アリス', text: 'やあ', timestamp: 1000 });
    component.tabIdentifier.set(tab.identifier);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('chat-message .material-icons').length).toBeGreaterThan(0);
  });

  describe('the buttons it puts in the panel bar', () => {
    it('offers following the newest line and taking the box off', () => {
      component.tabIdentifier.set(tab.identifier);
      fixture.detectChanges();

      const panelService = TestBed.inject(PanelService);
      expect(panelService.headerControls().map((each) => each.icon)).toEqual(['vertical_align_bottom', 'opacity']);
      expect(control('vertical_align_bottom').active).toBe(true);
    });

    it('takes the box off the panel and puts it back', () => {
      component.tabIdentifier.set(tab.identifier);
      fixture.detectChanges();
      const panelService = TestBed.inject(PanelService);

      control('opacity').press();
      fixture.detectChanges();

      expect(panelService.isGhost()).toBe(true);
      expect(control('opacity').active).toBe(true);

      control('opacity').press();
      fixture.detectChanges();

      expect(panelService.isGhost()).toBe(false);
    });
  });

  describe('following the newest line', () => {
    it('carries the window down as a line arrives', () => {
      component.tabIdentifier.set(tab.identifier);
      fixture.detectChanges();
      const emit = vi.spyOn(TestBed.inject(PanelService).scrollToBottom$, 'emit');

      TestBed.inject(ObjectChangeService).messageAdded$.emit({
        tabIdentifier: tab.identifier,
        messageIdentifier: 'message-1',
      });

      expect(emit).toHaveBeenCalled();
    });

    it('stays where it was put once following is turned off', () => {
      component.tabIdentifier.set(tab.identifier);
      fixture.detectChanges();
      control('vertical_align_bottom').press();
      fixture.detectChanges();
      const emit = vi.spyOn(TestBed.inject(PanelService).scrollToBottom$, 'emit');

      TestBed.inject(ObjectChangeService).messageAdded$.emit({
        tabIdentifier: tab.identifier,
        messageIdentifier: 'message-1',
      });

      expect(component.followsLatest()).toBe(false);
      expect(emit).not.toHaveBeenCalled();
    });

    it('leaves another tab alone', () => {
      component.tabIdentifier.set(tab.identifier);
      fixture.detectChanges();
      const emit = vi.spyOn(TestBed.inject(PanelService).scrollToBottom$, 'emit');

      TestBed.inject(ObjectChangeService).messageAdded$.emit({
        tabIdentifier: 'another-tab',
        messageIdentifier: 'message-1',
      });

      expect(emit).not.toHaveBeenCalled();
    });
  });

  it('draws no rule between the lines once the box is off', () => {
    tab.addMessage({ from: 'alice', name: 'アリス', text: 'やあ', timestamp: 1000 });
    component.tabIdentifier.set(tab.identifier);
    fixture.detectChanges();

    const log = fixture.nativeElement.querySelector('[data-testid="chat-stream-log"]') as HTMLElement;
    expect(log.className).not.toContain('border-b-0');

    control('opacity').press();
    fixture.detectChanges();

    expect(log.className).toContain('[&_.message]:border-b-0!');
  });

  describe('switching tabs and speaking', () => {
    const byTestId = (id: string) => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);

    it('shows a tab strip and an input, and keeps both to speak in once the box is taken off', () => {
      component.tabIdentifier.set(tab.identifier);
      fixture.detectChanges();
      expect(byTestId('chat-stream-tabs')?.querySelector('chat-tab-strip')).not.toBeNull();
      expect(byTestId('chat-stream-input')?.tagName).toBe('CHAT-INPUT');

      control('opacity').press();
      fixture.detectChanges();

      expect(byTestId('chat-stream-tabs')?.querySelector('chat-tab-strip')).not.toBeNull();
      expect(byTestId('chat-stream-input')).not.toBeNull();
    });

    it('shows another tab picked from the strip', () => {
      const other = ChatTabList.instance.addChatTab('雑談');
      try {
        other.addMessage({ from: 'bob', name: 'ボブ', text: 'おなかすいた', timestamp: 1000 });
        component.tabIdentifier.set(tab.identifier);
        fixture.detectChanges();

        const pill = [...fixture.nativeElement.querySelectorAll('.chat-tab-pill')].find((each) =>
          (each as HTMLElement).textContent?.includes('雑談')
        ) as HTMLElement;
        pill.click();
        fixture.detectChanges();

        expect(component.tabIdentifier()).toBe(other.identifier);
        expect(fixture.nativeElement.textContent).toContain('おなかすいた');
      } finally {
        other.destroy();
      }
    });

    it('is found by the tab it shows, taking that one up as another is picked', () => {
      const other = ChatTabList.instance.addChatTab('雑談');
      const panelService = TestBed.inject(PanelService);
      try {
        component.tabIdentifier.set(tab.identifier);
        fixture.detectChanges();
        expect(panelService.hasSingle(`chat-stream:${tab.identifier}`)).toBe(true);

        component.tabIdentifier.set(other.identifier);
        fixture.detectChanges();

        expect(panelService.hasSingle(`chat-stream:${tab.identifier}`)).toBe(false);
        expect(panelService.hasSingle(`chat-stream:${other.identifier}`)).toBe(true);
      } finally {
        other.destroy();
      }
    });

    it('leaves Ctrl and an arrow to a field that steps over words with them', () => {
      const other = ChatTabList.instance.addChatTab('雑談');
      try {
        component.tabIdentifier.set(tab.identifier);
        fixture.detectChanges();
        const field = document.createElement('input');
        fixture.nativeElement.appendChild(field);

        const event = new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        });
        field.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
        expect(component.tabIdentifier()).toBe(tab.identifier);
      } finally {
        other.destroy();
      }
    });

    it('moves to the tab beside it on Ctrl and an arrow, wrapping round', () => {
      const other = ChatTabList.instance.addChatTab('雑談');
      try {
        component.tabIdentifier.set(tab.identifier);
        fixture.detectChanges();
        const tabs = component.visibleChatTabs();
        const at = tabs.indexOf(tab);

        fixture.nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true }));

        expect(component.tabIdentifier()).toBe(tabs[(at + 1) % tabs.length].identifier);
      } finally {
        other.destroy();
      }
    });

    it('says a line into the tab shown, as the chat window says one', () => {
      const send = vi.spyOn(TestBed.inject(ChatSendService), 'send').mockImplementation(() => {});
      component.tabIdentifier.set(tab.identifier);
      fixture.detectChanges();
      const line = { text: 'こんにちは', sendFrom: 'me' } as Parameters<ChatSendService['send']>[1];

      component.send(line);

      expect(send).toHaveBeenCalledWith(tab, line);
    });
  });

  it('says so once the tab it was opened on is gone', () => {
    component.tabIdentifier.set('no-such-tab');
    fixture.detectChanges();

    expect(component.chatTab()).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('chat-tab')).toHaveLength(0);
  });
});
