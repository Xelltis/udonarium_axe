import { buffGroupOf, isBuffGroupMember } from '@axe/domain/character/buff-group';
import { buffKindOf, parseBuffKindWord } from '@axe/domain/character/buff-kind';
import { buffExpires, resolveBuffTiming } from '@axe/domain/character/buff-timing';
import { GameCharacter } from '@axe/domain/character/game-character';
import type { StatusAilment } from '@axe/domain/character/status-ailment';
import { DataElement } from '@axe/domain/data/data-element';

/**
 * Which buffs a removal takes away: those held until cleared, those with exactly so many rounds
 * left, those of one name, or, whatever their rounds and names, every one of them, the buffs alone
 * or the debuffs alone.
 */
export type BuffRemovalRule =
  | { readonly kind: 'held' }
  | { readonly kind: 'rounds'; readonly rounds: number }
  | { readonly kind: 'name'; readonly name: string }
  | { readonly kind: 'all' }
  | { readonly kind: 'buffs' }
  | { readonly kind: 'debuffs' };

/** A removal that picks buffs by a condition on each: how it is held, its rounds or its name. */
export type BuffConditionRule = Extract<BuffRemovalRule, { kind: 'held' | 'rounds' | 'name' }>;

/** A removal that clears a piece: all it wears, or all of one kind. */
export type BuffClearanceRule = Exclude<BuffRemovalRule, BuffConditionRule>;

/** How many characters a sweep reached and how many buffs it took away. */
export interface BuffRemovalCount {
  readonly characters: number;
  readonly buffs: number;
}

/** What clearing one piece took: how many buffs in all, and how many of its parts lost any. */
export interface BuffClearanceCount {
  readonly parts: number;
  readonly buffs: number;
}

/** Whether the rule clears a piece rather than picking buffs by a condition. */
export function isBuffClearance(rule: BuffRemovalRule): rule is BuffClearanceRule {
  return rule.kind === 'all' || rule.kind === 'buffs' || rule.kind === 'debuffs';
}

/**
 * Whether a buff is one the rule takes away. A buff held until cleared has no rounds left to match.
 * The further rows of a buff that moves several statuses go with it by its name, and are of its kind.
 */
function matchesBuffRemoval(data: DataElement, rule: BuffRemovalRule, ailments: readonly StatusAilment[]): boolean {
  switch (rule.kind) {
    case 'held':
      return !buffExpires(data);
    case 'rounds':
      return buffExpires(data) && parseInt(String(data.value), 10) === rule.rounds;
    case 'name':
      return data.name === rule.name || (isBuffGroupMember(data) && buffGroupOf(data) === rule.name);
    case 'all':
      return true;
    case 'buffs':
      return buffKindOf(data, ailments) === 'buff';
    case 'debuffs':
      return buffKindOf(data, ailments) === 'debuff';
  }
}

/**
 * The rows of the buff a piece was given for riding two up, while it still rides so: the row the
 * piece remembers by its identifier and the further rows of that buff. None once the piece has got
 * off, which forgets the mount it was given the buff on.
 */
function rowsKeptForRiding(character: GameCharacter, rows: readonly DataElement[]): DataElement[] {
  if (character.rideTwoUpFrom === '' || character.rideTwoUpBuff === '') return [];
  const given = rows.find((data) => data.identifier === character.rideTwoUpBuff);
  if (!given) return [];
  return rows.filter((data) => data === given || (isBuffGroupMember(data) && buffGroupOf(data) === given.name));
}

/**
 * The rows the rule takes off a piece, read before any of them goes, since a further row of a buff
 * is told what kind it is by its first. Whatever the rule picks by, the buff the piece rides two up
 * by is left on it.
 */
function rowsTaken(character: GameCharacter, rule: BuffRemovalRule, ailments: readonly StatusAilment[]): DataElement[] {
  const rows = character.buffs.list();
  const kept = rowsKeptForRiding(character, rows);
  return rows.filter((data) => !kept.includes(data) && matchesBuffRemoval(data, rule, ailments));
}

/**
 * How many buffs the rows are, a buff that moves several statuses counted once by its first row. In
 * clearing a piece, further rows left without their first row count as the one buff they were.
 */
function buffsAmong(taken: readonly DataElement[], rule: BuffRemovalRule): number {
  const heads = taken.filter((data) => !isBuffGroupMember(data));
  if (!isBuffClearance(rule)) return heads.length;
  const named = new Set(heads.map((data) => data.name));
  const orphaned = new Set(taken.filter((data) => isBuffGroupMember(data)).map((data) => buffGroupOf(data)));
  return heads.length + [...orphaned].filter((group) => !named.has(group)).length;
}

/**
 * Counts what the rule would take off these characters, taking nothing. `ailments` are the states
 * the room keeps, which tell a debuff from a buff where a rule asks.
 */
export function countBuffRemoval(
  characters: readonly GameCharacter[],
  rule: BuffRemovalRule,
  ailments: readonly StatusAilment[] = []
): BuffRemovalCount {
  let reached = 0;
  let buffs = 0;
  for (const character of characters) {
    const taken = rowsTaken(character, rule, ailments);
    if (taken.length < 1) continue;
    const matching = buffsAmong(taken, rule);
    if (matching < 1) continue;
    reached += 1;
    buffs += matching;
  }
  return { characters: reached, buffs };
}

/**
 * Takes what the rule picks off every character given, putting back whatever each buff moved on
 * its sheet, and counts what went. Each character is taken on its own, a part as much as its body.
 * The buff a piece was given for riding two up stays on it while it rides so, and is not counted.
 * `ailments` are the states the room keeps, which tell a debuff from a buff where a rule asks.
 */
export function removeBuffsAcross(
  characters: readonly GameCharacter[],
  rule: BuffRemovalRule,
  ailments: readonly StatusAilment[] = []
): BuffRemovalCount {
  let reached = 0;
  let buffs = 0;
  for (const character of characters) {
    const taken = rowsTaken(character, rule, ailments);
    const counted = buffsAmong(taken, rule);
    const removed = character.buffs.removeWhere((data) => taken.includes(data));
    if (removed.length < 1) continue;
    reached += 1;
    buffs += counted;
  }
  return { characters: reached, buffs };
}

/**
 * Takes what the rule picks off one piece and off the parts that go with it, and counts what went:
 * a creature of many parts is cleared whole from its body. A part is cleared on its own.
 */
export function removeBuffsWithParts(
  piece: GameCharacter,
  rule: BuffRemovalRule,
  ailments: readonly StatusAilment[] = []
): BuffClearanceCount {
  const own = removeBuffsAcross([piece], rule, ailments);
  const along = removeBuffsAcross(piece.partsAlong(), rule, ailments);
  return { parts: along.characters, buffs: own.buffs + along.buffs };
}

/**
 * Whether a piece is a part that goes with one of the others given, its body: clearing the body
 * clears it too, so aimed at both it is left to its body and counted once.
 */
export function isClearedWithBody(piece: GameCharacter, others: readonly GameCharacter[]): boolean {
  if (!piece.isWrittenAsPart) return false;
  return others.some(
    (other) => other !== piece && other.identifier === piece.ridingOn && other.partsAlong().includes(piece)
  );
}

/** Reads what stands after the marks of a removal as clearing a piece: `*`, `*バフ` or `*デバフ`. */
function readClearance(target: string): BuffClearanceRule | null {
  const starred = target.match(/^[*＊](.*)$/);
  if (!starred) return null;
  const word = starred[1].trim();
  if (word.length < 1) return { kind: 'all' };
  const kind = parseBuffKindWord(word);
  if (kind === 'buff') return { kind: 'buffs' };
  return kind === 'debuff' ? { kind: 'debuffs' } : null;
}

/**
 * Reads a buff command that clears the speaker's piece, or with a `t` the pieces aimed at, or null
 * for anything else.
 *
 * `&*-` takes every buff, `&*バフ-` (`&*buff-`) those that are buffs and `&*デバフ-` (`&*debuff-`)
 * those that are debuffs. Any other word after the star leaves the command what it always was, one
 * that takes off the buff of that name.
 */
export function parseBuffClearanceCommand(command: string): BuffClearanceRule | null {
  const match = (command ?? '').trim().match(/^[tTｔＴ]?[&＆]([*＊].*)[-－]$/);
  return match ? readClearance(match[1].trim()) : null;
}

const RESET_WORDS: readonly string[] = ['リセット', 'reset'];

function isResetWord(word: string): boolean {
  return RESET_WORDS.includes(word.trim().normalize('NFKC').toLowerCase());
}

/**
 * Whether a buff command is the one word that resets the speaker's piece, or with a `t` the pieces
 * aimed at: `&リセット-` (`&reset-`), which clears the piece and its parts of every buff and then puts
 * their values back to their defaults. A buff of that name is no longer taken off by it.
 */
export function isPieceResetCommand(command: string): boolean {
  const match = (command ?? '').trim().match(/^[tTｔＴ]?[&＆]([^&＆].*)[-－]$/);
  return match != null && isResetWord(match[1]);
}

/**
 * Whether a sweep is the one word that resets the table, `&&リセット-` (`&&reset-`): every buff off
 * every piece on it, and then their values back to their defaults. A leading `s` is allowed as for
 * any sweep.
 */
export function isTableResetCommand(command: string): boolean {
  const match = (command ?? '').trim().match(/^[sSｓＳ]?[&＆]{2}(.+)[-－]$/);
  return match != null && isResetWord(match[1]);
}

/**
 * Reads a sweep across the table written in chat, or null for anything else.
 *
 * `&&*-` takes every buff, `&&*バフ-` (`&&*buff-`) the buffs and `&&*デバフ-` (`&&*debuff-`) the
 * debuffs, read before anything else. `&&none-` takes the buffs held until cleared (any word a
 * buff's timing reads as never, such as `消えない`), `&&2R-` those with exactly two rounds left, and
 * `&&毒-` every buff named 毒. A leading `s` for a secret report is allowed, and the ampersands, the
 * R and the closing dash may be written full width.
 */
export function parseBuffRemovalCommand(command: string): BuffRemovalRule | null {
  const match = (command ?? '').trim().match(/^[sSｓＳ]?[&＆]{2}(.+)[-－]$/);
  if (!match) return null;
  const target = match[1].trim();
  if (target.length < 1) return null;
  const clearance = readClearance(target);
  if (clearance) return clearance;
  if (resolveBuffTiming(target) === 'none') return { kind: 'held' };
  const rounds = target.normalize('NFKC').match(/^(\d+)\s*(?:R|ラウンド)$/i);
  if (rounds) return { kind: 'rounds', rounds: parseInt(rounds[1], 10) };
  return { kind: 'name', name: target };
}

/** What the rule takes away, as the chat report and the confirmation name it. */
export function describeBuffRemoval(rule: BuffRemovalRule): string {
  switch (rule.kind) {
    case 'held':
      return '消えないバフ';
    case 'rounds':
      return `残り${rule.rounds}Rのバフ`;
    case 'name':
      return `「${rule.name}」`;
    case 'all':
      return 'すべてのバフ';
    case 'buffs':
      return 'バフ';
    case 'debuffs':
      return 'デバフ';
  }
}

/** What the rule found none of, as the chat report says when it took nothing. */
export function describeBuffsLacking(rule: BuffRemovalRule): string {
  if (!isBuffClearance(rule)) return describeBuffRemoval(rule);
  return rule.kind === 'debuffs' ? 'デバフ' : 'バフ';
}
