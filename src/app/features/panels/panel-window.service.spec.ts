import { TestBed } from '@angular/core/testing';
import { AttachedDocuments } from '@axe/domain/ui/attached-documents';
import { PanelWindowService } from '@axe/features/panels/panel-window.service';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';

describe('PanelWindowService', () => {
  let opened: RoomPanelService;

  function setup(open: Window['open']): PanelWindowService {
    vi.spyOn(window, 'open').mockImplementation(open);
    TestBed.configureTestingModule({});
    opened = TestBed.inject(RoomPanelService);
    vi.spyOn(opened, 'open').mockImplementation(() => undefined);
    return TestBed.inject(PanelWindowService);
  }

  beforeEach(() => AttachedDocuments.reset(document));

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

    expect(windows.popOut('chatWindow')).toBe(false);
    expect(windows.isDetached('chatWindow')).toBe(false);
    expect(windows.detached()).toEqual([]);
  });

  it('holds nothing to bring back before anything has left', () => {
    const windows = setup(() => null);

    expect(() => windows.bringBack('chatWindow')).not.toThrow();
    expect(opened.open).not.toHaveBeenCalled();
  });

  it('closes nothing, quietly, when the page goes away with no windows out', () => {
    const windows = setup(() => null);

    expect(() => windows.closeAll()).not.toThrow();
    expect(windows.detached()).toEqual([]);
  });
});
