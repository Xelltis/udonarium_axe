import type { TranslateFn } from '@axe/application/i18n/translate.token';
import { type ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';

export interface ReplayEntryMenuState {
  /** How many rows are chosen. */
  count: number;
  /** Whether the one row chosen has words that can be rewritten. */
  canRewrite: boolean;
  /** Whether a scene can be recorded from here now: the table is free for it. */
  canStage: boolean;
}

export interface ReplayEntryMenuCallbacks {
  rewrite: () => void;
  moveUp: () => void;
  moveDown: () => void;
  remove: () => void;
  writeAfter: () => void;
  stageAfter: () => void;
}

/**
 * The menu for the chosen rows of the replay list while it is being edited.
 *
 * Rewriting is offered for one row with words; moving and removing act on every row chosen, and
 * the removal says how many. Writing and recording put what is made after the last row chosen.
 */
export function buildReplayEntryContextMenu(
  state: ReplayEntryMenuState,
  callbacks: ReplayEntryMenuCallbacks,
  t: TranslateFn
): ContextMenuAction[] {
  if (state.count < 1) return [];
  const actions: ContextMenuAction[] = [];
  if (state.count === 1 && state.canRewrite) {
    actions.push({ name: t('feature.replay.editor.rewrite'), action: callbacks.rewrite });
  }
  actions.push(
    { name: t('feature.replay.editor.up'), action: callbacks.moveUp },
    { name: t('feature.replay.editor.down'), action: callbacks.moveDown },
    ContextMenuSeparator,
    { name: t('feature.replay.editor.writeAfter'), action: callbacks.writeAfter },
    { name: t('feature.replay.editor.stageAfter'), action: callbacks.stageAfter, enabled: state.canStage },
    ContextMenuSeparator,
    { name: t('feature.replay.editor.removeCount', { count: state.count }), action: callbacks.remove }
  );
  return actions;
}
