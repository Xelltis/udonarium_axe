/**
 * The stamps a line of chat can be answered with, or sent as a line of its own.
 *
 * Two families come with the app drawn by the app itself, so that every screen shows them the
 * same: the sound effects of a comic, written out large, and the round seal of a name stamp. The
 * rest that come with it are pictures of the character who speaks for the system, a family to a
 * part of play. A stamp from a room's own set is a picture in the room, named by the picture it is.
 *
 * A stamp is kept, and travels, as its identifier alone, so a family or a stamp added later costs
 * no change to what is saved, and a version that does not know one simply leaves it out.
 */

/** The families that come with the app as pictures, a family to a part of play. */
export const ART_STAMP_FAMILIES = ['roll', 'battle', 'explore', 'feel', 'talk'] as const;
export type ArtStampFamily = (typeof ART_STAMP_FAMILIES)[number];

export const STAMP_FAMILIES = ['sfx', 'seal', ...ART_STAMP_FAMILIES] as const;
export type StampFamily = (typeof STAMP_FAMILIES)[number];

/** How a stamp moves as it is put on, or as it arrives. */
export const STAMP_MOTIONS = ['pop', 'shiver', 'slam', 'beat', 'press'] as const;
export type StampMotion = (typeof STAMP_MOTIONS)[number];

export interface BuiltinStamp {
  /** `family:key`, as it is kept and sent. */
  readonly id: string;
  readonly family: StampFamily;
  readonly key: string;
  /** The colour it is drawn in, or empty for a picture. */
  readonly color: string;
  /** How far it leans, in degrees. */
  readonly tilt: number;
  readonly motion: StampMotion;
}

function stamp(family: StampFamily, key: string, color: string, tilt: number, motion: StampMotion): BuiltinStamp {
  return { id: `${family}:${key}`, family, key, color, tilt, motion };
}

function picture(family: ArtStampFamily, key: string, motion: StampMotion = 'pop'): BuiltinStamp {
  return stamp(family, key, '', 0, motion);
}

const SEAL_RED = '#d2382b';

export const BUILTIN_STAMPS: readonly BuiltinStamp[] = [
  stamp('sfx', 'laugh', '#ff8a1f', -8, 'pop'),
  stamp('sfx', 'shock', '#4f63d9', 5, 'slam'),
  stamp('sfx', 'creepy', '#7b3fd6', -4, 'shiver'),
  stamp('sfx', 'heart', '#ff4f93', -9, 'beat'),
  stamp('sfx', 'clap', '#f0b400', 4, 'pop'),
  stamp('sfx', 'notice', '#12a36e', -6, 'pop'),
  stamp('sfx', 'gulp', '#5c6b80', 3, 'shiver'),
  stamp('sfx', 'smirk', '#d4302f', -5, 'slam'),
  stamp('sfx', 'boom', '#e8541e', -6, 'slam'),
  stamp('sfx', 'menace', '#6a3fb5', 4, 'shiver'),
  stamp('sfx', 'silence', '#7d8a99', 0, 'pop'),
  stamp('sfx', 'stare', '#3c8dbc', -3, 'pop'),
  stamp('sfx', 'thump', '#ff5c7a', 6, 'beat'),
  stamp('sfx', 'excited', '#ffa41b', -7, 'pop'),
  stamp('sfx', 'flop', '#2f8f5b', 9, 'slam'),
  stamp('sfx', 'shine', '#e6b800', -8, 'pop'),
  stamp('sfx', 'startle', '#4a5bd4', 5, 'shiver'),
  stamp('sfx', 'murmur', '#4b4b4b', -4, 'shiver'),
  stamp('sfx', 'entrance', '#d92b2b', 7, 'slam'),
  stamp('sfx', 'glance', '#2fa3a3', -5, 'pop'),
  stamp('sfx', 'huff', '#ff6a3d', 6, 'shiver'),
  stamp('sfx', 'gloom', '#5a5f7a', 0, 'slam'),
  stamp('sfx', 'idea', '#f0a800', -6, 'pop'),
  stamp('sfx', 'leanin', '#c2410c', 8, 'slam'),
  stamp('sfx', 'roll', '#2563eb', -5, 'shiver'),
  stamp('sfx', 'dumbfounded', '#8b8fa3', 3, 'pop'),

  stamp('seal', 'ok', SEAL_RED, -8, 'press'),
  stamp('seal', 'seen', SEAL_RED, 6, 'press'),
  stamp('seal', 'lol', SEAL_RED, -4, 'press'),
  stamp('seal', 'wow', SEAL_RED, 10, 'press'),
  stamp('seal', 'fear', SEAL_RED, -11, 'press'),
  stamp('seal', 'sob', SEAL_RED, 5, 'press'),
  stamp('seal', 'god', SEAL_RED, -6, 'press'),
  stamp('seal', 'precious', SEAL_RED, 8, 'press'),
  stamp('seal', 'agree', SEAL_RED, -7, 'press'),
  stamp('seal', 'really', SEAL_RED, 9, 'press'),
  stamp('seal', 'fair', SEAL_RED, -5, 'press'),
  stamp('seal', 'unfair', SEAL_RED, 6, 'press'),
  stamp('seal', 'noobjection', SEAL_RED, -9, 'press'),
  stamp('seal', 'objection', SEAL_RED, 8, 'press'),
  stamp('seal', 'gotit', SEAL_RED, -4, 'press'),
  stamp('seal', 'thatsit', SEAL_RED, 7, 'press'),
  stamp('seal', 'relate', SEAL_RED, -8, 'press'),
  stamp('seal', 'lmao', SEAL_RED, 5, 'press'),
  stamp('seal', 'genius', SEAL_RED, -6, 'press'),
  stamp('seal', 'win', SEAL_RED, 10, 'press'),
  stamp('seal', 'best', SEAL_RED, -3, 'press'),
  stamp('seal', 'capable', SEAL_RED, 4, 'press'),
  stamp('seal', 'noway', SEAL_RED, -10, 'press'),
  stamp('seal', 'approved', SEAL_RED, 6, 'press'),
  stamp('seal', 'rejected', SEAL_RED, -7, 'press'),
  stamp('seal', 'foreshadow', SEAL_RED, 3, 'press'),
  stamp('seal', 'ominous', SEAL_RED, -11, 'press'),
  stamp('seal', 'rip', SEAL_RED, 5, 'press'),
  stamp('seal', 'done', SEAL_RED, -6, 'press'),
  stamp('seal', 'congrats', SEAL_RED, 8, 'press'),
  stamp('seal', 'thanks', SEAL_RED, -9, 'press'),
  stamp('seal', 'secret', SEAL_RED, 4, 'press'),
  stamp('seal', 'lucky', SEAL_RED, -4, 'press'),
  stamp('seal', 'unlucky', SEAL_RED, 9, 'press'),

  picture('roll', 'critical', 'slam'),
  picture('roll', 'fumble'),
  picture('roll', 'success'),
  picture('roll', 'failure'),
  picture('roll', 'pray', 'beat'),
  picture('roll', 'throw'),
  picture('roll', 'reroll', 'beat'),
  picture('roll', 'shake', 'shiver'),
  picture('roll', 'blow'),
  picture('roll', 'stare'),
  picture('roll', 'sanity', 'shiver'),
  picture('roll', 'secret'),
  picture('roll', 'count'),
  picture('roll', 'clover'),
  picture('roll', 'cursed', 'shiver'),
  picture('roll', 'nervous', 'shiver'),
  picture('roll', 'aghast', 'slam'),
  picture('roll', 'bonus'),
  picture('roll', 'hoard'),
  picture('roll', 'doubt'),

  picture('battle', 'sword', 'slam'),
  picture('battle', 'shield'),
  picture('battle', 'magic'),
  picture('battle', 'bow'),
  picture('battle', 'charge', 'slam'),
  picture('battle', 'hurt', 'shiver'),
  picture('battle', 'heal'),
  picture('battle', 'fainted'),
  picture('battle', 'dodge'),
  picture('battle', 'victory'),
  picture('battle', 'flee', 'shiver'),
  picture('battle', 'berserk', 'shiver'),
  picture('battle', 'stunned', 'shiver'),
  picture('battle', 'poison', 'shiver'),
  picture('battle', 'asleep'),
  picture('battle', 'buff', 'beat'),
  picture('battle', 'taunt'),
  picture('battle', 'protect', 'slam'),
  picture('battle', 'smash', 'slam'),
  picture('battle', 'ready'),
  picture('battle', 'lowhp', 'shiver'),

  picture('explore', 'magnifier'),
  picture('explore', 'listen'),
  picture('explore', 'sneak'),
  picture('explore', 'found', 'slam'),
  picture('explore', 'map'),
  picture('explore', 'treasure', 'beat'),
  picture('explore', 'trapped', 'shiver'),
  picture('explore', 'lockpick'),
  picture('explore', 'torch', 'shiver'),
  picture('explore', 'think'),
  picture('explore', 'idea', 'slam'),
  picture('explore', 'puzzled'),
  picture('explore', 'shop'),
  picture('explore', 'eat'),
  picture('explore', 'camp'),
  picture('explore', 'toast'),
  picture('explore', 'tome'),
  picture('explore', 'peek'),
  picture('explore', 'lost'),
  picture('explore', 'knock'),

  picture('feel', 'smile'),
  picture('feel', 'laugh'),
  picture('feel', 'cry'),
  picture('feel', 'angry', 'slam'),
  picture('feel', 'shock', 'slam'),
  picture('feel', 'blush'),
  picture('feel', 'smug'),
  picture('feel', 'love', 'beat'),
  picture('feel', 'scared', 'shiver'),
  picture('feel', 'awkward'),
  picture('feel', 'confused'),
  picture('feel', 'excited', 'beat'),
  picture('feel', 'pout'),
  picture('feel', 'sigh'),
  picture('feel', 'sleepy'),
  picture('feel', 'evil'),
  picture('feel', 'moved', 'beat'),
  picture('feel', 'blank'),
  picture('feel', 'proud'),
  picture('feel', 'panic', 'shiver'),

  picture('talk', 'ok'),
  picture('talk', 'no', 'slam'),
  picture('talk', 'wait'),
  picture('talk', 'hello'),
  picture('talk', 'goodgame'),
  picture('talk', 'thanks', 'beat'),
  picture('talk', 'sorry'),
  picture('talk', 'question'),
  picture('talk', 'agree'),
  picture('talk', 'beg', 'slam'),
  picture('talk', 'brb'),
  picture('talk', 'goodnight'),
  picture('talk', 'tea'),
  picture('talk', 'clap'),
  picture('talk', 'cheer', 'beat'),
  picture('talk', 'popcorn'),
  picture('talk', 'memo'),
  picture('talk', 'rules'),
  picture('talk', 'hurry', 'shiver'),
  picture('talk', 'letsplay'),
  picture('talk', 'ruling', 'slam'),
  picture('talk', 'oshi', 'beat'),
  picture('talk', 'foreshadow'),
];

const BY_ID = new Map(BUILTIN_STAMPS.map((each) => [each.id, each]));

/** How a stamp from a room's own set is named: by the picture it is. */
export const IMAGE_STAMP_PREFIX = 'image:';

/** What a stamp identifier names. */
export type StampRef =
  | { readonly kind: 'builtin'; readonly stamp: BuiltinStamp }
  | { readonly kind: 'image'; readonly imageIdentifier: string };

/**
 * What a stamp identifier names, or null for one this version does not know, as a newer version
 * may send, and for an empty one.
 */
export function stampOf(id: string | null | undefined): StampRef | null {
  const text = `${id ?? ''}`.trim();
  if (text.length < 1) return null;
  if (text.startsWith(IMAGE_STAMP_PREFIX)) {
    const imageIdentifier = text.slice(IMAGE_STAMP_PREFIX.length).trim();
    return imageIdentifier.length > 0 ? { kind: 'image', imageIdentifier } : null;
  }
  const builtin = BY_ID.get(text);
  return builtin ? { kind: 'builtin', stamp: builtin } : null;
}

/**
 * Where a stamp stands among the others when they are shown together: the ones that come with the
 * app in the order they are offered, then the room's own.
 */
export function stampOrder(id: string): number {
  const index = BUILTIN_STAMPS.findIndex((each) => each.id === id);
  return index >= 0 ? index : BUILTIN_STAMPS.length;
}

/** The identifier of the stamp a picture in the room is. */
export function imageStampId(imageIdentifier: string): string {
  return `${IMAGE_STAMP_PREFIX}${imageIdentifier}`;
}

/** The stamps of one family, in the order they are offered. */
export function stampsOfFamily(family: StampFamily): readonly BuiltinStamp[] {
  return BUILTIN_STAMPS.filter((each) => each.family === family);
}

/** Whether a family comes with the app as pictures rather than drawn by the app. */
export function isArtStampFamily(family: string): family is ArtStampFamily {
  return (ART_STAMP_FAMILIES as readonly string[]).includes(family);
}

/** Where the picture of a stamp that comes with the app as a picture is, or null for the others. */
export function stampArtUrl(stamp: BuiltinStamp): string | null {
  return isArtStampFamily(stamp.family) ? `assets/images/stamps/${stamp.family}/${stamp.key}.webp` : null;
}

/** Whether a stamp is a picture, one of the app's or one from the room, rather than drawn by the app. */
export function isPictureStamp(id: string): boolean {
  const ref = stampOf(id);
  return ref !== null && (ref.kind === 'image' || isArtStampFamily(ref.stamp.family));
}

/** The translation key for the words written on a stamp, for the families that write any. */
export function stampLabelKey(stamp: BuiltinStamp): string {
  return `ui.stamp.items.${stamp.family}.${stamp.key}.label`;
}

/** The translation key for what a stamp means, shown when it is pointed at and in a log. */
export function stampNameKey(stamp: BuiltinStamp): string {
  return `ui.stamp.items.${stamp.family}.${stamp.key}.name`;
}
