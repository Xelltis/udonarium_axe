import { inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { CutInService } from '@axe/application/media/cut-in.service';
import { PictureSizeService } from '@axe/application/media/picture-size.service';
import { AgentToolError } from '@axe/core/agent/agent-error';
import type { IPeerContext } from '@axe/core/network/peer-context';
import { resetPeerContextProvider, setPeerContextProvider } from '@axe/core/network/peer-context-source';
import type { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { BoundedPresetNumber, EffectPreset, PRESET_NUMBER_BOUNDS } from '@axe/domain/effect/effect-preset';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { BackgroundSound } from '@axe/domain/media/background-sound';
import { createDefaultCutIns } from '@axe/domain/media/builtin-cut-ins';
import { CutIn } from '@axe/domain/media/cut-in';
import { CutInLauncher } from '@axe/domain/media/cut-in-launcher';
import { CutInLayer } from '@axe/domain/media/cut-in-layer';
import { CutInScene } from '@axe/domain/media/cut-in-scene';
import { ImageTag } from '@axe/domain/media/image-tag';
import { ImageTagLock } from '@axe/domain/media/image-tag-lock';
import { Jukebox } from '@axe/domain/media/jukebox';
import { Playlist } from '@axe/domain/media/playlist';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { VN_STAGE_IDENTIFIER, VnStage } from '@axe/domain/visual-novel/vn-stage';
import { AgentKindTools } from '@axe/features/agent-tools/agent-kind-tools.service';
import { AgentKinds } from '@axe/features/agent-tools/kinds/agent-kinds.service';
import { AgentMediaKinds } from '@axe/features/agent-tools/kinds/agent-media-kinds.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const signal = new AbortController().signal;

/**
 * A sound of the library, as the kinds read one. One not ready yet is waited for rather than played,
 * which keeps an ambient sound from reaching for a speaker the test has not got.
 */
function sound(identifier: string, name: string, isReady = true): AudioFile {
  return { identifier, name, isHidden: false, isReady } as unknown as AudioFile;
}

describe('AgentMediaKinds', () => {
  let tools: AgentKindTools;

  function call(tool: string, args: Record<string, unknown> = {}): unknown {
    return tools.handlers[tool](args, { signal });
  }

  function seatAs(role: PeerRole): void {
    PeerCursor.myCursor.role = role;
  }

  /** Puts the sounds in the room's library, each tagged as given. */
  function useSounds(...tagged: [AudioFile, string][]): void {
    const audios = tagged.map(([audio]) => audio);
    vi.spyOn(AudioStorage.instance, 'audios', 'get').mockReturnValue(audios);
    vi.spyOn(AudioStorage.instance, 'get').mockImplementation(
      (identifier) => audios.find((audio) => audio.identifier === identifier) ?? null
    );
    for (const [audio, tag] of tagged) AudioTag.create(audio.identifier).tag = tag;
  }

  /** Puts pictures in the room, each filed under the tag given. */
  function usePictures(...tagged: [string, string][]): void {
    for (const [identifier, tag] of tagged) {
      ImageStorage.instance.add(identifier);
      ImageTag.create(identifier).tag = tag;
    }
  }

  function cutInNamed(name: string): CutIn {
    const cutIn = new CutIn();
    cutIn.name = name;
    cutIn.originalSize = false;
    cutIn.initialize();
    return cutIn;
  }

  beforeEach(() => {
    setPeerContextProvider({
      peerContext: { userId: 'ai-user' } as IPeerContext,
      peerContexts: [],
      peerIds: [],
      peerId: 'ai-peer',
    });
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.userId = 'ai-user';
    seatAs(PeerRole.GameMaster);
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: AgentKinds,
          useFactory: () => {
            const kinds = inject(AgentMediaKinds).kinds;
            return { all: () => kinds, of: (name: string) => kinds.find((kind) => kind.kind === name) ?? null };
          },
        },
      ],
    });
    new Jukebox('Jukebox').initialize();
    new CutInLauncher('CutInLauncher').initialize();
    new VnStage(VN_STAGE_IDENTIFIER).initialize();
    new Playlist(Playlist.DEFAULT_IDENTIFIER).initialize();
    tools = TestBed.inject(AgentKindTools);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    PeerCursor.myCursor = null!;
    resetPeerContextProvider();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  describe('cut-in', () => {
    it('makes one as the cut-in list does, changes it, and takes it away with its scene and layers', () => {
      const made = call('create_object', {
        kind: 'cut-in',
        fields: { name: '召喚', position_x: 20, tag: 'summon', from_chat: true },
      }) as { id: string };
      const layer = call('create_object', {
        kind: 'cut-in-layer',
        options: { cut_in: made.id, kind: 'text' },
        fields: { text: '来たれ' },
      }) as { id: string };
      const cutIn = ObjectStore.instance.get<CutIn>(made.id)!;

      expect(call('list_objects', { kind: 'cut-in' })).toEqual([{ id: made.id, name: '召喚' }]);
      expect(call('get_object', { kind: 'cut-in', id: '召喚' })).toMatchObject({
        picture: 'testTableBackgroundImage_image',
        position_x: 20,
        tag: 'summon',
        from_chat: true,
        original_size: false,
        scene: cutIn.scene!.identifier,
        sample: false,
      });
      expect(
        call('change_object', { kind: 'cut-in', id: made.id, fields: { loop: true, frameless: true } })
      ).toMatchObject({ loop: true, out_time: 0, frameless: true });
      expect(call('remove_object', { kind: 'cut-in', id: made.id })).toEqual({
        removed: { id: made.id, name: '召喚' },
      });
      expect(ObjectStore.instance.getObjects(CutIn)).toEqual([]);
      expect(ObjectStore.instance.getObjects(CutInScene)).toEqual([]);
      expect(ObjectStore.instance.get(layer.id)).toBeNull();
    });

    it('refuses a size out of the bounds of a picture, or of a video, and keeps a video in proportion', () => {
      const cutIn = cutInNamed('火球');

      expect(() =>
        call('change_object', { kind: 'cut-in', id: cutIn.identifier, fields: { tag: '炎', width: 2000 } })
      ).toThrow(/at most 1920/);
      expect([cutIn.width, cutIn.tagName]).toEqual([480, '']);

      call('change_object', {
        kind: 'cut-in',
        id: cutIn.identifier,
        fields: { video: true, video_url: 'https://youtu.be/abcdEFGhij0' },
      });
      expect([cutIn.width, cutIn.height]).toEqual([640, 360]);

      expect(() => call('change_object', { kind: 'cut-in', id: cutIn.identifier, fields: { height: 200 } })).toThrow(
        /A video cut-in is 252 to 1080 pixels tall/
      );
      call('change_object', { kind: 'cut-in', id: cutIn.identifier, fields: { width: 1900 } });
      expect(cutIn.width).toBe(1900);

      call('change_object', { kind: 'cut-in', id: cutIn.identifier, fields: { keep_aspect: true, width: 800 } });
      expect([cutIn.width, cutIn.height]).toEqual([800, 450]);
    });

    it('holds the side that follows a kept aspect inside the bounds, the side given following it back', () => {
      usePictures(['tall', '']);
      vi.spyOn(TestBed.inject(PictureSizeService), 'sizeOf').mockReturnValue({ width: 100, height: 1000 });
      const cutIn = cutInNamed('縦長');
      cutIn.imageIdentifier = 'tall';
      cutIn.originalSize = false;
      cutIn.width = 100;
      cutIn.height = 1000;

      call('change_object', { kind: 'cut-in', id: cutIn.identifier, fields: { keep_aspect: true, width: 1900 } });

      expect([cutIn.width, cutIn.height]).toEqual([120, 1200]);
    });

    it('keeps the proportions of the picture itself, read before anything is written, however often it is resized', async () => {
      usePictures(['wide', '']);
      const sizes = TestBed.inject(PictureSizeService);
      let read = false;
      vi.spyOn(sizes, 'sizeOf').mockImplementation((url) => (read && url ? { width: 1000, height: 333 } : null));
      const reading = vi.spyOn(sizes, 'read').mockImplementation(async () => {
        read = true;
        return { width: 1000, height: 333 };
      });
      const cutIn = cutInNamed('横長');
      cutIn.imageIdentifier = 'wide';
      cutIn.setSize(480, 320);

      await call('change_object', { kind: 'cut-in', id: cutIn.identifier, fields: { keep_aspect: true } });
      expect(reading).toHaveBeenCalledOnce();
      expect([cutIn.width, cutIn.height]).toEqual([480, 159]);

      for (const width of [1919, 10, 1919]) {
        await call('change_object', { kind: 'cut-in', id: cutIn.identifier, fields: { width } });
      }
      expect([cutIn.width, cutIn.height]).toEqual([1919, 639]);
      expect(reading).toHaveBeenCalledOnce();
    });

    it('writes a new picture before the size it keeps the aspect of, whatever order the call gives them in', () => {
      usePictures(['wide', ''], ['tall', '']);
      const own: Record<string, { width: number; height: number }> = {
        wide: { width: 1600, height: 900 },
        tall: { width: 300, height: 400 },
      };
      vi.spyOn(TestBed.inject(PictureSizeService), 'sizeOf').mockImplementation((url) => own[url] ?? null);
      const cutIn = cutInNamed('差し替え');
      cutIn.imageIdentifier = 'wide';
      cutIn.keepImageAspect = true;
      cutIn.setSize(800, 450);

      call('change_object', { kind: 'cut-in', id: cutIn.identifier, fields: { width: 600, picture: 'tall' } });

      expect([cutIn.imageIdentifier, cutIn.width, cutIn.height]).toEqual(['tall', 600, 800]);
    });

    it('writes nothing once the call it waited for a picture on was given up', async () => {
      usePictures(['slow', '']);
      const sizes = TestBed.inject(PictureSizeService);
      vi.spyOn(sizes, 'sizeOf').mockReturnValue(null);
      let come: () => void = () => undefined;
      vi.spyOn(sizes, 'read').mockReturnValue(
        new Promise((resolve) => (come = () => resolve({ width: 100, height: 100 })))
      );
      const cutIn = cutInNamed('遅い');
      cutIn.imageIdentifier = 'slow';
      cutIn.keepImageAspect = true;
      cutIn.setSize(480, 320);
      const giveUp = new AbortController();

      const changing = Promise.resolve(
        tools.handlers['change_object'](
          { kind: 'cut-in', id: cutIn.identifier, fields: { width: 600 } },
          { signal: giveUp.signal }
        )
      );
      giveUp.abort();
      come();

      await expect(changing).rejects.toThrow(/given up/);
      expect([cutIn.width, cutIn.height]).toEqual([480, 320]);
    });

    it('holds the size as it is while the cut-in is shown at its picture’s own size', () => {
      const cutIn = cutInNamed('雷');
      cutIn.originalSize = true;

      expect(() => call('change_object', { kind: 'cut-in', id: cutIn.identifier, fields: { width: 300 } })).toThrow(
        /follows its own picture/
      );
      expect(() =>
        call('change_object', { kind: 'cut-in', id: cutIn.identifier, fields: { keep_aspect: true } })
      ).toThrow(/follows its own picture/);
      expect(cutIn.width).toBe(480);
    });

    it('holds the time it closes after while it stays up until stopped', () => {
      const cutIn = cutInNamed('結界');
      cutIn.isLoop = true;

      expect(() => call('change_object', { kind: 'cut-in', id: cutIn.identifier, fields: { out_time: 5 } })).toThrow(
        /turn loop off first/
      );
      expect(cutIn.outTime).toBe(0);
    });

    it('takes a sample cut-in away like any other, for the samples to be put back whole', () => {
      createDefaultCutIns(ImageStorage.instance);

      call('remove_object', { kind: 'cut-in', id: 'sample-cut-in-flash' });
      expect(ObjectStore.instance.get('sample-cut-in-flash')).toBeNull();

      TestBed.inject(CutInService).restoreSamples();
      expect(ObjectStore.instance.get<CutIn>('sample-cut-in-flash')?.scene?.layers.length).toBeGreaterThan(0);
    });

    it('puts on it only a picture this seat may come across, and a sound of the library, writing nothing else when refused', () => {
      seatAs(PeerRole.Player);
      usePictures(['mine', 'コマ'], ['boss', 'ボス']);
      ImageTagLock.lock('ボス', 'someone-else');
      useSounds([sound('roar', '咆哮'), 'SE']);
      const cutIn = cutInNamed('登場');

      expect(() =>
        call('change_object', { kind: 'cut-in', id: cutIn.identifier, fields: { tag: '秘密', picture: 'boss' } })
      ).toThrow(/no picture named boss/);
      expect(() =>
        call('change_object', { kind: 'cut-in', id: cutIn.identifier, fields: { tag: '秘密', sound: '無い音' } })
      ).toThrow(/no sound named 無い音/);
      expect(cutIn.tagName).toBe('');
      expect(
        call('change_object', { kind: 'cut-in', id: cutIn.identifier, fields: { picture: 'mine', sound: '咆哮' } })
      ).toMatchObject({ picture: 'mine', sound: 'roar' });
      expect(cutIn.audioName).toBe('咆哮');
    });

    it('plays it and plays its sound alone through the cut-in service, and stops it', () => {
      const cutIn = cutInNamed('召喚');
      const launcher = ObjectStore.instance.get<CutInLauncher>('CutInLauncher')!;
      const stop = vi.spyOn(launcher, 'stopCutIn');
      const service = TestBed.inject(CutInService);
      const launch = vi.spyOn(service, 'launch');
      const soundOnly = vi.spyOn(service, 'launchSoundOnly');

      expect(call('act_on_object', { kind: 'cut-in', id: '召喚', action: 'play' })).toEqual({
        playing: '召喚',
        sound_only: false,
      });
      call('act_on_object', { kind: 'cut-in', id: '召喚', action: 'play', args: { sound_only: true } });
      call('act_on_object', { kind: 'cut-in', id: '召喚', action: 'stop' });

      expect(launch).toHaveBeenCalledWith(cutIn);
      expect(soundOnly).toHaveBeenCalledWith(cutIn);
      expect(launcher.launchCutInIdentifier).toBe(cutIn.identifier);
      expect(stop).toHaveBeenCalledWith(cutIn);
    });

    it('plays none for a guest on a room server, as the service refuses', () => {
      cutInNamed('召喚');
      vi.spyOn(PeerCursor, 'isMyselfKeptOffTable', 'get').mockReturnValue(true);

      expect(() => call('act_on_object', { kind: 'cut-in', id: '召喚', action: 'play' })).toThrow(
        /guest on a room server/
      );
      expect(ObjectStore.instance.get<CutInLauncher>('CutInLauncher')!.launchCutInIdentifier).toBe('');
    });

    it('stops none for a guest on a room server', () => {
      const cutIn = cutInNamed('召喚');
      const stop = vi.spyOn(ObjectStore.instance.get<CutInLauncher>('CutInLauncher')!, 'stopCutIn');
      vi.spyOn(PeerCursor, 'isMyselfKeptOffTable', 'get').mockReturnValue(true);

      expect(() => call('act_on_object', { kind: 'cut-in', id: cutIn.identifier, action: 'stop' })).toThrow(
        /guest on a room server/
      );
      expect(stop).not.toHaveBeenCalled();
    });
  });

  describe('cut-in-scene', () => {
    it('gives a cut-in its scene and writes how long it runs, its loop, its background and its sounds', () => {
      useSounds([sound('boom', '爆発'), 'SE']);
      const cutIn = cutInNamed('爆発');
      const made = call('create_object', {
        kind: 'cut-in-scene',
        options: { cut_in: '爆発' },
        fields: { duration_ms: 2000, loop: true, background_color: '#000000' },
      }) as { id: string };

      expect(cutIn.scene?.identifier).toBe(made.id);
      expect(
        call('change_object', {
          kind: 'cut-in-scene',
          id: made.id,
          fields: {
            sounds: [
              { at_ms: 300, sound: '爆発', volume: 80 },
              { at_ms: 0, sound: 'boom' },
            ],
          },
        })
      ).toMatchObject({
        cut_in: { id: cutIn.identifier, name: '爆発' },
        duration_ms: 2000,
        running_ms: 2000,
        loop: true,
        background_color: '#000000',
        sounds: [
          { at_ms: 0, sound: 'boom', volume: 100 },
          { at_ms: 300, sound: 'boom', volume: 80 },
        ],
      });
      expect(call('create_object', { kind: 'cut-in-scene', options: { cut_in: '爆発' } })).toMatchObject({
        id: made.id,
      });
    });

    it('lists only the scenes whose cut-in is in the room', () => {
      const orphan = new CutInScene();
      orphan.initialize();
      orphan.cutInIdentifier = 'gone';
      const cutIn = cutInNamed('残る');
      call('create_object', { kind: 'cut-in-scene', options: { cut_in: cutIn.identifier } });

      expect(call('list_objects', { kind: 'cut-in-scene' })).toEqual([{ id: cutIn.scene!.identifier, name: '残る' }]);
    });
  });

  describe('cut-in-layer', () => {
    it('lays, changes, copies, moves and takes away the layers of a cut-in', () => {
      const cutIn = cutInNamed('見得');
      cutIn.originalSize = true;
      const band = call('create_object', {
        kind: 'cut-in-layer',
        options: { cut_in: '見得', kind: 'fill' },
        fields: { name: '帯', fill_from: '#ff0000', fill_shape: 'stripes' },
      }) as { id: string };
      const words = call('create_object', {
        kind: 'cut-in-layer',
        options: { cut_in: cutIn.identifier, kind: 'text' },
        fields: { name: '文字', text: '見参', x: 40, opacity: 0.5, font_weight: 900 },
      }) as { id: string };

      expect(cutIn.originalSize).toBe(false);
      expect(call('list_objects', { kind: 'cut-in-layer' })).toEqual([
        { id: band.id, name: '帯' },
        { id: words.id, name: '文字' },
      ]);
      expect(call('get_object', { kind: 'cut-in-layer', id: words.id })).toMatchObject({
        cut_in: { id: cutIn.identifier, name: '見得' },
        kind: 'text',
        position: 2,
        text: '見参',
        x: 40,
        opacity: 0.5,
        font_weight: 900,
      });

      const copy = call('act_on_object', { kind: 'cut-in-layer', id: words.id, action: 'duplicate' }) as {
        id: string;
      };
      expect(call('act_on_object', { kind: 'cut-in-layer', id: copy.id, action: 'move', args: { to: 1 } })).toEqual({
        position: 1,
      });
      expect(cutIn.scene!.layers.map((layer) => layer.identifier)).toEqual([copy.id, band.id, words.id]);

      call('act_on_object', { kind: 'cut-in-layer', id: band.id, action: 'apply_look', args: { look: 'impact' } });
      expect(ObjectStore.instance.get<CutInLayer>(band.id)!.effect).toBe('shake');

      call('remove_object', { kind: 'cut-in-layer', id: copy.id });
      expect(cutIn.scene!.layers.map((layer) => layer.identifier)).toEqual([band.id, words.id]);
    });

    it('writes a layer’s tracks, and refuses the resting value of a property its keys move', () => {
      cutInNamed('流れ');
      const made = call('create_object', {
        kind: 'cut-in-layer',
        options: { cut_in: '流れ', kind: 'image' },
        fields: {
          tracks: {
            x: [
              { at_ms: 500, value: 100 },
              { at_ms: 0, value: -200, easing: 'linear' },
            ],
          },
        },
      }) as { id: string; tracks: unknown };

      expect(made.tracks).toEqual({
        x: [
          { at_ms: 0, value: -200, easing: 'linear' },
          { at_ms: 500, value: 100 },
        ],
      });
      expect(() => call('change_object', { kind: 'cut-in-layer', id: made.id, fields: { x: 10 } })).toThrow(
        /moves along keys in tracks/
      );
      expect(call('change_object', { kind: 'cut-in-layer', id: made.id, fields: { y: 10 } })).toMatchObject({ y: 10 });
    });

    it('takes a layer of a sample cut-in away like any other, for the samples to be put back whole', () => {
      createDefaultCutIns(ImageStorage.instance);

      call('remove_object', { kind: 'cut-in-layer', id: 'sample-cut-in-flash-word' });
      expect(ObjectStore.instance.get('sample-cut-in-flash-word')).toBeNull();

      TestBed.inject(CutInService).restoreSamples();
      expect(ObjectStore.instance.get('sample-cut-in-flash-word')).toBeInstanceOf(CutInLayer);
    });
  });

  describe('vn-stage', () => {
    it('lets the game master set and clear its background, its transition and who directs it', () => {
      usePictures(['forest', '背景']);
      const stage = ObjectStore.instance.get<VnStage>(VN_STAGE_IDENTIFIER)!;

      expect(
        call('act_on_object', {
          kind: 'vn-stage',
          action: 'set_background',
          args: { picture: 'forest', transition: 'wipe' },
        })
      ).toEqual({ background: 'forest', transition: 'wipe' });
      expect(call('change_object', { kind: 'vn-stage', fields: { transition: 'none' } })).toMatchObject({
        background: 'forest',
        transition: 'none',
        directed: false,
      });
      const trigger = stage.transitionTrigger;
      call('act_on_object', { kind: 'vn-stage', action: 'play_transition' });
      expect(stage.transitionTrigger).toBe(trigger + 1);
      call('act_on_object', { kind: 'vn-stage', action: 'clear_background' });
      expect(stage.backgroundImageIdentifier).toBe('');

      call('act_on_object', { kind: 'vn-stage', action: 'start_directing' });
      expect([stage.isDirected, stage.directorPeerId]).toEqual([true, 'ai-peer']);
      call('act_on_object', { kind: 'vn-stage', action: 'stop_directing' });
      expect(stage.isDirected).toBe(false);
    });

    it('is changed by the game master’s seat only', () => {
      seatAs(PeerRole.Player);

      expect(() => call('act_on_object', { kind: 'vn-stage', action: 'clear_background' })).toThrow(
        /Only the game master's seat/
      );
      expect(() => call('change_object', { kind: 'vn-stage', fields: { transition: 'none' } })).toThrow(
        /Only the game master's seat/
      );
      expect(call('get_object', { kind: 'vn-stage' })).toMatchObject({ transition: 'fade' });
    });

    it('lets only the seat directing stop it', () => {
      const stage = ObjectStore.instance.get<VnStage>(VN_STAGE_IDENTIFIER)!;
      stage.startDirecting('other-peer');

      expect(() => call('act_on_object', { kind: 'vn-stage', action: 'stop_directing' })).toThrow(
        /not directing the stage/
      );
      expect(stage.directorPeerId).toBe('other-peer');
    });
  });

  describe('jukebox', () => {
    it('plays, pauses, goes on with and stops the room’s music, and plays a playlist', () => {
      useSounds([sound('field', '草原'), 'BGM'], [sound('town', '街'), 'BGM']);
      const list = Playlist.create('冒険', ['town', 'field']);

      expect(call('act_on_object', { kind: 'jukebox', action: 'play', args: { track: '草原' } })).toMatchObject({
        track: { id: 'field', name: '草原' },
        state: 'playing',
      });
      expect(call('act_on_object', { kind: 'jukebox', action: 'pause' })).toMatchObject({ state: 'paused' });
      expect(call('act_on_object', { kind: 'jukebox', action: 'resume' })).toMatchObject({ state: 'playing' });
      expect(
        call('act_on_object', { kind: 'jukebox', action: 'play_playlist', args: { playlist: '冒険' } })
      ).toMatchObject({ track: { id: 'town' }, playlist: { id: list.identifier, name: '冒険' } });
      expect(call('get_object', { kind: 'jukebox' })).toMatchObject({
        queue: [
          { id: 'town', name: '街' },
          { id: 'field', name: '草原' },
        ],
      });
      expect(call('act_on_object', { kind: 'jukebox', action: 'stop' })).toMatchObject({
        track: null,
        state: 'stopped',
      });
    });

    it('stops a sound effect for everyone', () => {
      useSounds([sound('bell', '鐘'), 'SE']);
      const stop = vi.spyOn(ObjectStore.instance.get<Jukebox>('Jukebox')!, 'stopSE');

      call('act_on_object', { kind: 'jukebox', action: 'stop_sound_effect', args: { sound: '鐘' } });
      expect(stop).toHaveBeenCalledWith('bell');
    });

    it('moves the track only while the room’s seek bar is unlocked', () => {
      const seek = vi.spyOn(ObjectStore.instance.get<Jukebox>('Jukebox')!, 'seek');

      expect(() => call('act_on_object', { kind: 'jukebox', action: 'seek', args: { seconds: 30 } })).toThrow(
        /seek bar is locked/
      );
      expect(seek).not.toHaveBeenCalled();
      call('act_on_object', { kind: 'jukebox', action: 'set_seek_lock', args: { locked: false } });
      call('act_on_object', { kind: 'jukebox', action: 'seek', args: { seconds: 30 } });
      expect(seek).toHaveBeenCalledWith(30);
    });

    it('lets only the game master turn shuffle and repeat, saying so in the system log', () => {
      const notice = vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemNotice').mockReturnValue(null);

      expect(call('act_on_object', { kind: 'jukebox', action: 'set_repeat', args: { mode: 'all' } })).toMatchObject({
        repeat: 'all',
      });
      expect(call('act_on_object', { kind: 'jukebox', action: 'set_shuffle', args: { on: true } })).toMatchObject({
        shuffle: true,
      });
      expect(notice).toHaveBeenCalledTimes(3);

      seatAs(PeerRole.Player);
      expect(() => call('act_on_object', { kind: 'jukebox', action: 'set_shuffle', args: { on: false } })).toThrow(
        /Only the game master's seat/
      );
      expect(() => call('act_on_object', { kind: 'jukebox', action: 'set_repeat', args: { mode: 'one' } })).toThrow(
        /Only the game master's seat/
      );
      expect(call('get_object', { kind: 'jukebox' })).toMatchObject({ shuffle: true, repeat: 'all' });
    });
  });

  describe('background-sound', () => {
    it('lists the ambient sounds, and starts, sets and stops one for the room', () => {
      useSounds([sound('rain', '雨', false), 'BGS'], [sound('field', '草原'), 'BGM']);

      expect(call('list_objects', { kind: 'background-sound' })).toEqual([{ id: 'bgs_rain', name: '雨' }]);
      expect(call('act_on_object', { kind: 'background-sound', id: '雨', action: 'start' })).toEqual({
        playing: true,
        volume: 1,
      });
      expect(
        call('act_on_object', { kind: 'background-sound', id: 'bgs_rain', action: 'set_volume', args: { volume: 0.4 } })
      ).toEqual({ playing: true, volume: 0.4 });
      expect(call('act_on_object', { kind: 'background-sound', id: 'bgs_rain', action: 'stop' })).toEqual({
        playing: false,
        volume: 0.4,
      });
      expect(BackgroundSound.of('rain')).toBeInstanceOf(BackgroundSound);
      expect(call('act_on_object', { kind: 'background-sound', id: 'bgs_rain', action: 'start' })).toMatchObject({
        playing: true,
      });
    });

    it('sets the volume of one only while it plays', () => {
      useSounds([sound('wind', '風', false), 'BGS']);

      expect(() =>
        call('act_on_object', { kind: 'background-sound', id: '風', action: 'set_volume', args: { volume: 0.2 } })
      ).toThrow(/while it plays/);
      expect(BackgroundSound.of('wind')).toBeNull();
    });
  });

  describe('playlist', () => {
    it('makes, names, fills, orders and takes away a playlist', () => {
      useSounds([sound('field', '草原'), 'BGM'], [sound('town', '街'), 'BGM']);
      const made = call('create_object', { kind: 'playlist', fields: { name: ' 冒険 ' } }) as { id: string };

      call('act_on_object', { kind: 'playlist', id: made.id, action: 'add_track', args: { track: '草原' } });
      call('act_on_object', { kind: 'playlist', id: made.id, action: 'add_track', args: { track: 'town' } });
      expect(
        call('act_on_object', { kind: 'playlist', id: '冒険', action: 'move_track', args: { track: '街', to: 1 } })
      ).toEqual({
        tracks: [
          { id: 'town', name: '街' },
          { id: 'field', name: '草原' },
        ],
      });
      call('act_on_object', { kind: 'playlist', id: made.id, action: 'remove_track', args: { track: 'field' } });
      expect(call('get_object', { kind: 'playlist', id: made.id })).toMatchObject({
        name: '冒険',
        tracks: [{ id: 'town', name: '街' }],
        active: false,
        first: false,
      });
      expect(call('remove_object', { kind: 'playlist', id: made.id })).toEqual({
        removed: { id: made.id, name: '冒険' },
      });
    });

    it('puts only music on a playlist', () => {
      useSounds([sound('bell', '鐘'), 'SE']);
      const list = Playlist.create('冒険');

      expect(() =>
        call('act_on_object', { kind: 'playlist', id: list.identifier, action: 'add_track', args: { track: '鐘' } })
      ).toThrow(/Only music goes on a playlist/);
      expect(list.entries).toEqual([]);
    });

    it('takes the room’s first playlist away never', () => {
      expect(() => call('remove_object', { kind: 'playlist', id: Playlist.DEFAULT_IDENTIFIER })).toThrow(
        /first playlist cannot be taken away/
      );
      expect(Playlist.instance).not.toBeNull();
    });

    it('lets the jukebox go back to the first playlist when the one it goes on through is taken away', () => {
      const list = Playlist.create('戦闘');
      const jukebox = ObjectStore.instance.get<Jukebox>('Jukebox')!;
      jukebox.playlistIdentifier = list.identifier;

      expect(call('get_object', { kind: 'playlist', id: list.identifier })).toMatchObject({ active: true });
      call('remove_object', { kind: 'playlist', id: list.identifier });
      expect(jukebox.playlistIdentifier).toBe('');
    });
  });

  describe('effect-preset', () => {
    it('makes, changes, copies and takes away an effect', () => {
      useSounds([sound('fire', '炎の音'), 'SE']);
      const made = call('create_object', {
        kind: 'effect-preset',
        fields: { name: '火球', kind: 'flame', scale: 2, sound: '炎の音', targeting: 'multi', max_targets: 4 },
      }) as { id: string };

      expect(call('get_object', { kind: 'effect-preset', id: '火球' })).toMatchObject({
        kind: 'flame',
        scale: 2,
        sound: 'fire',
        targeting: 'multi',
        max_targets: 4,
        gm_only: false,
      });
      expect(
        call('change_object', {
          kind: 'effect-preset',
          id: made.id,
          fields: {
            stages: [
              { role: 'travel', kind: 'projectile', durationMs: 400 },
              { role: 'impact', kind: 'burst', durationMs: 300, grade: 3 },
            ],
          },
        })
      ).toMatchObject({ stages: [{ role: 'travel' }, { role: 'impact', grade: 3 }] });

      const copy = call('act_on_object', { kind: 'effect-preset', id: made.id, action: 'duplicate' }) as {
        id: string;
        name: string;
      };
      expect(copy.name).toBe('火球 (2)');
      call('remove_object', { kind: 'effect-preset', id: made.id });
      expect(ObjectStore.instance.getObjects(EffectPreset).map((preset) => preset.identifier)).toEqual([copy.id]);
    });

    it('offers every number of an effect within the bounds the effect plays within', () => {
      const kind = TestBed.inject(AgentMediaKinds).kinds.find((each) => each.kind === 'effect-preset')!;
      const fields: readonly [string, BoundedPresetNumber][] = [
        ['duration_ms', 'durationMs'],
        ['stagger_ms', 'staggerMs'],
        ['scale', 'scale'],
        ['max_targets', 'maxTargets'],
        ['area_radius', 'areaRadius'],
        ['grade', 'grade'],
        ['shots', 'shots'],
        ['shot_interval', 'shotInterval'],
      ];

      for (const [name, key] of fields) {
        const schema = kind.fields.find((field) => field.name === name)!.schema as { minimum: number; maximum: number };
        expect([schema.minimum, schema.maximum], name).toEqual([
          PRESET_NUMBER_BOUNDS[key].min,
          PRESET_NUMBER_BOUNDS[key].max,
        ]);
      }
    });

    it('lays no stage whose role cannot draw the look it names', () => {
      const preset = new EffectPreset();
      preset.name = '矢';
      preset.initialize();

      expect(() =>
        call('change_object', {
          kind: 'effect-preset',
          id: preset.identifier,
          fields: { name: '矢の雨', stages: [{ role: 'travel', kind: 'burst', durationMs: 400 }] },
        })
      ).toThrow(/A travel stage cannot draw burst/);
      expect([preset.name, preset.stages]).toEqual(['矢', '']);
    });

    it('keeps an effect the game master keeps from every other seat', () => {
      const secret = new EffectPreset();
      secret.name = '奥の手';
      secret.gmOnly = true;
      secret.initialize();
      const open = new EffectPreset();
      open.name = '火花';
      open.initialize();
      seatAs(PeerRole.Player);

      expect(call('list_objects', { kind: 'effect-preset' })).toEqual([{ id: open.identifier, name: '火花' }]);
      expect(() => call('get_object', { kind: 'effect-preset', id: secret.identifier })).toThrow(AgentToolError);
      expect(() =>
        call('change_object', { kind: 'effect-preset', id: secret.identifier, fields: { name: '暴露' } })
      ).toThrow(AgentToolError);
      expect(secret.name).toBe('奥の手');
    });
  });
});
