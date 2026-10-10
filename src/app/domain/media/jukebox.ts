import { updateAudioResource$ } from '@axe/core/event/domain-events';
import { onFirstUserInteraction } from '@axe/core/input/user-interaction-unlock';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioPlayer, VOLUME_TYPES, VolumeType } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject, ObjectContext } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AUDIO_TAG_BGS, AudioTag } from '@axe/domain/media/audio-tag';
import { BackgroundSound } from '@axe/domain/media/background-sound';
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
  private fadingPlayer: AudioPlayer | null = null;
  private audioUpdateCleanup: (() => void) | null = null;
  private releaseGestures: (() => void) | null = null;
  private isInitialSync = true;
  private playingFrom = 0;
  private static readonly CROSSFADE_MS = 600;
  private static readonly SYNC_SEEK_THRESHOLD_MS = 250;
  private static readonly RESTART_THRESHOLD_S = 3;

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
    this._stop();
  }

  /** Goes on with the room's paused track from where it stopped. Does nothing unless one is paused. */
  resume(): void {
    if (!this.isPaused) return;
    this.isPlaying = true;
    this._play(Number(this.startTime) || 0);
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
    this._play();
  }

  private playSE(audio: AudioFile) {
    AudioPlayer.playSE(audio);
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

  private _play(startAt: number = 0) {
    this._stop();
    this.playingFrom = startAt;
    if (!this.audio || !this.audio.isReady) {
      this.playAfterFileUpdate(startAt);
      return;
    }
    this.prepare(this.audioPlayer);
    this.audioPlayer.play(this.audio);
    if (startAt > 0) this.audioPlayer.seekTo(startAt);
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
    player.onEnded = isSE ? null : () => this.onTrackNaturallyEnded();
  }

  /** Stops the room's track and clears it, for every peer. */
  stop() {
    this.audioIdentifier = '';
    this.isPlaying = false;
    this._stop();
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

  private _stop() {
    this.unregisterEvent();
    this.audioPlayer.stop();
    if (this.fadingPlayer) {
      this.fadingPlayer.stop();
      this.fadingPlayer = null;
    }
  }

  private crossfadeSeek(time: number, fadeMs: number = Jukebox.CROSSFADE_MS) {
    if (!this.audio || !this.audio.isReady) {
      this.audioPlayer.seekTo(time);
      return;
    }
    if (this.fadingPlayer) {
      this.fadingPlayer.stop();
      this.fadingPlayer = null;
    }
    const fading = this.audioPlayer;
    fading.onEnded = null;
    this.fadingPlayer = fading;

    const newPlayer = new AudioPlayer();
    this.prepare(newPlayer);
    newPlayer.volume = 0;
    newPlayer.play(this.audio);
    newPlayer.seekTo(time);
    this.audioPlayer = newPlayer;

    newPlayer.fadeVolumeTo(1, fadeMs);
    fading.fadeVolumeTo(0, fadeMs).then(() => {
      if (this.fadingPlayer === fading) {
        fading.stop();
        this.fadingPlayer = null;
      }
    });
  }

  private playAfterFileUpdate(startAt: number = 0) {
    if (this.audioUpdateCleanup) return;
    this.audioUpdateCleanup = updateAudioResource$.subscribe(() => {
      if (!this.audio || !this.audio.isReady) return;
      this.unregisterEvent();
      this.prepare(this.audioPlayer);
      this.audioPlayer.play(this.audio);
      if (startAt > 0) this.audioPlayer.seekTo(startAt);
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
    super.apply(context);
    if (this.isInitialSync) {
      this.isInitialSync = false;
      if (this.isPlaying) this._play();
      return;
    }
    if (this.seTrigger !== seTrigger && this.seIdentifier) {
      const seAudio = AudioStorage.instance.get(this.seIdentifier);
      if (seAudio?.isReady) this.playSE(seAudio);
    }
    if (this.seStopTrigger !== seStopTrigger && this.seStopIdentifier) {
      AudioPlayer.stopSE(this.seStopIdentifier);
    }
    if ((audioIdentifier !== this.audioIdentifier || !isPlaying) && this.isPlaying) {
      const resumes = audioIdentifier === this.audioIdentifier && !isPlaying;
      this._play(resumes ? Number(this.startTime) || 0 : 0);
    } else if (isPlaying !== this.isPlaying && !this.isPlaying) {
      this._stop();
    } else if (this.isPlaying && (startTime !== this.startTime || this.wasSoughtSince(seekCount))) {
      const driftMs = Math.abs((this.audioPlayer.currentTime - this.startTime) * 1000);
      if (driftMs < Jukebox.SYNC_SEEK_THRESHOLD_MS) return;
      this.crossfadeSeek(this.startTime);
    }
  }
}
