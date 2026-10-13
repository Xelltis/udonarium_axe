import { DestroyRef, effect, inject, Injectable, untracked } from '@angular/core';
import { AudioAnalysisService } from '@axe/application/media/audio-analysis.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { MusicBus } from '@axe/core/audio/music-bus';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Jukebox } from '@axe/domain/media/jukebox';
import { roomMix } from '@axe/domain/media/mix-level';

/** How often the room's track is looked at for the point to move on to the next, in milliseconds. */
export const AUTOMIX_TICK_MS = 250;

/**
 * Keeps what this peer hears mixed as the room asks.
 *
 * It sets the music's way up as soon as the page has an audio context, ducks the music under
 * effects while it plays and the room's settings say so, listening for nothing while it is quiet,
 * eases the tracks to their levels whenever a reading arrives or changes, and, while the room
 * plays, looks at the track a few times a second for the point to fade into the next.
 */
@Injectable({ providedIn: 'root' })
export class MixEventHandlerService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly analysis = inject(AudioAnalysisService);
  private automixTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    MusicBus.installWhenReady();
    effect(() => {
      this.objectChange.versionOf('Config')();
      this.objectChange.versionOf('Jukebox')();
      MusicBus.setDucking(roomMix().ducking && this.jukebox?.isPlaying === true);
    });
    effect(() => {
      this.analysis.version();
      untracked(() => this.jukebox?.refreshMix());
    });
    effect(() => {
      this.objectChange.versionOf('Jukebox')();
      const playing = this.jukebox?.isPlaying === true;
      untracked(() => this.followPlaying(playing));
    });
    inject(DestroyRef).onDestroy(() => this.followPlaying(false));
  }

  private get jukebox(): Jukebox | null {
    return this.objectStore.get<Jukebox>('Jukebox') ?? null;
  }

  private followPlaying(playing: boolean): void {
    if (playing && this.automixTimer === null) {
      this.automixTimer = setInterval(() => this.jukebox?.tickAutomix(), AUTOMIX_TICK_MS);
    } else if (!playing && this.automixTimer !== null) {
      clearInterval(this.automixTimer);
      this.automixTimer = null;
    }
  }
}
