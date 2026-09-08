import { ChangeDetectionStrategy, Component, ComponentRef, ViewContainerRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OverlayLayers } from '@axe/application/ui/overlay-layers';
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
