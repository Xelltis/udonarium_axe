import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EFFECT_STAGE_LOADER } from '@axe/application/effect/effect-stage-loader';
import { PersonalVolumeService } from '@axe/application/media/personal-volume.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioOutput, VolumeType } from '@axe/core/storage/audio-output';
import { AudioPlayer } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { CutIn } from '@axe/domain/media/cut-in';
import { CutInLayer } from '@axe/domain/media/cut-in-layer';
import { CutInScene } from '@axe/domain/media/cut-in-scene';
import { CutInSoundService } from '@axe/features/media/cut-in-sound.service';
import {
  CUT_IN_VIDEO_START_LIMIT_MS,
  CutInWindowComponent,
} from '@axe/features/media/cut-in-window/cut-in-window.component';
import { BorrowedGlobals } from '@axe/testing/borrowed-globals';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function makeReadyAudio(identifier: string): AudioFile {
  const audio = AudioFile.createEmpty(identifier);
  const ctx = (audio as unknown as { context: Record<string, unknown> }).context;
  ctx['blob'] = new Blob(['x']);
  ctx['url'] = 'blob:x';
  return audio;
}

describe('CutInWindowComponent', () => {
  let component: CutInWindowComponent;
  let fixture: ComponentFixture<CutInWindowComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [CutInWindowComponent],
      providers: [...TEST_PROVIDERS, { provide: EFFECT_STAGE_LOADER, useValue: () => Promise.resolve(null) }],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(CutInWindowComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    AudioStorage.instance.audios.forEach((a) => AudioStorage.instance.delete(a.identifier));
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  it('shows its picture from a URL of this window’s own, for a moving picture to play from its start each time', () => {
    const picture = ImageStorage.instance.add({
      identifier: 'apng-once',
      name: 'once.png',
      type: 'image/png',
      blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
      url: 'blob:held-once',
      thumbnail: { type: '', blob: null, url: '' },
    });
    const cutIn = new CutIn('apng-cut-in');
    cutIn.initialize();
    cutIn.imageIdentifier = picture.identifier;
    component.cutIn = cutIn;
    component.startCutIn();
    fixture.detectChanges();

    const shown = (fixture.nativeElement as HTMLElement).querySelector('img')?.getAttribute('src') ?? '';

    expect(shown).not.toBe('');
    expect(shown).not.toBe('blob:held-once');
    cutIn.destroy();
    ImageStorage.instance.delete('apng-once');
  });

  it('shows the same picture from another URL in the next window, and lets go of a window’s own as it closes', () => {
    const letGo = vi.spyOn(URL, 'revokeObjectURL');
    const picture = ImageStorage.instance.add({
      identifier: 'apng-twice',
      name: 'twice.png',
      type: 'image/png',
      blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
      url: 'blob:held-twice',
      thumbnail: { type: '', blob: null, url: '' },
    });
    const cutIn = new CutIn('apng-cut-in-twice');
    cutIn.initialize();
    cutIn.imageIdentifier = picture.identifier;
    const show = () => {
      const window = TestBed.createComponent(CutInWindowComponent);
      window.componentInstance.cutIn = cutIn;
      window.componentInstance.startCutIn();
      window.detectChanges();
      const src = (window.nativeElement as HTMLElement).querySelector('img')?.getAttribute('src') ?? '';
      return { window, src };
    };

    const first = show();
    first.window.destroy();
    const second = show();

    expect(letGo).toHaveBeenCalledWith(first.src);
    expect(second.src).not.toBe(first.src);
    second.window.destroy();
    cutIn.destroy();
    ImageStorage.instance.delete('apng-twice');
  });

  describe('the size of the video player', () => {
    const borrowed = new BorrowedGlobals();
    let resized: ((entries: { contentRect: { width: number; height: number } }[]) => void) | null;

    beforeEach(() => {
      resized = null;
      borrowed.lend(
        'ResizeObserver',
        class {
          constructor(callback: typeof resized) {
            resized = callback;
          }
          observe(): void {}
          disconnect(): void {}
        }
      );
    });

    afterEach(() => borrowed.giveBack());

    function showing(): void {
      const cutIn = new CutIn('size-test');
      cutIn.initialize();
      component.cutIn = cutIn;
      fixture.detectChanges();
    }

    it('follows the cut-in area as it is resized', () => {
      showing();
      resized!([{ contentRect: { width: 800, height: 450 } }]);

      expect(component.youTubeWidth).toBe(800);
      expect(component.youTubeHeight).toBe(450);
    });

    it('lays nothing out to find it when the window is checked again', () => {
      showing();
      const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get');
      const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get');

      const view = fixture.debugElement.injector.get(ChangeDetectorRef);
      for (let check = 0; check < 5; check++) {
        view.markForCheck();
        fixture.detectChanges();
      }

      expect(width).not.toHaveBeenCalled();
      expect(height).not.toHaveBeenCalled();
    });
  });

  describe('videoVolume', () => {
    it('passes a cut-ins own volume straight to the video player', () => {
      const cutIn = new CutIn('volume-test');
      cutIn.initialize();
      cutIn.videoVolume = 75;
      component.cutIn = cutIn;

      expect(component.videoVolume).toBe(75);
    });

    it('follows the listener’s own cut-in volume, counting from the half it starts at', () => {
      vi.spyOn(AudioOutput, 'setChannelVolume').mockImplementation(() => {});
      const volumes = TestBed.inject(PersonalVolumeService);
      const cutIn = new CutIn('personal-volume-test');
      cutIn.initialize();
      cutIn.videoVolume = 60;
      component.cutIn = cutIn;

      volumes.set('cutIn', 0.25);
      expect(component.videoVolume).toBe(30);

      volumes.set('cutIn', 1);
      expect(component.videoVolume).toBe(100);

      volumes.setMuted('cutIn', true);
      expect(component.videoVolume).toBe(0);
    });

    it('mutes a replicated face that does not own the audio', () => {
      const cutIn = new CutIn('muted-replica-test');
      cutIn.initialize();
      cutIn.videoVolume = 75;
      component.cutIn = cutIn;
      component.audioEnabled = false;

      expect(component.videoVolume).toBe(0);
    });
  });

  describe('which volume a cut-in plays through', () => {
    it('plays a sound-effect-tagged cut-in through the cut-in volume, not the effects', () => {
      vi.spyOn(AudioPlayer.prototype, 'play').mockImplementation(() => {});
      vi.spyOn(AudioPlayer.prototype, 'stop').mockImplementation(() => {});
      AudioStorage.instance.add(makeReadyAudio('cutin-se'));
      const tag = AudioTag.create('cutin-se');
      tag.tag = 'SE';

      const cutIn = new CutIn('cutin-se-test');
      cutIn.initialize();
      cutIn.audioIdentifier = 'cutin-se';
      component.cutIn = cutIn;

      component.startCutIn();

      expect(component.audioPlayer.volumeType).toBe(VolumeType.CUT_IN);
    });

    it('plays any other through the cut-in volume, not the music', () => {
      vi.spyOn(AudioPlayer.prototype, 'play').mockImplementation(() => {});
      vi.spyOn(AudioPlayer.prototype, 'stop').mockImplementation(() => {});
      AudioStorage.instance.add(makeReadyAudio('cutin-bgm'));

      const cutIn = new CutIn('cutin-bgm-test');
      cutIn.initialize();
      cutIn.audioIdentifier = 'cutin-bgm';
      component.cutIn = cutIn;

      component.startCutIn();

      expect(component.audioPlayer.volumeType).toBe(VolumeType.CUT_IN);
    });

    it('does not play attached audio on a replicated face', () => {
      const play = vi.spyOn(AudioPlayer.prototype, 'play').mockImplementation(() => {});
      vi.spyOn(AudioPlayer.prototype, 'stop').mockImplementation(() => {});
      AudioStorage.instance.add(makeReadyAudio('replica-audio'));

      const cutIn = new CutIn('replica-audio-test');
      cutIn.initialize();
      cutIn.audioIdentifier = 'replica-audio';
      component.cutIn = cutIn;
      component.audioEnabled = false;

      component.startCutIn();

      expect(play).not.toHaveBeenCalled();
    });
  });

  it('keeps a supplied multi-direction panel layout', () => {
    const cutIn = new CutIn('layout-test');
    cutIn.initialize();
    component.cutIn = cutIn;
    component.panelLayout = { left: -40, top: 120, width: 300, height: 220 };

    component.moveCutInPos();

    expect(component.left).toBe(-40);
    expect(component.top).toBe(120);
    expect(component.width).toBe(300);
    expect(component.height).toBe(220);
  });

  it('keeps ordinary YouTube playback at its configured start', () => {
    const cutIn = new CutIn('ordinary-video-test');
    cutIn.initialize();
    cutIn.isVideoCutIn = true;
    cutIn.videoUrl = 'https://youtu.be/abcdefghijk?t=12';
    component.cutIn = cutIn;
    const target = { setVolume: vi.fn(), seekTo: vi.fn(), playVideo: vi.fn() };

    component.startCutIn();
    component.onPlayerReady({ target });
    component.onPlayerStateChange({ data: 5, target });

    expect(target.seekTo).not.toHaveBeenCalled();
    expect(target.playVideo).toHaveBeenCalled();
  });

  it('seeks a replicated YouTube face as far into the video as another face has played it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const cutIn = new CutIn('replicated-video-test');
    cutIn.initialize();
    cutIn.isVideoCutIn = true;
    cutIn.videoUrl = 'https://youtu.be/abcdefghijk?t=12';
    component.cutIn = cutIn;
    const target = { setVolume: vi.fn(), seekTo: vi.fn(), playVideo: vi.fn() };

    component.startCutIn(9_000, undefined, { startedAtMs: 9_500 });
    vi.setSystemTime(10_500);
    component.onPlayerReady({ target });
    component.onPlayerStateChange({ data: 5, target });

    expect(target.seekTo).toHaveBeenCalledWith(13, true);
    vi.useRealTimers();
  });

  describe('the play time of a video', () => {
    let close: ReturnType<typeof vi.spyOn>;
    const target = () => ({ setVolume: vi.fn(), seekTo: vi.fn(), playVideo: vi.fn() });

    beforeEach(() => {
      vi.useFakeTimers();
      close = vi.spyOn(TestBed.inject(PanelService), 'close').mockImplementation(() => {});
      const cutIn = new CutIn('video-play-time-test');
      cutIn.initialize();
      cutIn.isVideoCutIn = true;
      cutIn.videoUrl = 'https://youtu.be/abcdefghijk';
      cutIn.outTime = 5;
      component.cutIn = cutIn;
    });

    afterEach(() => vi.useRealTimers());

    it('counts from when the video begins to play, however long it took to load', () => {
      const player = target();
      component.startCutIn();
      vi.advanceTimersByTime(8_000);
      component.onPlayerReady({ target: player });
      component.onPlayerStateChange({ data: 5, target: player });
      component.onPlayerStateChange({ data: 1, target: player });

      vi.advanceTimersByTime(4_999);
      expect(close).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2);
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('counts a face joining late from when the first face of the cut-in began to play', () => {
      const clock = { startedAtMs: Date.now() };
      component.startCutIn(Date.now(), undefined, clock);
      vi.advanceTimersByTime(2_000);
      component.onPlayerStateChange({ data: 1, target: target() });

      vi.advanceTimersByTime(2_999);
      expect(close).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2);
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('closes all the same once a video that never plays has waited long enough', () => {
      component.startCutIn();

      vi.advanceTimersByTime(CUT_IN_VIDEO_START_LIMIT_MS + 4_999);
      expect(close).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2);
      expect(close).toHaveBeenCalledTimes(1);
    });
  });

  it('waits for the video to be cued before starting it, and starts it once', () => {
    const cutIn = new CutIn('cued-video-test');
    cutIn.initialize();
    cutIn.isVideoCutIn = true;
    cutIn.videoUrl = 'https://youtu.be/abcdefghijk';
    component.cutIn = cutIn;
    const target = { setVolume: vi.fn(), seekTo: vi.fn(), playVideo: vi.fn() };

    component.startCutIn();
    component.onPlayerReady({ target });
    expect(target.playVideo).not.toHaveBeenCalled();

    component.onPlayerStateChange({ data: 5, target });
    component.onPlayerStateChange({ data: 5, target });
    expect(target.playVideo).toHaveBeenCalledTimes(1);
  });

  it('keeps a prepared YouTube face paused until the coordinated start', () => {
    const cutIn = new CutIn('prepared-video-test');
    cutIn.initialize();
    cutIn.isVideoCutIn = true;
    cutIn.videoUrl = 'https://youtu.be/abcdefghijk?t=12';
    component.cutIn = cutIn;
    const target = { setVolume: vi.fn(), seekTo: vi.fn(), playVideo: vi.fn() };

    component.onPlayerReady({ target });
    component.onPlayerStateChange({ data: 5, target });
    expect(target.playVideo).not.toHaveBeenCalled();

    component.startCutIn();
    expect(target.playVideo).toHaveBeenCalledTimes(1);
  });

  describe('the YouTube player it shows', () => {
    const borrowed = new BorrowedGlobals();
    let made: FakeYouTubePlayer[];

    class FakeYouTubePlayer {
      private readonly listeners = new Map<string, (event: unknown) => void>();
      readonly setVolume = vi.fn();
      readonly playVideo = vi.fn();
      readonly seekTo = vi.fn();
      readonly cueVideoById = vi.fn(() => this.listeners.get('onStateChange')?.({ data: 5, target: this }));
      readonly setSize = vi.fn();
      readonly setPlaybackQuality = vi.fn();
      readonly destroy = vi.fn();

      constructor() {
        made.push(this);
      }

      addEventListener(name: string, listener: (event: unknown) => void): void {
        this.listeners.set(name, listener);
      }

      removeEventListener(): void {}

      getPlayerState(): number {
        return -1;
      }

      /** Says the player is ready, as YouTube's script does once the frame has loaded. */
      becomeReady(): void {
        this.listeners.get('onReady')?.({ target: this });
      }
    }

    beforeEach(() => {
      made = [];
      borrowed.lend('YT', { Player: FakeYouTubePlayer });
    });

    afterEach(() => borrowed.giveBack());

    it('makes its player at once rather than showing a placeholder that waits for a click, and plays it as the cut-in starts', async () => {
      const cutIn = new CutIn('youtube-player-test');
      cutIn.initialize();
      cutIn.isVideoCutIn = true;
      cutIn.videoUrl = 'https://youtu.be/abcdefghijk';
      component.cutIn = cutIn;

      component.startCutIn();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(made).toHaveLength(1);
      made[0].becomeReady();

      const [cued] = made[0].cueVideoById.mock.invocationCallOrder;
      const [played] = made[0].playVideo.mock.invocationCallOrder;
      expect(cued).toBeDefined();
      expect(played).toBeGreaterThan(cued);
    });
  });

  describe('ngOnDestroy', () => {
    it('clears the cut-in timer on teardown', () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const priv = component as unknown as { cutInTimeOut: ReturnType<typeof setTimeout> | null };
      priv.cutInTimeOut = setTimeout(() => {}, 999_999);

      fixture.destroy();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      expect(priv.cutInTimeOut).toBeNull();
    });
  });

  describe('a cut-in that shows a 3D model', () => {
    function makeCutIn(fields: Partial<CutIn> = {}): CutIn {
      const cutIn = new CutIn();
      cutIn.initialize();
      Object.assign(cutIn, fields);
      component.cutIn = cutIn;
      return cutIn;
    }

    type Shown = {
      modelShown: () => boolean;
      modelDoing: () => { act: { role: string; name?: string; atMs: number } | null; walking: boolean };
    };
    const shown = () => component as unknown as Shown;

    it('shows the model over the picture, standing until the cut-in is shown and acting what it keeps from then', () => {
      makeCutIn({ modelIdentifier: 'knight', modelAct: 'attack' });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('model-preview')).not.toBeNull();
      expect(shown().modelDoing()).toEqual({ act: null, walking: false });

      component.startCutIn();
      fixture.detectChanges();

      expect(shown().modelDoing()).toMatchObject({ act: { role: 'attack' }, walking: false });
    });

    it('is as far into its act as the shared start was taken, for a window that joins it late', () => {
      makeCutIn({ modelIdentifier: 'knight', modelAct: 'attack' });
      vi.spyOn(performance, 'now').mockReturnValue(50_000);

      component.startCutIn(Date.now() - 3_000);

      const act = shown().modelDoing().act!;
      expect(50_000 - act.atMs).toBeGreaterThanOrEqual(3_000);
      expect(50_000 - act.atMs).toBeLessThan(3_500);
    });

    it('acts anew each time the cut-in is started again', () => {
      makeCutIn({ modelIdentifier: 'knight', modelAct: 'attack' });
      const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);
      component.startCutIn();
      const first = shown().modelDoing().act!;

      now.mockReturnValue(9_000);
      component.startCutIn();

      expect(shown().modelDoing().act!.atMs).toBe(9_000);
      expect(shown().modelDoing().act).not.toBe(first);
    });

    it('walks for as long as it is shown, or plays one of the model’s own motions, as the cut-in keeps', () => {
      const cutIn = makeCutIn({ modelIdentifier: 'knight', modelAct: 'walk' });
      component.startCutIn();
      expect(shown().modelDoing()).toEqual({ act: null, walking: true });

      cutIn.modelAct = 'Victory';
      TestBed.inject(ObjectChangeService).notifyChanged(cutIn.identifier);
      expect(shown().modelDoing().act).toMatchObject({ role: 'named', name: 'Victory' });
    });

    it('shows no model for a cut-in that names none, nor for a video', () => {
      makeCutIn();
      fixture.detectChanges();
      expect(shown().modelShown()).toBe(false);
      expect(fixture.nativeElement.querySelector('model-preview')).toBeNull();

      const video = makeCutIn({ modelIdentifier: 'knight', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
      video.isVideoCutIn = true;
      TestBed.inject(ObjectChangeService).notifyChanged(video.identifier);
      expect(shown().modelShown()).toBe(false);
    });
  });

  describe('a cut-in built out of layers', () => {
    function makeCutIn(): CutIn {
      const cutIn = new CutIn();
      cutIn.initialize();
      component.cutIn = cutIn;
      return cutIn;
    }

    function giveScene(cutIn: CutIn, withLayer: boolean): CutInScene {
      const scene = new CutInScene();
      scene.initialize();
      scene.cutInIdentifier = cutIn.identifier;
      if (withLayer) {
        const layer = new CutInLayer();
        layer.initialize();
        scene.appendChild(layer);
      }
      return scene;
    }

    it('shows no stage for a cut-in that is one picture', () => {
      makeCutIn();
      fixture.detectChanges();

      expect(component.scene()).toBeNull();
      expect(fixture.nativeElement.querySelector('cut-in-stage')).toBeNull();
    });

    it('shows no stage for a scene with nothing laid into it', () => {
      const cutIn = makeCutIn();
      giveScene(cutIn, false);
      fixture.detectChanges();

      expect(component.scene()).toBeNull();
    });

    it('lays the stage over the picture once there are layers', () => {
      const cutIn = makeCutIn();
      const scene = giveScene(cutIn, true);
      fixture.detectChanges();

      expect(component.scene()).toBe(scene);
      expect(fixture.nativeElement.querySelector('cut-in-stage')).not.toBeNull();
    });

    it('closes once the scene has run, without a play time being set', () => {
      vi.useFakeTimers();
      const cutIn = makeCutIn();
      const scene = giveScene(cutIn, true);
      scene.durationMs = 1500;
      const close = vi.spyOn(TestBed.inject(PanelService), 'close').mockImplementation(() => {});

      component.startCutIn();
      vi.advanceTimersByTime(1499);
      expect(close).not.toHaveBeenCalled();

      vi.advanceTimersByTime(2);
      expect(close).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('starts the primary scene sound at zero after coordinated preparation', () => {
      vi.useFakeTimers();
      vi.setSystemTime(10_000);
      const cutIn = makeCutIn();
      const scene = giveScene(cutIn, true);
      const sound = TestBed.inject(CutInSoundService);
      const play = vi.spyOn(sound, 'play').mockReturnValue({ stop: vi.fn() });

      component.startCutIn(9_950, 0);

      expect(play).toHaveBeenCalledWith(scene, 0, false);
      vi.useRealTimers();
    });
  });
});
