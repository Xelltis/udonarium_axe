import { TestBed } from '@angular/core/testing';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { Network } from '@axe/core/network/network';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { leaveRoomByReloading, LeaveRoomService, leavingLoss } from '@axe/features/lobby/leave-room';
import { RoomArchiveEventHandlerService } from '@axe/features/room-archive/room-archive-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('leaveRoomByReloading', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lets the page go unasked and drops the invitation from the address before loading afresh', () => {
    const calls: string[] = [];
    vi.spyOn(Network, 'letPageGo').mockImplementation(() => calls.push('let go'));
    const win = {
      location: { pathname: '/axe/', search: '?lang=ja', reload: () => calls.push('reload') },
      history: { replaceState: (_state: unknown, _title: string, url: string) => calls.push(`replace ${url}`) },
    } as unknown as Window;

    leaveRoomByReloading(win);

    expect(calls).toEqual(['let go', 'replace /axe/?lang=ja', 'reload']);
  });
});

describe('leaving the room', () => {
  let calls: string[];
  let win: Window;
  let ask: ReturnType<typeof vi.fn>;

  function inRoom(transport: 'server' | 'skyway', { linked = true, images = false, sounds = false } = {}): void {
    vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ isRoom: true } as never);
    vi.spyOn(Network, 'transport', 'get').mockReturnValue(transport);
    vi.spyOn(Network, 'isAuthorityOpen', 'get').mockReturnValue(linked);
    vi.spyOn(ImageStorage.instance, 'hasUploadsPending', 'get').mockReturnValue(images);
    vi.spyOn(AudioStorage.instance, 'hasUploadsPending', 'get').mockReturnValue(sounds);
  }

  beforeEach(() => {
    calls = [];
    win = {
      location: { pathname: '/axe/', search: '', reload: () => calls.push('reload') },
      history: { replaceState: () => {} },
    } as unknown as Window;
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    ask = vi.fn().mockResolvedValue(false);
    TestBed.overrideProvider(ConfirmService, { useValue: { ask } });
    vi.spyOn(Network, 'letPageGo').mockImplementation(() => {});
    vi.spyOn(TestBed.inject(RoomArchiveEventHandlerService), 'flush').mockImplementation(async () => {
      calls.push('save');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['through SkyWay, where the table stays only with whoever is left', 'skyway', {}, 'peer-to-peer'],
    ['while the link to the room server is down', 'server', { linked: false }, 'unsent'],
    ['while a picture has yet to go up', 'server', { images: true }, 'uploads'],
    ['while a sound has yet to go up', 'server', { sounds: true }, 'uploads'],
  ] as const)('asks first %s, and stays when the reader says no', async (_case, transport, state, loss) => {
    inRoom(transport, state);

    expect(leavingLoss()).toBe(loss);
    expect(await TestBed.inject(LeaveRoomService).leave(win)).toBe(false);

    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({
        message: TestBed.inject(TRANSLATE_FN)(`feature.lobby.leaveRoom.${loss}`),
        danger: true,
      })
    );
    expect(calls).toEqual([]);
  });

  it('keeps the room in the automatic save before leaving, once the reader is sure', async () => {
    inRoom('skyway');
    ask.mockResolvedValue(true);

    expect(await TestBed.inject(LeaveRoomService).leave(win)).toBe(true);

    expect(calls).toEqual(['save', 'reload']);
  });

  it('finds nothing to lose outside a room', () => {
    inRoom('skyway', { images: true });
    vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ isRoom: false } as never);

    expect(leavingLoss()).toBeNull();
  });

  it('takes one press at a time while it is on its way out', async () => {
    inRoom('server');
    let finishSaving!: () => void;
    vi.mocked(TestBed.inject(RoomArchiveEventHandlerService).flush).mockReturnValue(
      new Promise<void>((resolve) => (finishSaving = resolve))
    );
    const service = TestBed.inject(LeaveRoomService);

    const first = service.leave(win);
    await Promise.resolve();
    expect(await service.leave(win)).toBe(false);
    finishSaving();

    expect(await first).toBe(true);
    expect(calls).toEqual(['reload']);
  });

  it('leaves a room server’s room unasked when everything has reached the server', async () => {
    inRoom('server');

    expect(leavingLoss()).toBeNull();
    expect(await TestBed.inject(LeaveRoomService).leave(win)).toBe(true);

    expect(ask).not.toHaveBeenCalled();
    expect(calls).toEqual(['save', 'reload']);
  });
});
