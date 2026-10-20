import { TestBed } from '@angular/core/testing';
import { AssetRemovalService } from '@axe/application/file/asset-removal.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ConfirmDialogOption } from '@axe/application/ui/confirm-option';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { Network } from '@axe/core/network/network';
import { AssetHttpStore, AssetRemovalResult } from '@axe/core/storage/asset-http-store';
import { ASSET_RETRY_DELAY_MS, ASSET_RETRY_LIMIT } from '@axe/core/storage/asset-retries';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { AssetRemoval } from '@axe/domain/media/asset-removal';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { BackgroundSound } from '@axe/domain/media/background-sound';
import { CutIn } from '@axe/domain/media/cut-in';
import { CutInLauncher } from '@axe/domain/media/cut-in-launcher';
import { ImageTag, SYSTEM_RESERVED_TAG } from '@axe/domain/media/image-tag';
import { Jukebox } from '@axe/domain/media/jukebox';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import type { MockInstance } from 'vitest';

describe('AssetRemovalService', () => {
  const pictureId = 'a'.repeat(64);
  const otherId = 'c'.repeat(64);
  const trackId = 'b'.repeat(64);
  let isGameMaster: boolean;
  let service: AssetRemovalService;
  let ask: ReturnType<typeof vi.fn<(option: ConfirmDialogOption) => Promise<boolean>>>;
  let show: ReturnType<typeof vi.fn<(message: string) => void>>;

  beforeEach(() => {
    isGameMaster = true;
    ask = vi.fn(async () => true);
    show = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        { provide: ConfirmService, useValue: { ask } },
        { provide: SnackbarService, useValue: { show } },
        {
          provide: RolePermissionService,
          useValue: {
            get canEditShared() {
              return isGameMaster;
            },
          },
        },
      ],
    });
    service = TestBed.inject(AssetRemovalService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('removes only what a person added, named by its hash, and no picture the tool brought with it', () => {
    ImageTag.create(otherId).tag = SYSTEM_RESERVED_TAG;

    expect(service.removable('image', [pictureId, pictureId, otherId, 'none_icon'])).toEqual([pictureId]);
    expect(service.removable('audio', [trackId, 'https://example.com/a.mp3'])).toEqual([trackId]);
  });

  it('records each for the room as the GM, and nothing for anyone else', () => {
    isGameMaster = false;
    expect(service.remove('image', [pictureId])).toBe(0);
    expect(AssetRemoval.all()).toEqual([]);

    isGameMaster = true;
    expect(service.remove('image', [pictureId, 'none_icon'])).toBe(1);

    expect(AssetRemoval.get(pictureId)?.isRemoved).toBe(true);
    expect(AssetRemoval.get(pictureId)?.kind).toBe('image');
    expect(AssetRemoval.all()).toHaveLength(1);
  });

  it('stops a sound the room is playing before removing it, and leaves the others playing', () => {
    const jukebox = new Jukebox('Jukebox');
    jukebox.initialize();
    jukebox.audioIdentifier = trackId;
    const stopMusic = vi.spyOn(jukebox, 'stop').mockImplementation(() => {});
    const rain = BackgroundSound.start(trackId)!;
    const wind = BackgroundSound.start(otherId)!;

    service.remove('audio', [trackId]);

    expect(stopMusic).toHaveBeenCalledTimes(1);
    expect(rain.isOn).toBe(false);
    expect(wind.isOn).toBe(true);
    expect(AssetRemoval.get(trackId)?.kind).toBe('audio');
  });

  it('stops the cut-in shown when it plays a sound being removed, and leaves one with another sound', () => {
    const launcher = new CutInLauncher('CutInLauncher');
    launcher.initialize();
    const cutIn = new CutIn('cut-in-1');
    cutIn.initialize();
    cutIn.audioIdentifier = trackId;
    launcher.launchCutInIdentifier = cutIn.identifier;
    launcher.launchIsStart = true;
    const stopCutIn = vi.spyOn(launcher, 'stopCutIn').mockImplementation(() => {});

    service.remove('audio', [otherId]);
    expect(stopCutIn).not.toHaveBeenCalled();
    service.remove('audio', [trackId]);

    expect(stopCutIn.mock.calls).toEqual([[cutIn]]);
  });

  it('puts back for the room, as the GM alone may', () => {
    AssetRemoval.remove(pictureId, 'image');

    isGameMaster = false;
    expect(service.putBack(pictureId)).toBe(false);
    expect(AssetRemoval.get(pictureId)?.isRemoved).toBe(true);

    isGameMaster = true;
    expect(service.putBack(pictureId)).toBe(true);
    expect(AssetRemoval.get(pictureId)?.isRemoved).toBe(false);
  });

  it('counts no background sound that is off, which only keeps the sound it last played', () => {
    BackgroundSound.start(trackId)!.stop();

    expect(service.countUses([trackId])).toBe(0);
    BackgroundSound.start(trackId);
    expect(service.countUses([trackId])).toBe(1);
  });

  it('counts what uses any of them, leaving out tags, removals and chat', () => {
    const table = new GameTable('table-1');
    table.initialize();
    table.imageIdentifier = pictureId;
    const other = new GameTable('table-2');
    other.initialize();
    other.backgroundImageIdentifier = otherId;
    ImageTag.create(pictureId);
    new AudioTag(`audiotag_${trackId}`).initialize();
    AssetRemoval.remove(pictureId, 'image');
    const said = new ChatMessage('said');
    said.initialize();
    said.imageIdentifier = pictureId;

    expect(service.countUses([pictureId])).toBe(1);
    expect(service.countUses([pictureId, otherId])).toBe(2);
    expect(service.countUses([trackId])).toBe(0);
    expect(service.countUses([])).toBe(0);
  });

  describe('asking first', () => {
    it('says how many go, how many things use them and how to bring them back, then removes them and says so', async () => {
      const t = TestBed.inject(TRANSLATE_FN);
      const table = new GameTable('table-1');
      table.initialize();
      table.imageIdentifier = pictureId;

      expect(await service.removeAfterAsking('image', [pictureId, otherId])).toBe(2);

      expect(ask).toHaveBeenCalledTimes(1);
      const asked = ask.mock.calls[0][0];
      expect(asked.danger).toBe(true);
      expect(asked.title).toBe(t('feature.file.removal.imageTitle'));
      expect(asked.message.split('\n')).toEqual([
        t('feature.file.removal.imageConfirm', { count: 2 }),
        t('feature.file.removal.uses', { uses: 1 }),
        t('feature.file.removal.restore'),
      ]);
      expect(AssetRemoval.get(pictureId)?.isRemoved).toBe(true);
      expect(show).toHaveBeenCalledWith(t('feature.file.removal.imageRemoved', { count: 2 }));
    });

    it('leaves out how many use them when nothing does, and removes nothing when told no', async () => {
      const t = TestBed.inject(TRANSLATE_FN);
      ask.mockResolvedValue(false);

      expect(await service.removeAfterAsking('audio', [trackId])).toBe(0);

      expect(ask.mock.calls[0][0].message.split('\n')).toEqual([
        t('feature.file.removal.audioConfirm', { count: 1 }),
        t('feature.file.removal.restore'),
      ]);
      expect(AssetRemoval.all()).toEqual([]);
      expect(show).not.toHaveBeenCalled();
    });

    it('asks nothing of anyone but the GM, nor about nothing removable, which it says may not be removed', async () => {
      const t = TestBed.inject(TRANSLATE_FN);
      isGameMaster = false;
      expect(await service.removeAfterAsking('image', [pictureId])).toBe(0);
      expect(show).not.toHaveBeenCalled();
      isGameMaster = true;
      expect(await service.removeAfterAsking('image', ['none_icon'])).toBe(0);

      expect(ask).not.toHaveBeenCalled();
      expect(show.mock.calls).toEqual([[t('feature.file.removal.notRemovable')]]);
    });
  });

  describe('on a room server', () => {
    let remove: MockInstance<AssetHttpStore['remove']>;

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      vi.spyOn(Network, 'transport', 'get').mockReturnValue('server');
      vi.spyOn(AssetHttpStore.instance, 'isEnabled', 'get').mockReturnValue(true);
      remove = vi.spyOn(AssetHttpStore.instance, 'remove');
    });

    it('takes each out of the room’s store too', async () => {
      remove.mockResolvedValue('removed');

      service.remove('image', [pictureId, otherId]);
      await vi.advanceTimersByTimeAsync(0);

      expect(remove.mock.calls).toEqual([[pictureId], [otherId]]);
    });

    it('asks the store again a few times when it could not be asked, and not when it said no', async () => {
      remove.mockResolvedValue('failed' satisfies AssetRemovalResult);
      service.remove('image', [pictureId]);
      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 2 ** (ASSET_RETRY_LIMIT + 1));
      expect(remove).toHaveBeenCalledTimes(1 + ASSET_RETRY_LIMIT);

      remove.mockClear().mockResolvedValue('refused');
      service.remove('image', [otherId]);
      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 2 ** (ASSET_RETRY_LIMIT + 1));
      expect(remove).toHaveBeenCalledTimes(1);
    });

    it('puts the bytes up again when the room put them back while the store was taking them out', async () => {
      let land!: (result: AssetRemovalResult) => void;
      remove.mockReturnValue(new Promise((resolve) => (land = resolve)));
      const putUp = vi.spyOn(ImageStorage.instance, 'putUpAgain').mockImplementation(() => {});
      const putUpSound = vi.spyOn(AudioStorage.instance, 'putUpAgain').mockImplementation(() => {});
      service.remove('image', [pictureId]);

      AssetRemoval.restore(pictureId);
      land('removed');
      await vi.advanceTimersByTimeAsync(0);

      expect(putUp.mock.calls).toEqual([[pictureId]]);
      expect(putUpSound).not.toHaveBeenCalled();
    });

    it('takes out of the store again, as the GM, what the room keeps removed, whoever removed it', async () => {
      remove.mockResolvedValue('removed');
      AssetRemoval.remove(pictureId, 'image');
      AssetRemoval.remove(otherId, 'image');
      AssetRemoval.restore(otherId);

      isGameMaster = false;
      service.takeOut([pictureId, otherId, trackId]);
      isGameMaster = true;
      service.takeOut([pictureId, otherId, trackId]);
      await vi.advanceTimersByTimeAsync(0);

      expect(remove.mock.calls).toEqual([[pictureId]]);
    });

    it.each([
      ['the seat has gone into another room', () => vi.spyOn(Network, 'roomKey', 'get').mockReturnValue('room-b')],
      ['the room has put it back', () => AssetRemoval.restore(pictureId)],
    ])('asks the store no more once %s', async (_label, meanwhile) => {
      vi.spyOn(Network, 'roomKey', 'get').mockReturnValue('room-a');
      remove.mockResolvedValue('failed');
      service.remove('image', [pictureId]);
      await vi.advanceTimersByTimeAsync(0);

      meanwhile();
      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 2 ** (ASSET_RETRY_LIMIT + 1));

      expect(remove).toHaveBeenCalledTimes(1);
    });

    it('asks no store away from a room server', async () => {
      vi.spyOn(Network, 'transport', 'get').mockReturnValue('skyway');

      service.remove('image', [pictureId]);
      await vi.advanceTimersByTimeAsync(0);

      expect(remove).not.toHaveBeenCalled();
    });
  });
});
