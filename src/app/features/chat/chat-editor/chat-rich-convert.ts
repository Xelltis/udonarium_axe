import type { ChatDecoration, ChatFontKey, ChatSizeKey, ChatTagLanguage } from '@axe/domain/chat/chat-decoration';
import { portraitCommandSite } from '@axe/domain/chat/chat-portrait-command';
import {
  type ChatRichChip,
  type ChatRichLine,
  type ChatRichMode,
  type ChatRichSegment,
  type ChatRichText,
  isPaletteDirectiveLine,
  normalMarks,
  serializeChatRichText,
} from '@axe/domain/chat/chat-rich-text';
import { CHAT_CHIP, CHAT_MARK } from '@axe/features/chat/chat-editor/chat-rich-schema';
import { Fragment, type Mark, type Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model';

/** The marks of the editor's document for a decoration. */
export function marksOfDecoration(schema: Schema, decoration: ChatDecoration | null): Mark[] {
  const marks: Mark[] = [];
  const set = normalMarks(decoration);
  if (!set) return marks;
  if (set.bold) marks.push(schema.marks[CHAT_MARK.bold].create());
  if (set.italic) marks.push(schema.marks[CHAT_MARK.italic].create());
  if (set.strike) marks.push(schema.marks[CHAT_MARK.strike].create());
  if (set.size) marks.push(schema.marks[CHAT_MARK.size].create({ value: set.size }));
  if (set.font) marks.push(schema.marks[CHAT_MARK.font].create({ value: set.font }));
  if (set.color) marks.push(schema.marks[CHAT_MARK.color].create({ value: set.color }));
  return marks;
}

/** The decoration the editor's marks come to, or null for none. */
export function decorationOfMarks(marks: readonly Mark[]): ChatDecoration | null {
  const value = (name: string) => marks.find((mark) => mark.type.name === name)?.attrs['value'] ?? null;
  return normalMarks({
    bold: marks.some((mark) => mark.type.name === CHAT_MARK.bold),
    italic: marks.some((mark) => mark.type.name === CHAT_MARK.italic),
    strike: marks.some((mark) => mark.type.name === CHAT_MARK.strike),
    size: value(CHAT_MARK.size) as ChatSizeKey | null,
    font: value(CHAT_MARK.font) as ChatFontKey | null,
    color: value(CHAT_MARK.color) as string | null,
  });
}

/** A chip as a node of the editor's document. */
export function nodeOfChip(schema: Schema, chip: ChatRichChip, marks: readonly Mark[] = []): ProseMirrorNode {
  switch (chip.kind) {
    case 'ruby':
      return schema.nodes[CHAT_CHIP.ruby].create(
        { raw: chip.raw, base: chip.base, reading: chip.reading },
        null,
        marks
      );
    case 'reference':
      return schema.nodes[CHAT_CHIP.reference].create(
        { raw: chip.raw, name: chip.name, targeted: chip.targeted, useMax: chip.useMax },
        null,
        marks
      );
    case 'effect':
      return schema.nodes[CHAT_CHIP.effect].create(
        { raw: chip.raw, name: chip.name, battle: chip.battle },
        null,
        marks
      );
    case 'portrait':
      return schema.nodes[CHAT_CHIP.portrait].create({ raw: chip.raw }, null, marks);
    case 'cutIn':
      return schema.nodes[CHAT_CHIP.cutIn].create(
        { raw: chip.raw, name: chip.name, soundOnly: chip.soundOnly },
        null,
        marks
      );
  }
}

/** The chip a node of the editor's document stands for, or null for text. */
export function chipOfNode(node: ProseMirrorNode): ChatRichChip | null {
  const attrs = node.attrs;
  const raw = String(attrs['raw'] ?? '');
  switch (node.type.name) {
    case CHAT_CHIP.ruby:
      return { kind: 'ruby', raw, base: String(attrs['base']), reading: String(attrs['reading']) };
    case CHAT_CHIP.reference:
      return {
        kind: 'reference',
        raw,
        name: String(attrs['name']),
        targeted: !!attrs['targeted'],
        useMax: !!attrs['useMax'],
      };
    case CHAT_CHIP.effect:
      return { kind: 'effect', raw, name: String(attrs['name']), battle: !!attrs['battle'] };
    case CHAT_CHIP.portrait:
      return {
        kind: 'portrait',
        raw,
        command: portraitCommandSite(raw)?.command ?? { type: 'name', name: raw.replace(/^[@＠]/, '') },
      };
    case CHAT_CHIP.cutIn:
      return { kind: 'cutIn', raw, name: String(attrs['name']), soundOnly: !!attrs['soundOnly'] };
    default:
      return null;
  }
}

/** A line as a paragraph of the editor's document, keeping the text it was read from. */
export function paragraphOfLine(schema: Schema, line: ChatRichLine): ProseMirrorNode {
  const content: ProseMirrorNode[] = [];
  for (const segment of line.segments) {
    const marks = marksOfDecoration(schema, segment.marks);
    if (segment.kind === 'text') {
      if (segment.text.length > 0) content.push(schema.text(segment.text, marks));
    } else {
      content.push(nodeOfChip(schema, segment, marks));
    }
  }
  return schema.nodes['paragraph'].create({ source: line.source ?? null }, Fragment.from(content));
}

/** Lines as the editor's document. */
export function docOfLines(schema: Schema, lines: readonly ChatRichLine[]): ProseMirrorNode {
  const paragraphs = lines.map((line) => paragraphOfLine(schema, line));
  return schema.nodes['doc'].create(null, paragraphs.length > 0 ? paragraphs : [schema.nodes['paragraph'].create()]);
}

const LINES = new WeakMap<ProseMirrorNode, ChatRichLine>();

/** A paragraph of the editor's document as a line, worked out once for each paragraph. */
export function lineOfParagraph(paragraph: ProseMirrorNode): ChatRichLine {
  const known = LINES.get(paragraph);
  if (known) return known;
  const segments: ChatRichSegment[] = [];
  paragraph.forEach((child) => {
    const marks = decorationOfMarks(child.marks);
    const chip = chipOfNode(child);
    if (chip) segments.push({ ...chip, marks });
    else if (child.isText) segments.push({ kind: 'text', text: child.text ?? '', marks });
  });
  const source = paragraph.attrs['source'];
  const line: ChatRichLine = typeof source === 'string' ? { segments, source } : { segments };
  LINES.set(paragraph, line);
  return line;
}

/** The text a paragraph shows, chips counted as the text they stand for. */
function plainOfLine(line: ChatRichLine): string {
  return line.segments.map((segment) => (segment.kind === 'text' ? segment.text : segment.raw)).join('');
}

/** A document written as the syntax string, with the way between its places and the text's. */
export interface ChatDocText {
  readonly text: string;
  /** The place in the document of a place in the text; one inside a chip goes before or after it. */
  toPos(offset: number, assoc?: -1 | 1): number;
  /** The place in the text of a place in the document: before the marks there, or after them. */
  toOffset(pos: number, assoc?: -1 | 1): number;
}

const PALETTE_LINES = new WeakMap<ProseMirrorNode, Map<ChatTagLanguage, ChatRichText>>();

/**
 * Writes a document as the syntax string. A palette is written a line at a time, each line once
 * for each paragraph, since every line of it is a message of its own and a palette may run long.
 */
export function textOfDoc(doc: ProseMirrorNode, language: ChatTagLanguage, mode: ChatRichMode): ChatDocText {
  const paragraphs: ProseMirrorNode[] = [];
  const starts: number[] = [];
  doc.forEach((paragraph, offset) => {
    paragraphs.push(paragraph);
    starts.push(offset);
  });
  const lines = paragraphs.map(lineOfParagraph);
  const parts =
    mode === 'palette'
      ? paragraphs.map((paragraph, index) => paletteLineText(paragraph, lines[index], language))
      : [serializeChatRichText(lines, { language })];
  const texts = parts.map((part) => part.text);
  const text = texts.join('\n');
  const partStarts: number[] = [];
  let at = 0;
  for (const part of texts) {
    partStarts.push(at);
    at += part.length + 1;
  }
  const pointOf = (offset: number, assoc: -1 | 1) => {
    if (mode !== 'palette') return parts[0].toModel(offset, assoc);
    let line = 0;
    while (line + 1 < partStarts.length && partStarts[line + 1] <= offset) line++;
    return { line, offset: parts[line].toModel(offset - partStarts[line], assoc).offset };
  };
  return {
    text,
    toPos(offset, assoc = -1) {
      const point = pointOf(Math.max(0, Math.min(offset, text.length)), assoc);
      const paragraph = paragraphs[point.line] ?? paragraphs[paragraphs.length - 1];
      const start = starts[point.line] ?? starts[starts.length - 1];
      return start + 1 + Math.min(point.offset, paragraph.content.size);
    },
    toOffset(pos, assoc = -1) {
      let line = 0;
      while (line + 1 < starts.length && starts[line + 1] < pos) line++;
      const offset = Math.max(0, Math.min(pos - starts[line] - 1, paragraphs[line].content.size));
      if (mode !== 'palette') return parts[0].toText({ line, offset }, assoc);
      return partStarts[line] + parts[line].toText({ line: 0, offset }, assoc);
    },
  };
}

function paletteLineText(paragraph: ProseMirrorNode, line: ChatRichLine, language: ChatTagLanguage): ChatRichText {
  const known = PALETTE_LINES.get(paragraph)?.get(language);
  if (known) return known;
  const directive = isPaletteDirectiveLine(plainOfLine(line));
  const written = serializeChatRichText([directive ? { ...line, directive } : line], { language, mode: 'palette' });
  const byLanguage = PALETTE_LINES.get(paragraph) ?? new Map<ChatTagLanguage, ChatRichText>();
  byLanguage.set(language, written);
  PALETTE_LINES.set(paragraph, byLanguage);
  return written;
}
