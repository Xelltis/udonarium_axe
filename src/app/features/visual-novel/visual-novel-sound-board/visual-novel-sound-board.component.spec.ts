import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { CutIn } from '@axe/domain/media/cut-in';
import { CutInLauncher } from '@axe/domain/media/cut-in-launcher';
import { Jukebox } from '@axe/domain/media/jukebox';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import {
  AttachedSound,
  VisualNovelSoundBoardComponent,
} from '@axe/features/visual-novel/visual-novel-sound-board/visual-novel-sound-board.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('VisualNovelSoundBoardComponent', () => {
  let fixture: ComponentFixture<VisualNovelSoundBoardComponent>;
  let board: VisualNovelSoundBoardComponent;

  function makeReadyAudio(identifier: string, name?: string): AudioFile {
    const audio = AudioFile.createEmpty(identifier);
    const ctx = (audio as unknown as { context: Record<string, unknown> }).context;
    ctx['blob'] = new Blob(['x']);
    ctx['url'] = 'blob:x';
    ctx['name'] = name ?? identifier;
    return audio;
  }

  function addAudio(identifier: string, tag: string, name?: string): AudioFile {
    const audio = makeReadyAudio(identifier, name);
    AudioStorage.instance.add(audio);
    AudioTag.create(identifier).tag = tag;
    return audio;
  }

  /** The tool registers its own sounds at start-up, which a test does not run. */
  function addPresetSound(file: string): string {
    const audio = AudioStorage.instance.add(`./assets/sounds/soundeffect-lab/${file}.mp3`);
    audio.isHidden = true;
    return audio.identifier;
  }

  function ensureJukebox(): Jukebox {
    let jukebox = ObjectStore.instance.get<Jukebox>('Jukebox');
    if (!jukebox) {
      jukebox = new Jukebox('Jukebox');
      jukebox.initialize();
    }
    return jukebox;
  }

  function create(): void {
    fixture = TestBed.createComponent(VisualNovelSoundBoardComponent);
    board = fixture.componentInstance;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [VisualNovelSoundBoardComponent], providers: [...TEST_PROVIDERS] });
    TestBed.inject(ObjectChangeService);
  });

  afterEach(() => {
    AudioStorage.instance.audios.forEach((audio) => AudioStorage.instance.delete(audio.identifier));
  });

  it('returns the sound-effect tracks alone', () => {
    addAudio('se-1', 'SE', 'ジャーン');
    addAudio('bgm-1', 'BGM', '戦闘曲');
    AudioStorage.instance.add(makeReadyAudio('no-tag', 'タグなし'));
    create();

    expect(board.soundEffects().map((a) => a.identifier)).toEqual(['se-1']);
    expect(board.bgmTracks().map((a) => a.identifier)).toEqual(expect.arrayContaining(['bgm-1', 'no-tag']));
  });

  it('plays and stops them through the jukebox', () => {
    const jukebox = ensureJukebox();
    const playSpy = vi.spyOn(jukebox, 'play').mockImplementation(() => undefined);
    const stopSpy = vi.spyOn(jukebox, 'stopSE').mockImplementation(() => undefined);
    const stopBgmSpy = vi.spyOn(jukebox, 'stop').mockImplementation(() => undefined);
    create();

    board.playSoundEffect('se-1');
    expect(playSpy).toHaveBeenCalledWith('se-1');

    board.stopSoundEffect('se-1');
    expect(stopSpy).toHaveBeenCalledWith('se-1');

    board.playBgm('bgm-1');
    expect(playSpy).toHaveBeenCalledWith('bgm-1');
    board.stopBgm();
    expect(stopBgmSpy).toHaveBeenCalled();
  });

  it('plays nothing for a guest, who may not touch the jukebox or the cut-ins', () => {
    const jukebox = ensureJukebox();
    const play = vi.spyOn(jukebox, 'play').mockImplementation(() => undefined);
    const stop = vi.spyOn(jukebox, 'stop').mockImplementation(() => undefined);
    const launcher = ObjectStore.instance.get<CutInLauncher>('CutInLauncher') ?? new CutInLauncher('CutInLauncher');
    launcher.initialize();
    const start = vi.spyOn(launcher, 'startCutIn').mockImplementation(() => undefined);
    const original = PeerCursor.myCursor;
    PeerCursor.myCursor = { role: PeerRole.Guest } as PeerCursor;
    try {
      create();
      board.playSoundEffect('se-1');
      board.playBgm('bgm-1');
      board.stopBgm();
      board.playCutIn('any');

      expect(play).not.toHaveBeenCalled();
      expect(stop).not.toHaveBeenCalled();
      expect(start).not.toHaveBeenCalled();
    } finally {
      PeerCursor.myCursor = original;
    }
  });

  it('reports what the jukebox is playing', () => {
    const jukebox = ensureJukebox();
    vi.spyOn(jukebox, 'isSePlaying').mockReturnValue(true);
    create();

    expect(board.isSoundEffectPlaying('se-1')).toBe(true);
  });

  it('offers the sounds the tool comes with, under their own names', () => {
    addPresetSound('barrier');
    addPresetSound('warp');
    create();

    const presets = board.presetSoundEffects();
    expect(presets.length).toBeGreaterThan(0);
    // Named rather than left as the file path, which says nothing about the sound.
    expect(presets.every((sound) => sound.name.length > 0 && !sound.name.includes('/'))).toBe(true);
    expect(presets.map((sound) => sound.name)).toEqual(
      [...presets.map((sound) => sound.name)].sort((a, b) => a.localeCompare(b, 'ja'))
    );
  });

  it('keeps the room own sounds apart from the built-in ones', () => {
    const audio = AudioStorage.instance.add('test://vn/door.mp3');
    AudioTag.create(audio.identifier).tag = 'SE';
    addPresetSound('barrier');
    create();
    TestBed.inject(ObjectChangeService).notifyChanged(audio.identifier);

    expect(board.soundEffects().map((sound) => sound.identifier)).toContain(audio.identifier);
    expect(board.presetSoundEffects().map((sound) => sound.identifier)).not.toContain(audio.identifier);
  });

  it('leaves out a hidden sound that is not one of them', () => {
    const hidden = AudioStorage.instance.add('test://vn/secret.mp3');
    hidden.isHidden = true;
    create();

    expect(board.presetSoundEffects().map((sound) => sound.identifier)).not.toContain(hidden.identifier);
  });

  it('narrows every list at once', () => {
    addPresetSound('barrier');
    create();
    const before = board.presetSoundEffects().length;

    board.soundFilter.set('のありえない名前');

    expect(board.presetSoundEffects()).toHaveLength(0);
    expect(board.soundEffects()).toHaveLength(0);
    expect(board.cutIns()).toHaveLength(0);
    expect(before).toBeGreaterThan(0);
  });

  it('offers the cut-ins of the room', () => {
    const cutIn = new CutIn();
    cutIn.initialize();
    cutIn.name = 'ここで一枚';
    try {
      create();
      TestBed.inject(ObjectChangeService).notifyChanged(cutIn.identifier);
      expect(board.cutIns().map((entry) => entry.name)).toContain('ここで一枚');
    } finally {
      cutIn.destroy();
    }
  });

  it('sends a cut-in to everybody rather than playing it alone, and says it played one', () => {
    const cutIn = new CutIn();
    cutIn.initialize();
    cutIn.name = 'ここで一枚';
    const launcher = ObjectStore.instance.get<CutInLauncher>('CutInLauncher') ?? new CutInLauncher('CutInLauncher');
    launcher.initialize();
    const spy = vi.spyOn(launcher, 'startCutIn').mockImplementation(() => undefined);
    try {
      create();
      const played: void[] = [];
      board.played.subscribe(() => played.push(undefined));
      board.playCutIn(cutIn.identifier);
      expect(spy).toHaveBeenCalledWith(cutIn);
      expect(played).toHaveLength(1);
    } finally {
      cutIn.destroy();
    }
  });

  it('hands the chosen sound to whoever is listening', () => {
    create();
    const attached: AttachedSound[] = [];
    board.attach.subscribe((sound) => attached.push(sound));
    board.attach.emit({ identifier: 'se-1', name: 'ジャーン' });
    expect(attached).toEqual([{ identifier: 'se-1', name: 'ジャーン' }]);
  });
});
