import { TestBed } from '@angular/core/testing';
import { AssetRemovalService } from '@axe/application/file/asset-removal.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { Network } from '@axe/core/network/network';
import { AssetHttpStore, AssetRemovalResult } from '@axe/core/storage/asset-http-store';
import { ASSET_RETRY_DELAY_MS, ASSET_RETRY_LIMIT } from '@axe/core/storage/asset-retries';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { AssetRemoval } from '@axe/domain/media/asset-removal';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { BackgroundSound } from '@axe/domain/media/background-sound';
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

  beforeEach(() => {
    isGameMaster = true;
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
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

    it('asks no store away from a room server', async () => {
      vi.spyOn(Network, 'transport', 'get').mockReturnValue('skyway');

      service.remove('image', [pictureId]);
      await vi.advanceTimersByTimeAsync(0);

      expect(remove).not.toHaveBeenCalled();
    });
  });
});
