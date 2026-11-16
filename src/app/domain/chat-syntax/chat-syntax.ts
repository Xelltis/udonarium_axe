import {
  isBuffClearance,
  isPieceResetCommand,
  isTableResetCommand,
  parseBuffClearanceCommand,
  parseBuffRemovalCommand,
} from '@axe/domain/character/buff-bulk-removal';
import { buffCommandFields, halfWidthBuffCommand } from '@axe/domain/character/buff-command';
import {
  chatDecorationLayout,
  type ChatDecorationMark,
  type PlacedChatDecoration,
} from '@axe/domain/chat/chat-decoration';
import { aimMarkSites, paletteVariableSite } from '@axe/domain/chat/chat-palette';
import { type PortraitCommand, portraitCommandSite } from '@axe/domain/chat/chat-portrait-command';
import { CHARACTER_REFERENCE, type ReferenceSite, referenceSites } from '@axe/domain/chat/chat-reference';
import { RUBY_NOTATION } from '@axe/domain/chat/chat-ruby-notation';
import { inlineStampSites } from '@axe/domain/chat/inline-stamp';
import { isPaletteTabLine } from '@axe/domain/chat/palette-rows';
import { lexDiceCommand } from '@axe/domain/chat-syntax/dice-command-lexer';
import { findEmbeddedRolls } from '@axe/domain/data/embedded-roll';
import {
  readDefaultResetCommand,
  resourceCommandParts,
  resourceCommandSites,
} from '@axe/domain/data/resource-command-words';
import { diceChatTokenSite } from '@axe/domain/dice/dice-chat-token';
import { looksLikeRollWord, readRollLine, rollableText, rollWordSite } from '@axe/domain/dice/dice-roll-line';
import { effectTokenSites } from '@axe/domain/effect/effect-chat-token';
import { readCutInChatTail } from '@axe/domain/media/cut-in-chat-tail';
import { readTurnChatCommand, type TurnChatCommand } from '@axe/domain/tabletop/turn-chat-command';
import { type LegacyVnSuffixSite, legacyVnSuffixSite } from '@axe/domain/visual-novel/vn-emote';

/** A stretch of the text, by the index of its first character and the index just past its last. */
export interface TextRange {
  readonly from: number;
  readonly to: number;
}

/**
 * What a piece of a syntax is: a `marker` is what an editor may hide while the cursor is away,
 * leaving the rest to be read as it will look; the others say what the piece stands for.
 */
export type SyntaxPartRole =
  | 'marker'
  | 'name'
  | 'operator'
  | 'amount'
  | 'field'
  | 'reading'
  | 'number'
  | 'die'
  | 'arith'
  | 'compare'
  | 'paren'
  | 'word';

/** One piece of a syntax and what it is. */
export interface SyntaxPart extends TextRange {
  readonly role: SyntaxPartRole;
}

/** One syntax in the text, where it stands, its pieces, and what it reads as. */
export type SyntaxSpan = TextRange & { readonly parts: readonly SyntaxPart[] } & (
    | { readonly kind: 'repeat'; readonly repeat: number }
    /** The first word of a message shaped like a roll; whether the game system takes it is told apart. */
    | { readonly kind: 'roll'; readonly message: TextRange }
    | { readonly kind: 'reference'; readonly site: ReferenceSite }
    | { readonly kind: 'resource'; readonly command: string; readonly targeted: boolean }
    /** A `t:` standing on its own, which aims the line at the targets and is not said. */
    | { readonly kind: 'aim' }
    | { readonly kind: 'buff'; readonly command: string; readonly targeted: boolean }
    | { readonly kind: 'sweep'; readonly command: string }
    /**
     * A command that clears buffs whatever their names, `&*-`, puts values back to their defaults,
     * `:*=既定`, or does both, `&リセット-`: of the speaker's piece, of the pieces aimed at where it is
     * `targeted`, or with `&&` of every piece on the table.
     */
    | {
        readonly kind: 'reset';
        readonly command: string;
        readonly targeted: boolean;
        readonly reach: 'piece' | 'table';
        readonly takes: 'buffs' | 'values' | 'both';
      }
    /** A round command that opens a message, `&T`; `rest` is what follows it, read as a message of its own. */
    | { readonly kind: 'turn'; readonly command: TurnChatCommand; readonly rest: TextRange }
    | { readonly kind: 'portrait'; readonly command: PortraitCommand }
    /**
     * The last word of a message, which starts the cut-in of that name if there is one; an `@` before
     * it plays only its sound. A portrait command found for the speaker is taken off first, which
     * leaves no such word, so a line with one starts no cut-in.
     */
    | { readonly kind: 'cutIn'; readonly name: string; readonly soundOnly: boolean }
    /** A `《name》` token; `order` counts the effect tokens before it, the battle stage's left out. */
    | { readonly kind: 'effect'; readonly name: string; readonly battle: boolean; readonly order: number }
    | { readonly kind: 'diceToken'; readonly name: string }
    | { readonly kind: 'ruby' }
    /** A stamp put inside the line, by the identifier it is kept under and the name it was written with. */
    | { readonly kind: 'stamp'; readonly id: string; readonly label: string }
    /** A decoration mark; `pairedWith` is where the mark it is paired with stands, if it is. */
    | { readonly kind: 'decoration'; readonly mark: ChatDecorationMark; readonly pairedWith: TextRange | null }
    | { readonly kind: 'quote' }
    | { readonly kind: 'vnSuffix'; readonly site: LegacyVnSuffixSite }
    | { readonly kind: 'paletteVariable'; readonly name: string }
    | { readonly kind: 'paletteTab' }
  );

export type SyntaxKind = SyntaxSpan['kind'];

/** Everything read out of a text, for drawing it and checking it. */
export interface ChatSyntaxScan {
  readonly text: string;
  readonly spans: readonly SyntaxSpan[];
  /** The stretches drawn decorated, where the text is drawn as it will look. */
  readonly decorations: readonly PlacedChatDecoration[];
  /** Each message the text holds: the whole of it in chat, each line that is said in a palette. */
  readonly messages: readonly TextRange[];
}

/**
 * Whether the text is one chat message, as typed into the chat input, or a palette, each line of
 * which is a message of its own, a variable, a tab or nothing.
 */
export type ChatSyntaxMode = 'chat' | 'palette';

/**
 * Reads every syntax out of a text, with where it stands, by the same readings sending it goes by.
 * Spans come in the order they start, and may lie inside one another, as a reference in a roll or
 * a decoration around anything does.
 */
export function scanChatSyntax(text: string, mode: ChatSyntaxMode = 'chat'): ChatSyntaxScan {
  const spans: SyntaxSpan[] = [];
  const decorations: PlacedChatDecoration[] = [];
  const messages: TextRange[] = [];
  if (mode === 'chat') {
    scanMessage(text, 0, spans, decorations);
    messages.push({ from: 0, to: text.length });
  } else {
    let at = 0;
    for (const line of text.split('\n')) {
      scanPaletteLine(line, at, spans, decorations, messages);
      at += line.length + 1;
    }
  }
  spans.sort((a, b) => a.from - b.from || b.to - a.to);
  return { text, spans, decorations, messages };
}

function scanPaletteLine(
  line: string,
  offset: number,
  spans: SyntaxSpan[],
  decorations: PlacedChatDecoration[],
  messages: TextRange[]
): void {
  const variable = paletteVariableSite(line);
  if (variable) {
    spans.push({
      kind: 'paletteVariable',
      name: variable.name,
      from: offset,
      to: offset + line.length,
      parts: [
        { role: 'marker', from: offset, to: offset + variable.nameFrom },
        { role: 'name', from: offset + variable.nameFrom, to: offset + variable.nameTo },
        { role: 'amount', from: offset + variable.valueFrom, to: offset + line.length },
      ],
    });
    return;
  }
  if (isPaletteTabLine(line)) {
    spans.push({ kind: 'paletteTab', from: offset, to: offset + line.length, parts: [] });
    return;
  }
  if (line.trim().length < 1) return;
  scanMessage(line, offset, spans, decorations);
  messages.push({ from: offset, to: offset + line.length });
}

/** Where a character of a message stands in the whole text. */
type At = (index: number) => number;

/**
 * Reads a message as it is said: one that opens with a round command as the command and then what
 * follows it, which is said as a line of its own once the round has been moved.
 */
function scanMessage(message: string, offset: number, spans: SyntaxSpan[], decorations: PlacedChatDecoration[]): void {
  const round = readTurnChatCommand(message);
  if (!round) return scanSaidLine(message, offset, spans, decorations);
  const from = offset + round.from;
  const to = offset + round.to;
  spans.push({
    kind: 'turn',
    command: round.command,
    rest: { from: offset + round.restFrom, to: offset + message.length },
    from,
    to,
    parts: [
      { role: 'marker', from, to: from + 1 },
      { role: 'name', from: from + 1, to },
    ],
  });
  if (round.restFrom < message.length) {
    scanSaidLine(message.slice(round.restFrom), offset + round.restFrom, spans, decorations);
  }
}

function scanSaidLine(message: string, offset: number, spans: SyntaxSpan[], decorations: PlacedChatDecoration[]): void {
  const at: At = (index) => offset + index;
  scanRoll(message, offset, spans);
  scanReferences(message, at, spans);
  scanAims(message, at, spans);
  scanCommandWords(message, at, spans);
  scanPortrait(message, at, spans);
  scanCutInTail(message, at, spans);
  scanEffectTokens(message, at, spans);
  scanDiceToken(message, at, spans);
  scanStamps(message, at, spans);
  scanRuby(message, at, spans);
  scanDecorations(message, at, spans, decorations);
  scanQuotes(message, at, spans);
  scanVnSuffix(message, at, spans);
}

function scanReferences(message: string, at: At, spans: SyntaxSpan[]): void {
  for (const site of referenceSites(message)) {
    const raw = message.slice(site.from, site.to);
    const open = raw.search(/[{｛]/) + 1;
    spans.push({
      kind: 'reference',
      site: { ...site, from: at(site.from), to: at(site.to) },
      from: at(site.from),
      to: at(site.to),
      parts: [
        { role: 'marker', from: at(site.from), to: at(site.from + open) },
        { role: 'name', from: at(site.from + open), to: at(site.to - 1) },
        { role: 'marker', from: at(site.to - 1), to: at(site.to) },
      ],
    });
  }
}

function scanAims(message: string, at: At, spans: SyntaxSpan[]): void {
  for (const mark of aimMarkSites(message)) {
    spans.push({
      kind: 'aim',
      from: at(mark.from),
      to: at(mark.to),
      parts: [{ role: 'marker', from: at(mark.from), to: at(mark.to) }],
    });
  }
}

/**
 * The resource, buff and sweep commands of a message, in that order. One that clears buffs whatever
 * their names, puts values back to their defaults or does both is a reset, with the pieces of the
 * kind of command it is written as.
 */
function scanCommandWords(message: string, at: At, spans: SyntaxSpan[]): void {
  const words = resourceCommandSites(message);
  for (const site of words.resources) {
    const targeted = site.command.startsWith('t');
    const from = site.markFrom;
    const parts: SyntaxPart[] = [{ role: 'marker', from: at(from), to: at(site.from + (targeted ? 2 : 1)) }];
    const command = resourceCommandParts(site.command);
    if (command) {
      const base = site.from;
      parts.push({ role: 'name', from: at(base + command.nameFrom), to: at(base + command.operatorAt) });
      parts.push({ role: 'operator', from: at(base + command.operatorAt), to: at(base + command.amountFrom) });
      if (command.amount.length > 0) {
        parts.push({ role: 'amount', from: at(base + command.amountFrom), to: at(site.to) });
        for (const roll of findEmbeddedRolls(command.amount)) {
          const start = base + command.amountFrom + roll.start;
          parts.push({ role: 'paren', from: at(start), to: at(start + 1) });
          parts.push({
            role: 'paren',
            from: at(start + roll.end - roll.start - 1),
            to: at(start + roll.end - roll.start),
          });
        }
      }
    }
    const placed = { command: site.command, targeted, from: at(from), to: at(site.to), parts };
    if (readDefaultResetCommand(site.command))
      spans.push({ kind: 'reset', reach: 'piece', takes: 'values', ...placed });
    else spans.push({ kind: 'resource', ...placed });
  }
  for (const site of words.buffs) {
    const targeted = site.command.startsWith('t');
    const from = site.markFrom;
    const fields = buffCommandFields(site.command);
    const parts: SyntaxPart[] = [{ role: 'marker', from: at(from), to: at(site.from + (fields[0]?.from ?? 0)) }];
    fields.forEach((field, index) => {
      if (index > 0)
        parts.push({ role: 'marker', from: at(site.from + field.from - 1), to: at(site.from + field.from) });
      parts.push({
        role: index === 0 ? 'name' : 'field',
        from: at(site.from + field.from),
        to: at(site.from + field.to),
      });
    });
    const placed = { command: site.command, targeted, from: at(from), to: at(site.to), parts };
    const written = halfWidthBuffCommand(site.command);
    if (isPieceResetCommand(written)) spans.push({ kind: 'reset', reach: 'piece', takes: 'both', ...placed });
    else if (parseBuffClearanceCommand(written))
      spans.push({ kind: 'reset', reach: 'piece', takes: 'buffs', ...placed });
    else spans.push({ kind: 'buff', ...placed });
  }
  for (const site of words.sweeps) {
    const placed = {
      command: site.command,
      from: at(site.markFrom),
      to: at(site.to),
      parts: [{ role: 'marker' as const, from: at(site.markFrom), to: at(site.from + 2) }],
    };
    const rule = parseBuffRemovalCommand(site.command);
    if (isTableResetCommand(site.command)) {
      spans.push({ kind: 'reset', reach: 'table', takes: 'both', targeted: false, ...placed });
    } else if (rule && isBuffClearance(rule)) {
      spans.push({ kind: 'reset', reach: 'table', takes: 'buffs', targeted: false, ...placed });
    } else spans.push({ kind: 'sweep', ...placed });
  }
}

function scanPortrait(message: string, at: At, spans: SyntaxSpan[]): void {
  const portrait = portraitCommandSite(message);
  if (!portrait) return;
  spans.push({
    kind: 'portrait',
    command: portrait.command,
    from: at(portrait.from),
    to: at(portrait.to),
    parts: [
      { role: 'marker', from: at(portrait.from), to: at(portrait.from + 1) },
      { role: 'name', from: at(portrait.from + 1), to: at(portrait.to) },
    ],
  });
}

function scanCutInTail(message: string, at: At, spans: SyntaxSpan[]): void {
  const tail = readCutInChatTail(message);
  if (!tail) return;
  const nameFrom = tail.to - tail.name.length;
  spans.push({
    kind: 'cutIn',
    name: tail.name,
    soundOnly: tail.soundOnly,
    from: at(tail.from),
    to: at(tail.to),
    parts: tail.soundOnly
      ? [
          { role: 'marker', from: at(tail.from), to: at(nameFrom) },
          { role: 'name', from: at(nameFrom), to: at(tail.to) },
        ]
      : [{ role: 'name', from: at(tail.from), to: at(tail.to) }],
  });
}

function scanEffectTokens(message: string, at: At, spans: SyntaxSpan[]): void {
  let order = 0;
  for (const site of effectTokenSites(message)) {
    spans.push({
      kind: 'effect',
      name: site.name,
      battle: site.battle,
      order: site.battle ? -1 : order++,
      from: at(site.from),
      to: at(site.to),
      parts: [
        { role: 'marker', from: at(site.from), to: at(site.from + 1) },
        { role: 'name', from: at(site.from + 1), to: at(site.to - 1) },
        { role: 'marker', from: at(site.to - 1), to: at(site.to) },
      ],
    });
  }
}

function scanDiceToken(message: string, at: At, spans: SyntaxSpan[]): void {
  const diceToken = diceChatTokenSite(message);
  if (!diceToken) return;
  spans.push({
    kind: 'diceToken',
    name: diceToken.name,
    from: at(diceToken.from),
    to: at(diceToken.to),
    parts: [
      { role: 'marker', from: at(diceToken.from), to: at(diceToken.from + 5) },
      { role: 'name', from: at(diceToken.from + 5), to: at(diceToken.to) },
    ],
  });
}

function scanStamps(message: string, at: At, spans: SyntaxSpan[]): void {
  for (const site of inlineStampSites(message)) {
    spans.push({
      kind: 'stamp',
      id: site.id,
      label: site.label,
      from: at(site.from),
      to: at(site.to),
      parts: [
        { role: 'marker', from: at(site.from), to: at(site.from + 1) },
        { role: 'name', from: at(site.from + 1), to: at(site.from + 1 + site.label.length) },
        { role: 'field', from: at(site.from + 2 + site.label.length), to: at(site.to - 1) },
        { role: 'marker', from: at(site.to - 1), to: at(site.to) },
      ],
    });
  }
}

function scanRuby(message: string, at: At, spans: SyntaxSpan[]): void {
  for (const ruby of message.matchAll(RUBY_NOTATION)) {
    const from = ruby.index;
    const baseTo = from + 1 + ruby[1].length;
    const to = from + ruby[0].length;
    spans.push({
      kind: 'ruby',
      from: at(from),
      to: at(to),
      parts: [
        { role: 'marker', from: at(from), to: at(from + 1) },
        { role: 'name', from: at(from + 1), to: at(baseTo) },
        { role: 'marker', from: at(baseTo), to: at(baseTo + 1) },
        { role: 'reading', from: at(baseTo + 1), to: at(to - 1) },
        { role: 'marker', from: at(to - 1), to: at(to) },
      ],
    });
  }
}

/** The decoration marks of a message, and the stretches they decorate. */
function scanDecorations(message: string, at: At, spans: SyntaxSpan[], decorations: PlacedChatDecoration[]): void {
  const layout = chatDecorationLayout(message);
  for (const mark of layout.marks) {
    const placed = { ...mark, from: at(mark.from), to: at(mark.to) };
    const partner = layout.marks[mark.partner];
    spans.push({
      kind: 'decoration',
      mark: placed,
      pairedWith: partner ? { from: at(partner.from), to: at(partner.to) } : null,
      from: placed.from,
      to: placed.to,
      parts: mark.paired ? [{ role: 'marker', from: placed.from, to: placed.to }] : [],
    });
  }
  for (const run of layout.runs) decorations.push({ ...run, from: at(run.from), to: at(run.to) });
}

function scanQuotes(message: string, at: At, spans: SyntaxSpan[]): void {
  let lineStart = 0;
  for (const line of message.split('\n')) {
    const quote = /^>\s?/.exec(line);
    if (quote) {
      const from = at(lineStart);
      spans.push({
        kind: 'quote',
        from,
        to: from + line.length,
        parts: [{ role: 'marker', from, to: from + quote[0].length }],
      });
    }
    lineStart += line.length + 1;
  }
}

function scanVnSuffix(message: string, at: At, spans: SyntaxSpan[]): void {
  const vn = legacyVnSuffixSite(message);
  if (!vn) return;
  const site: LegacyVnSuffixSite = {
    ...vn,
    from: at(vn.from),
    to: at(vn.to),
    words: vn.words.map((word) => ({ ...word, from: at(word.from), to: at(word.to) })),
  };
  spans.push({
    kind: 'vnSuffix',
    site,
    from: site.from,
    to: site.to,
    parts: site.read
      ? [
          { role: 'marker', from: site.from, to: site.from + 1 },
          ...site.words.map((word): SyntaxPart => ({ role: 'name', from: word.from, to: word.to })),
          { role: 'marker', from: site.to - 1, to: site.to },
        ]
      : [],
  });
}

function scanRoll(message: string, offset: number, spans: SyntaxSpan[]): void {
  const rollable = rollableText(message);
  const line = readRollLine(rollable);
  const count = /^(\d+)\s/.exec(rollable);
  if (count && line.rollFrom > 0) {
    spans.push({
      kind: 'repeat',
      repeat: line.repeat,
      from: offset,
      to: offset + count[1].length,
      parts: [{ role: 'number', from: offset, to: offset + count[1].length }],
    });
  }
  const site = rollWordSite(message);
  const word = rollable.slice(site.from, site.to);
  if (word.length < 1 || !looksLikeRollWord(word.replace(CHARACTER_REFERENCE, ''))) return;
  const from = offset + site.from;
  spans.push({
    kind: 'roll',
    message: { from: offset, to: offset + message.length },
    from,
    to: from + word.length,
    parts: lexDiceCommand(word, from),
  });
}
