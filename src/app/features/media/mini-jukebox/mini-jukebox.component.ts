import {
  afterEveryRender,
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PersonalVolumeService } from '@axe/application/media/personal-volume.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { Jukebox } from '@axe/domain/media/jukebox';
import { BackgroundSoundPlaybackService } from '@axe/features/media/background-sound-playback.service';
import { formatTrackTime, JukeboxPlaybackService } from '@axe/features/media/jukebox-playback.service';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-mini-jukebox',
  templateUrl: './mini-jukebox.component.html',
  imports: [FormsModule, DraggableDirective, TranslocoModule],
})
export class MiniJukeboxComponent {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly audioStorage = inject(AudioStorage);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly playback = inject(JukeboxPlaybackService);
  protected readonly backgroundSounds = inject(BackgroundSoundPlaybackService);
  private readonly personalVolumes = inject(PersonalVolumeService);

  readonly isPlaylistOpen = signal(false);
  readonly isMinimized = signal(false);
  readonly isTitleScrolling = signal(false);
  readonly isSeekLocked = computed<boolean>(() => {
    this.objectChange.versionOf('Jukebox')();
    return this.jukebox?.isSeekLocked ?? true;
  });
  readonly playerEl = viewChild.required<ElementRef<HTMLElement>>('playerEl');
  readonly titleTextEl = viewChild<ElementRef<HTMLElement>>('titleTextEl');

  private readonly _tick = signal(0);

  readonly lastAudioIdentifier = signal<string>('');

  private initialLeft = '';
  private initialTop = '';
  private expandedWidth = 0;
  private expandedHeight = 0;

  constructor() {
    afterNextRender(() => {
      const el = this.playerEl().nativeElement;
      el.style.left = `${window.innerWidth - el.offsetWidth - 37}px`;
      el.style.top = '3px';
      this.initialLeft = el.style.left;
      this.initialTop = el.style.top;
      this.expandedWidth = el.offsetWidth;
      this.expandedHeight = el.offsetHeight;
    });
    afterEveryRender(() => {
      const textEl = this.titleTextEl()?.nativeElement;
      if (!textEl) {
        this.isTitleScrolling.set(false);
        return;
      }
      const containerEl = textEl.parentElement;
      if (!containerEl) return;
      const overflow = textEl.scrollWidth - containerEl.clientWidth;
      if (overflow > 2) {
        textEl.style.setProperty('--scroll-dist', `-${overflow}px`);
        this.isTitleScrolling.set(true);
      } else {
        textEl.style.removeProperty('--scroll-dist');
        this.isTitleScrolling.set(false);
      }
    });
    const timer = setInterval(() => this._tick.update((v) => v + 1), 250);
    this.destroyRef.onDestroy(() => clearInterval(timer));
    effect(() => {
      this.objectChange.versionOf('Jukebox')();
      const id = this.jukebox?.audioIdentifier;
      if (id) this.lastAudioIdentifier.set(id);
    });
  }

  private get jukebox(): Jukebox | null {
    return this.objectStore.get<Jukebox>('Jukebox') ?? null;
  }

  readonly isPlaying = this.playback.isPlaying;
  readonly isPaused = this.playback.isPaused;
  readonly isShuffled = this.playback.isShuffled;
  readonly activePlaylist = this.playback.activePlaylist;
  readonly hasManyPlaylists = computed(() => this.playback.playlists().length > 1);

  readonly trackName = computed(() => {
    this.objectChange.versionOf('Jukebox')();
    return this.jukebox?.audio?.name ?? null;
  });

  readonly trackTag = computed(() => {
    this.objectChange.versionOf('Jukebox')();
    const id = this.jukebox?.audioIdentifier;
    if (!id) return '';
    return AudioTag.get(id)?.tag ?? 'BGM';
  });

  readonly lastTrackName = computed(() => {
    const id = this.lastAudioIdentifier();
    return this.audioStorage.get(id)?.name ?? null;
  });

  readonly lastTrackTag = computed(() => {
    const id = this.lastAudioIdentifier();
    if (!id) return '';
    return AudioTag.get(id)?.tag ?? 'BGM';
  });

  readonly repeatMode = this.playback.repeatMode;
  /** Whether this player may change what the room plays, which a guest may not. */
  readonly canOperate = this.playback.canOperate;
  /** Whether this player may turn shuffle and repeat, which only the game master may. */
  readonly canChangeModes = this.playback.canChangeModes;

  /** The names of the background sounds playing, one after another, for the line under the controls. */
  readonly backgroundNames = computed(() =>
    this.backgroundSounds
      .playing()
      .map((sound) => sound.name)
      .filter((name) => name.length > 0)
      .join(' · ')
  );

  readonly artworkUrl = computed(() => {
    this._tick();
    this.objectChange.versionOf('Jukebox')();
    return this.jukebox?.audio?.artworkUrl ?? null;
  });

  readonly progress = computed(() => {
    this._tick();
    this.objectChange.versionOf('Jukebox')();
    const ct = this.playback.position();
    const dur = this.playback.duration();
    return dur > 0 && isFinite(dur) ? ct / dur : 0;
  });

  readonly isSeeking = signal(false);
  readonly seekPreview = signal(0);
  readonly displayProgress = computed(() => (this.isSeeking() ? this.seekPreview() : this.progress()));

  readonly timeDisplay = computed(() => {
    this._tick();
    this.objectChange.versionOf('Jukebox')();
    if (!this.isPlaying() && !this.isPaused()) return '—';
    const dur = this.playback.duration();
    const ct = this.isSeeking() ? this.seekPreview() * dur : this.playback.position();
    return `${formatTrackTime(ct)} / ${dur > 0 ? formatTrackTime(dur) : '—'}`;
  });

  /** The tracks the room plays through, as listed. */
  readonly bgmList = this.playback.queue;

  /**
   * Plays the track before the current one for the whole room, going round to the last, or starts
   * the current one again when it is a few seconds in.
   */
  playPrev() {
    this.playback.previous();
  }

  /** Plays the track after the current one for the whole room, going round to the first. */
  playNext() {
    this.playback.next();
  }

  /** Pauses the room's music, goes on with it from where it was paused, or starts the playlist when nothing is held. */
  togglePlayPause() {
    this.playback.togglePlayPause();
  }

  /** Steps the room's repeat mode on through none, the whole playlist and one track. */
  cycleRepeatMode() {
    this.playback.cycleRepeatMode();
  }

  /** Turns shuffle on or off for the whole room. */
  toggleShuffle() {
    this.playback.toggleShuffle();
  }

  /** Moves the room on to the next or previous playlist and starts it. */
  stepPlaylist(direction: 1 | -1) {
    this.playback.stepPlaylist(direction);
  }

  /** Shows where the seek bar is being dragged to without moving playback yet. */
  onSeekInput(event: Event) {
    const value = (event.target as HTMLInputElement).valueAsNumber / 100;
    this.isSeeking.set(true);
    this.seekPreview.set(value);
  }

  /**
   * Seeks the room's music to where the user let go of the seek bar.
   *
   * The seek is skipped while the track's duration is unknown, but the drag preview ends either
   * way.
   */
  onSeekCommit(event: Event) {
    const value = (event.target as HTMLInputElement).valueAsNumber / 100;
    const dur = this.playback.duration();
    if (isFinite(dur) && dur > 0) {
      this.playback.seek(value * dur);
    }
    this.isSeeking.set(false);
  }

  /** Opens or closes the track list under the player. */
  togglePlaylist() {
    this.isPlaylistOpen.update((v) => !v);
  }

  /**
   * Locks or unlocks the seek bar; the lock is kept on the jukebox, so it holds for the whole room.
   */
  toggleSeekLock() {
    if (this.jukebox && this.canOperate()) this.jukebox.isSeekLocked = !this.jukebox.isSeekLocked;
  }

  /**
   * Shrinks the player to an icon near the bottom-right corner, or brings it back to where it first
   * stood, kept inside the window.
   */
  toggleMinimize() {
    const willMinimize = !this.isMinimized();
    this.isMinimized.set(willMinimize);
    const el = this.playerEl().nativeElement;
    if (willMinimize) {
      el.style.left = `${window.innerWidth - 64}px`;
      el.style.top = `${window.innerHeight - 64}px`;
    } else {
      const margin = 3;
      const maxLeft = Math.max(margin, window.innerWidth - this.expandedWidth - margin);
      const maxTop = Math.max(margin, window.innerHeight - this.expandedHeight - margin);
      const left = Math.min(Math.max(parseFloat(this.initialLeft) || 0, margin), maxLeft);
      const top = Math.min(Math.max(parseFloat(this.initialTop) || 0, margin), maxTop);
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    }
  }

  /** Plays the track the user clicked in the list for the whole room. */
  playFromList(audio: AudioFile) {
    this.playback.play(audio);
  }

  /**
   * The music volume from the player's slider, the same one the jukebox panel sets.
   *
   * Setting it changes what this browser plays at, scaled by the room volume, and is remembered in
   * this browser; it is not sent to other peers.
   */
  get volume(): number {
    return this.personalVolumes.get('bgm');
  }
  set volume(v: number) {
    this.personalVolumes.set('bgm', v);
  }
}
