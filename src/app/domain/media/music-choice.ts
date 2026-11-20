import { toHalfWidth } from '@axe/core/util/string-util';

/**
 * Something the room's music could be set to, as music is chosen by the words of a mood: a track or a
 * playlist, and every name it goes by — its own, its tag, the playlists that hold it, and the scenes
 * that put it on with their folders.
 */
export interface MusicCandidate {
  readonly kind: 'track' | 'playlist';
  readonly id: string;
  readonly name: string;
  readonly names: readonly string[];
}

/** A candidate as the words of a mood found it: which of the words its names hold. */
export interface MusicMatch {
  readonly candidate: MusicCandidate;
  readonly matched: readonly string[];
}

/** Text as it is compared: half-width, lower case, without spaces at its ends. */
function folded(text: string): string {
  return toHalfWidth(text).trim().toLowerCase();
}

/**
 * The words a mood is written in, parted at spaces and commas of either width, as `戦闘 緊迫` or
 * `battle, tense`.
 */
export function moodWords(mood: string): string[] {
  return folded(mood)
    .split(/[\s,、，]+/)
    .filter((word) => word.length > 0);
}

/**
 * The candidates the words of a mood find, best first: those whose names hold more of the words
 * before those holding fewer, and of those holding as many, a playlist before a track, as a
 * playlist goes on playing what suits once one track ends. None that hold no word.
 */
export function chooseMusic(words: readonly string[], candidates: readonly MusicCandidate[]): MusicMatch[] {
  const wanted = words.map(folded).filter((word) => word.length > 0);
  return candidates
    .map((candidate) => {
      const names = candidate.names.map(folded);
      return { candidate, matched: wanted.filter((word) => names.some((name) => name.includes(word))) };
    })
    .filter((match) => match.matched.length > 0)
    .sort(
      (a, b) =>
        b.matched.length - a.matched.length ||
        (a.candidate.kind === b.candidate.kind ? 0 : a.candidate.kind === 'playlist' ? -1 : 1)
    );
}
