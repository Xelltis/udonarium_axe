import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ContextMenuAction, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioPlayer } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { CutInLauncher } from '@axe/domain/media/cut-in-launcher';
import { Jukebox } from '@axe/domain/media/jukebox';
import { Playlist } from '@axe/domain/media/playlist';
import { JukeboxComponent } from '@axe/features/media/jukebox/jukebox.component';
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

      const stopBlankSpy = vi.spyOn(component.cutInLauncher, 'stopBlankTagCutIn').mockImplementation(() => {});
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

      vi.spyOn(component.cutInLauncher, 'stopBlankTagCutIn').mockImplementation(() => {});
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
});
