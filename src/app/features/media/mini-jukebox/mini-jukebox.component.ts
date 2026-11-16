import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PersonalVolumeService } from '@axe/application/media/personal-volume.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { clamp } from '@axe/core/util/clamp';
import { observeSize } from '@axe/core/util/observe-size';
import { AudioProfile } from '@axe/domain/media/audio-profile';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { Jukebox } from '@axe/domain/media/jukebox';
import { BackgroundSoundPlaybackService } from '@axe/features/media/background-sound-playback.service';
import { JukeboxPlaybackService } from '@axe/features/media/jukebox-playback.service';
import { JukeboxSeekBar } from '@axe/features/media/jukebox-seek-bar';
import { DjDeckComponent } from '@axe/features/media/mini-jukebox/dj-deck/dj-deck.component';
import { readDeckOpen, writeDeckOpen } from '@axe/features/media/mini-jukebox/dj-deck-preference';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'mini-jukebox',
  templateUrl: './mini-jukebox.component.html',
  providers: [JukeboxSeekBar],
  imports: [TextTooltipDirective, FormsModule, DraggableDirective, TranslocoModule, DjDeckComponent],
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
  /** Whether the DJ deck is open under the player, remembered in this browser. */
  readonly isDeckOpen = signal(readDeckOpen());
  /**
   * Whether the track's name is too long for its box and so slides along it. Measured when the
   * name or the width of its box changes, not on every draw of the player.
   */
  readonly isTitleScrolling = signal(false);
  private readonly titleBoxWidth = signal(0);
  readonly isSeekLocked = this.playback.isSeekLocked;
  /** The seek bar over the room's track, with the drag on it that is this player's own. */
  protected readonly seekBar = inject(JukeboxSeekBar);
  readonly playerEl = viewChild.required<ElementRef<HTMLElement>>('playerEl');
  readonly titleTextEl = viewChild<ElementRef<HTMLElement>>('titleTextEl');

  /** The sound the jukebox last played, kept while it is stopped so it can be played again. */
  readonly lastAudioIdentifier = linkedSignal<string, string>({
    source: () => {
      this.objectChange.versionOf('Jukebox')();
      return this.jukebox?.audioIdentifier ?? '';
    },
    computation: (playing, previous) => playing || previous?.value || '',
  });

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
    effect((onCleanup) => {
      const box = this.titleTextEl()?.nativeElement.parentElement;
      if (!box) return;
      onCleanup(observeSize(box, (size) => this.titleBoxWidth.set(size.width)));
    });
    afterRenderEffect({
      earlyRead: () => {
        this.trackName();
        this.titleBoxWidth();
        const textEl = this.titleTextEl()?.nativeElement;
        const box = textEl?.parentElement;
        return textEl && box ? textEl.scrollWidth - box.clientWidth : 0;
      },
      write: (overflow) => {
        const textEl = this.titleTextEl()?.nativeElement;
        const scrolls = !!textEl && overflow() > 2;
        if (scrolls) textEl.style.setProperty('--scroll-dist', `-${overflow()}px`);
        else textEl?.style.removeProperty('--scroll-dist');
        this.isTitleScrolling.set(scrolls);
      },
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
    this.playback.clock();
    this.objectChange.versionOf('Jukebox')();
    return this.jukebox?.audio?.artworkUrl ?? null;
  });

  /** The position and length of the room's track, or a dash while no track is held. */
  readonly timeDisplay = computed(() => this.seekBar.time() ?? '—');

  /** Where the places marked in the room's track lie along the seek bar, as percentages of its length. */
  readonly cueMarks = computed<{ slot: number; percent: number }[]>(() => {
    this.playback.clock();
    this.objectChange.versionOf('Jukebox')();
    const identifier = this.jukebox?.audioIdentifier ?? '';
    if (!identifier) return [];
    this.objectChange.versionOf(`audiotag_${identifier}`)();
    const duration = this.playback.duration();
    if (!(duration > 0) || !Number.isFinite(duration)) return [];
    return AudioProfile.cuesOf(identifier).flatMap((at, slot) =>
      at === null ? [] : [{ slot, percent: Math.min(100, (at / duration) * 100) }]
    );
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

  /** Opens or closes the track list under the player. */
  togglePlaylist() {
    this.isPlaylistOpen.update((v) => !v);
  }

  /** Opens or closes the DJ deck under the player, and remembers which in this browser. */
  toggleDeck() {
    const open = !this.isDeckOpen();
    this.isDeckOpen.set(open);
    writeDeckOpen(open);
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
      const left = clamp(parseFloat(this.initialLeft) || 0, margin, maxLeft);
      const top = clamp(parseFloat(this.initialTop) || 0, margin, maxTop);
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
