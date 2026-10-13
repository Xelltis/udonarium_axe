import { computed, inject, Injectable, signal } from '@angular/core';
import { AudioAnalysisService } from '@axe/application/media/audio-analysis.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioPlayer } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { type AudioAnalysis, autoLevelGainDb } from '@axe/domain/media/audio-analysis';
import { AudioProfile } from '@axe/domain/media/audio-profile';
import { AUDIO_TAG_BGS, AudioTag } from '@axe/domain/media/audio-tag';
import { BackgroundSound } from '@axe/domain/media/background-sound';
import {
  type BeatGrid,
  beatLength,
  BEATS_PER_BAR,
  beatsAt,
  clampBpm,
  withBpm,
  withDownbeatAt,
} from '@axe/domain/media/beat-grid';
import { type CuePoints, NO_CUE_POINTS, withCuePoint } from '@axe/domain/media/cue-points';
import { type DjEffects, NO_DJ_EFFECTS } from '@axe/domain/media/dj-effects';
import { NO_DJ_PADS, withPad } from '@axe/domain/media/dj-pads';
import { type DjSettings } from '@axe/domain/media/dj-settings';
import { Jukebox } from '@axe/domain/media/jukebox';
import { roomMix } from '@axe/domain/media/mix-level';
import { TapTempo } from '@axe/domain/media/tap-tempo';
import { Config } from '@axe/domain/peer/config';
import { BackgroundSoundPlaybackService } from '@axe/features/media/background-sound-playback.service';
import { JukeboxPlaybackService } from '@axe/features/media/jukebox-playback.service';

function padKindOf(identifier: string): PadKind {
  const tag = AudioTag.get(identifier)?.tag;
  if (tag === 'SE') return 'effect';
  return tag === AUDIO_TAG_BGS ? 'background' : 'music';
}

/** How many taps it takes before the tempo they give is set on the track. */
export const TAPS_TO_SET_TEMPO = 4;

/** How often a knob being turned shares where it is with the room, at most, in milliseconds. */
export const EFFECTS_SHARE_MS = 100;

/** What a pad sets off: a one-shot effect, a background sound turned on and off, or the room's track. */
export type PadKind = 'effect' | 'background' | 'music';

/** One pad as the deck shows it. */
export interface PadView {
  readonly slot: number;
  /** The sound on the pad, by identifier; empty for an empty pad. */
  readonly identifier: string;
  /** The sound's name, or empty for an empty pad or a sound not in the library. */
  readonly name: string;
  readonly kind: PadKind | null;
  /** Whether the pad's sound is on this device, ready to play. */
  readonly ready: boolean;
}

/** Where the room's track stands against its beats on this peer: which beat of the bar, and how far into it. */
export interface BeatClock {
  /** The beat of the bar, from 0 for the first to 3 for the last. */
  readonly beatOfBar: number;
  /** How far into the beat, from 0 to just under 1. */
  readonly fraction: number;
  /** The count of beats from the grid's first bar, for telling one beat from the next. */
  readonly beat: number;
}

/**
 * The DJ deck's view of the room's track and what it can do with it: the track's reading and beats,
 * how the room mixes, and the controls to set the beats by hand and change the mix.
 *
 * Setting the beats is the doing of anyone who may change what the room plays; changing the mix is
 * the game master's, as with the room's other shared settings. A guest sees it all and changes
 * nothing.
 */
@Injectable({ providedIn: 'root' })
export class DjConsoleService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly analysis = inject(AudioAnalysisService);
  private readonly audioStorage = inject(AudioStorage);
  private readonly playback = inject(JukeboxPlaybackService);
  private readonly backgroundSounds = inject(BackgroundSoundPlaybackService);
  private readonly tapTempo = new TapTempo();

  /** Whether this reader may set the beats and work the deck, which every role but a guest may. */
  readonly canOperate = computed(() => {
    this.objectChange.trackMyCursor();
    return this.rolePermission.canEditTabletop;
  });

  /** Whether this reader may change how the room mixes, which only the game master may. */
  readonly canChangeSettings = computed(() => {
    this.objectChange.trackMyCursor();
    return this.rolePermission.canEditShared;
  });

  /** How the room mixes its music. */
  readonly settings = computed<DjSettings>(() => {
    this.objectChange.versionOf('Config')();
    return roomMix();
  });

  /** The room's track, by identifier; empty while none is set. */
  readonly track = computed(() => {
    this.objectChange.versionOf('Jukebox')();
    return this.jukebox?.audioIdentifier ?? '';
  });

  /** How the room's track was read, or null before it has been. */
  readonly trackAnalysis = computed<AudioAnalysis | null>(() => {
    const identifier = this.track();
    if (!identifier) return null;
    this.followProfile(identifier);
    return AudioProfile.analysisOf(identifier);
  });

  /** The beats the room's track keeps, or null when none are known. */
  readonly grid = computed<BeatGrid | null>(() => {
    const identifier = this.track();
    if (!identifier) return null;
    this.followProfile(identifier);
    return AudioProfile.gridOf(identifier);
  });

  /** Whether the room's track keeps beats set by hand rather than those its reading found. */
  readonly isGridManual = computed(() => {
    const identifier = this.track();
    if (!identifier) return false;
    this.followProfile(identifier);
    return AudioProfile.manualGridOf(identifier) !== null;
  });

  /** The places marked in the room's track. */
  readonly cues = computed<CuePoints>(() => {
    const identifier = this.track();
    if (!identifier) return NO_CUE_POINTS;
    this.followProfile(identifier);
    return AudioProfile.cuesOf(identifier);
  });

  /** The room's pads, with the sound on each. */
  readonly pads = computed<PadView[]>(() => {
    this.objectChange.versionOf('Config')();
    this.objectChange.fileVersion();
    this.objectChange.collectionOf(AudioTag.aliasName)();
    const pads = this.objectStore.get<Config>('Config')?.djPads ?? NO_DJ_PADS;
    return pads.map((identifier, slot) => {
      const audio = identifier ? this.audioStorage.get(identifier) : null;
      return {
        slot,
        identifier,
        name: audio?.name ?? '',
        kind: identifier ? padKindOf(identifier) : null,
        ready: audio?.isReady === true,
      };
    });
  });

  /** The sounds a pad may be given: every sound in the library, by name. */
  readonly assignable = computed<AudioFile[]>(() => {
    this.objectChange.fileVersion();
    return this.audioStorage.audios.filter((audio) => !audio.isHidden).sort((a, b) => a.name.localeCompare(b.name));
  });

  /** Whether the room's track is being read, or waiting to be. */
  readonly isAnalyzing = computed(() => {
    const identifier = this.track();
    if (!identifier) return false;
    this.analysis.version();
    return this.analysis.reading() === identifier || this.analysis.isPending(identifier);
  });

  /** How far the room's track is turned up or down to level it, in dB; 0 while the room does not level. */
  readonly levelDb = computed(() => {
    if (!this.settings().autoLevel) return 0;
    const identifier = this.track();
    this.followProfile(identifier);
    const isEffect = AudioTag.get(identifier)?.tag === 'SE';
    return autoLevelGainDb(this.trackAnalysis(), isEffect ? 'effect' : 'music');
  });

  private readonly _localEffects = signal<DjEffects | null>(null);
  private effectsTimer: ReturnType<typeof setTimeout> | null = null;

  /** The effects the room's music goes through, as this reader is turning them, ahead of the room hearing of it. */
  readonly effects = computed<DjEffects>(() => {
    this.objectChange.versionOf('Jukebox')();
    return this._localEffects() ?? this.jukebox?.effects ?? NO_DJ_EFFECTS;
  });

  /** Whether the room's track is playing, so it can be braked. */
  readonly isPlaying = computed(() => {
    this.objectChange.versionOf('Jukebox')();
    return this.jukebox?.isPlaying === true;
  });

  private readonly _tappedBpm = signal<number | null>(null);
  /** The tempo the latest taps give, or null until there are two. */
  readonly tappedBpm = this._tappedBpm.asReadonly();

  private get jukebox(): Jukebox | null {
    return this.objectStore.get<Jukebox>('Jukebox') ?? null;
  }

  /**
   * The room's track as it stands now. Changes read it here rather than through the signals, which
   * catch up with a change only once it has gone round, so two changes in a row build on each other.
   */
  private get playingTrack(): string {
    return this.jukebox?.audioIdentifier ?? '';
  }

  private followProfile(identifier: string): void {
    this.analysis.version();
    this.objectChange.versionOf(`audiotag_${identifier}`)();
  }

  /** Where the room's track is on this peer, in seconds, read afresh on every call. */
  position(): number {
    return this.jukebox?.position ?? 0;
  }

  /** Where the room's track stands against its beats on this peer now, or null without beats. */
  beatClock(): BeatClock | null {
    const grid = this.grid();
    if (!grid) return null;
    const beats = beatsAt(grid, this.position());
    const beat = Math.floor(beats + 1e-9);
    return {
      beat,
      beatOfBar: ((beat % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR,
      fraction: beats - beat,
    };
  }

  /** Changes how the room mixes, for everyone. Anyone but the game master is refused. */
  setSettings(change: Partial<DjSettings>): void {
    if (!this.rolePermission.canEditShared) return;
    const config = this.objectStore.get<Config>('Config');
    if (!config) return;
    config.djSettings = { ...config.djSettings, ...change };
    this.jukebox?.refreshMix();
  }

  /**
   * Takes a tap on the beat of the room's track. From the fourth tap on, the tempo the taps give is
   * set on the track, the latest tap taken for the beat of the bar it was nearest before, or for a
   * bar's first beat when the track had no beats.
   */
  tap(): void {
    const identifier = this.playingTrack;
    if (!identifier || !this.rolePermission.canEditTabletop) return;
    const bpm = this.tapTempo.tap({ atMs: performance.now(), position: this.position() });
    this._tappedBpm.set(bpm);
    const last = this.tapTempo.last;
    if (bpm === null || !last || this.tapTempo.count < TAPS_TO_SET_TEMPO) return;
    const before = AudioProfile.gridOf(identifier);
    const nearest = before ? Math.round(beatsAt(before, last.position)) : 0;
    const beatOfBar = ((nearest % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR;
    const tempo = clampBpm(bpm);
    const downbeat = last.position - (beatOfBar * 60) / tempo;
    this.setGrid(identifier, withDownbeatAt({ bpm: tempo, bar: 0 }, downbeat));
  }

  /** Doubles the tempo of the room's track, keeping where its bars start. */
  doubleTempo(): void {
    this.changeGrid((grid) => withBpm(grid, grid.bpm * 2));
  }

  /** Halves the tempo of the room's track, keeping where its bars start. */
  halveTempo(): void {
    this.changeGrid((grid) => withBpm(grid, grid.bpm / 2));
  }

  /** Makes the point the room's track is at now the first beat of a bar. */
  setDownbeatHere(): void {
    const position = this.position();
    this.changeGrid((grid) => withDownbeatAt(grid, position));
  }

  /** Lets the room's track go back to the beats its reading found. */
  resetGrid(): void {
    const identifier = this.playingTrack;
    if (!identifier || !this.rolePermission.canEditTabletop) return;
    this.tapTempo.reset();
    this._tappedBpm.set(null);
    AudioProfile.setGrid(identifier, null);
  }

  /**
   * Turns one effect for the room. It is heard here at once, and shared at most every
   * `EFFECTS_SHARE_MS` while a knob turns, and at once when it settles.
   */
  setEffect(kind: keyof DjEffects, value: number, settled: boolean = false): void {
    if (!this.rolePermission.canEditTabletop) return;
    const jukebox = this.jukebox;
    if (!jukebox) return;
    const next = { ...this.effects(), [kind]: value };
    this._localEffects.set(next);
    jukebox.applyEffects(next);
    if (settled) this.shareEffects();
    else this.effectsTimer ??= setTimeout(() => this.shareEffects(), EFFECTS_SHARE_MS);
  }

  /** Turns every effect off for the room. */
  resetEffects(): void {
    if (!this.rolePermission.canEditTabletop) return;
    this._localEffects.set(NO_DJ_EFFECTS);
    this.shareEffects();
  }

  /** Brakes the room's track to a stop, as a record stops when its turntable is switched off. */
  brakeStop(): void {
    if (!this.rolePermission.canEditTabletop) return;
    this.jukebox?.brakeStop();
  }

  /**
   * Presses one of the track's cue slots: an empty one is given the place the track is at, put on
   * the nearest beat while the room quantises, and one holding a place jumps the room there.
   */
  pressCue(slot: number): void {
    const identifier = this.playingTrack;
    if (!identifier || !this.rolePermission.canEditTabletop) return;
    const cues = AudioProfile.cuesOf(identifier);
    const at = cues[slot];
    if (typeof at === 'number') {
      this.jukebox?.jumpTo(at);
      return;
    }
    AudioProfile.setCues(identifier, withCuePoint(cues, slot, this.markablePosition(identifier)));
  }

  /** Empties one of the track's cue slots. */
  clearCue(slot: number): void {
    const identifier = this.playingTrack;
    if (!identifier || !this.rolePermission.canEditTabletop) return;
    AudioProfile.setCues(identifier, withCuePoint(AudioProfile.cuesOf(identifier), slot, null));
  }

  private markablePosition(identifier: string): number {
    const position = this.position();
    const grid = AudioProfile.gridOf(identifier);
    if (!grid || !this.settings().quantize) return position;
    return Math.max(0, grid.bar + Math.round(beatsAt(grid, position)) * beatLength(grid));
  }

  /**
   * Sets off a pad for the room: an effect plays once, a background sound starts or stops, and
   * music becomes the room's track, crossfading and waiting for the bar as any change of track does.
   */
  firePad(slot: number): void {
    const identifier = this.objectStore.get<Config>('Config')?.djPads[slot] ?? '';
    const audio = identifier ? this.audioStorage.get(identifier) : null;
    if (!audio?.isReady || !this.rolePermission.canEditTabletop) return;
    if (padKindOf(identifier) === 'background') this.backgroundSounds.toggle(audio);
    else this.playback.play(audio);
  }

  /** Gives a pad a sound for the room. Anyone but the game master is refused. */
  assignPad(slot: number, identifier: string): void {
    if (!this.rolePermission.canEditShared) return;
    const config = this.objectStore.get<Config>('Config');
    if (config) config.djPads = withPad(config.djPads, slot, identifier);
  }

  /** Empties a pad for the room. Anyone but the game master is refused. */
  clearPad(slot: number): void {
    this.assignPad(slot, '');
  }

  /** Whether a pad's sound is sounding on this peer, read afresh on every call. */
  isPadSounding(pad: PadView): boolean {
    if (!pad.identifier) return false;
    if (pad.kind === 'effect') return AudioPlayer.isSePlaying(pad.identifier);
    if (pad.kind === 'background') return BackgroundSound.of(pad.identifier)?.isOn === true;
    const jukebox = this.jukebox;
    return jukebox?.isPlaying === true && jukebox.audioIdentifier === pad.identifier;
  }

  private shareEffects(): void {
    if (this.effectsTimer !== null) clearTimeout(this.effectsTimer);
    this.effectsTimer = null;
    const effects = this._localEffects();
    this._localEffects.set(null);
    if (effects) this.jukebox?.setEffects(effects);
  }

  private changeGrid(change: (grid: BeatGrid) => BeatGrid): void {
    const identifier = this.playingTrack;
    const grid = identifier ? AudioProfile.gridOf(identifier) : null;
    if (!identifier || !grid || !this.rolePermission.canEditTabletop) return;
    this.setGrid(identifier, change(grid));
  }

  private setGrid(identifier: string, grid: BeatGrid): void {
    AudioProfile.setGrid(identifier, grid);
  }
}
