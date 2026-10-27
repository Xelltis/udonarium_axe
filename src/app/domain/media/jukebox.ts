import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject, ObjectContext } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AUDIO_TAG_BGS, AudioTag } from '@axe/domain/media/audio-tag';
import { BackgroundSound } from '@axe/domain/media/background-sound';
import { type DjEffects, readDjEffects, writeDjEffects } from '@axe/domain/media/dj-effects';
import { JukeboxPlayback, SILENT_PLAYBACK } from '@axe/domain/media/jukebox-playback';
import { roomMix } from '@axe/domain/media/mix-level';
import {
  nextShuffleSeed,
  randomShuffleSeed,
  shuffledOrder,
  trackAfter,
  trackBefore,
} from '@axe/domain/media/playback-order';
import { Playlist } from '@axe/domain/media/playlist';

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
   *
   * It and the two counts below are given no starting value, so a jukebox is made without writing
   * them, and they read as unset until first used.
   */
  @SyncVar() fx: string | undefined;

  /**
   * How many times the room's track has been braked to a stop, so every peer slows it down as the
   * one who braked it did. An older version sends no count, and its stop is an ordinary one.
   */
  @SyncVar() brakeCount: number | undefined;

  /**
   * How many times the room's track has jumped to a marked place, so every peer jumps on its own
   * next beat while the room quantises. A jump moves the seek count too, so an older version, which
   * knows nothing of jumps, follows it as a seek.
   */
  @SyncVar() jumpCount: number | undefined;

  /**
   * How many times the room's track has been changed on the next bar or beat, so every peer waits
   * for its own as the one who changed it did, and cuts straight across for a change that did not
   * wait, such as one into the next track as the last ends. An older version sends no count, and a
   * change from it is followed at once, as it was made.
   */
  @SyncVar() quantizeCount: number | undefined;

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

  /** What this peer hears of the room's jukebox, silent until a playback is attached. */
  private playback: JukeboxPlayback = SILENT_PLAYBACK;
  private isInitialSync = true;
  /** Whether the first update from the room came before any playback was attached, to be followed once one is. */
  private initialSyncUnheard = false;
  /** How far into a track the previous one is taken to mean the top of this one again. */
  private static readonly RESTART_THRESHOLD_S = 3;

  /**
   * Plays the room's jukebox on this peer through a playback, as it starts listening: the room's
   * track at once where the room's first update came before it, and nothing until that update
   * otherwise.
   */
  usePlayback(playback: JukeboxPlayback): void {
    this.playback = playback;
    if (!this.initialSyncUnheard) return;
    this.initialSyncUnheard = false;
    this.followInitialSync();
  }

  private followInitialSync(): void {
    if (this.isPlaying) this.playback.play();
    else this.playback.applyEffects();
  }

  /** How far into the track this peer's playback is, in seconds. */
  get currentTime(): number {
    return this.playback.currentTime;
  }

  /** How far into the room's track it is, in seconds: where this peer is playing, or where it was paused. */
  get position(): number {
    if (this.isPlaying) return this.playback.soundingTime;
    return this.isPaused ? Number(this.startTime) || 0 : 0;
  }

  /** The length of the track this peer is playing, in seconds. */
  get duration(): number {
    return this.playback.duration;
  }

  /** Steps the room's repeat mode from none to all to one and round again, and shares the change. */
  cycleRepeatMode(): void {
    const modes: RepeatMode[] = ['none', 'all', 'one'];
    const next = (modes.indexOf(this.repeatMode) + 1) % modes.length;
    this.repeatMode = modes[next];
    this.playback.setLoop(this.repeatMode === 'one');
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
    if (this.isPlaying && this.playback.currentTime > Jukebox.RESTART_THRESHOLD_S) {
      this.seek(0);
      return;
    }
    const previous = this.playableBefore(this.playOrder, this.audioIdentifier ?? '');
    if (previous) this.play(previous);
  }

  /** Stops the room's track where it is, keeping it to go on from there. Does nothing unless it is playing. */
  pause(): void {
    if (!this.isPlaying || !this.audioIdentifier) return;
    const at = this.playback.soundingTime;
    GameObject.batch(() => {
      this.startTime = Number.isFinite(at) && at > 0 ? at : 0;
      this.isPlaying = false;
    });
    this.playback.stop(this.pauseFadeMs());
  }

  /**
   * Goes on with the room's paused track from where it stopped, fading back in over the room's fade
   * for a pause. Does nothing unless one is paused.
   */
  resume(): void {
    if (!this.isPaused) return;
    this.isPlaying = true;
    this.playback.play(Number(this.startTime) || 0, false, true);
  }

  /**
   * Stops the room's track as a record stops when its turntable is switched off: it slows to a
   * stop, its pitch falling, and is held there to go on from where the braking began. Does nothing
   * unless it is playing.
   */
  brakeStop(): void {
    if (!this.isPlaying || !this.audioIdentifier) return;
    const at = this.playback.soundingTime;
    GameObject.batch(() => {
      this.startTime = Number.isFinite(at) && at > 0 ? at : 0;
      this.isPlaying = false;
      this.brakeCount = (Number(this.brakeCount) || 0) + 1;
    });
    this.playback.brake();
  }

  /** The effects the room's music goes through. */
  get effects(): DjEffects {
    return readDjEffects(this.fx);
  }

  /** Puts the room's music through these effects, for every peer. */
  setEffects(effects: DjEffects): void {
    const text = writeDjEffects(effects);
    if (text !== (this.fx ?? '')) this.fx = text;
    this.playback.applyEffects(effects);
  }

  /** Stops this peer's playback when the jukebox leaves the room. */
  override onStoreRemoved() {
    super.onStoreRemoved();
    this.playback.dispose();
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
      this.playback.playSE(audio);
      return;
    }
    const waits = this.playback.barWaitMs() > 0;
    GameObject.batch(() => {
      this.startTime = 0;
      this.audioIdentifier = identifier;
      this.isPlaying = true;
      if (waits) this.quantizeCount = (Number(this.quantizeCount) || 0) + 1;
    });
    this.playback.play(0, waits);
  }

  /** Stops a sound effect on this peer and on every other peer. */
  stopSE(identifier: string) {
    this.seStopIdentifier = identifier;
    this.seStopTrigger = this.seStopTrigger + 1;
    this.playback.stopSE(identifier);
  }

  /** Stops the room's track, fading it out over the room's fade for a pause, and clears it, for every peer. */
  stop() {
    this.audioIdentifier = '';
    this.isPlaying = false;
    this.playback.stop(this.pauseFadeMs());
  }

  /** How long the music fades out when the room pauses or stops it, and in when it goes on, in milliseconds. */
  private pauseFadeMs(): number {
    return roomMix().pauseFadeS * 1000;
  }

  /**
   * Moves the room's track to a point in seconds.
   *
   * Other peers cross-fade to the new point, unless they are already within a quarter of a
   * second of it. While a change of track waits for its bar or beat, the track to come is moved,
   * and starts from there; a jump to a marked place still waiting is called off.
   */
  seek(time: number) {
    GameObject.batch(() => {
      this.startTime = time;
      this.seekCount = (Number(this.seekCount) || 0) + 1;
    });
    this.playback.seekTo(time);
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
    this.playback.jump(time);
  }

  /**
   * Moves the room on to the next track once one has played to its end.
   *
   * Every peer gets here on its own and works out the same next track, so they agree without
   * waiting for each other. Going round from the last track to the first happens only on repeat,
   * and while shuffled the next time round is mixed afresh, with the track just heard kept off the
   * top.
   */
  moveOnFromEnd(): void {
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
    this.playback.play();
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

  /** Whether another peer jumped the track to a marked place since the count read before, which an older version never says. */
  private wasJumpedSince(jumpCount: number | undefined): boolean {
    return typeof this.jumpCount === 'number' && this.jumpCount !== jumpCount;
  }

  /** Whether another peer braked the track since the count read before, which an older version, sending no count, never says. */
  private wasBrakedSince(brakeCount: number | undefined): boolean {
    return typeof this.brakeCount === 'number' && this.brakeCount !== brakeCount;
  }

  /** Whether another peer changed the track on its next bar or beat since the count read before, which an older version never says. */
  private wasQuantizedSince(quantizeCount: number | undefined): boolean {
    return typeof this.quantizeCount === 'number' && this.quantizeCount !== quantizeCount;
  }

  /** Whether another peer moved the track since the count read before, which an older version, sending no count, never says. */
  private wasSoughtSince(seekCount: number): boolean {
    return typeof this.seekCount === 'number' && this.seekCount !== seekCount;
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
    const quantizeCount = this.quantizeCount;
    const fx = this.fx;
    super.apply(context);
    const playback = this.playback;
    if (this.isInitialSync) {
      this.isInitialSync = false;
      if (playback === SILENT_PLAYBACK) this.initialSyncUnheard = true;
      else this.followInitialSync();
      return;
    }
    if ((fx ?? '') !== (this.fx ?? '')) playback.applyEffects();
    if (this.seTrigger !== seTrigger && this.seIdentifier) {
      const seAudio = AudioStorage.instance.get(this.seIdentifier);
      if (seAudio?.isReady) playback.playSE(seAudio);
    }
    if (this.seStopTrigger !== seStopTrigger && this.seStopIdentifier) {
      playback.stopSE(this.seStopIdentifier);
    }
    if ((audioIdentifier !== this.audioIdentifier || !isPlaying) && this.isPlaying) {
      const resumes = audioIdentifier === this.audioIdentifier && !isPlaying;
      playback.play(
        resumes ? Number(this.startTime) || 0 : 0,
        !resumes && this.wasQuantizedSince(quantizeCount),
        resumes
      );
    } else if (isPlaying !== this.isPlaying && !this.isPlaying) {
      if (this.wasBrakedSince(brakeCount)) playback.brake();
      else playback.stop(this.pauseFadeMs());
    } else if (this.isPlaying && (startTime !== this.startTime || this.wasSoughtSince(seekCount))) {
      if (this.wasJumpedSince(jumpCount)) {
        playback.jump(Number(this.startTime) || 0);
        return;
      }
      playback.follow(this.startTime);
    }
  }
}
