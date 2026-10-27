import { AudioCache } from '@axe/core/storage/audio-cache';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioOutput, VolumeType } from '@axe/core/storage/audio-output';

type SoundingEffect = { source: AudioBufferSourceNode; gain: GainNode };

/** The page's short sounds, each played from its decoded buffer over whatever else is playing. */
export class SoundEffects {
  private static readonly sources = new Map<string, Set<SoundingEffect>>();
  private static readonly pending = new Map<string, number>();

  /**
   * Plays the audio once at the given volume, which may be above 1, through the channel of its kind,
   * and forgets about it.
   *
   * It goes through the sound-effect channel unless given another kind. Nothing is kept to stop it
   * with or to report it as playing; use `play` for an effect that may need stopping.
   */
  static playOnce(audio: AudioFile, volume: number = 1.0, type: VolumeType = VolumeType.SE): void {
    void SoundEffects.playBufferAsync(audio, volume, type);
  }

  /**
   * Plays the audio as a sound effect that `stop` can cut off and `isPlaying` reports from the
   * moment it is asked for, turned up or down by a factor that may be above 1.
   *
   * The effect is decoded once and kept, so repeated and overlapping plays of it are cheap.
   */
  static play(audio: AudioFile, level: number = 1): void {
    const identifier = audio.identifier;
    SoundEffects.pending.set(identifier, (SoundEffects.pending.get(identifier) ?? 0) + 1);
    void SoundEffects.playSeBufferAsync(audio, identifier, level);
  }

  /**
   * Stops every play of this sound effect that has started sounding.
   *
   * A play still being decoded stops being reported by `isPlaying`, but it will still sound once
   * decoding finishes.
   */
  static stop(identifier: string): void {
    const entries = SoundEffects.sources.get(identifier);
    if (entries) {
      for (const { source, gain } of entries) {
        source.onended = null;
        source.stop();
        source.disconnect();
        gain.disconnect();
        source.buffer = null;
      }
      SoundEffects.sources.delete(identifier);
    }
    SoundEffects.pending.delete(identifier);
  }

  /** Stops every sound effect started with `play`, with the same caveat as `stop` for plays still being decoded. */
  static stopAll(): void {
    for (const identifier of [...SoundEffects.sources.keys()]) SoundEffects.stop(identifier);
    SoundEffects.pending.clear();
  }

  /**
   * Whether a sound effect from `play` is sounding, or still being decoded, for this audio, which
   * the jukebox and sound board show as playing.
   */
  static isPlaying(identifier: string): boolean {
    return (SoundEffects.sources.get(identifier)?.size ?? 0) > 0 || (SoundEffects.pending.get(identifier) ?? 0) > 0;
  }

  private static async playBufferAsync(audio: AudioFile, volume: number, type: VolumeType): Promise<void> {
    const source = await AudioCache.bufferSource(audio);
    if (!source) return;

    const gain = AudioOutput.context.createGain();
    gain.gain.setValueAtTime(volume, AudioOutput.context.currentTime);

    gain.connect(AudioOutput.channelInput(type));
    source.connect(gain);

    source.onended = () => {
      source.stop();
      source.disconnect();
      gain.disconnect();
      source.buffer = null;
    };

    source.start();
  }

  private static async playSeBufferAsync(audio: AudioFile, identifier: string, level: number): Promise<void> {
    const source = await AudioCache.bufferSource(audio);
    const remaining = (SoundEffects.pending.get(identifier) ?? 1) - 1;
    if (remaining > 0) SoundEffects.pending.set(identifier, remaining);
    else SoundEffects.pending.delete(identifier);
    if (!source) return;

    const gain = AudioOutput.context.createGain();
    gain.gain.setValueAtTime(level, AudioOutput.context.currentTime);
    gain.connect(AudioOutput.channelInput(VolumeType.SE));
    source.connect(gain);

    let entries = SoundEffects.sources.get(identifier);
    if (!entries) {
      entries = new Set();
      SoundEffects.sources.set(identifier, entries);
    }
    const set = entries;
    const entry = { source, gain };
    set.add(entry);

    source.onended = () => {
      source.stop();
      source.disconnect();
      gain.disconnect();
      source.buffer = null;
      set.delete(entry);
      if (set.size === 0) SoundEffects.sources.delete(identifier);
    };

    source.start();
  }
}
