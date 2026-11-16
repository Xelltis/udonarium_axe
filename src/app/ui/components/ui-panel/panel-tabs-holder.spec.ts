import { ComponentRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PanelService } from '@axe/application/ui/panel.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { PanelTabSlotComponent } from '@axe/ui/components/ui-panel/panel-tab-slot.component';
import { PanelTabHandle, PanelTabsFrame, PanelTabsHolder } from '@axe/ui/components/ui-panel/panel-tabs-holder';

describe('PanelTabsHolder', () => {
  let own: PanelService;
  let frame: {
    setShrunk: ReturnType<typeof vi.fn<PanelTabsFrame['setShrunk']>>;
    resizeTo: ReturnType<typeof vi.fn<PanelTabsFrame['resizeTo']>>;
  };
  let holder: PanelTabsHolder;

  function newPanel(title: string): PanelService {
    const panel = TestBed.runInInjectionContext(() => new PanelService());
    panel.title = title;
    return panel;
  }

  function handleOf(panel: PanelService): PanelTabHandle {
    return {
      panel,
      slot: {} as ComponentRef<PanelTabSlotComponent>,
      body: {} as ComponentRef<unknown>,
      box: null,
    };
  }

  function names(): string[] {
    return holder.tabs().map((tab) => tab.panel.title);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    own = newPanel('Own');
    frame = { setShrunk: vi.fn<PanelTabsFrame['setShrunk']>(), resizeTo: vi.fn<PanelTabsFrame['resizeTo']>() };
    holder = new PanelTabsHolder(own, frame);
  });

  it("answers with the frame's own panel while nothing was built into it", () => {
    expect(holder.count()).toBe(0);
    expect(holder.activePanel()).toBe(own);
  });

  it('puts each panel held at the end of the row and brings it to the front', () => {
    expect(holder.hold(handleOf(newPanel('Chat')))).toBe(0);
    expect(holder.hold(handleOf(newPanel('Sheet')))).toBe(1);

    expect(names()).toEqual(['Chat', 'Sheet']);
    expect(holder.activeIndex()).toBe(1);
    expect(holder.activePanel().title).toBe('Sheet');
  });

  it('finds the tab holding a panel, and nothing for a panel held elsewhere', () => {
    const chat = newPanel('Chat');
    holder.hold(handleOf(chat));

    expect(holder.find(chat)?.panel).toBe(chat);
    expect(holder.find(newPanel('Stranger'))).toBeNull();
  });

  it('brings the tab at an index to the front, and leaves the front alone for one out of range', () => {
    holder.hold(handleOf(newPanel('Chat')));
    holder.hold(handleOf(newPanel('Sheet')));

    expect(holder.select(0)?.panel.title).toBe('Chat');
    expect(holder.activeIndex()).toBe(0);
    expect(holder.select(2)).toBeNull();
    expect(holder.select(-1)).toBeNull();
    expect(holder.activeIndex()).toBe(0);
  });

  it('keeps the front where it was when a tab behind it is dropped, and moves it back from past the end', () => {
    holder.hold(handleOf(newPanel('Chat')));
    const sheet = holder.find(newPanel('Sheet'));
    expect(sheet).toBeNull();
    holder.hold(handleOf(newPanel('Sheet')));
    holder.hold(handleOf(newPanel('Palette')));
    holder.select(0);

    expect(holder.drop(holder.tabs()[2])).toBe(0);
    expect(names()).toEqual(['Chat', 'Sheet']);

    holder.select(1);
    expect(holder.drop(holder.tabs()[1])).toBe(0);
    expect(names()).toEqual(['Chat']);

    expect(holder.drop(holder.tabs()[0])).toBe(0);
    expect(holder.count()).toBe(0);
    expect(holder.activePanel()).toBe(own);
  });

  it('moves a tab to another place in the row and says where it stands', () => {
    holder.hold(handleOf(newPanel('Chat')));
    holder.hold(handleOf(newPanel('Sheet')));
    holder.hold(handleOf(newPanel('Palette')));

    expect(holder.move(0, 2)).toBe(2);
    expect(names()).toEqual(['Sheet', 'Palette', 'Chat']);
    expect(holder.move(5, 0)).toBeNull();
    expect(names()).toEqual(['Sheet', 'Palette', 'Chat']);
  });

  it('follows what a panel folded in asks only while it is in front, and stops once dropped', () => {
    const chat = newPanel('Chat');
    const sheet = newPanel('Sheet');
    holder.hold(handleOf(chat));
    holder.hold(handleOf(sheet));

    chat.shrinkRequest$.emit(true);
    expect(frame.setShrunk).not.toHaveBeenCalled();

    sheet.shrinkRequest$.emit(true);
    sheet.resizeRequest$.emit({ width: 300, height: 200 });
    expect(frame.setShrunk).toHaveBeenCalledWith(true);
    expect(frame.resizeTo).toHaveBeenCalledWith({ width: 300, height: 200 });

    holder.drop(holder.find(sheet)!);
    sheet.shrinkRequest$.emit(false);
    expect(frame.setShrunk).toHaveBeenCalledTimes(1);
  });

  it("leaves the frame's own panel to the frame, which already follows it", () => {
    holder.hold(handleOf(own));

    own.shrinkRequest$.emit(true);

    expect(frame.setShrunk).not.toHaveBeenCalled();
  });
});
