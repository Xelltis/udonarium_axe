import { RUBY_NOTATION } from '@axe/domain/chat/chat-ruby-notation';
import { INLINE_STAMP, withInlineStampsAsWords } from '@axe/domain/chat/inline-stamp';

/**
 * The decorations a line of chat can carry, written in its text: `**bold**`, and a name in square
 * brackets closed by `[/]` or by the name again, `[明朝]…[/明朝]`, for a font, a size, a colour,
 * italics or a line through.
 *
 * Only a `**` paired with another on the same line makes bold, and only a tag closed later in the message takes
 * effect: a lone `**`, a tag never closed, a closing tag with nothing to close, or a name the chat
 * does not know stays the text it was. A message written before there were decorations is drawn as
 * it always was, unless it happened to close a tag it opened. A backslash before a mark that would
 * take effect, `\**` or `\[赤]`, writes the mark as it stands; anywhere else a backslash is only a
 * backslash, so a line written before keeps the ones it had.
 *
 * An older version of the tool, or another tool, shows the marks as they were typed; nothing is kept
 * anywhere but in the text.
 */

/** The fonts a line may be drawn in: the five that come with the tool, and the tool's own. */
export const CHAT_FONT_KEYS = ['mincho', 'rounded', 'hand', 'pop', 'pixel', 'gothic'] as const;
export type ChatFontKey = (typeof CHAT_FONT_KEYS)[number];

/** The sizes a line may be drawn at, beside its own. */
export const CHAT_SIZE_KEYS = ['small', 'large', 'huge'] as const;
export type ChatSizeKey = (typeof CHAT_SIZE_KEYS)[number];

/**
 * The colours a line may be named in, each mid-toned so that it reads on a light or a dark chat, but
 * for white and black, which are drawn with a thin edge of the other (see {@link chatColorHalo}).
 */
export const CHAT_COLORS = {
  red: '#e5484d',
  orange: '#f76b15',
  yellow: '#d6a400',
  green: '#30a46c',
  cyan: '#0797b9',
  blue: '#3e63dd',
  purple: '#8e4ec6',
  pink: '#e93d82',
  gray: '#8b8d98',
  white: '#ffffff',
  black: '#1c2024',
} as const;
export type ChatColorKey = keyof typeof CHAT_COLORS;

/** What a run of a line is drawn with. A run drawn plainly has none. */
export interface ChatDecoration {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly strike: boolean;
  readonly size: ChatSizeKey | null;
  readonly font: ChatFontKey | null;
  /** A colour as `#rrggbb`, or null for the line's own. */
  readonly color: string | null;
}

/** A run of a line and what it is drawn with, null for a plain one. */
export interface DecoratedRun {
  readonly text: string;
  readonly decoration: ChatDecoration | null;
}

/** One kind of tag and what it sets: a font, a size, a colour, or one of the three marks. */
type TagEffect =
  | { kind: 'bold' | 'italic' | 'strike' }
  | { kind: 'size'; value: ChatSizeKey }
  | { kind: 'font'; value: ChatFontKey }
  | { kind: 'color'; value: string };

/** Every thing a tag can set, by the one name each is written with, the first in each language. */
export type ChatTagKey = 'bold' | 'italic' | 'strike' | ChatSizeKey | `font:${ChatFontKey}` | `color:${ChatColorKey}`;

/**
 * The names a tag is written with, in Japanese, English and Korean, the first of each language being
 * the one a button writes. English is read without regard to case.
 */
export const CHAT_TAG_NAMES: Readonly<
  Record<ChatTagKey, { ja: readonly string[]; en: readonly string[]; ko: readonly string[] }>
> = {
  bold: { ja: ['太字'], en: ['bold'], ko: ['굵게'] },
  italic: { ja: ['斜体'], en: ['italic'], ko: ['기울임'] },
  strike: { ja: ['取消線'], en: ['strike'], ko: ['취소선'] },
  small: { ja: ['小'], en: ['small'], ko: ['작게'] },
  large: { ja: ['大'], en: ['large'], ko: ['크게'] },
  huge: { ja: ['特大'], en: ['huge'], ko: ['아주크게'] },
  'font:mincho': { ja: ['明朝'], en: ['mincho', 'serif'], ko: ['명조'] },
  'font:rounded': { ja: ['丸ゴシック'], en: ['rounded'], ko: ['둥근고딕'] },
  'font:hand': { ja: ['手書き'], en: ['handwriting'], ko: ['손글씨'] },
  'font:pop': { ja: ['ポップ'], en: ['pop'], ko: ['팝'] },
  'font:pixel': { ja: ['ドット'], en: ['pixel'], ko: ['도트'] },
  'font:gothic': { ja: ['ゴシック'], en: ['gothic'], ko: ['고딕'] },
  'color:red': { ja: ['赤'], en: ['red'], ko: ['빨강'] },
  'color:orange': { ja: ['橙', 'オレンジ'], en: ['orange'], ko: ['주황'] },
  'color:yellow': { ja: ['黄'], en: ['yellow'], ko: ['노랑'] },
  'color:green': { ja: ['緑'], en: ['green'], ko: ['초록'] },
  'color:cyan': { ja: ['水色'], en: ['cyan'], ko: ['하늘'] },
  'color:blue': { ja: ['青'], en: ['blue'], ko: ['파랑'] },
  'color:purple': { ja: ['紫'], en: ['purple'], ko: ['보라'] },
  'color:pink': { ja: ['桃', 'ピンク'], en: ['pink'], ko: ['분홍'] },
  'color:gray': { ja: ['灰', 'グレー'], en: ['gray', 'grey'], ko: ['회색'] },
  'color:white': { ja: ['白'], en: ['white'], ko: ['흰색'] },
  'color:black': { ja: ['黒'], en: ['black'], ko: ['검정'] },
};

/** The languages a tag's name is written in. */
export type ChatTagLanguage = 'ja' | 'en' | 'ko';

const TAG_BY_NAME: ReadonlyMap<string, ChatTagKey> = new Map(
  (Object.entries(CHAT_TAG_NAMES) as [ChatTagKey, (typeof CHAT_TAG_NAMES)[ChatTagKey]][]).flatMap(([key, names]) =>
    [...names.ja, ...names.en.map((name) => name.toLowerCase()), ...names.ko].map((name) => [name, key] as const)
  )
);

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** What a tag's name sets, or null for a name the chat does not know. */
function effectOfName(name: string): TagEffect | null {
  const trimmed = name.trim();
  if (HEX_COLOR.test(trimmed)) return { kind: 'color', value: fullHex(trimmed) };
  const key = TAG_BY_NAME.get(trimmed) ?? TAG_BY_NAME.get(trimmed.toLowerCase());
  return key ? effectOfKey(key) : null;
}

function effectOfKey(key: ChatTagKey): TagEffect {
  if (key === 'bold' || key === 'italic' || key === 'strike') return { kind: key };
  if (key === 'small' || key === 'large' || key === 'huge') return { kind: 'size', value: key };
  const [kind, value] = key.split(':') as ['font' | 'color', string];
  if (kind === 'font') return { kind, value: value as ChatFontKey };
  return { kind, value: CHAT_COLORS[value as ChatColorKey] };
}

function fullHex(hex: string): string {
  const digits = hex.slice(1).toLowerCase();
  return `#${digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits}`;
}

/** Two effects that one closes the other: the same kind setting the same thing. */
function sameEffect(a: TagEffect, b: TagEffect): boolean {
  return a.kind === b.kind && ('value' in a ? a.value : '') === ('value' in b ? b.value : '');
}

type Token = { from: number; to: number } & (
  | { type: 'text'; text: string }
  | { type: 'escape' }
  | { type: 'stars'; raw: string; pair: number }
  | { type: 'open'; raw: string; effect: TagEffect; pair: number }
  | { type: 'close'; raw: string; effect: TagEffect | null; pair: number }
);

const OPEN_BRACKETS = '[［';
const CLOSE_BRACKETS = ']］';
const SLASHES = '/／';
/** How far past a bracket its closing bracket is looked for: further than any tag's name runs. */
const TAG_REACH = 24;

/**
 * Cuts a line into its text and the marks that might decorate it, before any is paired, each with
 * where it stands. A backslash that keeps a mark from taking effect is a token of its own.
 */
function tokensOf(text: string): Token[] {
  const tokens: Token[] = [];
  let plain = '';
  let plainFrom = 0;
  const flush = (to: number) => {
    if (plain.length > 0) tokens.push({ type: 'text', text: plain, from: plainFrom, to });
    plain = '';
  };
  const addPlain = (piece: string, at: number) => {
    if (plain.length < 1) plainFrom = at;
    plain += piece;
  };
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    const next = text[at + 1];
    if (char === '\\' && (next === '*' ? text[at + 2] === '*' : tagAt(text, at + 1) !== null)) {
      flush(at);
      tokens.push({ type: 'escape', from: at, to: at + 1 });
      addPlain(next, at + 1);
      at++;
      continue;
    }
    if (char === '*' && next === '*') {
      flush(at);
      tokens.push({ type: 'stars', raw: '**', pair: -1, from: at, to: at + 2 });
      at++;
      continue;
    }
    const tag = tagAt(text, at);
    if (tag) {
      flush(at);
      tokens.push(tag.token);
      at = tag.end;
      continue;
    }
    addPlain(char, at);
  }
  flush(text.length);
  return tokens;
}

/** The tag a bracket opens, with where it ends, or null where the bracket opens no tag the chat knows. */
function tagAt(text: string, at: number): { token: Token; end: number } | null {
  const bracket = text[at];
  if (bracket === undefined || !OPEN_BRACKETS.includes(bracket)) return null;
  const end = indexOfAny(text, CLOSE_BRACKETS, at + 1, at + 1 + TAG_REACH);
  const inside = end < 0 ? null : text.slice(at + 1, end);
  if (inside === null || inside.length < 1 || /[[\]［］\n]/.test(inside)) return null;
  const raw = text.slice(at, end + 1);
  if (SLASHES.includes(inside[0])) {
    const name = inside.slice(1);
    const effect = name.trim().length > 0 ? effectOfName(name) : null;
    return name.trim().length === 0 || effect
      ? { token: { type: 'close', raw, effect, pair: -1, from: at, to: end + 1 }, end }
      : null;
  }
  const effect = effectOfName(inside);
  return effect ? { token: { type: 'open', raw, effect, pair: -1, from: at, to: end + 1 }, end } : null;
}

/**
 * Words written to stand as they are in a line of chat, as a stamp's stand-in is: with a backslash
 * before them where their brackets would otherwise be read as a decoration's tag, as `［赤］` and
 * `[red]` would. Every version that reads tags reads the backslash, and shows the words alone.
 */
export function keptFromDecoration(words: string): string {
  return tagAt(words, 0) ? `\\${words}` : words;
}

function indexOfAny(text: string, chars: string, from: number, until: number): number {
  for (let at = from; at < Math.min(until, text.length); at++) if (chars.includes(text[at])) return at;
  return -1;
}

/**
 * Pairs the stars in the order they come within a line, and each closing tag with the latest open
 * tag it closes: `[/]` the latest of all, a named one the latest of its own kind, so that tags may
 * overlap. What is left unpaired stays text.
 */
function pair(tokens: Token[]): void {
  let waiting = -1;
  tokens.forEach((token, index) => {
    if (token.type === 'text' && token.text.includes('\n')) waiting = -1;
    if (token.type !== 'stars') return;
    if (waiting < 0) {
      waiting = index;
      return;
    }
    token.pair = waiting;
    (tokens[waiting] as { pair: number }).pair = index;
    waiting = -1;
  });
  const open: number[] = [];
  tokens.forEach((token, index) => {
    if (token.type === 'open') {
      open.push(index);
      return;
    }
    if (token.type !== 'close') return;
    const effect = token.effect;
    let match = open.length - 1;
    if (effect) {
      while (match >= 0 && !sameEffect((tokens[open[match]] as { effect: TagEffect }).effect, effect)) match--;
    }
    if (match < 0) return;
    const [opened] = open.splice(match, 1);
    token.pair = opened;
    (tokens[opened] as { pair: number }).pair = index;
  });
}

const PLAIN: ChatDecoration = { bold: false, italic: false, strike: false, size: null, font: null, color: null };

/** What the open effects come to: the marks if any is open, and the size, font and colour opened last. */
function decorationOf(open: readonly TagEffect[], boldStars: boolean): ChatDecoration | null {
  if (open.length < 1 && !boldStars) return null;
  let decoration: ChatDecoration = { ...PLAIN, bold: boldStars };
  for (const effect of open) {
    switch (effect.kind) {
      case 'bold':
      case 'italic':
      case 'strike':
        decoration = { ...decoration, [effect.kind]: true };
        break;
      case 'size':
        decoration = { ...decoration, size: effect.value };
        break;
      case 'font':
        decoration = { ...decoration, font: effect.value };
        break;
      case 'color':
        decoration = { ...decoration, color: effect.value };
        break;
    }
  }
  return decoration;
}

function sameDecoration(a: ChatDecoration | null, b: ChatDecoration | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.strike === b.strike &&
    a.size === b.size &&
    a.font === b.font &&
    a.color === b.color
  );
}

/**
 * Walks a line's pieces of text in order, each with where it stands and what it is drawn with: its
 * text, and the marks left unpaired, which stay text. Answers the tokens, paired.
 */
function walkDecorations(
  text: string,
  visit: (piece: string, from: number, to: number, decoration: ChatDecoration | null) => void
): Token[] {
  const tokens = tokensOf(text);
  pair(tokens);
  const open: { index: number; effect: TagEffect }[] = [];
  let bold = false;
  const current = () =>
    decorationOf(
      open.map((entry) => entry.effect),
      bold
    );
  tokens.forEach((token, index) => {
    if (token.type === 'escape') return;
    if (token.type === 'text') return visit(token.text, token.from, token.to, current());
    if (token.pair < 0) return visit(token.raw, token.from, token.to, current());
    if (token.type === 'stars') {
      bold = token.pair > index;
      return;
    }
    if (token.type === 'open') {
      open.push({ index, effect: token.effect });
      return;
    }
    const at = open.findIndex((entry) => entry.index === token.pair);
    if (at >= 0) open.splice(at, 1);
  });
  return tokens;
}

/** A line cut into runs, each with what it is drawn with, the marks taken out and the unpaired ones left as text. */
export function decoratedRunsOf(text: string): DecoratedRun[] {
  const runs: DecoratedRun[] = [];
  walkDecorations(text, (piece, _from, _to, decoration) => {
    if (piece.length < 1) return;
    const last = runs.at(-1);
    if (last && sameDecoration(last.decoration, decoration)) {
      runs[runs.length - 1] = { text: last.text + piece, decoration };
    } else {
      runs.push({ text: piece, decoration });
    }
  });
  return runs;
}

/**
 * A mark in a line that might decorate it, where it stands, and whether it does: a `**`, an opening
 * or closing tag, or a backslash that keeps the mark after it from taking effect.
 */
export interface ChatDecorationMark {
  readonly kind: 'stars' | 'open' | 'close' | 'escape';
  readonly from: number;
  readonly to: number;
  /** Whether the mark takes effect; one left unpaired is drawn as the text it is. */
  readonly paired: boolean;
  /** The index among the marks of the one it is paired with, or -1. */
  readonly partner: number;
}

/** A stretch of a line drawn with one decoration, by where it stands in the line as typed. */
export interface PlacedChatDecoration {
  readonly from: number;
  readonly to: number;
  readonly decoration: ChatDecoration;
}

/**
 * Where a line's decoration marks stand and what each stretch of it is drawn with, read just as
 * {@link decoratedRunsOf} reads it, for an editor that draws the line as it will look while keeping
 * the marks in place.
 */
export function chatDecorationLayout(text: string): {
  marks: ChatDecorationMark[];
  runs: PlacedChatDecoration[];
} {
  const runs: PlacedChatDecoration[] = [];
  const tokens = walkDecorations(text, (_piece, from, to, decoration) => {
    if (!decoration || from >= to) return;
    const last = runs.at(-1);
    if (last && last.to === from && sameDecoration(last.decoration, decoration)) {
      runs[runs.length - 1] = { from: last.from, to, decoration };
    } else {
      runs.push({ from, to, decoration });
    }
  });
  const markAt = new Map<number, number>();
  tokens.forEach((token, index) => {
    if (token.type !== 'text') markAt.set(index, markAt.size);
  });
  const marks: ChatDecorationMark[] = [];
  for (const token of tokens) {
    if (token.type === 'text') continue;
    const pair = token.type === 'escape' ? -1 : token.pair;
    marks.push({
      kind: token.type,
      from: token.from,
      to: token.to,
      paired: token.type === 'escape' || pair >= 0,
      partner: pair >= 0 ? (markAt.get(pair) ?? -1) : -1,
    });
  }
  return { marks, runs };
}

/**
 * What a line says with its decorations taken out, as it is read aloud, searched or written plainly:
 * a stamp put inside it is written as its name in brackets.
 */
export function withoutChatDecoration(text: string): string {
  return withInlineStampsAsWords(
    decoratedRunsOf(text)
      .map((run) => run.text)
      .join('')
  );
}

/** The fonts the runs of a line are drawn in, each once, for whatever has to load them. */
export function chatFontsIn(runs: readonly DecoratedRun[]): ChatFontKey[] {
  const fonts = new Set<ChatFontKey>();
  for (const run of runs) if (run.decoration?.font) fonts.add(run.decoration.font);
  return [...fonts];
}

/** The classes a decorated run is drawn with: `chat-deco` and one for each thing it sets. */
export function chatDecorationClasses(decoration: ChatDecoration): string {
  const classes = ['chat-deco'];
  if (decoration.bold) classes.push('chat-deco-bold');
  if (decoration.italic) classes.push('chat-deco-italic');
  if (decoration.strike) classes.push('chat-deco-strike');
  if (decoration.size) classes.push(`chat-size-${decoration.size}`);
  if (decoration.font) classes.push(`chat-font-${decoration.font}`);
  return classes.join(' ');
}

const LIGHT_HALO = '0 0 1px rgb(255 255 255 / 0.9), 0 0 2px rgb(255 255 255 / 0.6)';
const DARK_HALO = '0 0 1px rgb(0 0 0 / 0.9), 0 0 2px rgb(0 0 0 / 0.6)';

/**
 * The thin edge a colour is drawn with so that it reads on a light chat and on a dark one alike: a
 * dark edge round a colour as light as white, a light one round a colour as dark as black, and none
 * round the mid-toned ones. Null where it needs none, or for anything but a `#rrggbb`.
 */
export function chatColorHalo(color: string | null): string | null {
  if (!color || !HEX_COLOR.test(color)) return null;
  const hex = fullHex(color);
  const [red, green, blue] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  if (luminance > 0.6) return DARK_HALO;
  if (luminance < 0.04) return LIGHT_HALO;
  return null;
}

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
/** What opens a phrase and so stays with what follows it. */
const OPENING = /^[「『（(［[【〈《“‘]$/u;
/** What closes a phrase or may not start a line, and so stays with what goes before it. */
const CLOSING = /^[、。，．,.・：:；;？?！!ー…‥」』）)］\]】〉》”’ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ々〻]$/u;
const WORD = /^[\p{Script=Latin}\p{Nd}'’]$/u;

/**
 * Cuts the text of a leaning run into the pieces it may break between: a word of Latin letters or
 * figures whole, every other letter on its own, a mark that opens kept with what follows and one that
 * closes with what goes before, and the spaces between apart. A leaning run is drawn piece by piece,
 * as a lean is only drawn on a box, and a box does not break across lines.
 */
export function leaningPiecesOf(text: string): string[] {
  const pieces: string[] = [];
  let opening = '';
  for (const { segment } of GRAPHEMES.segment(text)) {
    const last = pieces.length - 1;
    const lastPiece = pieces[last] ?? '';
    if (/^\s+$/u.test(segment)) {
      if (opening) pieces.push(opening);
      opening = '';
      if (last >= 0 && /^\s+$/u.test(pieces[pieces.length - 1])) pieces[pieces.length - 1] += segment;
      else pieces.push(segment);
      continue;
    }
    if (OPENING.test(segment)) {
      opening += segment;
      continue;
    }
    const joins =
      opening.length < 1 &&
      last >= 0 &&
      !/^\s+$/u.test(lastPiece) &&
      (CLOSING.test(segment) || (WORD.test(segment) && WORD.test(lastPiece.at(-1) ?? '')));
    if (joins) pieces[last] += segment;
    else pieces.push(opening + segment);
    opening = '';
  }
  if (opening) pieces.push(opening);
  return pieces;
}

const KEPT_WHOLE = new RegExp(`${INLINE_STAMP.source}|${RUBY_NOTATION.source}|\\\\s`, 'g');

/** The pieces a leaning run breaks between, with a stamp, a word and its reading, and a `\s`, each kept whole. */
export function leaningPiecesKeepingNotation(text: string): string[] {
  const pieces: string[] = [];
  let at = 0;
  for (const match of text.matchAll(KEPT_WHOLE)) {
    pieces.push(...leaningPiecesOf(text.slice(at, match.index)), match[0]);
    at = match.index + match[0].length;
  }
  pieces.push(...leaningPiecesOf(text.slice(at)));
  return pieces;
}

/**
 * The runs of a line as html, each decorated run in a span of its classes and colour and everything through
 * `escape`, which makes the html of a plain piece of text (escaping it, with whatever else it reads).
 *
 * A span never runs over a line break: each line of a run gets its own, so that what reads a line
 * at a time, as quoted lines are, finds its lines whole. A quote mark that starts a line is left out
 * of the span, for the same reason. The colour is only ever a `#rrggbb` the parser made. A leaning
 * run is cut by `lean` into the pieces it may break between, each in a span of its own, the spaces
 * between drawn upright.
 */
export function chatDecorationMarkup(
  runs: readonly DecoratedRun[],
  escape: (text: string) => string,
  lean: (text: string) => string[] = leaningPiecesOf
): string {
  let html = '';
  let lineStart = true;
  for (const run of runs) {
    run.text.split('\n').forEach((piece, index) => {
      if (index > 0) {
        html += '\n';
        lineStart = true;
      }
      if (piece.length < 1) return;
      if (!run.decoration) {
        html += escape(piece);
        lineStart = false;
        return;
      }
      let rest = piece;
      if (lineStart) {
        const quote = /^>\s?/.exec(rest);
        if (quote) {
          html += escape(quote[0]);
          rest = rest.slice(quote[0].length);
        }
      }
      lineStart = false;
      if (rest.length < 1) return;
      const decoration = run.decoration;
      const span = (inner: string, upright = false) => {
        const drawn = upright ? { ...decoration, italic: false } : decoration;
        return `<span class="${chatDecorationClasses(drawn)}"${colorStyle(drawn)}>${escape(inner)}</span>`;
      };
      html += decoration.italic
        ? lean(rest)
            .map((leaning) => span(leaning, /^\s+$/u.test(leaning)))
            .join('')
        : span(rest);
    });
  }
  return html;
}

function colorStyle(decoration: ChatDecoration): string {
  if (!decoration.color) return '';
  const halo = chatColorHalo(decoration.color);
  return ` style="color: ${decoration.color}${halo ? `; text-shadow: ${halo}` : ''}"`;
}

/**
 * The rules a saved log draws the decorations by. A saved page carries no fonts, so each font is named
 * for a reader who has it installed, and falls back to the family it is like.
 */
export const CHAT_DECORATION_LOG_CSS =
  '.chat-deco-bold{font-weight:700}' +
  '.chat-deco-italic{display:inline-block;transform:skewX(-12deg)}' +
  '.chat-deco-strike{text-decoration:line-through}' +
  '.chat-size-small{font-size:.8em}' +
  '.chat-size-large{font-size:1.3em}' +
  '.chat-size-huge{font-size:1.7em;line-height:1.25}' +
  ".chat-font-mincho{font-family:'Shippori Mincho','Yu Mincho',YuMincho,'Hiragino Mincho ProN','Noto Serif JP',serif}" +
  ".chat-font-rounded{font-family:'Zen Maru Gothic','Hiragino Maru Gothic ProN',sans-serif}" +
  ".chat-font-hand{font-family:'Yomogi',sans-serif}" +
  ".chat-font-pop{font-family:'Mochiy Pop One',sans-serif}" +
  ".chat-font-pixel{font-family:'DotGothic16',sans-serif}" +
  '.chat-font-gothic{font-family:sans-serif}';

const BOLD_STARS = '**';

/** The marks a button writes round what is selected, in the language the reader reads the tool in. */
export function chatDecorationMarks(key: ChatTagKey, language: ChatTagLanguage): { open: string; close: string } {
  if (key === 'bold') return { open: BOLD_STARS, close: BOLD_STARS };
  const name = CHAT_TAG_NAMES[key][language][0];
  return { open: `[${name}]`, close: `[/${name}]` };
}

/**
 * Puts marks round the part of a text that is selected, or at the caret with nothing selected, and
 * says what to select afterwards: the part that was selected, or the caret between the marks.
 *
 * Stars only pair within a line, so a selection over several lines has each of its lines starred
 * on its own, the empty ones left as they are.
 */
export function wrapChatSelection(
  text: string,
  start: number,
  end: number,
  marks: { open: string; close: string }
): { text: string; selectionStart: number; selectionEnd: number } {
  const from = Math.max(0, Math.min(start, end, text.length));
  const to = Math.min(text.length, Math.max(start, end));
  const selected = text.slice(from, to);
  if (marks.open === BOLD_STARS && selected.includes('\n')) {
    const lines = selected.split('\n');
    const starred = lines.map((line) => (line.trim().length > 0 ? marks.open + line + marks.close : line)).join('\n');
    const opens = lines[0].trim().length > 0 ? marks.open.length : 0;
    const closes = (lines.at(-1) ?? '').trim().length > 0 ? marks.close.length : 0;
    return {
      text: text.slice(0, from) + starred + text.slice(to),
      selectionStart: from + opens,
      selectionEnd: from + starred.length - closes,
    };
  }
  const wrapped = text.slice(0, from) + marks.open + selected + marks.close + text.slice(to);
  return { text: wrapped, selectionStart: from + marks.open.length, selectionEnd: to + marks.open.length };
}
