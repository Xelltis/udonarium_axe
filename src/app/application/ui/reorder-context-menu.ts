import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';

export interface ReorderMenuCallbacks {
  moveToTop?: () => void;
  moveUp?: () => void;
  moveDown?: () => void;
  moveToBottom?: () => void;
}

/**
 * Moving one row of a list up or down, for a list that is otherwise put in order by dragging.
 *
 * Dragging a row is the browser's own drag and drop, which a touch screen may not start at all.
 * A move the row cannot make from where it stands is left out, and so is one the list gives no
 * callback for; the ends are only offered when they are further than one row away.
 */
export function buildReorderContextMenu(
  position: { index: number; count: number },
  callbacks: ReorderMenuCallbacks,
  t: TranslateFn
): ContextMenuAction[] {
  const { index, count } = position;
  const actions: ContextMenuAction[] = [];
  const offer = (name: string, action: (() => void) | undefined) => {
    if (action) actions.push({ name: t(name), action: () => action() });
  };
  if (index > 1) offer('common.reorder.toTop', callbacks.moveToTop);
  if (index > 0) offer('common.reorder.up', callbacks.moveUp);
  if (index < count - 1) offer('common.reorder.down', callbacks.moveDown);
  if (index < count - 2) offer('common.reorder.toBottom', callbacks.moveToBottom);
  return actions;
}
