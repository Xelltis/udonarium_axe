import {
  CHAT_COLORS,
  CHAT_TAG_NAMES,
  type ChatColorKey,
  type ChatDecoration,
  chatDecorationLayout,
  type ChatTagKey,
  type ChatTagLanguage,
} from '@axe/domain/chat/chat-decoration';
import { paletteVariableSite } from '@axe/domain/chat/chat-palette';
import { type PortraitCommand, portraitCommandSite } from '@axe/domain/chat/chat-portrait-command';
import { referenceSites } from '@axe/domain/chat/chat-reference';
import { RUBY_NOTATION } from '@axe/domain/chat/chat-ruby-notation';
import { inlineStampSites } from '@axe/domain/chat/inline-stamp';
import { isPaletteTabLine } from '@axe/domain/chat/palette-rows';
import { effectTokenSites } from '@axe/domain/effect/effect-chat-token';
import { readCutInChatTail } from '@axe/domain/media/cut-in-chat-tail';

/**
 * A chat line as a rich editor holds it: lines of text drawn as they will look, and of chips that
 * stand for a piece of syntax whole, and the way back to the syntax string that is sent.
 *
 * The string is what every reader receives, so it is the source of truth: a line nobody touched is
 * written back exactly as it came, and a line that was edited is written so that it is drawn just
 * as the editor drew it.
 */

/** Whether a text is one chat message, or a palette, each line of which is a message of its own. */
export type ChatRichMode = 'chat' | 'palette';

/** A piece of syntax shown whole, and the text it was written with. */
export type ChatRichChip =
  | { kind: 'ruby'; base: string; reading: string; raw: string }
  | { kind: 'reference'; name: string; targeted: boolean; useMax: boolean; raw: string }
  | { kind: 'effect'; name: string; battle: boolean; raw: string }
  | { kind: 'portrait'; command: PortraitCommand; raw: string }
  | { kind: 'cutIn'; name: string; soundOnly: boolean; raw: string }
  | { kind: 'stamp'; id: string; label: string; raw: string };

/** Text in one look, or a chip; `marks` is null for text drawn plainly. */
export type ChatRichSegment =
  { kind: 'text'; text: string; marks: ChatDecoration | null } | (ChatRichChip & { marks: ChatDecoration | null });

/** One line: what it holds, and the text it was read from, to be written back as it was if untouched. */
export interface ChatRichLine {
  readonly segments: readonly ChatRichSegment[];
  /** A palette's `//name=value` or `◆◆` line, which is never decorated and is kept as it stands. */
  readonly directive?: boolean;
  readonly source?: string;
}

/** A place in the model: a line, and a count into it of letters, each chip counting as one. */
export interface ChatRichPoint {
  line: number;
  offset: number;
}

/** A text and the lines it reads as, with the way between places in each. */
export interface ChatRichText {
  readonly text: string;
  readonly lines: readonly ChatRichLine[];
  /** Where a place in the model stands in the text: before the marks there, or after them. */
  toText(point: ChatRichPoint, assoc?: -1 | 1): number;
  /** Where a place in the text stands in the model; one inside a chip goes before it, or after it. */
  toModel(offset: number, assoc?: -1 | 1): ChatRichPoint;
}

export interface ChatRichParseOptions {
  readonly mode?: ChatRichMode;
  /** The cut-ins that start from chat, whose name ending a line becomes a chip. */
  readonly cutInNames?: ReadonlySet<string>;
}

export interface ChatRichSerializeOptions {
  readonly language: ChatTagLanguage;
  readonly mode?: ChatRichMode;
}

interface Range {
  from: number;
  to: number;
}

/** A line and where each of its letters and chips stands in the text, relative to the line. */
interface PlacedLine {
  line: ChatRichLine;
  units: Range[];
}

/** Whether two decorations draw the same; null and a decoration that sets nothing are the same. */
export function sameRichMarks(a: ChatDecoration | null, b: ChatDecoration | null): boolean {
  const left = normalMarks(a);
  const right = normalMarks(b);
  if (!left || !right) return left === right;
  return (
    left.bold === right.bold &&
    left.italic === right.italic &&
    left.strike === right.strike &&
    left.size === right.size &&
    left.font === right.font &&
    left.color === right.color
  );
}

/** A decoration, or null where it sets nothing. */
export function normalMarks(marks: ChatDecoration | null): ChatDecoration | null {
  if (!marks) return null;
  const sets = marks.bold || marks.italic || marks.strike || marks.size || marks.font || marks.color;
  return sets ? marks : null;
}

/** The mark a quoted line starts with, which is drawn plain whatever decoration it falls in. */
const QUOTE_PREFIX = /^>\s?/;

/** Whether a palette line is a variable or a tab, which is kept as it stands. */
export function isPaletteDirectiveLine(line: string): boolean {
  return paletteVariableSite(line) !== null || isPaletteTabLine(line);
}

/**
 * Reads a syntax string into lines of decorated text and chips, the way it is drawn: decorations
 * by {@link chatDecorationLayout}, then rubies, references and effect tokens wherever no decoration
 * mark cuts through them, and a portrait command or a cut-in's name where it ends a message.
 */
export function parseChatRichText(text: string, options: ChatRichParseOptions = {}): ChatRichText {
  const placed: PlacedLine[] = [];
  if (options.mode === 'palette') {
    for (const line of text.split('\n')) {
      if (isPaletteDirectiveLine(line)) {
        placed.push({
          line: { segments: line ? [{ kind: 'text', text: line, marks: null }] : [], directive: true, source: line },
          units: unitsOfPlain(line),
        });
      } else {
        placed.push(...parseMessage(line, options));
      }
    }
  } else {
    placed.push(...parseMessage(text, options));
  }
  return richText(text, placed);
}

function unitsOfPlain(line: string): Range[] {
  return Array.from({ length: line.length }, (_, index) => ({ from: index, to: index + 1 }));
}

/** Reads one message into its lines, each placed against its own line of the message. */
function parseMessage(message: string, options: ChatRichParseOptions): PlacedLine[] {
  const layout = chatDecorationLayout(message);
  const hidden = new Uint8Array(message.length);
  for (const mark of layout.marks) {
    if (!mark.paired) continue;
    hidden.fill(1, mark.from, mark.to);
  }
  const decorationAt: (ChatDecoration | null)[] = new Array(message.length).fill(null);
  for (const run of layout.runs) decorationAt.fill(run.decoration, run.from, run.to);

  const clear = (from: number, to: number) => {
    for (let at = from; at < to; at++) if (hidden[at] || message[at] === '\n') return false;
    return true;
  };
  const chips: (Range & { chip: ChatRichChip })[] = [];
  const take = (from: number, to: number, chip: ChatRichChip) => {
    if (from >= to || !clear(from, to)) return;
    if (chips.some((other) => other.from < to && from < other.to)) return;
    chips.push({ from, to, chip });
  };
  for (const site of inlineStampSites(message)) {
    take(site.from, site.to, { kind: 'stamp', id: site.id, label: site.label, raw: message.slice(site.from, site.to) });
  }
  for (const ruby of message.matchAll(RUBY_NOTATION)) {
    const raw = ruby[0];
    take(ruby.index, ruby.index + raw.length, { kind: 'ruby', base: ruby[1], reading: ruby[2], raw });
  }
  for (const site of referenceSites(message)) {
    const raw = message.slice(site.from, site.to);
    take(site.from, site.to, { kind: 'reference', name: site.name, targeted: site.targeted, useMax: site.useMax, raw });
  }
  for (const site of effectTokenSites(message)) {
    if (site.name.length < 1) continue;
    take(site.from, site.to, {
      kind: 'effect',
      name: site.name,
      battle: site.battle,
      raw: message.slice(site.from, site.to),
    });
  }
  const portrait = portraitCommandSite(message);
  const tail = portrait ? null : readCutInChatTail(message);
  if (portrait) {
    take(portrait.from, portrait.to, {
      kind: 'portrait',
      command: portrait.command,
      raw: message.slice(portrait.from, portrait.to),
    });
  } else if (tail && options.cutInNames?.has(tail.name)) {
    take(tail.from, tail.to, {
      kind: 'cutIn',
      name: tail.name,
      soundOnly: tail.soundOnly,
      raw: message.slice(tail.from, tail.to),
    });
  }
  chips.sort((a, b) => a.from - b.from);

  const placed: PlacedLine[] = [];
  let segments: ChatRichSegment[] = [];
  let units: Range[] = [];
  let lineStart = 0;
  let quoteUntil = -1;
  const push = (segment: ChatRichSegment) => {
    const last = segments.at(-1);
    if (segment.kind === 'text' && last?.kind === 'text' && sameRichMarks(last.marks, segment.marks)) {
      segments[segments.length - 1] = { ...last, text: last.text + segment.text };
    } else {
      segments.push(segment);
    }
  };
  const endLine = (at: number) => {
    placed.push({ line: { segments, source: message.slice(lineStart, at) }, units });
    segments = [];
    units = [];
    lineStart = at + 1;
  };
  const startQuote = (at: number) => {
    const end = message.indexOf('\n', at);
    const quote = QUOTE_PREFIX.exec(message.slice(at, end < 0 ? undefined : end));
    quoteUntil = quote ? at + quote[0].length : -1;
  };

  startQuote(0);
  let chipIndex = 0;
  for (let at = 0; at < message.length;) {
    const chip = chips[chipIndex];
    if (chip && chip.from === at) {
      push({ ...chip.chip, marks: normalMarks(decorationAt[at]) });
      units.push({ from: at - lineStart, to: chip.to - lineStart });
      at = chip.to;
      chipIndex++;
      continue;
    }
    if (message[at] === '\n') {
      endLine(at);
      at++;
      startQuote(at);
      continue;
    }
    if (!hidden[at]) {
      const marks = at < quoteUntil ? null : normalMarks(decorationAt[at]);
      push({ kind: 'text', text: message[at], marks });
      units.push({ from: at - lineStart, to: at + 1 - lineStart });
    }
    at++;
  }
  endLine(message.length);
  return placed;
}

/** What a line looks like letter by letter: each letter and chip's text, with its decoration. */
function flatten(line: ChatRichLine): { text: string; marks: ChatDecoration | null }[] {
  const letters: { text: string; marks: ChatDecoration | null }[] = [];
  for (const segment of withPlainLineEnd(line.segments)) {
    const text = segment.kind === 'text' ? segment.text : segment.raw;
    for (const letter of text) letters.push({ text: letter, marks: normalMarks(segment.marks) });
  }
  return letters;
}

/**
 * Whether two lines are drawn the same, chips counted as the text they stand for. A line is taken
 * as it is written: the commands ending it plain whatever they were put in. A backslash may stand on either side of a mark next to it, as one is written after a
 * mark it would otherwise keep from taking effect, so what it is drawn in does not count.
 */
export function sameRichLine(a: ChatRichLine, b: ChatRichLine): boolean {
  const left = flatten(a);
  const right = flatten(b);
  return (
    left.length === right.length &&
    left.every(
      (letter, index) =>
        letter.text === right[index].text && (letter.text === '\\' || sameRichMarks(letter.marks, right[index].marks))
    )
  );
}

/**
 * Whether two lines hold their chips in the same places, each standing for the same text. A line
 * whose chip went back to its letters, or whose letters became a chip, is drawn the same but stands
 * in the editor as other pieces, which places in it are counted by.
 */
function sameChipPlaces(a: ChatRichLine, b: ChatRichLine): boolean {
  const places = (line: ChatRichLine) => {
    const found: string[] = [];
    let at = 0;
    for (const segment of line.segments) {
      if (segment.kind === 'text') {
        at += [...segment.text].length;
        continue;
      }
      found.push(`${at}:${segment.raw}`);
      at += [...segment.raw].length;
    }
    return found.join('\n');
  };
  return places(a) === places(b);
}

/** One thing a decoration sets other than bold, written as one tag. */
interface TagWant {
  key: string;
  name: (language: ChatTagLanguage) => string;
}

const TAG_ORDER = ['size', 'font', 'color', 'italic', 'strike'] as const;

const COLOR_KEY_BY_VALUE: ReadonlyMap<string, ChatColorKey> = new Map(
  (Object.entries(CHAT_COLORS) as [ChatColorKey, string][]).map(([key, value]) => [value, key])
);

function tagName(key: ChatTagKey, language: ChatTagLanguage): string {
  return CHAT_TAG_NAMES[key][language][0];
}

/** The tags a decoration needs besides bold, in a fixed order. */
function tagsOf(marks: ChatDecoration | null): TagWant[] {
  if (!marks) return [];
  const wants: TagWant[] = [];
  for (const kind of TAG_ORDER) {
    if (kind === 'size' && marks.size) {
      const size = marks.size;
      wants.push({ key: `size:${size}`, name: (language) => tagName(size, language) });
    } else if (kind === 'font' && marks.font) {
      const font = marks.font;
      wants.push({ key: `font:${font}`, name: (language) => tagName(`font:${font}`, language) });
    } else if (kind === 'color' && marks.color) {
      const color = marks.color;
      const named = COLOR_KEY_BY_VALUE.get(color);
      wants.push({
        key: `color:${color}`,
        name: (language) => (named ? tagName(`color:${named}`, language) : color),
      });
    } else if (kind === 'italic' && marks.italic) {
      wants.push({ key: 'italic', name: (language) => tagName('italic', language) });
    } else if (kind === 'strike' && marks.strike) {
      wants.push({ key: 'strike', name: (language) => tagName('strike', language) });
    }
  }
  return wants;
}

/** A piece of a written line, and where each letter or chip of the model stands in it. */
interface Written {
  text: string;
  kind: 'text' | 'chip' | 'mark';
  spans: Range[];
}

/**
 * The segments of a line with the commands read off its end, the chips that pick a portrait or
 * start a cut-in there, taken out of every mark along with the spaces and the stamps round them,
 * which are read as spaces: a mark closed after one would be read as part of its name, and one
 * closed right before it would leave it no space to start after.
 */
function withPlainLineEnd(segments: readonly ChatRichSegment[]): ChatRichSegment[] {
  let from = segments.length;
  for (let index = segments.length - 1; index >= 0; index--) {
    const segment = segments[index];
    const isSpace = segment.kind === 'text' && segment.text.trim().length < 1;
    if (!isSpace && segment.kind !== 'stamp' && segment.kind !== 'portrait' && segment.kind !== 'cutIn') break;
    from = index;
  }
  const tail = segments.slice(from);
  if (!tail.some((segment) => segment.kind === 'portrait' || segment.kind === 'cutIn')) return [...segments];
  const head = segments.slice(0, from);
  const last = head.at(-1);
  const space = last?.kind === 'text' ? (/\s+$/.exec(last.text)?.[0] ?? '') : '';
  if (last?.kind === 'text' && space) head[head.length - 1] = { ...last, text: last.text.slice(0, -space.length) };
  return [
    ...head,
    ...(space ? [{ kind: 'text' as const, text: space, marks: null }] : []),
    ...tail.map((segment) => ({ ...segment, marks: null })),
  ];
}

/**
 * Writes one line in the shortest way the chat reads back as it is drawn: bold as `**`, everything
 * else as tags opened where they start and closed by name where they end, those lasting longest
 * opened first, and all of them closed at the end of the line, before the commands read off it.
 * Literal marks in the text are kept from taking effect where `escapeAll` asks. Backslashes that
 * would come right before a mark, and so keep it from taking effect, are written after the mark
 * instead.
 */
function writeLine(
  line: ChatRichLine,
  language: ChatTagLanguage,
  escapeAll: boolean
): { text: string; units: Range[] } {
  const pieces: Written[] = [];
  const open: TagWant[] = [];
  let bold = false;
  const segments = withPlainLineEnd(line.segments).filter(
    (segment) => segment.kind !== 'text' || segment.text.length > 0
  );
  const lasting = (key: string, from: number) => {
    let count = 0;
    for (let index = from; index < segments.length; index++) {
      if (!tagsOf(normalMarks(segments[index].marks)).some((want) => want.key === key)) break;
      count++;
    }
    return count;
  };
  const mark = (text: string) => {
    let moved = 0;
    for (let last = pieces.at(-1); last?.kind === 'text' && last.text.endsWith('\\'); last = pieces.at(-1)) {
      last.text = last.text.slice(0, -1);
      last.spans.pop();
      moved++;
      if (last.text.length < 1) pieces.pop();
    }
    pieces.push({ text, kind: 'mark', spans: [] });
    if (moved > 0) {
      pieces.push({
        text: '\\'.repeat(moved),
        kind: 'text',
        spans: Array.from({ length: moved }, (_, at) => ({ from: at, to: at + 1 })),
      });
    }
  };
  const closeTo = (depth: number) => {
    while (open.length > depth) mark(`[/${open.pop()!.name(language)}]`);
  };

  segments.forEach((segment, index) => {
    const marks = normalMarks(segment.marks);
    const wants = tagsOf(marks);
    const stale = open.findIndex((tag) => !wants.some((want) => want.key === tag.key));
    if (stale >= 0) closeTo(stale);
    if (!!marks?.bold !== bold) {
      mark('**');
      bold = !bold;
    }
    const missing = wants
      .filter((want) => !open.some((tag) => tag.key === want.key))
      .sort((a, b) => lasting(b.key, index) - lasting(a.key, index));
    for (const want of missing) {
      mark(`[${want.name(language)}]`);
      open.push(want);
    }
    if (segment.kind === 'text') {
      pieces.push({
        text: segment.text,
        kind: 'text',
        spans: Array.from({ length: segment.text.length }, (_, letter) => ({ from: letter, to: letter + 1 })),
      });
    } else {
      pieces.push({ text: segment.raw, kind: 'chip', spans: [{ from: 0, to: segment.raw.length }] });
    }
  });
  if (bold) mark('**');
  closeTo(0);

  let text = '';
  const units: Range[] = [];
  const literal: boolean[] = [];
  for (const piece of pieces) {
    for (const span of piece.spans) units.push({ from: text.length + span.from, to: text.length + span.to });
    for (let index = 0; index < piece.text.length; index++) literal.push(piece.kind === 'text');
    text += piece.text;
  }
  return escapeAll ? escapeLine(text, literal, units) : { text, units };
}

/** Whether a mark, written after a backslash, would be kept by it from taking effect: a mark the chat reads. */
function isReadableMark(mark: string): boolean {
  return chatDecorationLayout(`\\${mark}`).marks.some((found) => found.kind === 'escape' && found.from === 0);
}

/** A tag written where the search is set to start, as the chat's tags are written. */
const TAG_AT = /[[［][^[\]［］\n]{1,24}[\]］]/y;

/**
 * Puts backslashes into a written line wherever plain text would start a mark the chat reads, and
 * says where each letter and chip went.
 *
 * A backslash keeps two stars from pairing by showing the first of them as it stands, and the second
 * is then read afresh. So a run of literal stars is escaped two at a time from its end, the last of
 * them together with a mark's star that follows it, with an odd one first left as it is: it is
 * followed by a backslash, and so pairs with nothing. A literal tag the chat knows gets a backslash
 * of its own.
 */
function escapeLine(
  text: string,
  literal: readonly boolean[],
  units: readonly Range[]
): { text: string; units: Range[] } {
  const escapeAt = new Set<number>();
  for (let at = 0; at < text.length; at++) {
    if (!literal[at]) continue;
    if (text[at] === '*') {
      let end = at;
      while (end < text.length && literal[end] && text[end] === '*') end++;
      let pair = end - 2;
      if (text[end] === '*') {
        escapeAt.add(end - 1);
        pair = end - 3;
      }
      for (; pair >= at; pair -= 2) escapeAt.add(pair);
      at = end - 1;
      continue;
    }
    if (text[at] !== '[' && text[at] !== '［') continue;
    TAG_AT.lastIndex = at;
    const tag = TAG_AT.exec(text)?.[0];
    if (tag && isReadableMark(tag)) escapeAt.add(at);
  }
  let written = '';
  const shift: number[] = [];
  for (let at = 0; at < text.length; at++) {
    if (escapeAt.has(at)) written += '\\';
    shift.push(written.length - at);
    written += text[at];
  }
  return {
    text: written,
    units: units.map((unit) => ({ from: unit.from + shift[unit.from], to: unit.to + shift[unit.to - 1] })),
  };
}

/**
 * How the text of lines is read again to be checked against them: with the names of the cut-ins
 * their chips start, which end a line as a chip only where the reading knows them.
 */
function rereadOptions(lines: readonly ChatRichLine[]): ChatRichParseOptions {
  const names = lines.flatMap((line) =>
    line.segments.flatMap((segment) => (segment.kind === 'cutIn' ? [segment.name] : []))
  );
  return { cutInNames: new Set(names) };
}

/**
 * The message as it was read, where every line still holds the text it was read from and the whole
 * of it is drawn as the lines are: a decoration may run over several lines, which no line on its
 * own would show.
 */
function untouchedMessage(message: readonly ChatRichLine[]): PlacedLine[] | null {
  if (message.length < 1 || message.some((line) => line.source === undefined || line.directive)) return null;
  const reread = parseMessage(message.map((line) => line.source).join('\n'), rereadOptions(message));
  if (reread.length !== message.length) return null;
  return reread.every(
    (placedLine, index) =>
      sameRichLine(placedLine.line, message[index]) && sameChipPlaces(placedLine.line, message[index])
  )
    ? reread
    : null;
}

/** Whether a written message is drawn as its lines meant. */
function drawnAsMeant(text: string, lines: readonly ChatRichLine[]): boolean {
  const reread = parseMessage(text, rereadOptions(lines));
  if (reread.length !== lines.length) return false;
  return reread.every((placed, index) => sameRichLine(placed.line, lines[index]));
}

/**
 * Writes lines back into the syntax string. A line that is drawn just as the text it was read from
 * is written as that text, so what nobody touched does not change by a letter; any other line is
 * written in the canonical way, its decorations as `**` and as tags in the reader's language.
 * Plain text is escaped only where the chat would otherwise read a mark in it, and the whole message
 * is read back to make sure it is drawn as meant. A palette's variable or tab line, never drawn
 * decorated, is written as it now reads, a decoration the editor made in it going back to the marks
 * it was typed as.
 */
export function serializeChatRichText(lines: readonly ChatRichLine[], options: ChatRichSerializeOptions): ChatRichText {
  const placed: PlacedLine[] = [];
  const texts: string[] = [];
  const writeMessage = (message: readonly ChatRichLine[], keepSource: boolean, escapeAll: boolean) => {
    const out: { text: string; units: Range[] }[] = message.map((line) => {
      if (line.directive) return writeLine(line, options.language, false);
      if (keepSource && line.source !== undefined) {
        const reread = parseMessage(line.source, rereadOptions([line]));
        if (reread.length === 1 && sameRichLine(reread[0].line, line) && sameChipPlaces(reread[0].line, line)) {
          return { text: line.source, units: reread[0].units };
        }
      }
      return writeLine(line, options.language, escapeAll);
    });
    return out;
  };
  const messages: (readonly ChatRichLine[])[] = options.mode === 'palette' ? lines.map((line) => [line]) : [lines];
  for (const message of messages) {
    const whole = untouchedMessage(message);
    if (whole) {
      whole.forEach((placedLine, index) => {
        texts.push(message[index].source ?? '');
        placed.push({ line: message[index], units: placedLine.units });
      });
      continue;
    }
    let out = writeMessage(message, true, false);
    const plainLines = message.filter((line) => !line.directive);
    const check = () => out.map((line) => line.text).join('\n');
    if (plainLines.length === message.length && !drawnAsMeant(check(), message)) {
      out = writeMessage(message, false, false);
      if (!drawnAsMeant(check(), message)) out = writeMessage(message, false, true);
    }
    out.forEach((line, index) => {
      texts.push(line.text);
      placed.push({ line: message[index], units: line.units });
    });
  }
  return richText(texts.join('\n'), placed);
}

/** A text and its lines, with the way between places in the model and in the text. */
function richText(text: string, placed: readonly PlacedLine[]): ChatRichText {
  const starts: number[] = [];
  const lengths: number[] = [];
  let at = 0;
  for (const line of text.split('\n')) {
    starts.push(at);
    lengths.push(line.length);
    at += line.length + 1;
  }
  const lineLength = (line: number) => lengths[line] ?? 0;
  return {
    text,
    lines: placed.map((each) => each.line),
    toText({ line, offset }, assoc = -1) {
      const units = placed[line]?.units ?? [];
      const start = starts[line] ?? text.length;
      if (assoc < 0 && offset > 0) return start + units[Math.min(offset, units.length) - 1].to;
      if (assoc < 0 && offset === 0) return start;
      if (offset < units.length) return start + units[offset].from;
      return start + (units.length > 0 && assoc < 0 ? units[units.length - 1].to : lineLength(line));
    },
    toModel(position, assoc = -1) {
      const line = Math.max(0, firstAbove(starts.length, (index) => starts[index] > position) - 1);
      const local = position - starts[line];
      const units = placed[line]?.units ?? [];
      let offset = firstAbove(units.length, (index) => units[index].to > local);
      const inside = units[offset];
      if (inside && inside.from < local && local < inside.to && assoc > 0) offset++;
      return { line, offset };
    },
  };
}

/**
 * The first of `count` places in order where `above` holds, it holding from there on; `count`
 * where it holds nowhere. Found by halving, as the places in a long text are many.
 */
function firstAbove(count: number, above: (index: number) => boolean): number {
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (above(middle)) high = middle;
    else low = middle + 1;
  }
  return low;
}
