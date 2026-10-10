import { TestBed } from '@angular/core/testing';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { LoopPlayer } from '@axe/core/storage/loop-player';
import { AUDIO_TAG_BGS, AudioTag } from '@axe/domain/media/audio-tag';
import { BackgroundSound } from '@axe/domain/media/background-sound';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { BackgroundSoundPlaybackService } from '@axe/features/media/background-sound-playback.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function addBackgroundSound(identifier: string): AudioFile {
  const audio = AudioFile.createEmpty(identifier);
  const context = (audio as unknown as { context: Record<string, unknown> }).context;
  context['blob'] = new Blob(['x']);
  context['url'] = 'blob:x';
  AudioStorage.instance.add(audio);
  AudioTag.create(identifier).tag = AUDIO_TAG_BGS;
  return audio;
}

describe('BackgroundSoundPlaybackService', () => {
  let service: BackgroundSoundPlaybackService;

  function openAs(role: PeerRole): void {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = role;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    vi.spyOn(LoopPlayer.prototype, 'start').mockImplementation(() => {});
    vi.spyOn(LoopPlayer.prototype, 'stop').mockImplementation(() => {});
    service = TestBed.inject(BackgroundSoundPlaybackService);
  });

  afterEach(() => {
    BackgroundSound.stopAll();
    AudioStorage.instance.audios.forEach((audio) => AudioStorage.instance.delete(audio.identifier));
    vi.restoreAllMocks();
  });

  it('lets a player start a sound, set its volume and stop it for the room', () => {
    openAs(PeerRole.Player);
    const rain = addBackgroundSound('rain');

    service.toggle(rain);
    service.commitVolume('rain', 0.25);
    expect(BackgroundSound.of('rain')?.level).toBe(0.25);
    service.stop('rain');

    expect(service.canOperate()).toBe(true);
    expect(BackgroundSound.playing()).toEqual([]);
  });

  it('lets a guest start, stop and set none of them', () => {
    const rain = addBackgroundSound('rain');
    const fire = addBackgroundSound('fire');
    BackgroundSound.start('rain');
    openAs(PeerRole.Guest);
    const level = BackgroundSound.of('rain')!.level;

    service.toggle(fire);
    service.toggle(rain);
    service.stop('rain');
    service.stopAll();
    service.previewVolume('rain', 0.1);
    service.commitVolume('rain', 0.1);

    expect(service.canOperate()).toBe(false);
    expect(BackgroundSound.playing().map((sound) => sound.audioIdentifier)).toEqual(['rain']);
    expect(BackgroundSound.of('rain')!.level).toBe(level);
  });
});
