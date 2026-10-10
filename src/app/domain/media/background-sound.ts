import { updateAudioResource$ } from '@axe/core/event/domain-events';
import { onFirstUserInteraction } from '@axe/core/input/user-interaction-unlock';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { LoopPlayer } from '@axe/core/storage/loop-player';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject, ObjectContext } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { backgroundSoundLevel } from '@axe/domain/media/background-sound-level';

/**
 * One of the room's background sounds, such as rain or a crowd, which loops underneath the music
 * on every peer until somebody stops it. Several play at once, and changing the music leaves them
 * alone.
 *
 * There is one for each sound ever played this way, named after the sound, so two people starting
 * the same rain at once start the same one. Stopping it only marks it stopped: a name taken out of
 * the room can never be used again, and the room's volume for that sound is kept for next time.
 *
 * Peers do not keep their loops in step with one another, which rain and wind have no need of.
 */
@SyncObject('background-sound')
export class BackgroundSound extends GameObject {
  /** How long a background sound takes to rise as it starts and to die away as it stops. */
  static readonly FADE_MS = 1500;

  @SyncVar() audioIdentifier: string = '';

  /** How loud the sound is for the whole room, from 0 to 1, before each peer's own background volume. */
  @SyncVar() volume: number = 1;

  @SyncVar() isPlaying: boolean = false;

  /** When the sound was last started, in milliseconds, which puts the sounds playing in order. */
  @SyncVar() startedAt: number = 0;

  private player: LoopPlayer | null = null;
  private fileUpdateCleanup: (() => void) | null = null;
  private releaseGestures: (() => void) | null = null;

  /** The identifier the background sound for a sound goes by. */
  static identifierOf(audioIdentifier: string): string {
    return `bgs_${audioIdentifier}`;
  }

  /** The background sound for a sound, or null when it has never been played this way. */
  static of(audioIdentifier: string): BackgroundSound | null {
    const found = ObjectStore.instance.get(BackgroundSound.identifierOf(audioIdentifier));
    return found instanceof BackgroundSound ? found : null;
  }

  /**
   * Starts a sound looping for the whole room, making its background sound the first time. A sound
   * already playing goes on as it is, only moving to the end of the order.
   */
  static start(audioIdentifier: string): BackgroundSound | null {
    if (audioIdentifier.length < 1) return null;
    const known = BackgroundSound.of(audioIdentifier);
    if (known) {
      GameObject.batch(() => {
        known.isPlaying = true;
        known.startedAt = Date.now();
      });
      known.follow();
      return known;
    }
    const sound = new BackgroundSound(BackgroundSound.identifierOf(audioIdentifier));
    sound.audioIdentifier = audioIdentifier;
    sound.isPlaying = true;
    sound.startedAt = Date.now();
    sound.initialize();
    return sound;
  }

  /** The background sounds playing in the room, in the order they were started. */
  static playing(): BackgroundSound[] {
    return ObjectStore.instance
      .getObjects<BackgroundSound>(BackgroundSound)
      .filter((sound) => sound.isOn)
      .sort(
        (a, b) =>
          (Number(a.startedAt) || 0) - (Number(b.startedAt) || 0) ||
          (a.identifier < b.identifier ? -1 : a.identifier > b.identifier ? 1 : 0)
      );
  }

  /** Stops every background sound in the room. */
  static stopAll(): void {
    for (const sound of BackgroundSound.playing()) sound.stop();
  }

  /** Whether the sound is playing for the room. Only `true` counts, so a missing value is stopped. */
  get isOn(): boolean {
    return this.isPlaying === true && (this.audioIdentifier ?? '').length > 0;
  }

  /**
   * The room's volume for the sound, from 0 to 1. Anything that is not a number, an empty value
   * included, reads as full volume rather than as silence.
   */
  get level(): number {
    return backgroundSoundLevel(this.volume);
  }

  /** The sound, or null when its file is not in this peer's storage. */
  get audio(): AudioFile | null {
    return AudioStorage.instance.get(this.audioIdentifier);
  }

  /** Stops the sound for the whole room, letting it die away. */
  stop(): void {
    if (this.isPlaying === false) return;
    this.isPlaying = false;
    this.follow();
  }

  /** Sets the room's volume for the sound, from 0 to 1, and shares it. */
  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    this.follow();
  }

  /** Lets this peer hear a volume while a slider is being dragged, without sharing it yet. */
  previewVolume(volume: number): void {
    this.player?.setVolume(Math.min(1, Math.max(0, volume)));
  }

  /**
   * Starts the sound when it arrives already playing, as it does for somebody joining, and listens
   * to the user's gestures, since a browser may refuse to start a sound before the first one.
   */
  override onStoreAdded() {
    super.onStoreAdded();
    this.releaseGestures?.();
    this.releaseGestures = onFirstUserInteraction(() => {
      if (this.isOn && this.player?.isAwaitingGesture) {
        this.player.stop();
        this.follow();
      }
      return false;
    });
    this.follow();
  }

  /** Lets the sound go at once, and stops listening for gestures and files, when it leaves the room. */
  override onStoreRemoved() {
    super.onStoreRemoved();
    this.releaseGestures?.();
    this.releaseGestures = null;
    this.unwatchFile();
    this.player?.dispose();
    this.player = null;
  }

  /** Takes in an update from another peer and follows it: the sound started, stopped or made louder or softer. */
  override apply(context: ObjectContext) {
    super.apply(context);
    this.follow();
  }

  /**
   * Brings what this peer hears in line with the room: the sound started or stopped with a fade, or
   * set to the room's volume. A sound whose file has not arrived yet starts once it does.
   */
  private follow(): void {
    if (!this.isOn) {
      this.unwatchFile();
      this.player?.stop(BackgroundSound.FADE_MS);
      return;
    }
    const audio = this.audio;
    if (!audio?.isReady) {
      this.watchFile();
      return;
    }
    this.unwatchFile();
    const player = (this.player ??= new LoopPlayer());
    if (player.isActive) player.setVolume(this.level);
    else player.start(audio, this.level, BackgroundSound.FADE_MS);
  }

  private watchFile(): void {
    if (this.fileUpdateCleanup) return;
    this.fileUpdateCleanup = updateAudioResource$.subscribe(() => {
      if (this.audio?.isReady) this.follow();
    });
  }

  private unwatchFile(): void {
    this.fileUpdateCleanup?.();
    this.fileUpdateCleanup = null;
  }
}
