import type { TranslateFn } from '@axe/application/i18n/translate.token';
import type { ContextMenuAction } from '@axe/application/ui/context-menu.service';
import type { ResetCount, ResetRequest } from '@axe/domain/character/piece-reset';

/**
 * What a piece's menu offers to reset: every buff off, the buffs alone, the debuffs alone, the values
 * back to their defaults, or every buff off and the values back.
 */
export type PieceResetChoice = 'allBuffs' | 'buffs' | 'debuffs' | 'values' | 'everything';

/** The resets a piece's menu offers, in the order it lists them. */
export const PIECE_RESET_CHOICES: readonly PieceResetChoice[] = [
  'allBuffs',
  'buffs',
  'debuffs',
  'values',
  'everything',
];

const REQUEST_OF: Readonly<Record<PieceResetChoice, ResetRequest>> = {
  allBuffs: { rule: { kind: 'all' }, values: false },
  buffs: { rule: { kind: 'buffs' }, values: false },
  debuffs: { rule: { kind: 'debuffs' }, values: false },
  values: { rule: null, values: true },
  everything: { rule: { kind: 'all' }, values: true },
};

/** What a choice of the menu asks a reset to do. */
export function resetRequestOf(choice: PieceResetChoice): ResetRequest {
  return REQUEST_OF[choice];
}

/** Whether a reset reaching this much would do anything: take a buff off, or put a value back. */
export function doesAnything(count: ResetCount): boolean {
  return count.buffs > 0 || count.items > 0;
}

/**
 * The resets worth offering for a piece: those that would do something to it or its parts, given
 * what each would reach. A piece wearing nothing and standing at its defaults is offered none.
 */
export function offeredPieceResets(reachOf: (request: ResetRequest) => ResetCount): PieceResetChoice[] {
  return PIECE_RESET_CHOICES.filter((choice) => doesAnything(reachOf(resetRequestOf(choice))));
}

/**
 * The entries a piece's menu gathers with its buffs for resetting it, one for each choice offered.
 * None where nothing is offered or the seat is given no way to reset, as a seat that only watches is.
 */
export function buildPieceResetMenu(
  offers: readonly PieceResetChoice[],
  onReset: ((choice: PieceResetChoice) => void) | undefined,
  t: TranslateFn
): ContextMenuAction[] {
  if (!onReset) return [];
  return PIECE_RESET_CHOICES.filter((choice) => offers.includes(choice)).map((choice) => ({
    name: t(`feature.character.contextMenu.reset_${choice}`),
    action: () => onReset(choice),
  }));
}
