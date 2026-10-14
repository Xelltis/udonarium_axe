import { type AudioAnalysis, readAudioAnalysis, writeAudioAnalysis } from '@axe/domain/media/audio-analysis';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { type BeatGrid, effectiveGrid, readBeatGrid, writeBeatGrid } from '@axe/domain/media/beat-grid';
import { type CuePoints, readCuePoints, writeCuePoints } from '@axe/domain/media/cue-points';

const localReadings = new Map<string, AudioAnalysis>();

/** The tag of a sound, made first when the sound has none, as a sound with none is taken for BGM anyway. */
function tagFor(identifier: string): AudioTag {
  return AudioTag.get(identifier) ?? AudioTag.create(identifier);
}

/**
 * What the room knows of each sound beyond its tag: how it was read, the beats it keeps and the
 * places marked in it.
 *
 * What is shared lives on the sound's tag, so it goes to every peer and into the saved room. A
 * reading made on this device and not yet shared, as a guest's is, is kept here for this device
 * alone.
 */
export const AudioProfile = {
  /**
   * How a sound was read: from the room, or from this device while the room has none. When both
   * are held, the one made by the later version is taken, and the room's when they are level.
   */
  analysisOf(identifier: string): AudioAnalysis | null {
    const shared = readAudioAnalysis(AudioTag.get(identifier)?.analysis);
    const local = localReadings.get(identifier) ?? null;
    if (shared && local) return local.version > shared.version ? local : shared;
    return shared ?? local;
  },

  /** The analysis the room holds for a sound, leaving out any made on this device alone. */
  sharedAnalysisOf(identifier: string): AudioAnalysis | null {
    return readAudioAnalysis(AudioTag.get(identifier)?.analysis);
  },

  /** Keeps a reading made on this device, for this device alone. */
  keepLocal(identifier: string, analysis: AudioAnalysis): void {
    localReadings.set(identifier, analysis);
  },

  /** Forgets every reading kept on this device alone. */
  clearLocal(): void {
    localReadings.clear();
  },

  /** Gives the room a sound's reading, on its tag. */
  share(identifier: string, analysis: AudioAnalysis): void {
    const text = writeAudioAnalysis(analysis);
    const tag = tagFor(identifier);
    if (tag.analysis !== text) tag.analysis = text;
  },

  /**
   * Gives the room a sound's reading on the tag it already has, and does nothing for a sound with
   * none. Readings kept from before are shared this way on joining a room, when the room's own tags
   * may not have arrived yet: a tag made here in place of one could win over the room's, and lose
   * the tag, beats and marks it held.
   */
  shareOnTag(identifier: string, analysis: AudioAnalysis): void {
    const tag = AudioTag.get(identifier);
    if (!tag) return;
    const text = writeAudioAnalysis(analysis);
    if (tag.analysis !== text) tag.analysis = text;
  },

  /** The beats set by hand for a sound, or null while the reading's are used. */
  manualGridOf(identifier: string): BeatGrid | null {
    return readBeatGrid(AudioTag.get(identifier)?.beatGrid);
  },

  /** The beats a sound keeps: those set by hand, or those its reading found when sure enough. */
  gridOf(identifier: string): BeatGrid | null {
    return effectiveGrid(AudioProfile.manualGridOf(identifier), AudioProfile.analysisOf(identifier));
  },

  /** Sets a sound's beats by hand for the room, or with null goes back to those its reading found. */
  setGrid(identifier: string, grid: BeatGrid | null): void {
    const text = writeBeatGrid(grid);
    const tag = text === '' ? AudioTag.get(identifier) : tagFor(identifier);
    if (tag && tag.beatGrid !== text) tag.beatGrid = text;
  },

  /** The places marked in a sound. */
  cuesOf(identifier: string): CuePoints {
    return readCuePoints(AudioTag.get(identifier)?.cues);
  },

  /** Marks places in a sound for the room. */
  setCues(identifier: string, points: CuePoints): void {
    const text = writeCuePoints(points);
    const tag = text === '' ? AudioTag.get(identifier) : tagFor(identifier);
    if (tag && tag.cues !== text) tag.cues = text;
  },
};
