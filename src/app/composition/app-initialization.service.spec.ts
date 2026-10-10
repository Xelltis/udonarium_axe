import { TestBed } from '@angular/core/testing';
import { PERSONAL_VOLUME_STORAGE_KEY } from '@axe/application/media/personal-volumes';
import { AppConfigService } from '@axe/composition/app-config.service';
import { AppInitializationService } from '@axe/composition/app-initialization.service';
import { AudioSharingSystem } from '@axe/core/storage/audio-sharing-system';
import { LoopPlayer } from '@axe/core/storage/loop-player';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Alarm } from '@axe/domain/alarm/alarm';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { BackgroundSound } from '@axe/domain/media/background-sound';
import { CutIn } from '@axe/domain/media/cut-in';
import { Jukebox } from '@axe/domain/media/jukebox';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { ReloadCheck } from '@axe/domain/peer/reload-check';
import { Vote } from '@axe/domain/vote/vote';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('AppInitializationService', () => {
  let service: AppInitializationService;
  let objectStore: ObjectStore;

  beforeEach(() => {
    PeerCursor.myCursor = null!;
    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS],
    });
    objectStore = TestBed.inject(ObjectStore);
    vi.spyOn(TestBed.inject(AppConfigService), 'initialize').mockImplementation(() => {});
    service = TestBed.inject(AppInitializationService);
  });

  afterEach(() => {
    PeerCursor.myCursor = null!;
    const presets = PresetSound as unknown as Record<string, string>;
    for (const key of Object.keys(presets)) presets[key] = '';
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('hands the volumes this browser remembers to the jukebox as it starts', () => {
    localStorage.setItem(PERSONAL_VOLUME_STORAGE_KEY, JSON.stringify({ bgm: 0.2, background: 0.3 }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    vi.spyOn(TestBed.inject(AppConfigService), 'initialize').mockImplementation(() => {});

    TestBed.inject(AppInitializationService).initialize();

    const jukebox = TestBed.inject(ObjectStore).get<Jukebox>('Jukebox')!;
    expect(jukebox.volume).toBe(0.2);
    expect(jukebox.backgroundVolume).toBe(0.3);
    expect(jukebox.seVolume).toBe(0.5);
  });

  describe('initialize()', () => {
    beforeEach(() => {
      service.initialize();
    });

    it('registers the domain objects with the object store', () => {
      expect(objectStore.get<DiceBot>('DiceBot')).toBeTruthy();
      expect(objectStore.get<Jukebox>('Jukebox')).toBeTruthy();
      expect(objectStore.get<Vote>('Vote')).toBeTruthy();
      expect(objectStore.get<Alarm>('Alarm')).toBeTruthy();
      expect(objectStore.get<ReloadCheck>('ReloadCheck')).toBeTruthy();
      expect(objectStore.get<SoundEffect>('SoundEffect')).toBeTruthy();
    });

    it('lays down the sample cut-ins, each with a face and sounds of its own', () => {
      const cutIns = objectStore.getObjects(CutIn);

      expect(cutIns.length).toBeGreaterThan(0);
      for (const cutIn of cutIns) {
        expect(cutIn.isComposed).toBe(true);
        expect(cutIn.scene?.layers.some((layer) => layer.imageIdentifier.length > 0)).toBe(true);
        expect(cutIn.scene?.soundList.length).toBeGreaterThan(0);
        for (const sound of cutIn.scene!.soundList) expect(sound.a).toBeTruthy();
      }
    });

    it('sets up the audio presets', () => {
      expect(PresetSound.dicePick).toBeTruthy();
      expect(PresetSound.dicePut).toBeTruthy();
      expect(PresetSound.diceRoll1).toBeTruthy();
      expect(PresetSound.diceRoll2).toBeTruthy();
      expect(PresetSound.cardDraw).toBeTruthy();
      expect(PresetSound.alarm).toBeTruthy();
    });

    it('sends the files of the music and of the background sounds playing before any other', () => {
      vi.spyOn(LoopPlayer.prototype, 'start').mockImplementation(() => {});
      objectStore.get<Jukebox>('Jukebox')!.audioIdentifier = 'bgm';
      BackgroundSound.start('rain');
      BackgroundSound.start('fire')!.stop();

      expect(AudioSharingSystem.instance.preferredIdentifiers()).toEqual(['bgm', 'rain']);
    });

    it('creates the cursor for this peer', () => {
      expect(PeerCursor.myCursor).toBeTruthy();
      expect(PeerCursor.myCursor.name).toBe('プレイヤー');
    });
  });
});
