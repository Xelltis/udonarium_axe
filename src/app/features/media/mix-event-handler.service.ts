import { computed, DestroyRef, effect, inject, Injectable, untracked } from '@angular/core';
import { AudioAnalysisService } from '@axe/application/media/audio-analysis.service';
import { JukeboxEngineService } from '@axe/application/media/jukebox-engine.service';
import { PersonalVolumeService } from '@axe/application/media/personal-volume.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { MusicBus } from '@axe/core/audio/music-bus';
import { VOLUME_TYPES } from '@axe/core/storage/audio-output';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Jukebox } from '@axe/domain/media/jukebox';
import { roomMix } from '@axe/domain/media/mix-level';
import { Config } from '@axe/domain/peer/config';

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
  private readonly personalVolumes = inject(PersonalVolumeService);
  private readonly jukeboxEngine = inject(JukeboxEngineService);
  private automixTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    MusicBus.installWhenReady();
    effect(() => {
      this.objectChange.versionOf('Config')();
      this.objectChange.versionOf('Jukebox')();
      MusicBus.setDucking(roomMix().ducking && this.jukebox?.isPlaying === true);
    });
    effect(() => {
      this.roomScales();
      untracked(() => this.personalVolumes.applyToChannels());
    });
    effect(() => {
      this.analysis.version();
      this.mixSettings();
      untracked(() => this.jukeboxEngine.refreshMix());
    });
    effect(() => {
      this.objectChange.versionOf('Jukebox')();
      const playing = this.jukebox?.isPlaying === true;
      untracked(() => this.followPlaying(playing));
    });
    inject(DestroyRef).onDestroy(() => this.followPlaying(false));
  }

  /** The room's volume for each channel, as text, so a change made here or by another peer is put on the channels once. */
  private readonly roomScales = computed(() => {
    this.objectChange.versionOf('Config')();
    const config = this.objectStore.get<Config>('Config');
    return VOLUME_TYPES.map((type) => config?.roomScaleFor(type) ?? 1).join(',');
  });

  /** How the room mixes its music, as text, so a change made here or by another peer eases the tracks to it once. */
  private readonly mixSettings = computed(() => {
    this.objectChange.versionOf('Config')();
    return JSON.stringify(roomMix());
  });

  private get jukebox(): Jukebox | null {
    return this.objectStore.get<Jukebox>('Jukebox') ?? null;
  }

  private followPlaying(playing: boolean): void {
    if (playing && this.automixTimer === null) {
      this.automixTimer = setInterval(() => this.jukeboxEngine.tickAutomix(), AUTOMIX_TICK_MS);
    } else if (!playing && this.automixTimer !== null) {
      clearInterval(this.automixTimer);
      this.automixTimer = null;
    }
  }
}
