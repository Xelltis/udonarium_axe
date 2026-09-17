import { buffExpires, resolveBuffTiming } from '@axe/domain/character/buff-timing';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';

/**
 * Which buffs a sweep across the table takes away: those held until cleared, those with exactly so
 * many rounds left, or those of one name.
 */
export type BuffRemovalRule =
  | { readonly kind: 'held' }
  | { readonly kind: 'rounds'; readonly rounds: number }
  | { readonly kind: 'name'; readonly name: string };

/** How many characters a sweep reached and how many buffs it took away. */
export interface BuffRemovalCount {
  readonly characters: number;
  readonly buffs: number;
}

/** Whether a buff is one the rule takes away. A buff held until cleared has no rounds left to match. */
export function matchesBuffRemoval(data: DataElement, rule: BuffRemovalRule): boolean {
  switch (rule.kind) {
    case 'held':
      return !buffExpires(data);
    case 'rounds':
      return buffExpires(data) && parseInt(String(data.value), 10) === rule.rounds;
    case 'name':
      return data.name === rule.name;
  }
}

/** Counts what the rule would take off these characters, taking nothing. */
export function countBuffRemoval(characters: readonly GameCharacter[], rule: BuffRemovalRule): BuffRemovalCount {
  let reached = 0;
  let buffs = 0;
  for (const character of characters) {
    const container = character.buffDataElement?.children[0] as DataElement | undefined;
    const matching = (container?.children ?? []).filter((data) => matchesBuffRemoval(data as DataElement, rule)).length;
    if (matching < 1) continue;
    reached += 1;
    buffs += matching;
  }
  return { characters: reached, buffs };
}

/**
 * Takes what the rule picks off every character given, putting back whatever each buff moved on
 * its sheet, and counts what went.
 */
export function removeBuffsAcross(characters: readonly GameCharacter[], rule: BuffRemovalRule): BuffRemovalCount {
  let reached = 0;
  let buffs = 0;
  for (const character of characters) {
    const removed = character.buffs.removeWhere((data) => matchesBuffRemoval(data, rule));
    if (removed.length < 1) continue;
    reached += 1;
    buffs += removed.length;
  }
  return { characters: reached, buffs };
}

/**
 * Reads a sweep across the table written in chat, or null for anything else.
 *
 * `&&none-` takes the buffs held until cleared (any word a buff's timing reads as never, such as
 * `消えない`), `&&2R-` those with exactly two rounds left, and `&&毒-` every buff named 毒. A leading
 * `s` for a secret report is allowed, and the ampersands, the R and the closing dash may be written
 * full width.
 */
export function parseBuffRemovalCommand(command: string): BuffRemovalRule | null {
  const match = (command ?? '').trim().match(/^[sSｓＳ]?[&＆]{2}(.+)[-－]$/);
  if (!match) return null;
  const target = match[1].trim();
  if (target.length < 1) return null;
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
  }
}
