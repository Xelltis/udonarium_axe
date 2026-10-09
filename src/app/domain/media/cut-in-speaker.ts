/**
 * Who a cut-in is played for: the character whose line set it off, with the portrait that line was
 * said with. A layer can show that portrait, and a text layer can say that name.
 *
 * The speaker goes out with the launch as a snapshot, so a cut-in already playing is not changed by
 * a later edit to the character.
 */

/** The speaker a cut-in is played for. */
export interface CutInSpeaker {
  /** The character who spoke, empty where it was not a character. */
  readonly characterId: string;
  /** The portrait the line was said with, empty for none. */
  readonly imageIdentifier: string;
  readonly name: string;
}

interface LaunchSpeakerRecord {
  readonly v: 1;
  /** The launch this speaker belongs to: its time stamp and its cut-in. */
  readonly stamp: number;
  readonly cutIn: string;
  readonly c: string;
  readonly i: string;
  readonly n: string;
}

/**
 * The speaker written for one launch, empty where there is none.
 *
 * The launch it belongs to is written with it, since a version that does not know the field sends
 * back whatever it last held along with a launch of its own.
 */
export function encodeLaunchSpeaker(speaker: CutInSpeaker | null, stamp: number, cutInIdentifier: string): string {
  if (!speaker) return '';
  const record: LaunchSpeakerRecord = {
    v: 1,
    stamp,
    cutIn: cutInIdentifier,
    c: speaker.characterId,
    i: speaker.imageIdentifier,
    n: speaker.name,
  };
  return JSON.stringify(record);
}

/**
 * The speaker of a launch, where what is held belongs to it; null for none, for anything unreadable,
 * and for a speaker left over from another launch.
 */
export function readLaunchSpeaker(held: unknown, stamp: number, cutInIdentifier: string): CutInSpeaker | null {
  const text = `${held ?? ''}`;
  if (text.length < 1) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Partial<LaunchSpeakerRecord>;
  if (record.v !== 1 || record.stamp !== stamp || record.cutIn !== cutInIdentifier) return null;
  return {
    characterId: typeof record.c === 'string' ? record.c : '',
    imageIdentifier: typeof record.i === 'string' ? record.i : '',
    name: typeof record.n === 'string' ? record.n : '',
  };
}

/** What a text layer writes to be given the speaker's name. */
export const SPEAKER_NAME_TOKEN = '{character}';

/**
 * A text layer's words with the speaker's name put in for `{character}`, or `unknown` where there is
 * no name; `{{character}}` stays as `{character}`, for words that mean it.
 */
export function withSpeakerName(text: string, name: string | null | undefined, unknown: string): string {
  if (!text.includes(SPEAKER_NAME_TOKEN)) return text;
  const shown = name && name.length > 0 ? name : unknown;
  return text.replace(/\{\{character\}\}|\{character\}/g, (token) =>
    token === SPEAKER_NAME_TOKEN ? shown : SPEAKER_NAME_TOKEN
  );
}

/** A grey head and shoulders, shown in a portrait's place where there is no speaker and no picture. */
export const PORTRAIT_SILHOUETTE_URL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 400">' +
      '<circle cx="170" cy="140" r="78" fill="#8a8f99"/>' +
      '<path d="M30 400 C30 290 95 236 170 236 C245 236 310 290 310 400 Z" fill="#8a8f99"/>' +
      '</svg>'
  );
