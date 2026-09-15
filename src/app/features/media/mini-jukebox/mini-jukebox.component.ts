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
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { AudioPlayer } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { CutInLauncher } from '@axe/domain/media/cut-in-launcher';
import { Jukebox } from '@axe/domain/media/jukebox';
import { Playlist } from '@axe/domain/media/playlist';
import { Config } from '@axe/domain/peer/config';
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

  private get config(): Config | null {
    return this.objectStore.get<Config>('Config') ?? null;
  }

  private get cutInLauncher(): CutInLauncher {
    return this.objectStore.get<CutInLauncher>('CutInLauncher')!;
  }

  readonly isPlaying = computed(() => {
    this.objectChange.versionOf('Jukebox')();
    return this.jukebox?.isPlaying ?? false;
  });

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

  readonly repeatMode = computed(() => {
    this.objectChange.versionOf('Jukebox')();
    return (this.jukebox?.repeatMode ?? 'none') as 'none' | 'all' | 'one';
  });

  readonly artworkUrl = computed(() => {
    this._tick();
    this.objectChange.versionOf('Jukebox')();
    return this.jukebox?.audio?.artworkUrl ?? null;
  });

  readonly progress = computed(() => {
    this._tick();
    const ct = this.jukebox?.currentTime ?? 0;
    const dur = this.jukebox?.duration ?? 0;
    return dur > 0 && isFinite(dur) ? ct / dur : 0;
  });

  readonly isSeeking = signal(false);
  readonly seekPreview = signal(0);
  readonly displayProgress = computed(() => (this.isSeeking() ? this.seekPreview() : this.progress()));

  readonly timeDisplay = computed(() => {
    this._tick();
    const dur = this.jukebox?.duration ?? 0;
    if (!this.isPlaying()) return '—';
    const ct = this.isSeeking() ? this.seekPreview() * dur : (this.jukebox?.currentTime ?? 0);
    return `${this.formatTime(ct)} / ${this.formatTime(dur)}`;
  });

  readonly bgmList = computed(() => {
    this.objectChange.fileVersion();
    this.objectChange.collectionOf('audio-tag')();
    this.objectChange.versionOf('Playlist')();
    const playlist = this.objectStore.get<Playlist>('Playlist') ?? null;
    const entries = playlist?.entries ?? [];
    if (entries.length > 0) {
      return entries
        .map((id) => this.audioStorage.get(id))
        .filter((a): a is NonNullable<typeof a> => a !== null && !a.isHidden);
    }
    return this.audioStorage.audios.filter((a) => !a.isHidden && (AudioTag.get(a.identifier)?.tag ?? 'BGM') !== 'SE');
  });

  private get currentIndex(): number {
    if (!this.jukebox?.audio) return -1;
    return this.bgmList().indexOf(this.jukebox.audio);
  }

  /**
   * Plays the track before the current one in the list for the whole room, wrapping round to the
   * last.
   *
   * When nothing from the list is playing it starts at the last track. Any cut-in playing without a
   * tag is stopped first.
   */
  playPrev() {
    const list = this.bgmList();
    if (!list.length) return;
    const idx = this.currentIndex;
    const prev = list[(idx <= 0 ? list.length : idx) - 1];
    this.playBGM(prev.identifier);
  }

  /**
   * Plays the track after the current one in the list for the whole room, wrapping round to the
   * first.
   *
   * When nothing from the list is playing it starts at the first track. Any cut-in playing without
   * a tag is stopped first.
   */
  playNext() {
    const list = this.bgmList();
    if (!list.length) return;
    const idx = this.currentIndex;
    const next = list[(idx + 1) % list.length];
    this.playBGM(next.identifier);
  }

  private playBGM(identifier: string) {
    this.cutInLauncher?.stopBlankTagCutIn();
    this.jukebox?.play(identifier, true);
  }

  /**
   * Stops the room's music, or when it is stopped, plays the last track again; does nothing when no
   * track has been played yet.
   */
  togglePlayStop() {
    if (this.isPlaying()) {
      this.jukebox?.stop();
    } else {
      const id = this.lastAudioIdentifier();
      if (id) this.playBGM(id);
    }
  }

  /** Steps the room's repeat mode on through none, all and one. */
  cycleRepeatMode() {
    this.jukebox?.cycleRepeatMode();
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
    const dur = this.jukebox?.duration ?? 0;
    if (isFinite(dur) && dur > 0) {
      this.jukebox?.seek(value * dur);
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
    if (this.jukebox) this.jukebox.isSeekLocked = !this.jukebox.isSeekLocked;
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
  playFromList(identifier: string) {
    this.playBGM(identifier);
  }

  /**
   * The music volume from the player's slider, 0.5 until one is set.
   *
   * Setting it changes what this browser plays at, scaled by the room volume; it is not sent to
   * other peers.
   */
  get volume(): number {
    return this.jukebox?.volume ?? 0.5;
  }
  set volume(v: number) {
    if (this.jukebox) this.jukebox.volume = v;
    AudioPlayer.volume = v * (this.config?.roomVolume ?? 1);
  }

  private formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
