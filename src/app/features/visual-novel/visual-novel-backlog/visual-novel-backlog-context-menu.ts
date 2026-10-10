import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';

export interface BacklogEntryMenuCallbacks {
  edit: () => void;
}

/**
 * What can be done with one line of the novel log.
 *
 * The pencil on a line only shows under a mouse, so a touch screen reaches it through this. A
 * line the reader may not change offers nothing.
 */
export function buildBacklogEntryContextMenu(
  canEdit: boolean,
  callbacks: BacklogEntryMenuCallbacks,
  t: TranslateFn
): ContextMenuAction[] {
  if (!canEdit) return [];
  return [{ name: t('feature.visualNovel.edit.title'), action: () => callbacks.edit() }];
}
