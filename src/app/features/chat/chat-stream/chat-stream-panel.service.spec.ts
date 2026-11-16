import { TestBed } from '@angular/core/testing';
import { PanelService } from '@axe/application/ui/panel.service';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { chatStreamPanelName, ChatStreamPanelService } from '@axe/features/chat/chat-stream/chat-stream-panel.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { Z_VISUAL_NOVEL_PANEL } from '@axe/ui/z-layers';

describe('ChatStreamPanelService', () => {
  let service: ChatStreamPanelService;
  let panels: PanelService;
  let tab: ChatTab;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(ChatStreamPanelService);
    panels = TestBed.inject(PanelService);
    tab = new ChatTab();
    tab.initialize();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    tab.destroy();
  });

  it('names the widget of a tab after the tab, so each tab has one of its own', () => {
    expect(chatStreamPanelName('tab-1')).toBe('chat-stream:tab-1');
    expect(chatStreamPanelName('tab-1')).not.toBe(chatStreamPanelName('tab-2'));
  });

  it('says whether the widget of a tab is open by the name it is opened under', () => {
    const has = vi.spyOn(panels, 'hasSingle').mockReturnValue(true);

    expect(service.isOpen(tab)).toBe(true);
    expect(has).toHaveBeenCalledWith(chatStreamPanelName(tab.identifier));
  });

  it('opens the widget for the tab over novel mode, at the spot asked for', () => {
    vi.spyOn(panels, 'closeSingle').mockReturnValue(false);
    const stream = { tabIdentifier: { set: vi.fn() } };
    const open = vi.spyOn(panels, 'openLazy').mockImplementation(((
      _load: unknown,
      _option: unknown,
      ready: unknown
    ) => {
      (ready as (opened: typeof stream) => void)(stream);
    }) as never);

    service.toggle(tab, { left: 40, top: 50 });

    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        left: 40,
        top: 50,
        layer: Z_VISUAL_NOVEL_PANEL,
        single: chatStreamPanelName(tab.identifier),
      })
    );
    expect(stream.tabIdentifier.set).toHaveBeenCalledWith(tab.identifier);
  });

  it('keeps the widget inside the window where no spot is asked for', () => {
    vi.spyOn(panels, 'closeSingle').mockReturnValue(false);
    const open = vi.spyOn(panels, 'openLazy').mockImplementation((() => undefined) as never);

    service.toggle(tab);

    const option = open.mock.calls[0][1] as { left: number; top: number; width: number; height: number };
    expect(option.width).toBeGreaterThanOrEqual(260);
    expect(option.width).toBeLessThanOrEqual(360);
    expect(option.height).toBeGreaterThanOrEqual(240);
    expect(option.height).toBeLessThanOrEqual(480);
    expect(option.left).toBeGreaterThanOrEqual(8);
    expect(option.top).toBe(24);
  });

  it('puts the widget away where it is already up, opening no other', () => {
    const close = vi.spyOn(panels, 'closeSingle').mockReturnValue(true);
    const open = vi.spyOn(panels, 'openLazy').mockImplementation((() => undefined) as never);

    service.toggle(tab);

    expect(close).toHaveBeenCalledWith(chatStreamPanelName(tab.identifier));
    expect(open).not.toHaveBeenCalled();
  });
});
