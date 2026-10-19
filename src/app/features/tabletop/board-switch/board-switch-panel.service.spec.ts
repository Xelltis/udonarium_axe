import { TestBed } from '@angular/core/testing';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { BoardSwitchService } from '@axe/application/tabletop/board-switch.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { BoardSwitch } from '@axe/domain/tabletop/board-switch/board-switch';
import { BoardSwitchEditorComponent } from '@axe/features/tabletop/board-switch/board-switch-editor.component';
import {
  BoardSwitchPanelService,
  SwitchHostNode,
} from '@axe/features/tabletop/board-switch/board-switch-panel.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('BoardSwitchPanelService', () => {
  let openLazy: ReturnType<typeof vi.fn>;
  let service: BoardSwitchPanelService;
  const target = { identifier: 'switch-1' } as BoardSwitch;
  const host = { identifier: 'terrain-1', name: 'Gate' } as SwitchHostNode;

  beforeEach(() => {
    openLazy = vi.fn();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.overrideProvider(PanelService, { useValue: { openLazy } });
    TestBed.overrideProvider(PointerDeviceService, { useValue: { pointers: [{ x: 500, y: 400 }] } });
    TestBed.overrideProvider(BoardSwitchService, { useValue: { ensure: () => target } });
    service = TestBed.inject(BoardSwitchPanelService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('opens one editor to a switch, showing the switch it was opened for', async () => {
    service.open(host);

    const [load, option, setup] = openLazy.mock.calls[0];
    expect(option).toEqual(expect.objectContaining({ single: 'board-switch:switch-1', left: 270, top: 250 }));
    await expect(load()).resolves.toBe(BoardSwitchEditorComponent);
    const editor = { target: { set: vi.fn() } };
    setup(editor);
    expect(editor.target.set).toHaveBeenCalledWith(target);
  });

  it('opens nothing for a switch gone by the time its editor arrives', () => {
    const get = vi.spyOn(ObjectStore.instance, 'get').mockReturnValue(target as never);
    service.open(host);
    const option = openLazy.mock.calls[0][1];

    expect(option.stillWanted()).toBe(true);
    get.mockReturnValue(null);
    expect(option.stillWanted()).toBe(false);
  });

  it('opens nothing where no switch can be made', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.overrideProvider(PanelService, { useValue: { openLazy } });
    TestBed.overrideProvider(BoardSwitchService, { useValue: { ensure: () => null } });

    TestBed.inject(BoardSwitchPanelService).open(host);

    expect(openLazy).not.toHaveBeenCalled();
  });
});
