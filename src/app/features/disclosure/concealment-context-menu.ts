import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';

/** Something the master has put out of sight, as the table's menu offers to bring it back. */
export interface ConcealedEntry {
  /** What it is called, with the kind of thing it is. */
  label: string;
  reveal: () => void;
}

/**
 * What something is listed as in the master's lists: its name, or a word for a thing with none,
 * and beside it what kind of thing it is or where it is kept.
 */
export function listedThingLabel(name: string, note: string, t: TranslateFn): string {
  return t('feature.boardSwitch.listed', { name: name.trim() || t('feature.boardSwitch.unnamedThing'), note });
}

/**
 * The master's entry for putting something on the table out of sight, until a switch or the table's
 * menu brings it back. Nobody else is offered it.
 */
export function buildConcealMenu(canEdit: boolean, conceal: () => void, t: TranslateFn): ContextMenuAction[] {
  return canEdit ? [{ name: t('feature.boardSwitch.menu.conceal'), action: conceal }] : [];
}

/**
 * The master's list of what is out of sight, each brought back by choosing it. Left out for anybody
 * else, and while nothing is out of sight.
 */
export function buildRevealMenu(
  canEdit: boolean,
  concealed: readonly ConcealedEntry[],
  t: TranslateFn
): ContextMenuAction[] {
  if (!canEdit || concealed.length < 1) return [];
  return [
    {
      name: t('feature.boardSwitch.menu.concealed'),
      action: undefined,
      subActions: concealed.map((entry) => ({ name: entry.label, action: entry.reveal })),
    },
  ];
}
