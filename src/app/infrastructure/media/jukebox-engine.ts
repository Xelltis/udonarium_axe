import { MusicBus } from '@axe/core/audio/music-bus';
import { updateAudioResource$ } from '@axe/core/event/domain-events';
import { onFirstUserInteraction } from '@axe/core/input/user-interaction-unlock';
import { AudioFile } from '@axe/core/storage/audio-file';
import { VolumeType } from '@axe/core/storage/audio-output';
import { AudioPlayer } from '@axe/core/storage/audio-player';
import { AudioProfile } from '@axe/domain/media/audio-profile';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { BackgroundSound } from '@axe/domain/media/background-sound';
import { nextBoundary } from '@axe/domain/media/beat-grid';
import { type DjEffects, echoDelayS } from '@axe/domain/media/dj-effects';
import { Jukebox } from '@axe/domain/media/jukebox';
import { JukeboxPlayback } from '@axe/domain/media/jukebox-playback';
import { mixLevelOf, roomMix } from '@axe/domain/media/mix-level';
import { trackAfter } from '@axe/domain/media/playback-order';

/** A change held back for the next bar or beat: of the track, or a jump to a marked place in it. */
interface PendingChange {
  readonly kind: 'track' | 'jump';
  readonly timer: ReturnType<typeof setTimeout>;
  readonly run: () => void;
}

/** How long a seek from another peer crossfades for. */
const CROSSFADE_MS = 600;
/** How near a seek from another peer this peer may already be to leave it alone. */
const SYNC_SEEK_THRESHOLD_MS = 250;

/**
 * What the room's jukebox sounds like on this peer: the players, the fades from one track into the
 * next, the changes held for the next bar or beat, and the effects the music goes through.
 *
 * It plays what the jukebox has set and does what the jukebox asks; the one thing it writes back is
 * the room moving on, through the jukebox, when a track has played to its end.
 */
export class JukeboxEngine implements JukeboxPlayback {
  /** How long a track already playing takes to come to a new level, as when its reading arrives. */
  static readonly LEVEL_GLIDE_S = 1.5;
  /** The silence at the head of a track that is skipped when tracks are mixed into each other, beyond which it is cut. */
  static readonly LEAD_IN_KEPT_S = 0.3;
  /** How long a braked track takes to slow to a stop. */
  static readonly BRAKE_MS = 1200;
  /** The longest a change waits for the next bar or beat while the room quantises. */
  static readonly MAX_QUANTIZE_MS = 4000;
  /** How long a jump to a marked place crossfades for, short enough to keep the beat. */
  static readonly JUMP_FADE_MS = 80;

  private audioPlayer: AudioPlayer = new AudioPlayer();
  /** The players let go while still fading or slowing, each with the lease it was let go under. */
  private readonly fadingPlayers = new Map<AudioPlayer, number>();
  private fadeLeases = 0;
  /**
   * Players that have stopped, kept to play later tracks with: each holds a media element and its
   * audio nodes, which the page keeps for as long as its audio context lives.
   */
  private readonly sparePlayers: AudioPlayer[] = [];
  private soundingIdentifier = '';
  private pendingChange: PendingChange | null = null;
  private audioUpdateCleanup: (() => void) | null = null;
  private releaseGestures: (() => void) | null = null;
  private playingFrom = 0;

  constructor(private readonly room: Jukebox) {}

  /**
   * Starts playing the room's jukebox on this peer, as the room's first update asks of it.
   *
   * It listens to the user's gestures for as long as it plays, since browsers block playback until
   * the user has interacted with the page. A gesture starts the room's track again only while the
   * room is playing and the player's latest play was refused for want of a gesture. A track already
   * sounding, a silent room, a track that failed for another reason such as one that cannot be
   * loaded, and a track whose file is still arriving are left alone, so a gesture never loads a
   * track again for nothing.
   */
  attach(): void {
    this.releaseGestures?.();
    this.releaseGestures = onFirstUserInteraction(() => {
      if (this.room.isPlaying && this.audioPlayer.isAwaitingGesture && !this.audioUpdateCleanup)
        this.play(this.playingFrom);
      return false;
    });
    this.room.usePlayback(this);
  }

  dispose(): void {
    this.releaseGestures?.();
    this.releaseGestures = null;
    this.stop();
  }

  get currentTime(): number {
    return this.audioPlayer.currentTime;
  }

  get soundingTime(): number {
    return this.isSoundingTrack ? this.audioPlayer.currentTime : 0;
  }

  get duration(): number {
    return this.isSoundingTrack ? this.audioPlayer.duration : 0;
  }

  /**
   * Whether this peer's player holds the room's track, which it does not while the track has yet to
   * start, as when a change of track waits for the bar and the track before still sounds.
   */
  private get isSoundingTrack(): boolean {
    return this.soundingIdentifier !== '' && this.soundingIdentifier === this.room.audioIdentifier;
  }

  /** The room's track, or null when none is set or its file is not in this peer's storage. */
  private get audio(): AudioFile | null {
    return this.room.audio;
  }

  setLoop(loop: boolean): void {
    this.audioPlayer.loop = loop;
  }

  /**
   * Puts this peer's music through effects, the room's unless others are given to hear ahead of
   * sharing them, the echo timed to three quarters of a beat of the track playing, easing there
   * over the glide in seconds.
   */
  applyEffects(effects: DjEffects = this.room.effects, glideS: number = 0.05): void {
    const identifier = this.room.audioIdentifier;
    const bpm = identifier ? (AudioProfile.gridOf(identifier)?.bpm ?? null) : null;
    MusicBus.setEffects({ ...effects, echoDelayS: echoDelayS(bpm) }, glideS);
  }

  /**
   * Brings what this peer hears in line with the room's levels: the track and the background
   * sounds eased to them, as when a reading arrives or the room turns levelling on or off.
   */
  refreshMix(): void {
    if (this.soundingIdentifier) {
      this.audioPlayer.glideTrim(this.trackLevel(this.soundingIdentifier), JukeboxEngine.LEVEL_GLIDE_S);
    }
    for (const sound of BackgroundSound.playing()) sound.refreshLevel();
  }

  /**
   * Moves the room on to the next track a little before this one ends, so the two fade into each
   * other over the room's crossfade, and the silence at the end of a track is not waited through.
   *
   * Called a few times a second while the room plays; it does nothing on repeat one, without a
   * crossfade, while the track's length is not known, before the point to move on at, while a
   * change of track waits for its bar, and on the last track when the room does not go round, which
   * plays to its end.
   */
  tickAutomix(): void {
    const room = this.room;
    if (!room.isPlaying || room.repeatMode === 'one' || !this.isSoundingTrack || this.pendingChange !== null) return;
    const fadeS = roomMix().crossfadeS;
    const player = this.audioPlayer;
    if (fadeS <= 0 || player.paused) return;
    const duration = player.duration;
    if (!Number.isFinite(duration) || duration <= fadeS) return;
    const end = AudioProfile.analysisOf(room.audioIdentifier)?.end ?? duration;
    const lastSound = end > 0 && end < duration ? end : duration;
    if (player.currentTime < lastSound - fadeS) return;
    const { identifier, wrapped } = trackAfter(room.playOrder, room.audioIdentifier);
    if (!identifier || (wrapped && room.repeatMode !== 'all')) return;
    room.moveOnFromEnd();
  }

  playSE(audio: AudioFile): void {
    AudioPlayer.playSE(audio, mixLevelOf(audio.identifier, 'effect'));
  }

  stopSE(identifier: string): void {
    AudioPlayer.stopSE(identifier);
  }

  /**
   * Starts the room's track on this peer from a point in seconds, fading it in over the room's
   * crossfade while the track before it fades out, or cutting straight across when nothing was
   * sounding or the room has no crossfade.
   *
   * A change of track asked for while the room quantises waits for the next bar of the track
   * sounding, or its next beat when a bar is longer than the wait allowed, and starts from wherever
   * the room's track has been moved to meanwhile; it comes at once should that track end first. A
   * track going on after a pause fades in over the room's fade for a pause, when nothing else is
   * sounding.
   */
  play(startAt: number = 0, quantized: boolean = false, resuming: boolean = false): void {
    const wait = quantized ? this.quantizeWaitMs('bar') : 0;
    if (wait > 0) {
      this.holdChange('track', wait, () => this.play(Number(this.room.startTime) || 0));
      return;
    }
    this.cancelPendingChange();
    const fadeMs = roomMix().crossfadeS * 1000;
    const crossing = this.stopSounding(fadeMs);
    this.playingFrom = startAt;
    this.applyEffects();
    if (!this.audio || !this.audio.isReady) {
      this.playAfterFileUpdate(startAt);
      return;
    }
    this.startPlayer(this.audioPlayer, startAt, crossing ? fadeMs : resuming ? this.pauseFadeMs() : 0);
  }

  private startPlayer(player: AudioPlayer, startAt: number, fadeInMs: number): void {
    if (!this.audio) return;
    this.soundingIdentifier = this.room.audioIdentifier;
    this.prepare(player);
    player.fader = fadeInMs > 0 ? 0 : 1;
    player.play(this.audio);
    const from = startAt > 0 ? startAt : this.leadIn();
    if (from > 0) player.seekTo(from);
    if (fadeInMs > 0) void player.fadeVolumeTo(1, fadeInMs);
  }

  /**
   * Where a track starting from the top begins: past the silence at its head while the room mixes
   * tracks into each other, so one comes in as the other goes, and at the top otherwise.
   */
  private leadIn(): number {
    if (roomMix().crossfadeS <= 0) return 0;
    const start = AudioProfile.analysisOf(this.room.audioIdentifier)?.start ?? 0;
    return start > JukeboxEngine.LEAD_IN_KEPT_S ? start - 0.05 : 0;
  }

  /** The factor a track is played at to bring it to the loudness of music, or of an effect for one tagged SE: the room's unless another is named. */
  private trackLevel(identifier: string = this.room.audioIdentifier): number {
    const isSE = AudioTag.get(identifier)?.tag === 'SE';
    return mixLevelOf(identifier, isSE ? 'effect' : 'music');
  }

  /**
   * Sets a player up for the room's track: a track tagged SE plays once through the sound-effect
   * channel, and anything else plays as music, moving on when it ends and going round on repeat one.
   *
   * Music follows the loop points its file names, so a track with an introduction plays it once and
   * then goes round the part after it while on repeat one, and plays to its end otherwise.
   */
  private prepare(player: AudioPlayer): void {
    const isSE = AudioTag.get(this.room.audioIdentifier)?.tag === 'SE';
    player.volumeType = isSE ? VolumeType.SE : VolumeType.MASTER;
    player.followsLoopPoints = !isSE;
    player.loop = !isSE && this.room.repeatMode === 'one';
    player.trim = this.trackLevel();
    player.onEnded = isSE ? null : () => this.onPlayerEnded();
  }

  /** Follows the end of the track sounding: a change waiting for its bar or beat comes now, and otherwise the room moves on. */
  private onPlayerEnded(): void {
    if (!this.flushPendingChange()) this.room.moveOnFromEnd();
  }

  /** How long the music fades out when the room pauses or stops it, and in when it goes on, in milliseconds. */
  private pauseFadeMs(): number {
    return roomMix().pauseFadeS * 1000;
  }

  seekTo(time: number): void {
    if (this.pendingChange?.kind === 'jump') this.cancelPendingChange();
    if (this.isSoundingTrack) this.audioPlayer.seekTo(time);
  }

  follow(time: number): void {
    if (this.pendingChange?.kind === 'track') return;
    this.cancelPendingChange();
    const driftMs = Math.abs((this.audioPlayer.currentTime - time) * 1000);
    if (driftMs < SYNC_SEEK_THRESHOLD_MS) return;
    this.crossfadeSeek(time);
  }

  stop(fadeMs: number = 0): void {
    this.stopSounding(fadeMs);
  }

  /**
   * Stops this peer's track, fading it out over the time given or cutting it at once, and leaves a
   * player for whatever plays next. Without a fade, tracks still fading out from before stop too.
   * Says whether a track was left fading out.
   */
  private stopSounding(fadeMs: number = 0): boolean {
    this.unregisterEvent();
    this.cancelPendingChange();
    this.soundingIdentifier = '';
    if (fadeMs <= 0) {
      const fading = [...this.fadingPlayers.keys()];
      this.fadingPlayers.clear();
      for (const player of fading) this.keepSpare(player);
    }
    const fading = this.retire(this.audioPlayer, fadeMs);
    if (fading) this.audioPlayer = this.sparePlayer();
    return fading;
  }

  /**
   * Lets a player go: fading it out and then stopping it while it is sounding and a fade is asked
   * for, and stopping it at once otherwise. Says whether it was left fading; one left fading is no
   * longer this peer's player, and is kept spare once it has faded out.
   */
  private retire(player: AudioPlayer, fadeMs: number): boolean {
    player.onEnded = null;
    if (fadeMs <= 0 || player.paused || player.isAwaitingGesture || player.isLoading) {
      player.stop();
      return false;
    }
    this.letGo(player, player.fadeVolumeTo(0, fadeMs));
    return true;
  }

  /** Lets this peer's track slow to a stop, and leaves a player for whatever plays next. */
  brake(): void {
    this.unregisterEvent();
    this.cancelPendingChange();
    this.soundingIdentifier = '';
    const player = this.audioPlayer;
    player.onEnded = null;
    if (player.paused || player.isAwaitingGesture || player.isLoading) {
      player.stop();
      return;
    }
    this.audioPlayer = this.sparePlayer();
    this.letGo(player, player.brake(JukeboxEngine.BRAKE_MS));
  }

  /** Leaves a player to fade or slow out, keeping it spare once that is done unless it has been dealt with since. */
  private letGo(player: AudioPlayer, done: Promise<void>): void {
    const lease = ++this.fadeLeases;
    this.fadingPlayers.set(player, lease);
    void done.then(() => {
      if (this.fadingPlayers.get(player) !== lease) return;
      this.fadingPlayers.delete(player);
      this.keepSpare(player);
    });
  }

  /** A player to play the next track with: one kept spare, or a new one while none is. */
  private sparePlayer(): AudioPlayer {
    return this.sparePlayers.pop() ?? new AudioPlayer();
  }

  /** Stops a player let go of and keeps it to play a later track with. */
  private keepSpare(player: AudioPlayer): void {
    player.stop();
    player.onEnded = null;
    if (player !== this.audioPlayer && !this.sparePlayers.includes(player)) this.sparePlayers.push(player);
  }

  jump(time: number): void {
    const wait = this.quantizeWaitMs('beat');
    const jump = () => this.crossfadeSeek(time, JukeboxEngine.JUMP_FADE_MS);
    if (wait > 0) {
      this.holdChange('jump', wait, jump);
      return;
    }
    this.cancelPendingChange();
    jump();
  }

  barWaitMs(): number {
    return this.quantizeWaitMs('bar');
  }

  /**
   * How long a change waits for the next bar or beat of the track sounding on this peer, in
   * milliseconds: none unless the room quantises and the track keeps beats, and none when the
   * wait would be longer than `MAX_QUANTIZE_MS`; a bar that long is waited out to its next beat.
   */
  private quantizeWaitMs(unit: 'beat' | 'bar'): number {
    if (!roomMix().quantize || !this.soundingIdentifier) return 0;
    const player = this.audioPlayer;
    if (player.paused || player.isAwaitingGesture) return 0;
    const grid = AudioProfile.gridOf(this.soundingIdentifier);
    const position = player.currentTime;
    if (!grid || !Number.isFinite(position)) return 0;
    let waitMs = (nextBoundary(grid, position, unit) - position) * 1000;
    if (unit === 'bar' && waitMs > JukeboxEngine.MAX_QUANTIZE_MS) {
      waitMs = (nextBoundary(grid, position, 'beat') - position) * 1000;
    }
    return waitMs > 0 && waitMs <= JukeboxEngine.MAX_QUANTIZE_MS ? waitMs : 0;
  }

  /** Holds a change back for some milliseconds, for the next bar or beat, in place of any held before. */
  private holdChange(kind: PendingChange['kind'], waitMs: number, run: () => void): void {
    this.cancelPendingChange();
    const timer = setTimeout(() => {
      this.pendingChange = null;
      run();
    }, waitMs);
    this.pendingChange = { kind, timer, run };
  }

  /** Makes the change held back for its bar or beat at once, as when the track it waits on ends. Says whether one was held. */
  private flushPendingChange(): boolean {
    const pending = this.pendingChange;
    if (!pending) return false;
    this.cancelPendingChange();
    pending.run();
    return true;
  }

  private cancelPendingChange(): void {
    if (this.pendingChange !== null) clearTimeout(this.pendingChange.timer);
    this.pendingChange = null;
  }

  private crossfadeSeek(time: number, fadeMs: number = CROSSFADE_MS): void {
    if (!this.audio || !this.audio.isReady) {
      this.audioPlayer.seekTo(time);
      return;
    }
    if (this.retire(this.audioPlayer, fadeMs)) this.audioPlayer = this.sparePlayer();
    const newPlayer = this.audioPlayer;
    this.soundingIdentifier = this.room.audioIdentifier;
    this.prepare(newPlayer);
    newPlayer.fader = 0;
    newPlayer.play(this.audio);
    newPlayer.seekTo(time);
    void newPlayer.fadeVolumeTo(1, fadeMs);
  }

  private playAfterFileUpdate(startAt: number = 0): void {
    if (this.audioUpdateCleanup) return;
    this.audioUpdateCleanup = updateAudioResource$.subscribe(() => {
      if (!this.audio || !this.audio.isReady) return;
      this.unregisterEvent();
      this.startPlayer(this.audioPlayer, startAt, 0);
    });
  }

  private unregisterEvent(): void {
    this.audioUpdateCleanup?.();
    this.audioUpdateCleanup = null;
  }
}
