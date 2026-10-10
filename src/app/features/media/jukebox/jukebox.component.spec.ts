import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { PersonalVolumeService } from '@axe/application/media/personal-volume.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ContextMenuAction, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioPlayer, VolumeType } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { LoopPlayer } from '@axe/core/storage/loop-player';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AUDIO_TAG_BGS, AudioTag } from '@axe/domain/media/audio-tag';
import { BackgroundSound } from '@axe/domain/media/background-sound';
import { CutInLauncher } from '@axe/domain/media/cut-in-launcher';
import { Jukebox } from '@axe/domain/media/jukebox';
import { Playlist } from '@axe/domain/media/playlist';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { BackgroundSoundPlaybackService } from '@axe/features/media/background-sound-playback.service';
import { JukeboxComponent } from '@axe/features/media/jukebox/jukebox.component';
import { JukeboxPlaybackService } from '@axe/features/media/jukebox-playback.service';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { expectPanelDragRecovery, PanelDragTestHostComponent } from '@axe/testing/panel-drag-recovery';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function makeReadyAudio(identifier: string, name?: string): AudioFile {
  const audio = AudioFile.createEmpty(identifier);
  const ctx = (audio as unknown as { context: Record<string, unknown> }).context;
  ctx['blob'] = new Blob(['x']);
  ctx['url'] = 'blob:x';
  ctx['name'] = name ?? identifier;
  return audio;
}

function ensureJukeboxAndLauncher() {
  if (!ObjectStore.instance.get<Jukebox>('Jukebox')) {
    const jukebox = new Jukebox('Jukebox');
    jukebox.initialize();
  }
  if (!ObjectStore.instance.get<CutInLauncher>('CutInLauncher')) {
    const cutInLauncher = new CutInLauncher('CutInLauncher');
    cutInLauncher.initialize();
  }
}

describe('JukeboxComponent', () => {
  let component: JukeboxComponent;
  let fixture: ComponentFixture<JukeboxComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [JukeboxComponent, PanelDragTestHostComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    ensureJukeboxAndLauncher();
    fixture = TestBed.createComponent(JukeboxComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    AudioStorage.instance.audios.forEach((a) => AudioStorage.instance.delete(a.identifier));
    const allTags = ObjectStore.instance.getObjects(AudioTag);
    allTags.forEach((t) => ObjectStore.instance.delete(t, false));
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  it('lets the panel take the pointer again once the drag ends', async () => {
    await expectPanelDragRecovery(JukeboxComponent, {
      beforeOpen: () => {
        ensureJukeboxAndLauncher();
      },
    });
  });

  describe('the volumes', () => {
    it('opens every one of this player’s sound settings from beside their own volumes', async () => {
      const open = vi.spyOn(TestBed.inject(RoomPanelService), 'open').mockImplementation(() => {});
      await fixture.whenStable();

      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLButtonElement>('[data-testid="jukebox-open-sound-settings"]')!
        .click();

      expect(open).toHaveBeenCalledWith('soundSettings', expect.anything());
    });

    it('turns the music off for this player alone from its row, and back on', async () => {
      vi.spyOn(AudioPlayer, 'setChannelVolume').mockImplementation(() => {});
      const volumes = TestBed.inject(PersonalVolumeService);
      await fixture.whenStable();
      const mute = () =>
        (fixture.nativeElement as HTMLElement)
          .querySelector('input[name="bgm-volume"]')!
          .closest('ui-volume-row')!
          .querySelector<HTMLButtonElement>('[data-testid="volume-row-mute"]')!;

      mute().click();
      expect(volumes.isMuted('bgm')).toBe(true);

      await fixture.whenStable();
      mute().click();
      expect(volumes.isMuted('bgm')).toBe(false);
    });

    it('sets this player’s own volumes apart from the room’s, saying which is which', async () => {
      const t = TestBed.inject(TRANSLATE_FN);
      await fixture.whenStable();
      const root = fixture.nativeElement as HTMLElement;
      const own = root.querySelector('[data-testid="jukebox-own-volumes"]')!;
      const room = root.querySelector('[data-testid="jukebox-room-volumes"]')!;

      expect(own.textContent).toContain(t('feature.media.jukebox.ownVolumeHeading'));
      expect(own.textContent).toContain(t('feature.media.jukebox.ownVolumeNote'));
      expect(room.textContent).toContain(t('feature.media.jukebox.roomVolumeHeading'));
      const order = [
        own,
        root.querySelector('input[name="background-volume"]')!,
        room,
        root.querySelector('input[name="room-volume"]')!,
      ];
      for (let i = 1; i < order.length; i++) {
        expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
    });
  });

  describe('the room volume', () => {
    function roomSlider(): HTMLInputElement {
      return (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[name="room-volume"]')!;
    }

    function config(): Config {
      if (!ObjectStore.instance.get<Config>('Config')) new Config('Config').initialize();
      return ObjectStore.instance.get<Config>('Config')!;
    }

    beforeEach(() => {
      PeerCursor.createMyCursor();
      config().roomVolume = 1;
      vi.spyOn(AudioPlayer, 'setChannelVolume').mockImplementation(() => {});
    });

    it('is left alone for a player, who cannot move it', async () => {
      PeerCursor.myCursor.role = PeerRole.Player;
      await fixture.whenStable();

      component.roomVolume = 0.4;

      expect(roomSlider().disabled).toBe(true);
      expect(config().roomVolume).toBe(1);
    });

    it('is moved by the game master, for the whole room', async () => {
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      await fixture.whenStable();

      component.roomVolume = 0.4;

      expect(roomSlider().disabled).toBe(false);
      expect(config().roomVolume).toBe(0.4);
    });

    it('lists the room’s volume for BGM, SE and background sounds under its overall one', async () => {
      await fixture.whenStable();

      const names = [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('input[type="range"]'),
      ]
        .map((input) => input.name)
        .filter((name) => name.startsWith('room-'));

      expect(names).toEqual(['room-volume', 'room-bgm-volume', 'room-se-volume', 'room-background-volume']);
    });

    it('lets the game master turn the room’s BGM down for everyone, and not a player', async () => {
      const bgm = () =>
        (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[name="room-bgm-volume"]')!;
      PeerCursor.myCursor.role = PeerRole.Player;
      await fixture.whenStable();
      component.setRoomVolumeOf('bgm', 0.4);
      expect(bgm().disabled).toBe(true);
      expect(config().roomVolumes.bgm).toBe(1);

      PeerCursor.myCursor.role = PeerRole.GameMaster;
      await fixture.whenStable();
      component.setRoomVolumeOf('bgm', 0.4);
      await fixture.whenStable();

      expect(bgm().disabled).toBe(false);
      expect(config().roomVolumes.bgm).toBe(0.4);
      expect(bgm().valueAsNumber).toBeCloseTo(0.4);
    });

    it('asks for no tick of its own before the game master can move it', async () => {
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      await fixture.whenStable();

      expect((fixture.nativeElement as HTMLElement).querySelector('input[name="room-volume-change"]')).toBeNull();
    });
  });

  describe('what each role may touch', () => {
    const control = (testId: string) =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!;
    const titled = (title: string) =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(`button[title="${title}"]`)!;
    const transport = ['jukebox-prev', 'jukebox-play-pause', 'jukebox-next'];
    const modes = ['jukebox-shuffle', 'jukebox-repeat'];

    beforeEach(() => {
      PeerCursor.createMyCursor();
      AudioStorage.instance.add(makeReadyAudio('song'));
      AudioStorage.instance.add(makeReadyAudio('other'));
      ObjectStore.instance.get<Playlist>(Playlist.DEFAULT_IDENTIFIER)?.destroy();
      new Playlist(Playlist.DEFAULT_IDENTIFIER).initialize();
      ObjectStore.instance.get<Playlist>(Playlist.DEFAULT_IDENTIFIER)!.entries = ['song', 'other'];
      vi.spyOn(AudioPlayer.prototype, 'play').mockImplementation(() => {});
      vi.spyOn(AudioPlayer.prototype, 'stop').mockImplementation(() => {});
      component.jukebox.play('song');
    });

    it('greys out every control of the room’s music for a guest, but the preview', async () => {
      const t = TestBed.inject(TRANSLATE_FN);
      PeerCursor.myCursor.role = PeerRole.Guest;
      await fixture.whenStable();

      for (const testId of [...transport, ...modes]) expect(control(testId).disabled, testId).toBe(true);
      expect(titled(t('feature.media.jukebox.playBGM')).disabled).toBe(true);
      expect(titled(t('feature.media.jukebox.stop')).disabled).toBe(true);
      expect(titled(t('feature.media.jukebox.preview')).disabled).toBe(false);
    });

    it('lets a player play the room’s music, and leaves shuffle and repeat to the game master', async () => {
      const t = TestBed.inject(TRANSLATE_FN);
      PeerCursor.myCursor.role = PeerRole.Player;
      await fixture.whenStable();

      for (const testId of transport) expect(control(testId).disabled, testId).toBe(false);
      for (const testId of modes) {
        expect(control(testId).disabled, testId).toBe(true);
        expect(control(testId).title, testId).toContain(t('feature.media.jukebox.gmOnlySuffix'));
      }
    });

    it('takes shuffle and repeat back from the game master who becomes a player', async () => {
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      await fixture.whenStable();
      for (const testId of modes) expect(control(testId).disabled, testId).toBe(false);

      PeerCursor.myCursor.role = PeerRole.Player;
      TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
      await fixture.whenStable();

      for (const testId of modes) expect(control(testId).disabled, testId).toBe(true);
    });

    it('leaves a guest’s clicks on the room’s playlists and tags undone', async () => {
      PeerCursor.myCursor.role = PeerRole.Guest;
      await fixture.whenStable();
      const playlists = ObjectStore.instance.getObjects(Playlist).length;
      const song = AudioStorage.instance.get('song')!;

      component.removeFromPlaylist(song);
      component.setTagOf(AudioStorage.instance.get('other')!, 'SE');
      component.createPlaylist();
      component.toggleSeekLock();

      expect(ObjectStore.instance.get<Playlist>(Playlist.DEFAULT_IDENTIFIER)!.entries).toEqual(['song', 'other']);
      expect(component.getTagOf(AudioStorage.instance.get('other')!)).toBe('BGM');
      expect(ObjectStore.instance.getObjects(Playlist)).toHaveLength(playlists);
      expect(component.jukebox.isSeekLocked).toBe(true);
    });
  });

  describe('the time beside the seek bar', () => {
    function shownTime(): string {
      return (fixture.nativeElement as HTMLElement).querySelector('[data-testid="jukebox-time"]')!.textContent!.trim();
    }

    it('shows nothing while no track is held', async () => {
      await fixture.whenStable();

      expect(shownTime()).toBe('');
    });

    it('shows where a held track stands', async () => {
      const jukebox = component.jukebox;
      jukebox.audioIdentifier = 'held';
      jukebox.startTime = 20;
      jukebox.isPlaying = false;
      await fixture.whenStable();

      expect(shownTime()).toBe('0:20 / —');
    });
  });

  describe('dragging the seek bar', () => {
    function seekBarAt(value: number): Event {
      const input = document.createElement('input');
      input.type = 'range';
      input.value = String(value);
      return { target: input } as unknown as Event;
    }

    it('holds the bar where it is dragged to while the track plays on, and seeks there once it is let go', () => {
      const playback = TestBed.inject(JukeboxPlaybackService);
      vi.spyOn(playback, 'duration').mockReturnValue(200);
      const position = vi.spyOn(playback, 'position').mockReturnValue(20);
      const seek = vi.spyOn(playback, 'seek').mockImplementation(() => undefined);

      component.onSeekInput(seekBarAt(75));
      position.mockReturnValue(40);
      expect(component.displayProgress()).toBe(0.75);

      component.onSeekCommit(seekBarAt(75));

      expect(seek).toHaveBeenCalledWith(150);
      expect(component.isSeeking()).toBe(false);
    });
  });

  describe('getTagOf / setTagOf', () => {
    it('calls an untagged track music', () => {
      const audio = makeReadyAudio('tag-test-01');
      AudioStorage.instance.add(audio);

      expect(component.getTagOf(audio)).toBe('BGM');
    });

    it('returns the tag a track carries', () => {
      const audio = makeReadyAudio('tag-test-02');
      AudioStorage.instance.add(audio);
      const tag = AudioTag.create('tag-test-02');
      tag.tag = 'SE';

      expect(component.getTagOf(audio)).toBe('SE');
    });

    it('sets a tag on a track that has none', () => {
      const audio = makeReadyAudio('tag-test-03');
      AudioStorage.instance.add(audio);

      component.setTagOf(audio, '環境音');

      const tag = AudioTag.get('tag-test-03');
      expect(tag).toBeTruthy();
      expect(tag!.tag).toBe('環境音');
    });

    it('changes the tag a track carries', () => {
      const audio = makeReadyAudio('tag-test-04');
      AudioStorage.instance.add(audio);
      AudioTag.create('tag-test-04');

      component.setTagOf(audio, 'SE');
      expect(AudioTag.get('tag-test-04')!.tag).toBe('SE');
    });
  });

  describe('playBGM / stopBGM', () => {
    it('stops the untagged cut-ins and plays the music', () => {
      const audio = makeReadyAudio('play-bgm-01');
      AudioStorage.instance.add(audio);

      const stopBlankSpy = vi
        .spyOn(ObjectStore.instance.get<CutInLauncher>('CutInLauncher')!, 'stopBlankTagCutIn')
        .mockImplementation(() => {});
      const playSpy = vi.spyOn(component.jukebox, 'play').mockImplementation(() => {});

      component.playBGM(audio);

      expect(stopBlankSpy).toHaveBeenCalledOnce();
      expect(playSpy).toHaveBeenCalledWith('play-bgm-01', true); // BGM → loop=true
    });

    it('plays a sound effect once rather than looping it', () => {
      const audio = makeReadyAudio('play-se-01');
      AudioStorage.instance.add(audio);
      const tag = AudioTag.create('play-se-01');
      tag.tag = 'SE';

      vi.spyOn(ObjectStore.instance.get<CutInLauncher>('CutInLauncher')!, 'stopBlankTagCutIn').mockImplementation(
        () => {}
      );
      const playSpy = vi.spyOn(component.jukebox, 'play').mockImplementation(() => {});

      component.playBGM(audio);

      expect(playSpy).toHaveBeenCalledWith('play-se-01', false); // SE → loop=false
    });

    it('stops the music only when it is the track that is playing', () => {
      const audio = makeReadyAudio('stop-bgm-01');
      AudioStorage.instance.add(audio);

      vi.spyOn(AudioPlayer.prototype, 'play').mockImplementation(() => {});
      vi.spyOn(AudioPlayer.prototype, 'stop').mockImplementation(() => {});

      // when the jukebox is playing that track
      component.jukebox.audioIdentifier = 'stop-bgm-01';
      const stopSpy = vi.spyOn(component.jukebox, 'stop').mockImplementation(() => {});

      component.stopBGM(audio);
      expect(stopSpy).toHaveBeenCalledOnce();
    });

    it('leaves another track playing alone', () => {
      const audio = makeReadyAudio('stop-bgm-02');
      AudioStorage.instance.add(audio);

      component.jukebox.audioIdentifier = 'other-audio'; // 異なる identifier
      const otherAudio = makeReadyAudio('other-audio');
      AudioStorage.instance.add(otherAudio);

      const stopSpy = vi.spyOn(component.jukebox, 'stop').mockImplementation(() => {});

      component.stopBGM(audio);
      expect(stopSpy).not.toHaveBeenCalled();
    });
  });

  describe('background sounds', () => {
    function addBackgroundSound(identifier: string, name: string): AudioFile {
      const audio = makeReadyAudio(identifier, name);
      AudioStorage.instance.add(audio);
      AudioTag.create(identifier).tag = AUDIO_TAG_BGS;
      return audio;
    }

    function strip(): HTMLElement | null {
      return fixture.nativeElement.querySelector('[data-testid="jukebox-background-sounds"]');
    }

    function rows(): HTMLElement[] {
      return Array.from(fixture.nativeElement.querySelectorAll('[data-testid="jukebox-background-sound"]'));
    }

    function slider(value: number): Event {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '1';
      input.step = '0.01';
      input.value = String(value);
      return { target: input } as unknown as Event;
    }

    beforeEach(() => {
      vi.spyOn(LoopPlayer.prototype, 'start').mockImplementation(() => {});
      vi.spyOn(LoopPlayer.prototype, 'stop').mockImplementation(() => {});
    });

    it('shows no strip while none is playing', async () => {
      addBackgroundSound('rain', 'Rain');
      await fixture.whenStable();

      expect(strip()).toBeNull();
    });

    it('lists the ones playing in the order they were started, each with its name', async () => {
      addBackgroundSound('rain', 'Rain');
      addBackgroundSound('fire', 'Campfire');
      BackgroundSound.start('rain')!.startedAt = 100;
      BackgroundSound.start('fire')!.startedAt = 200;
      await fixture.whenStable();

      expect(rows().map((row) => row.querySelector('span')?.textContent?.trim())).toEqual(['Rain', 'Campfire']);
    });

    it('stops one for the room from its row, and the strip goes once none is left', async () => {
      addBackgroundSound('rain', 'Rain');
      BackgroundSound.start('rain');
      await fixture.whenStable();

      rows()[0].querySelector<HTMLButtonElement>('[data-testid="jukebox-background-stop"]')!.click();
      await fixture.whenStable();

      expect(BackgroundSound.of('rain')!.isOn).toBe(false);
      expect(strip()).toBeNull();
    });

    it('stops them all at once', async () => {
      addBackgroundSound('rain', 'Rain');
      addBackgroundSound('fire', 'Campfire');
      BackgroundSound.start('rain');
      BackgroundSound.start('fire');
      await fixture.whenStable();

      fixture.nativeElement.querySelector('[data-testid="jukebox-background-stop-all"]').click();

      expect(BackgroundSound.playing()).toEqual([]);
    });

    it('starts and stops one for the room from the library, leaving the music alone', async () => {
      const rain = addBackgroundSound('rain', 'Rain');
      const music = vi.spyOn(component.jukebox, 'play');
      await fixture.whenStable();
      const toggle = () =>
        (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
          '[data-testid="jukebox-background-toggle"]'
        )!;

      const backgroundSounds = TestBed.inject(BackgroundSoundPlaybackService);

      toggle().click();
      await fixture.whenStable();
      expect(backgroundSounds.isPlaying(rain)).toBe(true);

      toggle().click();
      await fixture.whenStable();
      expect(backgroundSounds.isPlaying(rain)).toBe(false);
      expect(music).not.toHaveBeenCalled();
    });

    it('lets the room volume be heard while its slider is dragged, and shares it once let go', async () => {
      addBackgroundSound('rain', 'Rain');
      const sound = BackgroundSound.start('rain')!;
      const preview = vi.spyOn(sound, 'previewVolume');

      component.onBackgroundVolumeInput('rain', slider(0.3));
      expect(preview).toHaveBeenCalledWith(0.3);
      expect(sound.volume).toBe(1);

      component.onBackgroundVolumeChange('rain', slider(0.3));
      expect(sound.volume).toBe(0.3);
    });

    it('sets this player’s own background volume, scaled by the room volume', () => {
      if (!ObjectStore.instance.get<Config>('Config')) new Config('Config').initialize();
      ObjectStore.instance.get<Config>('Config')!.roomVolume = 0.5;
      const channel = vi.spyOn(AudioPlayer, 'setChannelVolume').mockImplementation(() => {});

      component.backgroundVolume = 0.8;

      expect(component.jukebox.backgroundVolume).toBe(0.8);
      expect(channel).toHaveBeenCalledWith(VolumeType.BACKGROUND, expect.closeTo(0.4));
    });

    it('offers the background sounds as a tag of their own, shown by its translated name', async () => {
      const t = TestBed.inject(TRANSLATE_FN);
      await fixture.whenStable();

      expect(component.tagList()).toContain(AUDIO_TAG_BGS);
      const playback = TestBed.inject(JukeboxPlaybackService);
      expect(playback.tagLabel(AUDIO_TAG_BGS)).toBe(t('feature.media.jukebox.tagBgs'));
      expect(playback.tagLabel('SE')).toBe('SE');
      const chips = Array.from(fixture.nativeElement.querySelectorAll('button')).map((button) =>
        (button as HTMLElement).textContent?.trim()
      );
      expect(chips).toContain(t('feature.media.jukebox.tagBgs'));
    });
  });

  describe('moving a track of the playlist from its menu', () => {
    let playlist: Playlist;

    beforeEach(() => {
      playlist = ObjectStore.instance.get<Playlist>('Playlist') ?? new Playlist('Playlist');
      if (!ObjectStore.instance.get<Playlist>('Playlist')) playlist.initialize();
    });

    afterEach(() => {
      playlist.entries = [];
    });

    it('moves a track beside the one shown next to it, past a hidden one in between', () => {
      const t = TestBed.inject(TRANSLATE_FN);
      for (const id of ['pl-a', 'pl-hidden', 'pl-b', 'pl-c']) AudioStorage.instance.add(makeReadyAudio(id));
      AudioStorage.instance.get('pl-hidden')!.isHidden = true;
      playlist.entries = ['pl-a', 'pl-hidden', 'pl-b', 'pl-c'];
      vi.spyOn(TestBed.inject(PointerDeviceService), 'isAllowedToOpenContextMenu', 'get').mockReturnValue(true);
      const open = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);

      const event = new MouseEvent('contextmenu', { cancelable: true });
      component.onPlaylistContextMenu(event, AudioStorage.instance.get('pl-c')!);
      const actions = open.mock.calls[0][1] as ContextMenuAction[];
      actions.find((action) => action.name === t('common.reorder.up'))?.action?.();

      expect(event.defaultPrevented).toBe(true);
      expect(playlist.entries).toEqual(['pl-a', 'pl-hidden', 'pl-c', 'pl-b']);
    });
  });

  describe('stopSE / isSePlaying', () => {
    it('stops a sound effect by identifier', () => {
      const audio = makeReadyAudio('se-stop-01');
      const stopSpy = vi.spyOn(component.jukebox, 'stopSE').mockImplementation(() => {});

      component.stopSE(audio);

      expect(stopSpy).toHaveBeenCalledWith('se-stop-01');
    });

    it('reports whether an effect is playing', () => {
      const audio = makeReadyAudio('se-playing-01');
      vi.spyOn(component.jukebox, 'isSePlaying').mockReturnValue(true);

      expect(component.isSePlaying(audio)).toBe(true);
    });
  });

  describe('keeping several playlists', () => {
    let first: Playlist;

    beforeEach(() => {
      first = new Playlist(Playlist.DEFAULT_IDENTIFIER);
      first.initialize();
    });

    function openMenuOf(open: (event: MouseEvent) => void): ContextMenuAction[] {
      vi.spyOn(TestBed.inject(PointerDeviceService), 'isAllowedToOpenContextMenu', 'get').mockReturnValue(true);
      const menu = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);
      open(new MouseEvent('contextmenu', { cancelable: true }));
      return (menu.mock.calls[0]?.[1] ?? []) as ContextMenuAction[];
    }

    it('makes a new playlist and shows it, so the library adds to that one', async () => {
      const t = TestBed.inject(TRANSLATE_FN);
      AudioStorage.instance.add(makeReadyAudio('lib-a'));

      component.createPlaylist();
      await fixture.whenStable();
      component.addToPlaylist(AudioStorage.instance.get('lib-a')!);

      const made = Playlist.all()[1];
      expect(component.viewedPlaylist()?.identifier).toBe(made.identifier);
      expect(made.name).toBe(t('feature.media.jukebox.playlistNewName', { number: 2 }));
      expect(made.entries).toEqual(['lib-a']);
      expect(first.entries).toEqual([]);
    });

    it('shows the playlist the room plays through until another is picked', async () => {
      const battle = Playlist.create('Battle');
      component.jukebox.playlistIdentifier = battle.identifier;
      await fixture.whenStable();
      expect(component.viewedPlaylist()?.identifier).toBe(battle.identifier);

      component.choosePlaylist(first.identifier);

      expect(component.viewedPlaylist()?.identifier).toBe(first.identifier);
    });

    it('renames the playlist shown, and an emptied name gives back its stand-in', async () => {
      const t = TestBed.inject(TRANSLATE_FN);

      component.renamePlaylist('  Town  ');
      await fixture.whenStable();
      expect(first.name).toBe('Town');
      expect(component.viewedPlaylist()?.label).toBe('Town');

      component.renamePlaylist('');
      await fixture.whenStable();
      expect(component.viewedPlaylist()?.label).toBe(t('feature.media.jukebox.playlistDefaultName'));
    });

    it('deletes the playlist shown once that is confirmed, and the room goes on through its first', async () => {
      const battle = Playlist.create('Battle');
      component.jukebox.playlistIdentifier = battle.identifier;
      component.choosePlaylist(battle.identifier);
      await fixture.whenStable();
      vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);

      await component.deletePlaylist();
      await fixture.whenStable();

      expect(Playlist.all()).toEqual([first]);
      expect(component.jukebox.playlist).toBe(first);
      expect(component.viewedPlaylist()?.identifier).toBe(first.identifier);
    });

    it('keeps the playlist when the deletion is not confirmed', async () => {
      const battle = Playlist.create('Battle');
      component.choosePlaylist(battle.identifier);
      await fixture.whenStable();
      vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);

      await component.deletePlaylist();

      expect(Playlist.all()).toContain(battle);
    });

    it('never deletes the room’s first playlist', async () => {
      const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);

      await component.deletePlaylist();

      expect(ask).not.toHaveBeenCalled();
      expect(Playlist.all()).toEqual([first]);
    });

    it('keeps the tag of a track on any playlist, not only the one shown', async () => {
      AudioStorage.instance.add(makeReadyAudio('held'));
      const battle = Playlist.create('Battle');
      battle.addEntry('held');
      await fixture.whenStable();

      expect(component.viewedPlaylist()?.identifier).toBe(first.identifier);
      expect(component.isOnAnyPlaylist(AudioStorage.instance.get('held')!)).toBe(true);
    });

    it('moves a track to another playlist from its menu', async () => {
      const t = TestBed.inject(TRANSLATE_FN);
      AudioStorage.instance.add(makeReadyAudio('song'));
      first.entries = ['song'];
      const battle = Playlist.create('Battle');
      await fixture.whenStable();

      const actions = openMenuOf((event) => component.onPlaylistContextMenu(event, AudioStorage.instance.get('song')!));
      const move = actions.find((action) => action.name === t('feature.media.jukebox.moveToPlaylist'));
      move?.subActions?.find((target) => target.name === 'Battle')?.action?.();

      expect(first.entries).toEqual([]);
      expect(battle.entries).toEqual(['song']);
    });

    it('copies a track to another playlist from its menu', async () => {
      const t = TestBed.inject(TRANSLATE_FN);
      AudioStorage.instance.add(makeReadyAudio('song'));
      first.entries = ['song'];
      const battle = Playlist.create('Battle');
      await fixture.whenStable();

      const actions = openMenuOf((event) => component.onPlaylistContextMenu(event, AudioStorage.instance.get('song')!));
      const copy = actions.find((action) => action.name === t('feature.media.jukebox.copyToPlaylist'));
      copy?.subActions?.find((target) => target.name === 'Battle')?.action?.();

      expect(first.entries).toEqual(['song']);
      expect(battle.entries).toEqual(['song']);
    });

    it('puts a library track on a playlist from its menu, and takes it off again', async () => {
      AudioStorage.instance.add(makeReadyAudio('song'));
      const battle = Playlist.create('Battle');
      await fixture.whenStable();
      const pick = () =>
        openMenuOf((event) =>
          component.onLibraryContextMenu(event, AudioStorage.instance.get('song')!)
        )[0]?.subActions?.find((target) => target.name.endsWith('Battle'));

      pick()?.action?.();
      expect(battle.entries).toEqual(['song']);

      vi.restoreAllMocks();
      expect(pick()?.name).toBe('☑Battle');
      pick()?.action?.();
      expect(battle.entries).toEqual([]);
    });

    it('offers no playlist for a sound effect', () => {
      AudioStorage.instance.add(makeReadyAudio('se'));
      AudioTag.create('se').tag = 'SE';

      const actions = openMenuOf((event) => component.onLibraryContextMenu(event, AudioStorage.instance.get('se')!));

      expect(actions).toEqual([]);
    });

    it('plays a track of the playlist shown and goes on through that playlist', async () => {
      AudioStorage.instance.add(makeReadyAudio('song'));
      const battle = Playlist.create('Battle');
      battle.addEntry('song');
      component.choosePlaylist(battle.identifier);
      await fixture.whenStable();
      vi.spyOn(AudioPlayer.prototype, 'play').mockImplementation(() => {});

      component.playFromPlaylist(AudioStorage.instance.get('song')!);

      expect(component.jukebox.playlistIdentifier).toBe(battle.identifier);
      expect(component.jukebox.audioIdentifier).toBe('song');
    });
  });
});
