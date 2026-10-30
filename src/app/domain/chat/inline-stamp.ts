import { STAMP_FAMILIES } from '@axe/domain/chat/stamp-catalog';

/**
 * A stamp put inside a line as an emoji is, written `［name:id］`: the name the stamp is called by
 * in the language of whoever sent it, then the identifier it is kept by. A version that cannot draw
 * it, a log and a search read the name, in the brackets a stamp's stand-in words are written in.
 *
 * Only an identifier of a family there is, or of a room's picture, is read as a stamp, so that
 * brackets someone happened to write are left as they are. The form keeps clear of what is
 * rewritten as a line is sent: it holds no brace, no at mark and no space. With no space in it, no
 * part of a name can start a word, so none is ever read as a `&` or `:` command. Nor does it hold
 * a mark a decoration or a ruby is written with, which would pair with one in the line round it.
 */
export interface InlineStampSite {
  readonly from: number;
  readonly to: number;
  readonly label: string;
  readonly id: string;
}

/** The longest name kept in the written form. */
const LABEL_REACH = 40;

/** What a name may not hold: the form's own marks, what a sent line rewrites, and the marks of decorations and rubies. */
const LABEL_BARRED = '［］:{}｛｝@＠*＊\\[\\]|｜《》\\\\';

/** `［name:id］`, the identifier of a family there is or of a room's picture. */
export const INLINE_STAMP = new RegExp(
  `［([^${LABEL_BARRED}\\s]{1,${LABEL_REACH}}):((?:${STAMP_FAMILIES.join('|')}):[a-z0-9]+|image:[^［］\\s]+)］`,
  'g'
);

/** The stamps written inside a text, in the order they stand. */
export function inlineStampSites(text: string): InlineStampSite[] {
  return [...text.matchAll(INLINE_STAMP)].map((match) => ({
    from: match.index,
    to: match.index + match[0].length,
    label: match[1],
    id: match[2],
  }));
}

/**
 * How a stamp is written into a line: its name, kept to what the form can hold with the spaces in
 * it written as underscores, and its identifier. A name with nothing left to it is written as the
 * stamp's key, kept the same way, or as `stamp` where nothing is left of that either.
 */
export function inlineStampToken(label: string, id: string): string {
  const keep = (name: string) =>
    name
      .replace(new RegExp(`[${LABEL_BARRED}]`, 'g'), '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, LABEL_REACH);
  return `［${keep(label) || keep(id.slice(id.indexOf(':') + 1)) || 'stamp'}:${id}］`;
}

/** A text with each stamp inside it written as its name, in brackets, as plain text shows it. */
export function withInlineStampsAsWords(text: string): string {
  return text.replace(INLINE_STAMP, (_, label: string) => `［${label}］`);
}

/**
 * A text with each stamp inside it written as spaces as long, for what reads words and commands out
 * of a line: a stamp ends a word as a space does, holds no command, and leaves where everything
 * else stands as it was.
 */
export function withInlineStampsAsSpaces(text: string): string {
  return text.replace(INLINE_STAMP, (stamp) => ' '.repeat(stamp.length));
}

/**
 * The stamps a text is made of, where it holds nothing but stamps and the space between them; null
 * for a text with words in it, or with nothing at all.
 */
export function inlineStampsAlone(text: string): string[] | null {
  const sites = inlineStampSites(text);
  if (sites.length < 1) return null;
  let rest = text;
  for (const site of [...sites].reverse()) rest = rest.slice(0, site.from) + rest.slice(site.to);
  return rest.trim().length > 0 ? null : sites.map((site) => site.id);
}
