import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';

/** What the menu of a narrow character sheet can do; an action left out is not offered. */
export interface CharacterSheetMenuCallbacks {
  copy?: () => void;
  save?: () => void;
  portraits?: () => void;
  collapseAll?: () => void;
  expandAll?: () => void;
}

/**
 * The menu under the "⋯" at the top of a narrow character sheet, which holds what the toolbar and
 * the portrait column hold on a wide one: making a copy, saving, and the portraits; then folding
 * every section or opening them all.
 */
export function buildCharacterSheetMenu(callbacks: CharacterSheetMenuCallbacks, t: TranslateFn): ContextMenuAction[] {
  const offer = (key: string, action: (() => void) | undefined): ContextMenuAction[] =>
    action ? [{ name: t(key), action: () => action() }] : [];
  const object = [
    ...offer('feature.inventory.sheet.portraitsManage', callbacks.portraits),
    ...offer('feature.inventory.sheet.copy', callbacks.copy),
    ...offer('feature.inventory.sheet.save', callbacks.save),
  ];
  const folding = [
    ...offer('feature.inventory.sheet.collapseAll', callbacks.collapseAll),
    ...offer('feature.inventory.sheet.expandAll', callbacks.expandAll),
  ];
  return object.length > 0 && folding.length > 0
    ? [...object, ContextMenuSeparator, ...folding]
    : [...object, ...folding];
}
