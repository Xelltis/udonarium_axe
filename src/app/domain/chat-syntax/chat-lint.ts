import { toHalfWidth } from '@axe/core/util/string-util';
import { isAimedAtStatus } from '@axe/domain/character/aimed-at-buff';
import {
  buffCommandKind,
  halfWidthBuffCommand,
  readBuffStacking,
  readCalculatedBuff,
  removedBuffName,
  splitBuffRounds,
} from '@axe/domain/character/buff-command';
import { isBuffEffectTimingField, resolveBuffEffectTiming } from '@axe/domain/character/buff-timing';
import { countDefaults, type DefaultPick, holdsItemNamed } from '@axe/domain/character/default-value';
import { GameCharacter } from '@axe/domain/character/game-character';
import { findStatusAilment } from '@axe/domain/character/status-ailment';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';
import { decoratedRunsOf } from '@axe/domain/chat/chat-decoration';
import { emptiesUnanswered, textTargetsCharacter } from '@axe/domain/chat/chat-palette';
import {
  findImageIdentifierByName,
  type ImageNameEntry,
  type PortraitCommand,
} from '@axe/domain/chat/chat-portrait-command';
import type { ReferenceSite } from '@axe/domain/chat/chat-reference';
import { stampOf } from '@axe/domain/chat/stamp-catalog';
import { isTargetNumberReference } from '@axe/domain/chat/target-number';
import type { ChatSyntaxScan, SyntaxSpan, TextRange } from '@axe/domain/chat-syntax/chat-syntax';
import {
  hasSecretEditMark,
  readDefaultResetCommand,
  resourceCommandParts,
  resourceCommandSites,
} from '@axe/domain/data/resource-command-words';
import { parseResourceEditOption, readModifierLayout } from '@axe/domain/data/resource-edit-helpers';
import { readNamedResourceSlot } from '@axe/domain/data/resource-slot';
import {
  firstWordOf,
  meantAsRollWord,
  readRollLine,
  rollableText,
  type RollCheck,
  rollLimitBreaches,
} from '@axe/domain/dice/dice-roll-line';
import type { TurnChatCommand, TurnChatRefusal } from '@axe/domain/tabletop/turn-chat-command';

/** How much a finding matters: it will not work, it may not work as meant, or it is worth knowing. */
export type ChatDiagnosticSeverity = 'error' | 'warning' | 'info';

/** Every kind of finding; its message is the translation under `feature.chat.lint.` and its code. */
export const CHAT_LINT_CODES = [
  'dice.plainText',
  'dice.unrollable',
  'dice.failed',
  'dice.tooMany',
  'dice.noRepeat',
  'dice.cannotCheck',
  'dice.tooManyDice',
  'dice.tooManySides',
  'dice.tooManyRepeats',
  'target.none',
  'ref.unknownKept',
  'ref.targetNumberNone',
  'ref.unknownEmptied',
  'ref.noSpeaker',
  'edit.noSpeaker',
  'edit.keptOffTable',
  'res.noOperator',
  'res.noAmount',
  'res.unknownStatus',
  'res.badOption',
  'buff.noName',
  'buff.unreadable',
  'buff.missingStatus',
  'buff.notFound',
  'buff.roundsDefault',
  'buff.badEffectTiming',
  'buff.idleEffectTiming',
  'sweep.gmOnly',
  'reset.gmOnly',
  'reset.noDefaults',
  'reset.shadowsBuff',
  'turn.take',
  'turn.end',
  'turn.wait',
  'turn.stepIn',
  'turn.back',
  'turn.roundStart',
  'turn.roundNext',
  'turn.roundBack',
  'turn.roundReset',
  'turn.no.watching',
  'turn.no.noPiece',
  'turn.no.fixedOrder',
  'turn.no.notUnderWay',
  'turn.no.notInOrder',
  'turn.no.acted',
  'turn.no.otherSide',
  'turn.no.alreadyUp',
  'turn.no.waiting',
  'turn.no.nobodyUp',
  'turn.no.cannotWait',
  'turn.no.notWaiting',
  'turn.no.nothingToUndo',
  'turn.no.underWay',
  'turn.no.notStarted',
  'portrait.unknown',
  'portrait.lostByTarget',
  'cutIn.secret',
  'cutIn.lostByTarget',
  'effect.blank',
  'effect.unknown',
  'effect.extra',
  'battle.noSpeaker',
  'battle.noTarget',
  'effect.noTarget',
  'diceToken.unknown',
  'diceToken.keptOffTable',
  'deco.unpaired',
  'deco.hidesCommand',
  'vn.dropped',
  'vn.duplicate',
  'stamp.unknown',
  'stamp.denied',
] as const;

/** What a finding is about. */
export type ChatLintCode = (typeof CHAT_LINT_CODES)[number];

/** Something found in the text, where it stands, and what it is. */
export interface ChatDiagnostic extends TextRange {
  readonly severity: ChatDiagnosticSeverity;
  readonly code: ChatLintCode;
  readonly params?: Readonly<Record<string, string | number>>;
}

/** What the text is checked against: who speaks it, whom it is aimed at, and what the room holds. */
export interface ChatLintContext {
  /** Whether the text is typed into chat, where a reference nothing answers is kept, or sent from a palette, where it is emptied. */
  readonly path: 'chatWindow' | 'palette';
  /** The piece the line is spoken as, or null for a speaker who is no piece. */
  readonly speaker: GameCharacter | null;
  /** The pieces a line aimed at targets is sent to. */
  readonly targets: readonly GameCharacter[];
  readonly isGameMaster: boolean;
  /** Whether the reader watches a room on a room server, where their commands are not carried out. */
  readonly keptOffTable: boolean;
  /** What a reference is filled in with, or null where nothing answers it. */
  referenceValue(site: ReferenceSite): string | null;
  /**
   * A text with the speaker's references filled in and every other one left as typed, which tells
   * whether a reference of theirs aims the line at the targets, as sending it does; the text as
   * typed where this is not told.
   */
  speakerFilled?(text: string): string;
  /** The speaker's portraits, by label; an identifier is empty where its picture is missing. */
  portraits(): readonly ImageNameEntry[];
  /** Whether a cut-in of that name starts from chat. */
  isChatCutIn(name: string): boolean;
  hasEffect(name: string): boolean;
  hasPieceNamed(name: string): boolean;
  /** What the game system makes of a message, or null while that is not known yet. */
  rollCheck(message: TextRange): RollCheck | null;
  /** What a message is rolled as, its references filled in; the message as typed where this is not told. */
  rolledText?(message: TextRange): string;
  /** Whether a message goes out as a secret roll, its references filled in; not where this is not told. */
  secretRoll?(message: TextRange): boolean;
  /** Whether the room lets a stamp be sent in a line; every stamp where this is not told. */
  stampAllowed?(stampId: string): boolean;
  /**
   * Whether an effect from a line not aimed at targets has a piece to play on: one targeted, or else
   * one selected. A line of chat plays no effect without one; taken to have one where this is not told.
   */
  readonly hasEffectTarget?: boolean;
  /**
   * Whether a battle from a line not aimed at targets has a piece to fight other than the speaker,
   * which fights nobody; taken to have one where this is not told.
   */
  readonly hasBattleDefender?: boolean;
  /**
   * Whether the text is written to be sent later, as a palette's lines are as the palette is
   * written, aimed at the targets and the pieces an effect plays on as each is sent; a line typed
   * to be sent now, in the palette's own box among them, is not.
   */
  readonly sentLater?: boolean;
  /**
   * The pieces on the table, which a reset of the whole table reaches; what such a reset would find
   * there is not checked where this is not told.
   */
  piecesOnTable?(): readonly GameCharacter[];
  /** The name a piece is told by in what is found; its own where this is not told. */
  nameOf?(piece: GameCharacter): string;
  /**
   * Why a round command said now would move nothing, as the seat may not use it or the round does
   * not stand where it applies; null where it would be carried out, as it is taken to be where this
   * is not told.
   */
  turnCommandRefusal?(command: TurnChatCommand): TurnChatRefusal | null;
}

/**
 * Checks what was read out of a text against what the room holds, the way sending each message
 * would go, and answers what will not work, or not as it looks, in the order it stands.
 */
export function lintChatSyntax(scan: ChatSyntaxScan, context: ChatLintContext): ChatDiagnostic[] {
  const found: ChatDiagnostic[] = [];
  const spans = [...scan.spans].sort((a, b) => a.from - b.from);
  let first = 0;
  for (const message of scan.messages) {
    const text = scan.text.slice(message.from, message.to);
    while (first < spans.length && spans[first].from < message.from) first++;
    const inside: SyntaxSpan[] = [];
    for (let at = first; at < spans.length && spans[at].from <= message.to; at++) {
      if (spans[at].to <= message.to) inside.push(spans[at]);
    }
    lintMessage(text, message, inside, context, found);
  }
  return found.sort((a, b) => a.from - b.from || a.to - b.to);
}

/**
 * Whether a decoration keeps a roll or a change from being read: the line with its decorations
 * taken off starts with a roll, or holds a change of a status or a buff, that the line as written
 * does not, the marks of a decoration standing in the words the commands are read from.
 */
function decorationHidesCommand(text: string): boolean {
  const bare = decoratedRunsOf(text)
    .map((run) => run.text)
    .join('');
  if (bare === text) return false;
  const rolls = (line: string) => meantAsRollWord(firstWordOf(readRollLine(rollableText(line)).rollText));
  const changes = (line: string) => {
    const words = resourceCommandSites(line);
    return words.resources.length + words.buffs.length;
  };
  return (rolls(bare) && !rolls(text)) || changes(bare) > changes(text);
}

/**
 * Checks one message. A text written to be sent later, as a palette's lines are, is aimed at the
 * targets and the pieces an effect plays on as each line is sent, so nothing in it that turns on
 * the pieces picked out now is found at fault where none are, nor is a round command for where the
 * round stands now. What follows a round command is rolled as the line of its own it is said as.
 */
function lintMessage(
  text: string,
  message: TextRange,
  spans: readonly SyntaxSpan[],
  context: ChatLintContext,
  found: ChatDiagnostic[]
): void {
  const speakerFilled = (typed: string) => context.speakerFilled?.(typed) ?? typed;
  const targeting = textTargetsCharacter(text) || textTargetsCharacter(speakerFilled(text));
  const noTarget = targeting && context.targets.length < 1;
  const aimsThrough = (site: ReferenceSite) =>
    textTargetsCharacter(speakerFilled(text.slice(site.from - message.from, site.to - message.from)));
  const later = context.sentLater === true;
  const nameOf = (piece: GameCharacter) => context.nameOf?.(piece) ?? piece.name;
  const add = (span: TextRange, severity: ChatDiagnosticSeverity, code: ChatLintCode, extra = {}) =>
    found.push({ from: span.from, to: span.to, severity, code, ...extra });
  const round = spans.find((span) => span.kind === 'turn');
  const said = round?.kind === 'turn' ? round.rest : message;
  const portrait = spans.find((span) => span.kind === 'portrait');
  const portraitFound = portrait?.kind === 'portrait' && portraitResolves(portrait.command, context);
  let effectsStopped = false;
  let hidesCommandFound = false;
  let hidesCommand: boolean | undefined;

  for (const span of spans) {
    switch (span.kind) {
      case 'roll':
        if (!(later && noTarget)) {
          const rolled = text.slice(span.message.from - message.from, span.message.to - message.from);
          lintRoll(rolled, span.message, span, context, add);
        }
        break;
      case 'turn': {
        const refusal = later ? null : (context.turnCommandRefusal?.(span.command) ?? null);
        if (refusal) add(span, 'error', `turn.no.${refusal}`);
        else add(span, 'info', `turn.${span.command}`);
        break;
      }
      case 'reference':
        if (noTarget && (span.site.targeted || aimsThrough(span.site))) {
          if (!later) add(span, 'error', 'target.none');
        } else if (
          !span.site.targeted &&
          !context.speaker &&
          !targeting &&
          context.path === 'chatWindow' &&
          !isTargetNumberReference(span.site.name)
        )
          add(span, 'warning', 'ref.noSpeaker');
        else if (
          context.referenceValue(span.site) == null &&
          !span.site.targeted &&
          isTargetNumberReference(span.site.name)
        )
          add(span, 'info', 'ref.targetNumberNone');
        else if (context.referenceValue(span.site) == null) {
          const emptied = context.path === 'palette' || emptiesUnanswered(text, span.site.from - message.from);
          add(span, 'warning', emptied ? 'ref.unknownEmptied' : 'ref.unknownKept', {
            params: { name: span.site.name },
          });
        }
        break;
      case 'aim':
        if (noTarget && !later) add(span, 'error', 'target.none');
        break;
      case 'resource':
      case 'buff':
        if (span.kind === 'resource' && !meantAsResourceCommand(span.command, piecesFor(span.targeted, context))) break;
        if (span.targeted && noTarget) {
          if (!later) add(span, 'error', 'target.none');
        } else if (context.keptOffTable) add(span, 'warning', 'edit.keptOffTable');
        else if (!span.targeted && !context.speaker) add(span, 'warning', 'edit.noSpeaker');
        else if (span.kind === 'resource')
          lintResource(span.command, span, piecesFor(span.targeted, context), add, nameOf);
        else lintBuff(span.command, span, piecesFor(span.targeted, context), add, nameOf);
        break;
      case 'sweep':
        if (context.keptOffTable) add(span, 'warning', 'edit.keptOffTable');
        else if (!context.isGameMaster) add(span, 'error', 'sweep.gmOnly');
        break;
      case 'reset':
        if (span.targeted && noTarget) {
          if (!later) add(span, 'error', 'target.none');
        } else if (context.keptOffTable) add(span, 'warning', 'edit.keptOffTable');
        else if (span.reach === 'table' && !context.isGameMaster)
          add(span, 'error', span.takes === 'both' ? 'reset.gmOnly' : 'sweep.gmOnly');
        else if (span.reach === 'piece' && !span.targeted && !context.speaker) add(span, 'warning', 'edit.noSpeaker');
        else lintReset(span, context, add, nameOf);
        break;
      case 'portrait':
        if (targeting) add(span, 'warning', 'portrait.lostByTarget');
        else if (!portraitFound && !playsCutInSound(span.command, context)) add(span, 'warning', 'portrait.unknown');
        break;
      case 'cutIn':
        if (portraitFound || !context.isChatCutIn(span.name)) break;
        if (context.keptOffTable) add(span, 'warning', 'edit.keptOffTable');
        else if (targeting) add(span, 'warning', 'cutIn.lostByTarget', { params: { name: span.name } });
        else if (hasSecretEditMark(text) || context.secretRoll?.(said)) {
          add(span, 'info', 'cutIn.secret', { params: { name: span.name } });
        }
        break;
      case 'effect':
        if (span.name.length < 1) {
          if (!effectsStopped) add(span, 'warning', 'effect.blank');
          effectsStopped = true;
        } else if (context.keptOffTable) {
          if (!effectsStopped) add(span, 'warning', 'edit.keptOffTable');
        } else if (span.battle) {
          if (!context.speaker) add(span, 'info', 'battle.noSpeaker');
          else if (!later && !targeting && context.hasBattleDefender === false) add(span, 'warning', 'battle.noTarget');
        } else if (effectsStopped) break;
        else if (span.order > 0) add(span, 'info', 'effect.extra');
        else if (!context.hasEffect(span.name)) add(span, 'warning', 'effect.unknown', { params: { name: span.name } });
        else if (!later && !targeting && context.hasEffectTarget === false)
          add(span, 'warning', 'effect.noTarget', { params: { name: span.name } });
        break;
      case 'diceToken':
        if (context.keptOffTable) add(span, 'warning', 'diceToken.keptOffTable');
        else if (span.name.length > 0 && !context.hasPieceNamed(span.name))
          add(span, 'warning', 'diceToken.unknown', { params: { name: span.name } });
        break;
      case 'decoration':
        if (!span.mark.paired && span.mark.kind !== 'escape') add(span, 'warning', 'deco.unpaired');
        else if (span.mark.paired && !hidesCommandFound && (hidesCommand ??= decorationHidesCommand(text))) {
          hidesCommandFound = true;
          add(message, 'warning', 'deco.hidesCommand');
        }
        break;
      case 'stamp':
        if (!stampOf(span.id)) add(span, 'info', 'stamp.unknown', { params: { name: span.label } });
        else if (context.stampAllowed && !context.stampAllowed(span.id))
          add(span, 'warning', 'stamp.denied', { params: { name: span.label } });
        break;
      case 'vnSuffix':
        if (!span.site.read) {
          const unknown = span.site.words.filter((word) => !word.known);
          if (unknown.length < 1) add(span, 'warning', 'vn.duplicate');
          else {
            const words = unknown
              .map((word) => text.slice(word.from - message.from, word.to - message.from))
              .join('・');
            add(span, 'warning', 'vn.dropped', { params: { words } });
          }
        }
        break;
    }
  }
}

type Report = (
  span: TextRange,
  severity: ChatDiagnosticSeverity,
  code: ChatLintCode,
  extra?: { params?: Record<string, string | number> }
) => void;

const ROLL_CHECK_FINDINGS: Partial<Record<RollCheck['kind'], [ChatDiagnosticSeverity, ChatLintCode]>> = {
  plainText: ['warning', 'dice.plainText'],
  unrollable: ['error', 'dice.unrollable'],
  failed: ['error', 'dice.failed'],
  tooMany: ['error', 'dice.tooMany'],
  noRepeat: ['warning', 'dice.noRepeat'],
  cannotCheck: ['info', 'dice.cannotCheck'],
};

const LIMIT_FINDINGS = {
  dice: 'dice.tooManyDice',
  sides: 'dice.tooManySides',
  repeats: 'dice.tooManyRepeats',
} as const;

function lintRoll(text: string, message: TextRange, span: TextRange, context: ChatLintContext, add: Report): void {
  const check = context.rollCheck(message);
  if (!check) return;
  const finding = ROLL_CHECK_FINDINGS[check.kind];
  if (finding) {
    add(span, finding[0], finding[1]);
    return;
  }
  if (check.kind !== 'rolled') return;
  const breaches = rollLimitBreaches(text);
  for (const breach of breaches) {
    add({ from: message.from + breach.from, to: message.from + breach.to }, 'warning', LIMIT_FINDINGS[breach.limit]);
  }
  const rolled = context.rolledText?.(message) ?? text;
  if (breaches.length > 0 || rolled === text) return;
  for (const limit of new Set(rollLimitBreaches(rolled).map((breach) => breach.limit))) {
    add(span, 'warning', LIMIT_FINDINGS[limit]);
  }
}

function piecesFor(targeted: boolean, context: ChatLintContext): readonly GameCharacter[] {
  if (targeted) return context.targets;
  return context.speaker ? [context.speaker] : [];
}

/**
 * Whether a word that starts with a colon was meant as a resource command: one with an operator,
 * or one naming a status of the pieces it is aimed at that only lacks it. A face such as `:)` or
 * `:D` is no command, and sending it does nothing.
 */
function meantAsResourceCommand(command: string, pieces: readonly GameCharacter[]): boolean {
  if (resourceCommandParts(command)) return true;
  const name = readNamedResourceSlot(command.replace(/^[tTｔＴ]?[:：]/, '')).name;
  return (
    name.length > 0 &&
    pieces.some((piece) => piece.status.canChangeName(name) || piece.status.canChangeName(toHalfWidth(name)))
  );
}

/** Whether a command holds a reference, filled in before the command is read, so that what it names is not known yet. */
function holdsReference(command: string): boolean {
  return /[{｛]/.test(command);
}

/**
 * Checks a `:` command the way it is read into an edit, in the same order, for each piece it is aimed
 * at. The status and the amount of one holding a reference are read only once it is filled in.
 */
function lintResource(
  command: string,
  span: TextRange,
  pieces: readonly GameCharacter[],
  add: Report,
  nameOf: (piece: GameCharacter) => string
): void {
  const parts = resourceCommandParts(command);
  if (!parts) return add(span, 'error', 'res.noOperator');
  if (parts.operator !== '>' && parts.amount === '') return add(span, 'error', 'res.noAmount');
  if (holdsReference(command)) return;
  const name = readNamedResourceSlot(parts.name).name;
  const missing = pieces.filter(
    (piece) => !piece.status.canChangeName(name) && !piece.status.canChangeName(toHalfWidth(name))
  );
  if (missing.length > 0) {
    return add(span, 'error', 'res.unknownStatus', {
      params: { name, piece: missing.map(nameOf).join('・') },
    });
  }
  if (parts.operator !== '>' && parseResourceEditOption(parts.amount).isErr) add(span, 'error', 'res.badOption');
}

/**
 * Checks a `&` command the way laying it would go, for each piece it is aimed at. The buff and the
 * statuses one holding a reference names are read only once it is filled in.
 */
function lintBuff(
  source: string,
  span: TextRange,
  pieces: readonly GameCharacter[],
  add: Report,
  nameOf: (piece: GameCharacter) => string
): void {
  const { command } = readBuffStacking(halfWidthBuffCommand(source));
  const kind = buffCommandKind(command);
  if (holdsReference(command) && (kind === 'remove' || kind === 'calculated')) return;
  if (kind === 'remove') {
    const name = removedBuffName(command);
    const without = pieces.filter((piece) => piece.buffs.find(name) == null);
    if (without.length > 0) {
      add(span, 'warning', 'buff.notFound', { params: { name, piece: without.map(nameOf).join('・') } });
    }
    return;
  }
  if (kind === 'calculated') {
    const read = readCalculatedBuff(command);
    if (read.name.length < 1) return add(span, 'error', 'buff.noName');
    if (!read.requests) return add(span, 'error', 'buff.unreadable');
    for (const request of read.requests) {
      if (isAimedAtStatus(request.target)) continue;
      if (pieces.some((piece) => piece.status.getValue(request.target, request.slot) == null)) {
        add(span, 'warning', 'buff.missingStatus', { params: { name: request.target } });
      }
    }
    const movesAtCounts = read.requests.some((request) => request.step !== undefined);
    lintEffectTiming(read.rest, movesAtCounts, span, add);
    return;
  }
  if (kind === 'plain') {
    const parts = readModifierLayout(command.replace(/^[tTｔＴ]?&/i, '').split('/'));
    const named = findStatusAilment(StatusAilmentCatalog.instance.ailments, parts[0]);
    const { rounds } = splitBuffRounds(parts.slice(2));
    if (!named && rounds && Number.isNaN(parseInt(rounds))) add(span, 'info', 'buff.roundsDefault');
    lintEffectTiming(parts.slice(2), named != null, span, add);
  }
}

type ResetSpan = Extract<SyntaxSpan, { kind: 'reset' }>;

/** The name a reset written as a buff command or a sweep would once have taken a buff off by. */
function nameShadowedBy(span: ResetSpan): string {
  if (span.reach === 'table') return span.command.match(/^[sSｓＳ]?[&＆]{2}(.+)[-－]$/)?.[1].trim() ?? '';
  return removedBuffName(readBuffStacking(halfWidthBuffCommand(span.command)).command);
}

/**
 * Checks a reset against the pieces it reaches: the speaker's, those aimed at, or those on the
 * table where they are told. A buff that goes by the very name the command is written with can no
 * longer be taken off by it, and values go back only where an item keeps a default: an item named
 * that a piece has not is found as for any change of one, and where nothing asked for keeps a default
 * the command changes no value.
 */
function lintReset(
  span: ResetSpan,
  context: ChatLintContext,
  add: Report,
  nameOf: (piece: GameCharacter) => string
): void {
  const pieces = span.reach === 'table' ? context.piecesOnTable?.() : piecesFor(span.targeted, context);
  if (!pieces || pieces.length < 1) return;
  if (span.takes !== 'values') {
    const name = nameShadowedBy(span);
    if (name.length > 0 && pieces.some((piece) => piece.buffs.find(name) != null)) {
      add(span, 'info', 'reset.shadowsBuff', { params: { name } });
    }
  }
  if (span.takes === 'buffs' || holdsReference(span.command)) return;
  const pick: DefaultPick = (span.takes === 'values' ? readDefaultResetCommand(span.command) : null) ?? { kind: 'all' };
  if (pick.kind === 'item') {
    const missing = pieces.filter((piece) => !holdsItemNamed(piece, pick.name));
    if (missing.length > 0) {
      return add(span, 'error', 'res.unknownStatus', {
        params: { name: pick.name, piece: missing.map(nameOf).join('・') },
      });
    }
  }
  if (pieces.every((piece) => countDefaults(piece, pick) < 1)) {
    add(span, span.takes === 'both' ? 'info' : 'warning', 'reset.noDefaults');
  }
}

/**
 * Checks the moment a buff's effect is told to move at, `発生:手番終了`: one that cannot be read is
 * left out as the buff is laid, and one on a buff that moves nothing at every count has nothing to
 * time.
 */
function lintEffectTiming(fields: readonly string[], movesAtCounts: boolean, span: TextRange, add: Report): void {
  const written = fields.filter((field) => isBuffEffectTimingField(field));
  if (written.length < 1) return;
  if (written.some((field) => resolveBuffEffectTiming(field) === null)) add(span, 'error', 'buff.badEffectTiming');
  else if (!movesAtCounts) add(span, 'info', 'buff.idleEffectTiming');
}

/** Whether an `@name` no portrait answers plays the sound of the cut-in of that name instead, as it is meant to. */
function playsCutInSound(command: PortraitCommand, context: ChatLintContext): boolean {
  return command.type === 'name' && context.isChatCutIn(command.name);
}

/** Whether a portrait command finds a picture of the speaker's, so that it is taken off the line. */
function portraitResolves(command: PortraitCommand, context: ChatLintContext): boolean {
  if (command.type === 'hide') return true;
  if (!context.speaker) return false;
  const portraits = context.portraits();
  if (command.type === 'index') return (portraits[command.position - 1]?.identifier ?? '').length > 0;
  if (command.type === 'name') return findImageIdentifierByName([...portraits], command.name).identifier.length > 0;
  return false;
}
