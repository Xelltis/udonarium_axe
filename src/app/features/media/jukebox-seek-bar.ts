import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import {
  formatTrackLength,
  formatTrackTime,
  JukeboxPlaybackService,
} from '@axe/features/media/jukebox-playback.service';

/**
 * A seek bar over the room's track, as the jukebox panel and the mini player each show one: how far
 * through the track it stands, where it is being dragged to, and the time read out beside it.
 *
 * Each component that shows a bar provides one of its own, as a drag in one bar is no drag in the
 * other. The room's clock is kept going for as long as the bar is shown.
 */
@Injectable()
export class JukeboxSeekBar {
  private readonly playback = inject(JukeboxPlaybackService);
  private readonly objectChange = inject(ObjectChangeService);

  /** Whether the bar is being dragged, so playback moving on does not pull it back. */
  readonly isSeeking = signal(false);
  /** Where the bar is being dragged to, from 0 to 1. */
  readonly seekPreview = signal(0);

  /** Where the bar stands: where it is being dragged to, or how far through the track it is. */
  readonly displayProgress = computed(() => (this.isSeeking() ? this.seekPreview() : this.playback.progress()));

  /**
   * The position and length of the room's track, read out as `1:23 / 4:56`, with a dash for a length
   * not known yet; null while no track is held.
   */
  readonly time = computed<string | null>(() => {
    this.playback.clock();
    this.objectChange.versionOf('Jukebox')();
    if (!this.playback.isPlaying() && !this.playback.isPaused()) return null;
    const duration = this.playback.duration();
    const at = this.isSeeking() ? this.seekPreview() * duration : this.playback.position();
    return `${formatTrackTime(at)} / ${duration > 0 ? formatTrackLength(duration) : '—'}`;
  });

  constructor() {
    this.playback.followClock(inject(DestroyRef));
  }

  /** Shows where the bar is being dragged to without moving playback yet. */
  onInput(event: Event): void {
    this.isSeeking.set(true);
    this.seekPreview.set((event.target as HTMLInputElement).valueAsNumber / 100);
  }

  /**
   * Moves the room's track to where the bar was let go, and ends the drag. The track is left where
   * it is while its length is unknown.
   */
  onCommit(event: Event): void {
    const duration = this.playback.duration();
    if (duration > 0) this.playback.seek(((event.target as HTMLInputElement).valueAsNumber / 100) * duration);
    this.isSeeking.set(false);
  }
}
