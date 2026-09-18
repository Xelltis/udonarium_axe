import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { ChatTabStripComponent } from '@axe/features/chat/chat-tab-strip/chat-tab-strip.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ChatTabStripComponent', () => {
  let fixture: ComponentFixture<ChatTabStripComponent>;
  let strip: ChatTabStripComponent;

  function select(identifier: string): void {
    fixture.componentRef.setInput('selected', identifier);
    fixture.detectChanges();
  }

  function showTabs(tabs: ChatTab[]): void {
    fixture.componentRef.setInput('tabs', tabs);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ChatTabStripComponent], providers: [...TEST_PROVIDERS] });
    fixture = TestBed.createComponent(ChatTabStripComponent);
    fixture.componentRef.setInput('tabs', []);
    fixture.componentRef.setInput('selected', '');
    strip = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('moving between tabs by wheel', () => {
    let tabs: ChatTab[];

    function turnWheel(deltaY: number, deltaMode = 0): WheelEvent {
      const event = new WheelEvent('wheel', { deltaY, cancelable: true });
      Object.defineProperty(event, 'deltaMode', { value: deltaMode });
      strip.switchTabByWheel(event);
      fixture.detectChanges();
      return event;
    }

    beforeEach(() => {
      tabs = [
        ChatTabList.instance.addChatTab('一枚目'),
        ChatTabList.instance.addChatTab('二枚目'),
        ChatTabList.instance.addChatTab('三枚目'),
      ];
      showTabs(tabs);
      select(tabs[0].identifier);
    });

    afterEach(() => {
      tabs.forEach((tab) => tab.destroy());
    });

    it('moves on to the next tab as the wheel turns forward', () => {
      turnWheel(100);

      expect(strip.selected()).toBe(tabs[1].identifier);
    });

    it('moves back a tab as the wheel turns back', () => {
      select(tabs[1].identifier);

      turnWheel(-100);

      expect(strip.selected()).toBe(tabs[0].identifier);
    });

    it('takes a notch reported in lines as a whole notch', () => {
      turnWheel(3, 1);

      expect(strip.selected()).toBe(tabs[1].identifier);
    });

    it('gathers up the small steps a trackpad sends', () => {
      turnWheel(8);
      turnWheel(8);

      expect(strip.selected()).toBe(tabs[0].identifier);

      turnWheel(8);
      turnWheel(8);
      turnWheel(8);

      expect(strip.selected()).toBe(tabs[1].identifier);
    });

    it('drops what it gathered when the wheel turns the other way', () => {
      turnWheel(30);
      turnWheel(-30);

      expect(strip.selected()).toBe(tabs[0].identifier);
    });

    it('holds on to the wheel so the strip does not slide instead', () => {
      const event = turnWheel(100);

      expect(event.defaultPrevented).toBe(true);
    });

    it('stops at the last tab rather than coming back round', () => {
      select(tabs[2].identifier);

      turnWheel(100);

      expect(strip.selected()).toBe(tabs[2].identifier);
    });

    it('stops at the first tab rather than coming back round', () => {
      turnWheel(-100);

      expect(strip.selected()).toBe(tabs[0].identifier);
    });

    it('leaves a sideways push to the strip it is over', () => {
      const event = new WheelEvent('wheel', { deltaX: -120, deltaY: 0, cancelable: true });
      strip.switchTabByWheel(event);
      fixture.detectChanges();

      // The strip is the one thing there that scrolls sideways, so the push belongs to it.
      expect(event.defaultPrevented).toBe(false);
      expect(strip.selected()).toBe(tabs[0].identifier);
    });

    it('leaves a wheel that has not moved alone', () => {
      const event = turnWheel(0);

      expect(event.defaultPrevented).toBe(false);
      expect(strip.selected()).toBe(tabs[0].identifier);
    });
  });

  describe('bringing the current tab back into the strip', () => {
    const PILL_WIDTH = 50;
    const PILL_PITCH = 60;

    let tabs: ChatTab[];

    /** happy-dom lays nothing out, so the strip is given a shape: three pills of 50 every 60. */
    function layOutStrip(stripWidth: number): { pills: HTMLElement; scrolledTo: number[] } {
      const inputs = [...fixture.nativeElement.querySelectorAll('input[name^="chat-tab"]')] as HTMLInputElement[];
      const pills = inputs.map((input) => input.closest('label') as HTMLElement);
      const container = pills[0].parentElement as HTMLElement;
      const scrolledTo: number[] = [];

      container.getBoundingClientRect = () => ({ left: 0, right: stripWidth }) as DOMRect;
      pills.forEach((pill, index) => {
        pill.getBoundingClientRect = () => {
          const left = index * PILL_PITCH - container.scrollLeft;
          return { left, right: left + PILL_WIDTH } as DOMRect;
        };
      });
      container.scrollTo = ((options: ScrollToOptions) => {
        scrolledTo.push(options.left ?? 0);
        container.scrollLeft = options.left ?? 0;
      }) as typeof container.scrollTo;

      return { pills: container, scrolledTo };
    }

    beforeEach(() => {
      tabs = ['一枚目', '二枚目', '三枚目'].map((name) => ChatTabList.instance.addChatTab(name));
      showTabs(tabs);
      select(tabs[0].identifier);
    });

    afterEach(() => {
      tabs.forEach((tab) => tab.destroy());
    });

    it('measures the tab it lands on rather than the one it left', () => {
      const { pills, scrolledTo } = layOutStrip(100);

      select(tabs[2].identifier);

      // The third pill sits at 120 and the strip is 100 wide: 94 leaves it 24 clear of the far edge.
      expect(scrolledTo).toEqual([94]);
      expect(pills.scrollLeft).toBe(94);
    });

    it('leaves the tab clear of the edge it came in at', () => {
      const { pills, scrolledTo } = layOutStrip(100);
      select(tabs[2].identifier);
      scrolledTo.length = 0;

      select(tabs[1].identifier);

      expect(pills.scrollLeft).toBe(36);
      expect(60 - pills.scrollLeft).toBe(24);
    });

    it('holds still for a tab that already has room on both sides', () => {
      const { scrolledTo } = layOutStrip(300);

      select(tabs[2].identifier);

      expect(scrolledTo).toEqual([]);
    });

    it('follows the wheel a tab at a time', () => {
      const { pills, scrolledTo } = layOutStrip(100);

      strip.switchTabByWheel(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
      fixture.detectChanges();

      expect(strip.selected()).toBe(tabs[1].identifier);
      expect(scrolledTo).toEqual([34]);
      expect(pills.scrollLeft).toBe(34);
    });

    it('finishes the scroll when the wheel runs on past the last tab', () => {
      const { pills, scrolledTo } = layOutStrip(100);
      select(tabs[2].identifier);
      pills.scrollLeft = 0;
      scrolledTo.length = 0;

      strip.switchTabByWheel(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));

      expect(strip.selected()).toBe(tabs[2].identifier);
      expect(scrolledTo).toEqual([94]);
    });
  });

  describe('the ground it is laid on', () => {
    let tab: ChatTab;

    function pill(): HTMLElement {
      return fixture.nativeElement.querySelector('.chat-tab-pill') as HTMLElement;
    }

    beforeEach(() => {
      tab = ChatTabList.instance.addChatTab('一枚目');
      showTabs([tab]);
    });

    afterEach(() => {
      tab.destroy();
    });

    function strip(): HTMLElement {
      return pill().closest('label')!.parentElement!;
    }

    it('groups its own tabs apart from another strip on the page', () => {
      const radio = fixture.nativeElement.querySelector('input[type="radio"]') as HTMLInputElement;

      const second = TestBed.createComponent(ChatTabStripComponent);
      second.componentRef.setInput('tabs', [tab]);
      second.componentRef.setInput('selected', tab.identifier);
      second.detectChanges();
      const other = second.nativeElement.querySelector('input[type="radio"]') as HTMLInputElement;

      expect(radio.name.length).toBeGreaterThan(0);
      expect(other.name).not.toBe(radio.name);
      second.destroy();
    });

    it('reads in the title bar colours by default', () => {
      expect(pill().classList).toContain('text-ui-titlebar-muted');
      expect(pill().classList).not.toContain('text-ui-muted');
      expect(strip().classList).toContain('pt-2');
    });

    it('reads in the panel colours on a panel, keeping the shape of a tab', () => {
      fixture.componentRef.setInput('tone', 'panel');
      fixture.detectChanges();

      expect(pill().classList).toContain('text-ui-muted');
      expect(pill().classList).not.toContain('text-ui-titlebar-muted');
      expect(pill().classList).toContain('rounded-full');
    });

    it('keeps only the room an unread count needs above the tabs on a panel', () => {
      fixture.componentRef.setInput('tone', 'panel');
      fixture.detectChanges();

      expect(strip().classList).toContain('pt-1.5');
      expect(strip().classList).not.toContain('pt-2');
      expect(strip().classList).toContain('overflow-x-auto');
    });
  });
});
