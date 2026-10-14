import { computed, DestroyRef, effect, inject, Injectable, InjectionToken, signal, untracked } from '@angular/core';
import { readAnalysisCache, writeAnalysisCache } from '@axe/application/media/audio-analysis-cache';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import type { AudioAnalysisResult } from '@axe/core/audio/audio-analysis';
import { analyzeAudioBlobAsync } from '@axe/core/audio/audio-analysis-client';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import {
  analysisFromResult,
  type AudioAnalysis,
  isAnalysisOutdated,
  readAudioAnalysis,
  writeAudioAnalysis,
} from '@axe/domain/media/audio-analysis';
import { AudioProfile } from '@axe/domain/media/audio-profile';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { BackgroundSound } from '@axe/domain/media/background-sound';
import { Jukebox } from '@axe/domain/media/jukebox';

/** Reads a sound's file whole; resolves null when it cannot be read. */
export type AudioAnalyzer = (blob: Blob) => Promise<AudioAnalysisResult | null>;

/** What reads sounds for the analysis service: the worker-backed reader, or a stand-in in tests. */
export const AUDIO_ANALYZER = new InjectionToken<AudioAnalyzer>('AUDIO_ANALYZER', {
  providedIn: 'root',
  factory: () => analyzeAudioBlobAsync,
});

/** How long the service waits before reading anything, for one who may share readings and for one who may not. */
export const AUDIO_ANALYSIS_DELAYS = new InjectionToken<{ sharing: number; watching: number; gap: number }>(
  'AUDIO_ANALYSIS_DELAYS',
  { providedIn: 'root', factory: () => ({ sharing: 3000, watching: 20000, gap: 400 }) }
);

/**
 * Reads every sound in the room for its loudness, the silence around it and its beat, one at a
 * time in the background, and shares what it finds.
 *
 * The track playing comes first, then the rest of the playlist and the background sounds playing,
 * then the library in an order of this device's own, so two peers reading at once tend to read
 * different sounds. A sound the room already has a reading for is not read again unless the reading
 * is from an earlier version.
 *
 * Readings are kept in this browser by the sound's hash, so a sound met again in another room is
 * not read again. One who may change what the room plays puts each reading on the sound's tag for
 * everyone; a guest keeps them to themselves, and waits longer before reading, as someone else in
 * the room usually shares the readings first. A device short of memory reads nothing.
 */
@Injectable({ providedIn: 'root' })
export class AudioAnalysisService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly audioStorage = inject(AudioStorage);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly analyze = inject(AUDIO_ANALYZER);
  private readonly delays = inject(AUDIO_ANALYSIS_DELAYS);

  /** Moves on whenever a reading is made here or the room's readings, beats or marks change, for what shows or uses them. */
  readonly version = signal(0);

  /** The sound being read now, or empty while none is. */
  readonly reading = signal('');

  private readonly cache = readAnalysisCache();
  private readonly failed = new Set<string>();
  private readonly libraryOrder = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private started = false;

  constructor() {
    for (const [identifier, text] of this.cache) {
      const analysis = readAudioAnalysis(text);
      if (analysis) AudioProfile.keepLocal(identifier, analysis);
    }
    const playing = computed(() => {
      this.objectChange.versionOf('Jukebox')();
      const jukebox = this.objectStore.get<Jukebox>('Jukebox');
      return `${jukebox?.audioIdentifier ?? ''}\n${jukebox?.playlistIdentifier ?? ''}`;
    });
    effect(() => {
      this.objectChange.fileVersion();
      this.objectChange.collectionOf(AudioTag.aliasName)();
      playing();
      untracked(() => this.schedule(this.started ? this.delays.gap : this.startDelay()));
    });
    const destroyRef = inject(DestroyRef);
    this.objectChange.onObjectChangedForSingleAlias(
      AudioTag.aliasName,
      () => this.version.update((value) => value + 1),
      destroyRef
    );
    destroyRef.onDestroy(() => {
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null;
    });
  }

  /** Whether a sound is waiting to be read: held on this device, not read yet, and not one that failed. */
  isPending(identifier: string): boolean {
    const audio = this.audioStorage.get(identifier);
    if (!audio?.blob || audio.isHidden || this.failed.has(identifier)) return false;
    return isAnalysisOutdated(AudioProfile.analysisOf(identifier));
  }

  private get canShare(): boolean {
    return this.rolePermission.canEditTabletop;
  }

  private startDelay(): number {
    return this.canShare ? this.delays.sharing : this.delays.watching;
  }

  private schedule(delayMs: number): void {
    if (this.timer !== null || this.running || !mayAnalyzeOnThisDevice()) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.started = true;
      void this.runNext();
    }, delayMs);
  }

  private async runNext(): Promise<void> {
    const audio = this.nextToRead();
    const blob = audio?.blob;
    if (!audio || !blob) return;
    this.running = true;
    this.reading.set(audio.identifier);
    try {
      const result = await this.analyze(blob);
      if (!result) {
        this.failed.add(audio.identifier);
      } else {
        const analysis = analysisFromResult(result);
        AudioProfile.keepLocal(audio.identifier, analysis);
        this.remember(audio.identifier, analysis);
        if (this.canShare) AudioProfile.share(audio.identifier, analysis);
      }
    } catch {
      this.failed.add(audio.identifier);
    } finally {
      this.running = false;
      this.reading.set('');
      this.version.update((value) => value + 1);
      this.schedule(this.delays.gap);
    }
  }

  /**
   * The next sound to read, sharing on the way the readings this device holds for sounds the room
   * has none for, on the tags the room has for them, and keeping those the room shares, so neither
   * is read again.
   */
  private nextToRead(): AudioFile | null {
    let kept = false;
    try {
      for (const identifier of this.readingOrder()) {
        const audio = this.audioStorage.get(identifier);
        if (!audio?.blob || audio.isHidden || this.failed.has(identifier)) continue;
        const shared = AudioProfile.sharedAnalysisOf(identifier);
        if (!isAnalysisOutdated(shared)) {
          if (shared && !this.cache.has(identifier)) {
            this.keep(identifier, shared);
            kept = true;
          }
          continue;
        }
        const known = AudioProfile.analysisOf(identifier);
        if (!isAnalysisOutdated(known)) {
          if (known && this.canShare) AudioProfile.shareOnTag(identifier, known);
          continue;
        }
        return audio;
      }
      return null;
    } finally {
      if (kept) writeAnalysisCache(this.cache);
    }
  }

  private readingOrder(): string[] {
    const jukebox = this.objectStore.get<Jukebox>('Jukebox');
    const first = [
      jukebox?.audioIdentifier ?? '',
      ...(jukebox?.queue ?? []),
      ...BackgroundSound.playing().map((sound) => sound.audioIdentifier),
    ];
    const library = this.audioStorage.audios.map((audio) => audio.identifier);
    for (const identifier of library) {
      if (!this.libraryOrder.has(identifier)) this.libraryOrder.set(identifier, orderingDraw());
    }
    library.sort((a, b) => (this.libraryOrder.get(a) ?? 0) - (this.libraryOrder.get(b) ?? 0));
    return [...new Set([...first, ...library])].filter((identifier) => identifier.length > 0);
  }

  private remember(identifier: string, analysis: AudioAnalysis): void {
    this.keep(identifier, analysis);
    writeAnalysisCache(this.cache);
  }

  /** Puts a reading in the cache as the latest, without writing the cache out. */
  private keep(identifier: string, analysis: AudioAnalysis): void {
    this.cache.delete(identifier);
    this.cache.set(identifier, writeAudioAnalysis(analysis));
  }
}

/**
 * A number to order the library by, drawn apart from `Math.random`, so reading sounds in the
 * background leaves the sequence that effects and the table draw from as it was.
 */
function orderingDraw(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/** Whether this device has the memory to decode whole sounds; one that says it has under 2 GB does not. */
function mayAnalyzeOnThisDevice(): boolean {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof memory !== 'number' || memory >= 2;
}
