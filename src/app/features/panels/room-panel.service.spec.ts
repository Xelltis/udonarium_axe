import { ViewContainerRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { PanelWindowRequest, PanelWindowService } from '@axe/features/panels/panel-window.service';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('RoomPanelService', () => {
  let service: RoomPanelService;
  let openLazy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    openLazy = vi.fn();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.overrideProvider(PanelService, { useValue: { openLazy } });
    service = TestBed.inject(RoomPanelService);
  });

  afterEach(() => TestBed.resetTestingModule());

  function option(call = 0): PanelOption {
    return openLazy.mock.calls[call][1] as PanelOption;
  }

  /** Takes the pop-out button's word for how the panel is to be opened again. */
  function popOut(): PanelWindowRequest {
    let asked: PanelWindowRequest | null = null;
    vi.spyOn(TestBed.inject(PanelWindowService), 'popOut').mockImplementation((request) => {
      asked = request;
      return true;
    });
    option().controls![0].press({ close: vi.fn(), windowed: () => false } as unknown as PanelService);
    return asked!;
  }

  it('offers to send a panel on the table to a window of its own', () => {
    service.open('cutInList');

    expect(option().controls?.map((control) => control.icon)).toEqual(['open_in_new']);
    expect(option().windowed).toBe(false);
  });

  it('does nothing when the button travelled to a window with the panel it was made for', () => {
    service.open('cutInList');
    const windows = vi.spyOn(TestBed.inject(PanelWindowService), 'popOut');

    option().controls![0].press({ close: vi.fn(), windowed: () => true } as unknown as PanelService);

    expect(windows).not.toHaveBeenCalled();
  });

  it('offers no way out again to one already in a window', () => {
    service.open('cutInList', {}, undefined, {} as ViewContainerRef);

    expect(option().controls).toEqual([]);
    expect(option().windowed).toBe(true);
  });

  it('opens it again in the window with everything it was asked for', () => {
    const setup = vi.fn();
    const host = {} as ViewContainerRef;
    service.open('cutInList', { width: 1200, title: 'カットイン' }, setup);

    popOut().open(host);

    const [, drawn, given, parent] = openLazy.mock.calls[1];
    expect(drawn).toEqual(expect.objectContaining({ width: 1200, title: 'カットイン', left: 0, top: 0 }));
    expect(given).toBe(setup);
    expect(parent).toBe(host);
  });

  it('brings it back the size it was, not the size the panel is opened at by default', () => {
    const setup = vi.fn();
    service.open('cutInList', { width: 1200, title: 'カットイン' }, setup);

    popOut().restore();

    const [, back, given] = openLazy.mock.calls[1];
    expect(back).toEqual(expect.objectContaining({ width: 1200, title: 'カットイン' }));
    expect(given).toBe(setup);
  });
});
