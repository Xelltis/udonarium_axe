import { TestBed } from '@angular/core/testing';
import { RoomVolumeService } from '@axe/application/media/room-volume.service';
import { AudioPlayer, VolumeType } from '@axe/core/storage/audio-player';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Jukebox } from '@axe/domain/media/jukebox';
import { DEFAULT_ROOM_VOLUMES } from '@axe/domain/media/room-volumes';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('RoomVolumeService', () => {
  let heard: (type: VolumeType) => number | undefined;

  function open(role: PeerRole): RoomVolumeService {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = role;
    if (!ObjectStore.instance.get<Config>('Config')) new Config('Config').initialize();
    if (!ObjectStore.instance.get<Jukebox>('Jukebox')) new Jukebox('Jukebox').initialize();
    return TestBed.inject(RoomVolumeService);
  }

  const config = () => ObjectStore.instance.get<Config>('Config')!;

  beforeEach(() => {
    const set = vi.spyOn(AudioPlayer, 'setChannelVolume').mockImplementation(() => {});
    heard = (type) => set.mock.calls.filter(([called]) => called === type).at(-1)?.[1];
  });

  afterEach(() => vi.restoreAllMocks());

  it('reads full for every kind before the room turns one down', () => {
    const room = open(PeerRole.Player);

    expect(room.volumes()).toEqual(DEFAULT_ROOM_VOLUMES);
  });

  it('lets the game master set a kind for everyone, heard here at once', () => {
    const room = open(PeerRole.GameMaster);
    ObjectStore.instance.get<Jukebox>('Jukebox')!.setLevel(VolumeType.BACKGROUND, 0.5);

    room.setKind('background', 0.4);

    expect(config().roomVolumes.background).toBe(0.4);
    expect(room.volumes().background).toBe(0.4);
    expect(heard(VolumeType.BACKGROUND)).toBeCloseTo(0.2);
  });

  it('keeps a kind within what the room may set', () => {
    const room = open(PeerRole.GameMaster);

    room.setKind('bgm', 3);
    room.setKind('se', -1);

    expect(config().roomVolumes.bgm).toBe(2);
    expect(config().roomVolumes.se).toBe(0);
  });

  it('refuses a player who tries to set a kind', () => {
    const room = open(PeerRole.Player);

    room.setKind('handling', 0);

    expect(config().roomVolumes.handling).toBe(1);
  });
});
