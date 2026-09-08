import { TestBed } from '@angular/core/testing';
import { AttachedDocuments } from '@axe/domain/ui/attached-documents';
import { PanelWindowRequest, PanelWindowService } from '@axe/features/panels/panel-window.service';

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
    TestBed.resetTestingModule();
    AttachedDocuments.reset(document);
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
