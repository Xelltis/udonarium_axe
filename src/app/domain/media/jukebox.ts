import { updateAudioResource$ } from '@axe/core/event/domain-events';
import { onFirstUserInteraction } from '@axe/core/input/user-interaction-unlock';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioPlayer, VolumeType } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject, ObjectContext } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AudioTag } from '@axe/domain/media/audio-tag';
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

  /** The track the room is set to, or null when none is set or its file is not in this peer's storage. */
  get audio(): AudioFile | null {
    return AudioStorage.instance.get(this.audioIdentifier);
  }

  private audioPlayer: AudioPlayer = new AudioPlayer();
  private fadingPlayer: AudioPlayer | null = null;
  private audioUpdateCleanup: (() => void) | null = null;
  private releaseGestures: (() => void) | null = null;
  private isInitialSync = true;
  private static readonly CROSSFADE_MS = 600;
  private static readonly SYNC_SEEK_THRESHOLD_MS = 250;

  /** The room's shared settings, whose room volume scales every volume here. */
  get config(): Config {
    return ObjectStore.instance.get<Config>('Config')!;
  }

  private _volume = 0.5;
  /**
   * This peer's own music volume, from 0 to 1. It is not shared with the room.
   *
   * Setting it changes nothing audible until `setNewVolume()` is called.
   */
  get volume(): number {
    return this._volume;
  }
  set volume(volume: number) {
    this._volume = volume;
  }

  private _auditionVolume = 0.5;
  /** This peer's own volume for previewing a track, from 0 to 1. Takes effect through `setNewVolume()`. */
  get auditionVolume() {
    return this._auditionVolume;
  }
  set auditionVolume(_auditionVolume: number) {
    this._auditionVolume = _auditionVolume;
  }

  private _seVolume = 0.5;
  /** This peer's own sound-effect volume, from 0 to 1. Takes effect through `setNewVolume()`. */
  get seVolume(): number {
    return this._seVolume;
  }
  set seVolume(seVolume: number) {
    this._seVolume = seVolume;
  }

  /** How far into the track this peer's playback is, in seconds. */
  get currentTime(): number {
    return this.audioPlayer.currentTime;
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

  /** Applies this peer's music, preview and sound-effect volumes, each scaled by the room volume, to every player. */
  setNewVolume() {
    AudioPlayer.volume = this.volume * this.config.roomVolume;
    AudioPlayer.auditionVolume = this.auditionVolume * this.config.roomVolume;
    AudioPlayer.seVolume = this.seVolume * this.config.roomVolume;
  }

  /**
   * Plays a sound for the whole room.
   *
   * A sound tagged SE is played once over the music on every peer, leaving the track alone.
   * Anything else becomes the room's track. Nothing happens when the file is missing or not
   * ready yet. The loop argument is ignored; the repeat mode decides.
   */
  play(identifier: string, _isLoop: boolean = false) {
    const audio = AudioStorage.instance.get(identifier);
    if (!audio || !audio.isReady) return;
    if (AudioTag.get(identifier)?.tag === 'SE') {
      this.seIdentifier = identifier;
      this.seTrigger = this.seTrigger + 1;
      this.playSE(audio);
      return;
    }
    this.audioIdentifier = identifier;
    this.isPlaying = true;
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

  private _play() {
    this._stop();
    if (!this.audio || !this.audio.isReady) {
      this.playAfterFileUpdate();
      return;
    }
    const isSE = AudioTag.get(this.audioIdentifier)?.tag === 'SE';
    this.audioPlayer.volumeType = isSE ? VolumeType.SE : VolumeType.MASTER;
    this.audioPlayer.loop = !isSE && this.repeatMode === 'one';
    this.audioPlayer.onEnded = isSE ? null : () => this.onTrackNaturallyEnded();
    this.audioPlayer.play(this.audio);
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
    this.startTime = time;
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

    const isSE = AudioTag.get(this.audioIdentifier)?.tag === 'SE';
    const newPlayer = new AudioPlayer();
    newPlayer.volumeType = isSE ? VolumeType.SE : VolumeType.MASTER;
    newPlayer.loop = !isSE && this.repeatMode === 'one';
    newPlayer.onEnded = isSE ? null : () => this.onTrackNaturallyEnded();
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

  private playAfterFileUpdate() {
    if (this.audioUpdateCleanup) return;
    this.audioUpdateCleanup = updateAudioResource$.subscribe(() => {
      if (!this.audio || !this.audio.isReady) return;
      this.unregisterEvent();
      const isSE = AudioTag.get(this.audioIdentifier)?.tag === 'SE';
      this.audioPlayer.volumeType = isSE ? VolumeType.SE : VolumeType.MASTER;
      this.audioPlayer.loop = !isSE && this.repeatMode === 'one';
      this.audioPlayer.onEnded = isSE ? null : () => this.onTrackNaturallyEnded();
      this.audioPlayer.play(this.audio);
    });
  }

  private onTrackNaturallyEnded() {
    if (this.repeatMode === 'one') return;
    const nextId = this.getNextTrackId();
    if (nextId) {
      this.audioIdentifier = nextId;
      this._play();
    } else {
      this.stop();
    }
  }

  private getNextTrackId(): string | null {
    const entries = (ObjectStore.instance.get<Playlist>('Playlist') ?? null)?.entries ?? [];
    const list =
      entries.length > 0
        ? entries
        : AudioStorage.instance.audios
            .filter((a) => !a.isHidden && (AudioTag.get(a.identifier)?.tag ?? 'BGM') !== 'SE')
            .map((a) => a.identifier);
    if (!list.length) return null;
    const idx = list.indexOf(this.audioIdentifier);
    const nextIdx = idx === -1 ? 0 : idx + 1;
    if (nextIdx >= list.length) return this.repeatMode === 'all' ? list[0] : null;
    return list[nextIdx];
  }

  private unlockAfterUserInteraction() {
    this.releaseGestures?.();
    this.releaseGestures = onFirstUserInteraction(() => {
      if (this.isPlaying && this.audioPlayer.isAwaitingGesture && !this.audioUpdateCleanup) this._play();
      return false;
    });
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
      this._play();
    } else if (isPlaying !== this.isPlaying && !this.isPlaying) {
      this._stop();
    } else if (startTime !== this.startTime && this.isPlaying) {
      const driftMs = Math.abs((this.audioPlayer.currentTime - this.startTime) * 1000);
      if (driftMs < Jukebox.SYNC_SEEK_THRESHOLD_MS) return;
      this.crossfadeSeek(this.startTime);
    }
  }
}
