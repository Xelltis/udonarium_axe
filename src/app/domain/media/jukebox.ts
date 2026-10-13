import { MusicBus } from '@axe/core/audio/music-bus';
import { updateAudioResource$ } from '@axe/core/event/domain-events';
import { onFirstUserInteraction } from '@axe/core/input/user-interaction-unlock';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioPlayer, VOLUME_TYPES, VolumeType } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject, ObjectContext } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AudioProfile } from '@axe/domain/media/audio-profile';
import { AUDIO_TAG_BGS, AudioTag } from '@axe/domain/media/audio-tag';
import { BackgroundSound } from '@axe/domain/media/background-sound';
import { nextBoundary } from '@axe/domain/media/beat-grid';
import { type DjEffects, echoDelayS, readDjEffects, writeDjEffects } from '@axe/domain/media/dj-effects';
import { mixLevelOf, roomMix } from '@axe/domain/media/mix-level';
import {
  nextShuffleSeed,
  randomShuffleSeed,
  shuffledOrder,
  trackAfter,
  trackBefore,
} from '@axe/domain/media/playback-order';
import { Playlist } from '@axe/domain/media/playlist';
import { Config } from '@axe/domain/peer/config';

export type RepeatMode = 'none' | 'all' | 'one';

@SyncObject('jukebox')
export class Jukebox extends GameObject {
  @SyncVar() audioIdentifier: string = '';
  @SyncVar() startTime: number = 0;
  @SyncVar() repeatMode: RepeatMode = 'one';
  @SyncVar() isPlaying: boolean = false;
  @SyncVar() isSeekLocked: boolean = true;
  @SyncVar() seIdentifier: string = '';
  @SyncVar() seTrigger: number = 0;
  @SyncVar() seStopIdentifier: string = '';
  @SyncVar() seStopTrigger: number = 0;

  /**
   * The playlist the room plays through, by identifier. Empty for the room's first playlist.
   *
   * An older version knows nothing of it and may send the jukebox without it, which reads as the
   * room's first playlist too.
   */
  @SyncVar() playlistIdentifier: string = '';

  /** Whether the room plays its playlist shuffled. Only `true` counts; an older version sends nothing. */
  @SyncVar() isShuffled: boolean = false;

  /** What the shuffled order is worked out from, the same on every peer. */
  @SyncVar() shuffleSeed: number = 0;

  /** The track the shuffled order starts from, so the one playing when shuffle came on goes first. */
  @SyncVar() shuffleLead: string = '';

  /**
   * How many times the room's track has been moved, so moving it back to the point it was last
   * moved to still reaches every peer, as starting a track again from the top does.
   */
  @SyncVar() seekCount: number = 0;

  /**
   * The effects the room's music goes through, as text for `readDjEffects`: empty while none is on.
   * Live, as a DJ works them, so not kept in a saved room. An older version knows nothing of them,
   * and its peers hear the music as it is.
   */
  @SyncVar() fx: string = '';

  /**
   * How many times the room's track has been braked to a stop, so every peer slows it down as the
   * one who braked it did. An older version sends no count, and its stop is an ordinary one.
   */
  @SyncVar() brakeCount: number = 0;

  /**
   * How many times the room's track has jumped to a marked place, so every peer jumps on its own
   * next beat while the room quantises. A jump moves the seek count too, so an older version, which
   * knows nothing of jumps, follows it as a seek.
   */
  @SyncVar() jumpCount: number = 0;

  /** The track the room is set to, or null when none is set or its file is not in this peer's storage. */
  get audio(): AudioFile | null {
    return AudioStorage.instance.get(this.audioIdentifier);
  }

  /** Whether the room's track is held where it stopped, to go on from there, rather than playing or cleared. */
  get isPaused(): boolean {
    return this.isPlaying !== true && (this.audioIdentifier ?? '').length > 0;
  }

  /** Whether the room plays its playlist shuffled. */
  get shuffles(): boolean {
    return this.isShuffled === true;
  }

  /** The playlist the room plays through: the one chosen, or the room's first while none is or the chosen one is gone. */
  get playlist(): Playlist | null {
    const chosen = this.playlistIdentifier ? ObjectStore.instance.get(this.playlistIdentifier) : null;
    return chosen instanceof Playlist ? chosen : Playlist.instance;
  }

  /**
   * The tracks the room plays through, as listed: its playlist's, or every BGM in the library while
   * that is empty. Sound effects and background sounds are not music and are left out.
   */
  get queue(): string[] {
    const entries = this.playlist?.entries ?? [];
    if (entries.length > 0) return [...entries];
    return AudioStorage.instance.audios
      .filter((audio) => {
        const tag = AudioTag.get(audio.identifier)?.tag ?? 'BGM';
        return !audio.isHidden && tag !== 'SE' && tag !== AUDIO_TAG_BGS;
      })
      .map((audio) => audio.identifier);
  }

  /** The queue in the order it is played: as listed, or mixed while shuffle is on. */
  get playOrder(): string[] {
    const queue = this.queue;
    return this.shuffles ? shuffledOrder(queue, Number(this.shuffleSeed) || 0, this.shuffleLead ?? '') : queue;
  }

  private audioPlayer: AudioPlayer = new AudioPlayer();
  private readonly fadingPlayers = new Set<AudioPlayer>();
  private soundingIdentifier = '';
  private pendingChange: ReturnType<typeof setTimeout> | null = null;
  private audioUpdateCleanup: (() => void) | null = null;
  private releaseGestures: (() => void) | null = null;
  private isInitialSync = true;
  private playingFrom = 0;
  private static readonly CROSSFADE_MS = 600;
  private static readonly SYNC_SEEK_THRESHOLD_MS = 250;
  private static readonly RESTART_THRESHOLD_S = 3;
  /** How long a track takes to fade out when the room pauses or stops it. */
  static readonly STOP_FADE_MS = 400;
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

  /** The room's shared settings, whose room volume scales every volume here. */
  get config(): Config {
    return ObjectStore.instance.get<Config>('Config')!;
  }

  private readonly levels = new Map<VolumeType, number>();

  /**
   * This peer's own level for one channel, from 0 to 1, which is half until it is set. It is not
   * shared with the room, and changes nothing audible until `setNewVolume()` is called.
   */
  levelOf(type: VolumeType): number {
    return this.levels.get(type) ?? 0.5;
  }

  /** Sets this peer's own level for one channel, from 0 to 1. Takes effect through `setNewVolume()`. */
  setLevel(type: VolumeType, level: number): void {
    this.levels.set(type, level);
  }

  /** This peer's own music volume, from 0 to 1. Takes effect through `setNewVolume()`. */
  get volume(): number {
    return this.levelOf(VolumeType.MASTER);
  }
  set volume(volume: number) {
    this.setLevel(VolumeType.MASTER, volume);
  }

  /** This peer's own volume for previewing a track, from 0 to 1. Takes effect through `setNewVolume()`. */
  get auditionVolume(): number {
    return this.levelOf(VolumeType.AUDITION);
  }
  set auditionVolume(auditionVolume: number) {
    this.setLevel(VolumeType.AUDITION, auditionVolume);
  }

  /** This peer's own sound-effect volume, from 0 to 1. Takes effect through `setNewVolume()`. */
  get seVolume(): number {
    return this.levelOf(VolumeType.SE);
  }
  set seVolume(seVolume: number) {
    this.setLevel(VolumeType.SE, seVolume);
  }

  /** This peer's own volume for the room's background sounds, from 0 to 1. Takes effect through `setNewVolume()`. */
  get backgroundVolume(): number {
    return this.levelOf(VolumeType.BACKGROUND);
  }
  set backgroundVolume(backgroundVolume: number) {
    this.setLevel(VolumeType.BACKGROUND, backgroundVolume);
  }

  /** How far into the track this peer's playback is, in seconds. */
  get currentTime(): number {
    return this.audioPlayer.currentTime;
  }

  /** How far into the room's track it is, in seconds: where this peer is playing, or where it was paused. */
  get position(): number {
    if (this.isPlaying) return this.audioPlayer.currentTime;
    return this.isPaused ? Number(this.startTime) || 0 : 0;
  }

  /** The length of the track this peer is playing, in seconds. */
  get duration(): number {
    return this.audioPlayer.duration;
  }

  /** Steps the room's repeat mode from none to all to one and round again, and shares the change. */
  cycleRepeatMode(): void {
    const modes: RepeatMode[] = ['none', 'all', 'one'];
    const next = (modes.indexOf(this.repeatMode) + 1) % modes.length;
    this.repeatMode = modes[next];
    this.audioPlayer.loop = this.repeatMode === 'one';
  }

  /**
   * Turns shuffle on or off for the room.
   *
   * Turned on, the playlist is mixed afresh, starting from the track playing now, so every track
   * is heard once before any comes round again.
   */
  setShuffled(shuffled: boolean): void {
    GameObject.batch(() => {
      this.isShuffled = shuffled;
      if (shuffled) {
        this.shuffleSeed = randomShuffleSeed();
        this.shuffleLead = this.audioIdentifier ?? '';
      }
    });
  }

  /**
   * Makes a playlist the one the room plays through and starts it from its first track, mixed afresh
   * while shuffle is on.
   *
   * An empty playlist is only chosen, and whatever is playing goes on.
   */
  playPlaylist(playlist: Playlist): void {
    GameObject.batch(() => {
      this.playlistIdentifier = playlist.identifier;
      if (playlist.entries.length === 0) return;
      if (this.shuffles) {
        this.shuffleSeed = randomShuffleSeed();
        this.shuffleLead = '';
      }
      const first = this.playableAfter(this.playOrder, '');
      if (first) this.play(first);
    });
  }

  /** Plays one track of a playlist for the room, making that the playlist the room goes on through. */
  playFromPlaylist(playlist: Playlist, identifier: string): void {
    GameObject.batch(() => {
      this.playlistIdentifier = playlist.identifier;
      this.play(identifier);
    });
  }

  /** Plays the track after the current one for the room, going round from the last to the first. */
  playNext(): void {
    const next = this.playableAfter(this.playOrder, this.audioIdentifier ?? '');
    if (next) this.play(next);
  }

  /**
   * Plays the track before the current one for the room, going round from the first to the last.
   *
   * A track more than a few seconds in is started again from the top instead.
   */
  playPrevious(): void {
    if (this.isPlaying && this.audioPlayer.currentTime > Jukebox.RESTART_THRESHOLD_S) {
      this.seek(0);
      return;
    }
    const previous = this.playableBefore(this.playOrder, this.audioIdentifier ?? '');
    if (previous) this.play(previous);
  }

  /** Stops the room's track where it is, keeping it to go on from there. Does nothing unless it is playing. */
  pause(): void {
    if (!this.isPlaying || !this.audioIdentifier) return;
    const at = this.audioPlayer.currentTime;
    GameObject.batch(() => {
      this.startTime = Number.isFinite(at) && at > 0 ? at : 0;
      this.isPlaying = false;
    });
    this._stop(Jukebox.STOP_FADE_MS);
  }

  /** Goes on with the room's paused track from where it stopped. Does nothing unless one is paused. */
  resume(): void {
    if (!this.isPaused) return;
    this.isPlaying = true;
    this._play(Number(this.startTime) || 0);
  }

  /**
   * Stops the room's track as a record stops when its turntable is switched off: it slows to a
   * stop, its pitch falling, and is held there to go on from where the braking began. Does nothing
   * unless it is playing.
   */
  brakeStop(): void {
    if (!this.isPlaying || !this.audioIdentifier) return;
    const at = this.audioPlayer.currentTime;
    GameObject.batch(() => {
      this.startTime = Number.isFinite(at) && at > 0 ? at : 0;
      this.isPlaying = false;
      this.brakeCount = (Number(this.brakeCount) || 0) + 1;
    });
    this.brakeOut();
  }

  /** The effects the room's music goes through. */
  get effects(): DjEffects {
    return readDjEffects(this.fx);
  }

  /** Puts the room's music through these effects, for every peer. */
  setEffects(effects: DjEffects): void {
    const text = writeDjEffects(effects);
    if (text !== (this.fx ?? '')) this.fx = text;
    this.applyEffects(effects);
  }

  /**
   * Puts this peer's music through effects, the room's unless others are given to hear ahead of
   * sharing them, the echo timed to three quarters of a beat of the track playing, easing there
   * over the glide in seconds.
   */
  applyEffects(effects: DjEffects = this.effects, glideS: number = 0.05): void {
    const bpm = this.audioIdentifier ? (AudioProfile.gridOf(this.audioIdentifier)?.bpm ?? null) : null;
    MusicBus.setEffects({ ...effects, echoDelayS: echoDelayS(bpm) }, glideS);
  }

  /**
   * Listens to the user's gestures for as long as the jukebox is in the room, since browsers block
   * playback until the user has interacted with the page.
   *
   * A gesture starts the room's track again only while the room is playing and the player's latest
   * play was refused for want of a gesture. A track already sounding, a silent room, a track that
   * failed for another reason such as one that cannot be loaded, and a track whose file is still
   * arriving are left alone, so a gesture never loads a track again for nothing.
   */
  override onStoreAdded() {
    super.onStoreAdded();
    this.unlockAfterUserInteraction();
  }

  /** Stops this peer's playback, and listening to the user's gestures, when the jukebox leaves the room. */
  override onStoreRemoved() {
    super.onStoreRemoved();
    this.releaseGestures?.();
    this.releaseGestures = null;
    this._stop();
  }

  /**
   * Applies this peer's own level for every channel, each scaled by the room's master volume and by
   * the room's volume for that channel's kind of sound.
   */
  setNewVolume() {
    const config = this.config;
    for (const type of VOLUME_TYPES) AudioPlayer.setChannelVolume(type, this.levelOf(type) * config.roomScaleFor(type));
  }

  /**
   * Brings what this peer hears in line with the room's mix: the track and the background sounds
   * eased to their levels, as when a reading arrives or the room turns levelling on or off, and the
   * music ducked under effects or not.
   */
  refreshMix(): void {
    MusicBus.setDucking(roomMix().ducking);
    if (this.audioIdentifier) this.audioPlayer.glideTrim(this.trackLevel(), Jukebox.LEVEL_GLIDE_S);
    for (const sound of BackgroundSound.playing()) sound.refreshLevel();
  }

  /**
   * Moves the room on to the next track a little before this one ends, so the two fade into each
   * other over the room's crossfade, and the silence at the end of a track is not waited through.
   *
   * Called a few times a second while the room plays; it does nothing on repeat one, without a
   * crossfade, while the track's length is not known, or before the point to move on at.
   */
  tickAutomix(): void {
    if (!this.isPlaying || this.repeatMode === 'one' || !this.audioIdentifier) return;
    const fadeS = roomMix().crossfadeS;
    const player = this.audioPlayer;
    if (fadeS <= 0 || player.paused) return;
    const duration = player.duration;
    if (!Number.isFinite(duration) || duration <= fadeS) return;
    const end = AudioProfile.analysisOf(this.audioIdentifier)?.end ?? duration;
    const lastSound = end > 0 && end < duration ? end : duration;
    if (player.currentTime >= lastSound - fadeS) this.onTrackNaturallyEnded();
  }

  /**
   * Plays a sound for the whole room.
   *
   * A sound tagged SE is played once over the music on every peer, leaving the track alone. One
   * tagged as a background sound starts looping underneath the music, also leaving the track alone.
   * Anything else becomes the room's track. Nothing happens when the file is missing or not ready
   * yet. The loop argument is ignored; the repeat mode decides.
   */
  play(identifier: string, _isLoop: boolean = false) {
    const audio = AudioStorage.instance.get(identifier);
    if (!audio || !audio.isReady) return;
    if (AudioTag.isBackgroundSound(identifier)) {
      BackgroundSound.start(identifier);
      return;
    }
    if (AudioTag.get(identifier)?.tag === 'SE') {
      this.seIdentifier = identifier;
      this.seTrigger = this.seTrigger + 1;
      this.playSE(audio);
      return;
    }
    GameObject.batch(() => {
      this.startTime = 0;
      this.audioIdentifier = identifier;
      this.isPlaying = true;
    });
    this._play(0, true);
  }

  private playSE(audio: AudioFile) {
    AudioPlayer.playSE(audio, mixLevelOf(audio.identifier, 'effect'));
  }

  /** Stops a sound effect on this peer and on every other peer. */
  stopSE(identifier: string) {
    this.seStopIdentifier = identifier;
    this.seStopTrigger = this.seStopTrigger + 1;
    AudioPlayer.stopSE(identifier);
  }

  /** Whether the sound effect is playing on this peer. */
  isSePlaying(identifier: string): boolean {
    return AudioPlayer.isSePlaying(identifier);
  }

  /**
   * Starts the room's track on this peer from a point in seconds, fading it in over the room's
   * crossfade while the track before it fades out, or cutting straight across when nothing was
   * sounding or the room has no crossfade.
   *
   * A change of track asked for while the room quantises waits for the next bar of the track
   * sounding, or its next beat when a bar is longer than the wait allowed.
   */
  private _play(startAt: number = 0, quantized: boolean = false) {
    this.cancelPendingChange();
    const wait = quantized ? this.quantizeWaitMs('bar') : 0;
    if (wait > 0) {
      this.pendingChange = setTimeout(() => {
        this.pendingChange = null;
        this._play(startAt);
      }, wait);
      return;
    }
    const fadeMs = roomMix().crossfadeS * 1000;
    const crossing = this._stop(fadeMs);
    this.playingFrom = startAt;
    if (!this.audio || !this.audio.isReady) {
      this.playAfterFileUpdate(startAt);
      return;
    }
    this.startPlayer(this.audioPlayer, startAt, crossing ? fadeMs : 0);
    this.applyEffects();
  }

  private startPlayer(player: AudioPlayer, startAt: number, fadeInMs: number): void {
    if (!this.audio) return;
    this.soundingIdentifier = this.audioIdentifier;
    this.prepare(player);
    if (fadeInMs > 0) player.fader = 0;
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
    const start = AudioProfile.analysisOf(this.audioIdentifier)?.start ?? 0;
    return start > Jukebox.LEAD_IN_KEPT_S ? start - 0.05 : 0;
  }

  /** The factor the room's track is played at to bring it to the loudness of music, or of an effect for one tagged SE. */
  private trackLevel(): number {
    const isSE = AudioTag.get(this.audioIdentifier)?.tag === 'SE';
    return mixLevelOf(this.audioIdentifier, isSE ? 'effect' : 'music');
  }

  /**
   * Sets a player up for the room's track: a track tagged SE plays once through the sound-effect
   * channel, and anything else plays as music, moving on when it ends and going round on repeat one.
   *
   * Music follows the loop points its file names, so a track with an introduction plays it once and
   * then goes round the part after it while on repeat one, and plays to its end otherwise.
   */
  private prepare(player: AudioPlayer): void {
    const isSE = AudioTag.get(this.audioIdentifier)?.tag === 'SE';
    player.volumeType = isSE ? VolumeType.SE : VolumeType.MASTER;
    player.followsLoopPoints = !isSE;
    player.loop = !isSE && this.repeatMode === 'one';
    player.trim = this.trackLevel();
    player.onEnded = isSE ? null : () => this.onTrackNaturallyEnded();
  }

  /** Stops the room's track, fading it out, and clears it, for every peer. */
  stop() {
    this.audioIdentifier = '';
    this.isPlaying = false;
    this._stop(Jukebox.STOP_FADE_MS);
  }

  /**
   * Moves the room's track to a point in seconds.
   *
   * Other peers cross-fade to the new point, unless they are already within a quarter of a
   * second of it.
   */
  seek(time: number) {
    GameObject.batch(() => {
      this.startTime = time;
      this.seekCount = (Number(this.seekCount) || 0) + 1;
    });
    this.audioPlayer.seekTo(time);
  }

  /**
   * Stops this peer's track, fading it out over the time given or cutting it at once, and leaves a
   * fresh player for whatever plays next. Without a fade, tracks still fading out from before stop
   * too. Says whether a track was left fading out.
   */
  private _stop(fadeMs: number = 0): boolean {
    this.unregisterEvent();
    this.cancelPendingChange();
    this.soundingIdentifier = '';
    if (fadeMs <= 0) {
      for (const player of this.fadingPlayers) player.stop();
      this.fadingPlayers.clear();
    }
    const fading = this.retire(this.audioPlayer, fadeMs);
    this.audioPlayer = new AudioPlayer();
    return fading;
  }

  /**
   * Lets a player go: fading it out and then stopping it while it is sounding and a fade is asked
   * for, and stopping it at once otherwise. Says whether it was left fading.
   */
  private retire(player: AudioPlayer, fadeMs: number): boolean {
    player.onEnded = null;
    if (fadeMs <= 0 || player.paused || player.isAwaitingGesture) {
      player.stop();
      return false;
    }
    this.fadingPlayers.add(player);
    void player.fadeVolumeTo(0, fadeMs).then(() => {
      if (this.fadingPlayers.delete(player)) player.stop();
    });
    return true;
  }

  /** Lets this peer's track slow to a stop, as `brakeStop` asks, and leaves a fresh player for whatever plays next. */
  private brakeOut(): void {
    this.unregisterEvent();
    this.cancelPendingChange();
    this.soundingIdentifier = '';
    const player = this.audioPlayer;
    player.onEnded = null;
    this.audioPlayer = new AudioPlayer();
    if (player.paused || player.isAwaitingGesture) {
      player.stop();
      return;
    }
    this.fadingPlayers.add(player);
    void player.brake(Jukebox.BRAKE_MS).then(() => {
      if (this.fadingPlayers.delete(player)) player.stop();
    });
  }

  /**
   * Jumps the room's track to a marked place in seconds, for every peer: each crossfades there in a
   * moment, on its own next beat while the room quantises. While the track is held, the place is
   * only kept to go on from.
   */
  jumpTo(time: number): void {
    if (!this.isPlaying || !this.audioIdentifier) {
      this.seek(time);
      return;
    }
    GameObject.batch(() => {
      this.startTime = time;
      this.seekCount = (Number(this.seekCount) || 0) + 1;
      this.jumpCount = (Number(this.jumpCount) || 0) + 1;
    });
    this.followJump(time);
  }

  private followJump(time: number): void {
    this.cancelPendingChange();
    const wait = this.quantizeWaitMs('beat');
    const jump = () => {
      this.pendingChange = null;
      this.crossfadeSeek(time, Jukebox.JUMP_FADE_MS);
    };
    if (wait > 0) this.pendingChange = setTimeout(jump, wait);
    else jump();
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
    if (unit === 'bar' && waitMs > Jukebox.MAX_QUANTIZE_MS) {
      waitMs = (nextBoundary(grid, position, 'beat') - position) * 1000;
    }
    return waitMs > 0 && waitMs <= Jukebox.MAX_QUANTIZE_MS ? waitMs : 0;
  }

  private cancelPendingChange(): void {
    if (this.pendingChange !== null) clearTimeout(this.pendingChange);
    this.pendingChange = null;
  }

  private crossfadeSeek(time: number, fadeMs: number = Jukebox.CROSSFADE_MS) {
    if (!this.audio || !this.audio.isReady) {
      this.audioPlayer.seekTo(time);
      return;
    }
    this.retire(this.audioPlayer, fadeMs);
    const newPlayer = new AudioPlayer();
    this.audioPlayer = newPlayer;
    this.soundingIdentifier = this.audioIdentifier;
    this.prepare(newPlayer);
    newPlayer.fader = 0;
    newPlayer.play(this.audio);
    newPlayer.seekTo(time);
    void newPlayer.fadeVolumeTo(1, fadeMs);
  }

  private playAfterFileUpdate(startAt: number = 0) {
    if (this.audioUpdateCleanup) return;
    this.audioUpdateCleanup = updateAudioResource$.subscribe(() => {
      if (!this.audio || !this.audio.isReady) return;
      this.unregisterEvent();
      this.startPlayer(this.audioPlayer, startAt, 0);
    });
  }

  /**
   * Moves the room on to the next track once one has played to its end.
   *
   * Every peer gets here on its own and works out the same next track, so they agree without
   * waiting for each other. Going round from the last track to the first happens only on repeat,
   * and while shuffled the next time round is mixed afresh, with the track just heard kept off the
   * top.
   */
  private onTrackNaturallyEnded() {
    if (this.repeatMode === 'one') return;
    const { identifier, wrapped } = trackAfter(this.playOrder, this.audioIdentifier);
    if (!identifier || (wrapped && this.repeatMode !== 'all')) {
      this.stop();
      return;
    }
    GameObject.batch(() => {
      let next = identifier;
      if (wrapped && this.shuffles) {
        const seed = nextShuffleSeed(Number(this.shuffleSeed) || 0);
        const fresh = shuffledOrder(this.queue, seed);
        next = fresh.length > 1 && fresh[0] === this.audioIdentifier ? fresh[1] : fresh[0];
        this.shuffleSeed = seed;
        this.shuffleLead = next;
      }
      this.startTime = 0;
      this.audioIdentifier = next;
    });
    this._play();
  }

  private playableAfter(order: readonly string[], from: string): string | null {
    return this.firstPlayable(order, from, (current) => trackAfter(order, current).identifier);
  }

  private playableBefore(order: readonly string[], from: string): string | null {
    return this.firstPlayable(order, from, (current) => trackBefore(order, current));
  }

  private firstPlayable(
    order: readonly string[],
    from: string,
    step: (current: string) => string | null
  ): string | null {
    let current = from;
    for (let i = 0; i < order.length; i++) {
      const candidate = step(current);
      if (!candidate) return null;
      const audio = AudioStorage.instance.get(candidate);
      if (audio && audio.isReady && !audio.isHidden) return candidate;
      current = candidate;
    }
    return null;
  }

  private unlockAfterUserInteraction() {
    this.releaseGestures?.();
    this.releaseGestures = onFirstUserInteraction(() => {
      if (this.isPlaying && this.audioPlayer.isAwaitingGesture && !this.audioUpdateCleanup)
        this._play(this.playingFrom);
      return false;
    });
  }

  /** Whether another peer jumped the track to a marked place since the count read before, which an older version never says. */
  private wasJumpedSince(jumpCount: number): boolean {
    return typeof this.jumpCount === 'number' && this.jumpCount !== jumpCount;
  }

  /** Whether another peer braked the track since the count read before, which an older version, sending no count, never says. */
  private wasBrakedSince(brakeCount: number): boolean {
    return typeof this.brakeCount === 'number' && this.brakeCount !== brakeCount;
  }

  /** Whether another peer moved the track since the count read before, which an older version, sending no count, never says. */
  private wasSoughtSince(seekCount: number): boolean {
    return typeof this.seekCount === 'number' && this.seekCount !== seekCount;
  }

  private unregisterEvent() {
    this.audioUpdateCleanup?.();
    this.audioUpdateCleanup = null;
  }

  /**
   * Takes in an update from another peer and follows it: a sound effect played or stopped, the
   * track started, changed or stopped, or a seek.
   *
   * The first update only starts the track if the room is already playing one.
   */
  override apply(context: ObjectContext) {
    const audioIdentifier = this.audioIdentifier;
    const isPlaying = this.isPlaying;
    const startTime = this.startTime;
    const seekCount = this.seekCount;
    const seTrigger = this.seTrigger;
    const seStopTrigger = this.seStopTrigger;
    const brakeCount = this.brakeCount;
    const jumpCount = this.jumpCount;
    const fx = this.fx;
    super.apply(context);
    if (this.isInitialSync) {
      this.isInitialSync = false;
      if (this.isPlaying) this._play();
      else this.applyEffects();
      return;
    }
    if ((fx ?? '') !== (this.fx ?? '')) this.applyEffects();
    if (this.seTrigger !== seTrigger && this.seIdentifier) {
      const seAudio = AudioStorage.instance.get(this.seIdentifier);
      if (seAudio?.isReady) this.playSE(seAudio);
    }
    if (this.seStopTrigger !== seStopTrigger && this.seStopIdentifier) {
      AudioPlayer.stopSE(this.seStopIdentifier);
    }
    if ((audioIdentifier !== this.audioIdentifier || !isPlaying) && this.isPlaying) {
      const resumes = audioIdentifier === this.audioIdentifier && !isPlaying;
      this._play(resumes ? Number(this.startTime) || 0 : 0, !resumes);
    } else if (isPlaying !== this.isPlaying && !this.isPlaying) {
      if (this.wasBrakedSince(brakeCount)) this.brakeOut();
      else this._stop(Jukebox.STOP_FADE_MS);
    } else if (this.isPlaying && (startTime !== this.startTime || this.wasSoughtSince(seekCount))) {
      if (this.wasJumpedSince(jumpCount)) {
        this.followJump(Number(this.startTime) || 0);
        return;
      }
      const driftMs = Math.abs((this.audioPlayer.currentTime - this.startTime) * 1000);
      if (driftMs < Jukebox.SYNC_SEEK_THRESHOLD_MS) return;
      this.crossfadeSeek(this.startTime);
    }
  }
}
