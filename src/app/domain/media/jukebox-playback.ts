import { AudioFile } from '@axe/core/storage/audio-file';
import { type DjEffects } from '@axe/domain/media/dj-effects';

/**
 * What the room's jukebox asks of this peer's playback.
 *
 * The jukebox holds what the room has set, writes it when asked to change it and follows what the
 * other peers change; what is heard on this peer, the players, their fades and the changes held
 * for the next bar or beat, is the playback's.
 */
export interface JukeboxPlayback {
  /** Where this peer's player is in the track it holds, in seconds. */
  readonly currentTime: number;
  /** Where this peer is in the room's track, in seconds: 0 while that has yet to sound here. */
  readonly soundingTime: number;
  /** The length of the room's track as it sounds here, in seconds: 0 while it has yet to. */
  readonly duration: number;
  /** How long a change of track waits for the next bar of the track sounding, in milliseconds: 0 for none. */
  barWaitMs(): number;
  /**
   * Starts the room's track from a point in seconds, waiting for the next bar where asked, and
   * fading back in over the room's fade for a pause where it goes on after one.
   */
  play(startAt?: number, quantized?: boolean, resuming?: boolean): void;
  /** Stops the track sounding, fading it out over the time given; without one, tracks still fading out stop too. */
  stop(fadeMs?: number): void;
  /** Lets the track sounding slow to a stop, its pitch falling. */
  brake(): void;
  /** Jumps the room's track to a marked place in seconds, on the next beat while the room quantises. */
  jump(time: number): void;
  /** Moves the room's track to a point in seconds at once where it sounds, calling off a jump still waiting. */
  seekTo(time: number): void;
  /**
   * Follows the room's track moved by another peer: crossfades there unless already within a
   * quarter of a second of it, and leaves a change of track waiting for its bar alone.
   */
  follow(time: number): void;
  /** Whether the track sounding goes round. */
  setLoop(loop: boolean): void;
  /** Puts the music through the room's effects, or through others to hear them ahead of sharing them. */
  applyEffects(effects?: DjEffects, glideS?: number): void;
  /** Plays a sound effect over the music. */
  playSE(audio: AudioFile): void;
  /** Cuts a sound effect off. */
  stopSE(identifier: string): void;
  /** Stops whatever sounds and listens for nothing more, as the jukebox leaves the room. */
  dispose(): void;
}

/** The playback of a jukebox no peer is listening to yet, which plays nothing. */
export const SILENT_PLAYBACK: JukeboxPlayback = {
  currentTime: 0,
  soundingTime: 0,
  duration: 0,
  barWaitMs: () => 0,
  play: () => undefined,
  stop: () => undefined,
  brake: () => undefined,
  jump: () => undefined,
  seekTo: () => undefined,
  follow: () => undefined,
  setLoop: () => undefined,
  applyEffects: () => undefined,
  playSE: () => undefined,
  stopSE: () => undefined,
  dispose: () => undefined,
};
