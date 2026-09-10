import { ChangeDetectionStrategy, Component, ComponentRef, ViewContainerRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OverlayLayers } from '@axe/application/ui/overlay-layers';
import { PanelFrame } from '@axe/application/ui/panel.service';
import { AttachedDocuments } from '@axe/domain/ui/attached-documents';
import { PanelWindowRequest, PanelWindowService } from '@axe/features/panels/panel-window.service';

@Component({
  selector: 'stand-in-panel',
  template: '<p>panel</p>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class StandInPanelComponent {}

describe('PanelWindowService', () => {
  const drawn = vi.fn();
  const restored = vi.fn();

  function request(key = 'room:chatWindow'): PanelWindowRequest {
    return { key, open: drawn, restore: restored };
  }

  function setup(open: Window['open']): PanelWindowService {
    vi.spyOn(window, 'open').mockImplementation(open);
    TestBed.configureTestingModule({});
    return TestBed.inject(PanelWindowService);
  }

  beforeEach(() => {
    drawn.mockClear();
    restored.mockClear();
    AttachedDocuments.reset(document);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    TestBed.resetTestingModule();
    AttachedDocuments.reset(document);
    OverlayLayers.reset();
  });

  /** A window the browser handed back, with a document of its own and nothing else in it. */
  function fakeWindow(): Window {
    const paper = document.implementation.createHTMLDocument('panel');
    const opened = {
      document: paper,
      closed: false,
      focus: vi.fn(),
      addEventListener: vi.fn(),
      close: vi.fn(() => {
        opened.closed = true;
      }),
    };
    return opened as unknown as Window;
  }

  describe('a window that has really opened', () => {
    let opened: Window;

    function open(draw: (host: ViewContainerRef) => void): PanelWindowService {
      opened = fakeWindow();
      const windows = setup(() => opened);
      expect(windows.popOut({ key: 'palette:c1', open: draw, restore: restored })).toBe(true);
      return windows;
    }

    it("offers the window's layer to whatever the panel opens over it", () => {
      let host: ViewContainerRef | null = null;
      open((layer) => (host = layer));

      vi.spyOn(opened.document, 'hasFocus').mockReturnValue(true);

      expect(host).not.toBeNull();
      expect(OverlayLayers.current()).toBe(host);
    });

    it('closes a window whose panel closed itself, without opening the panel again', () => {
      vi.useFakeTimers();
      let panel: ComponentRef<StandInPanelComponent> | null = null;
      const windows = open((layer) => (panel = layer.createComponent(StandInPanelComponent)));

      vi.advanceTimersByTime(500);
      panel!.destroy();
      vi.advanceTimersByTime(500);

      expect(opened.close).toHaveBeenCalled();
      expect(restored).not.toHaveBeenCalled();
      expect(windows.isDetached('palette:c1')).toBe(false);
    });

    it('puts the panel back when the reader shuts the window on it', () => {
      vi.useFakeTimers();
      const windows = open((layer) => layer.createComponent(StandInPanelComponent));

      vi.advanceTimersByTime(500);
      (opened as { closed: boolean }).closed = true;
      vi.advanceTimersByTime(500);

      expect(restored).toHaveBeenCalled();
      expect(windows.isDetached('palette:c1')).toBe(false);
    });

    it("lets go of the window's document even once the window has given it up", () => {
      vi.useFakeTimers();
      open((layer) => layer.createComponent(StandInPanelComponent));
      expect(AttachedDocuments.all()).toHaveLength(2);

      (opened as { closed: boolean }).closed = true;
      (opened as unknown as { document: Document | null }).document = null;
      vi.advanceTimersByTime(500);

      expect(AttachedDocuments.all()).toEqual([document]);
      expect(OverlayLayers.current()).toBeNull();
    });
  });

  describe('a group of panels taken out together', () => {
    /** A stand-in for a frame: it holds panels and hands them over as a whole. */
    function frameHolding(held: string[]) {
      const taken: string[] = [];
      const frame = {
        frameKey: 'panel-1',
        openTab: (() => ({})) as never,
        setInitialRotation: () => undefined,
        claimSelf: () => undefined,
        closeTab: () => undefined,
        takeIn: (handoff: { panel: { name: string } }) => {
          taken.push(handoff.panel.name);
          held.push(handoff.panel.name);
        },
        handOverAll: () =>
          held.splice(0).map((name) => ({ panel: { name, windowed: { set: () => undefined } } })) as never,
        panelCount: () => held.length,
        frameSize: () => ({ width: 900, height: 700 }),
        dismissFrame: vi.fn(),
        taken,
      };
      return frame as typeof frame & PanelFrame;
    }

    function panelsMaking(frame: ReturnType<typeof frameHolding>) {
      return { openFrame: vi.fn(() => frame) } as unknown as never;
    }

    it('moves every panel it holds into one frame in the window', () => {
      const opened = fakeWindow();
      const windows = setup(() => opened);
      const here = frameHolding(['chat', 'sheet']);
      const abroad = frameHolding([]);

      expect(windows.popOutGroup(here, panelsMaking(abroad))).toBe(true);

      expect(abroad.taken).toEqual(['chat', 'sheet']);
      expect(here.dismissFrame).toHaveBeenCalled();
      expect(windows.isDetached('group:panel-1')).toBe(true);
    });

    it('opens the window the size the frame is standing at, and brings it home that size', () => {
      const opened = fakeWindow();
      const open = vi.fn(() => opened);
      const windows = setup(open as unknown as Window['open']);
      const abroad = frameHolding([]);
      const panels = { openFrame: vi.fn(() => abroad) } as unknown as never;

      windows.popOutGroup(frameHolding(['chat']), panels);

      expect(String(open.mock.calls[0][2])).toContain('width=900');
      expect(String(open.mock.calls[0][2])).toContain('height=700');
    });

    it('brings them home before the window is taken down', () => {
      vi.useFakeTimers();
      const opened = fakeWindow();
      const windows = setup(() => opened);
      const abroad = frameHolding([]);
      const home = frameHolding([]);
      let made = 0;
      const panels = {
        openFrame: vi.fn(() => {
          made += 1;
          return made === 1 ? abroad : home;
        }),
      } as unknown as never;
      windows.popOutGroup(frameHolding(['chat', 'sheet']), panels);

      (opened as { closed: boolean }).closed = true;
      vi.advanceTimersByTime(500);

      expect(home.taken).toEqual(['chat', 'sheet']);
      expect(abroad.dismissFrame).toHaveBeenCalled();
      expect(restored).not.toHaveBeenCalled();
    });
  });

  it('says a browser that can open a window can take a panel', () => {
    const windows = setup(() => null);

    expect(windows.isSupported).toBe(true);
  });

  it('reports a window the browser refused rather than pretending', () => {
    const windows = setup(() => null);

    expect(windows.popOut(request())).toBe(false);
    expect(windows.isDetached('room:chatWindow')).toBe(false);
    expect(windows.detached()).toEqual([]);
    expect(drawn).not.toHaveBeenCalled();
  });

  it('holds nothing to bring back before anything has left', () => {
    const windows = setup(() => null);

    expect(() => windows.bringBack('room:chatWindow')).not.toThrow();
    expect(restored).not.toHaveBeenCalled();
  });

  it('closes nothing, quietly, when the page goes away with no windows out', () => {
    const windows = setup(() => null);

    expect(() => windows.closeAll()).not.toThrow();
    expect(windows.detached()).toEqual([]);
  });
});
