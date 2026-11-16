import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';

/** What the menu of a narrow character sheet can do; an action left out is not offered. */
export interface CharacterSheetMenuCallbacks {
  copy?: () => void;
  save?: () => void;
  portraits?: () => void;
  captureDefaults?: () => void;
  clearDefaults?: () => void;
  collapseAll?: () => void;
  expandAll?: () => void;
}

/**
 * The menu under the "⋯" at the top of a narrow character sheet, which holds what the toolbar and
 * the portrait column hold on a wide one: making a copy, saving, and the portraits; then making the
 * values the sheet holds its defaults and taking the defaults away; then folding every section or
 * opening them all.
 */
export function buildCharacterSheetMenu(callbacks: CharacterSheetMenuCallbacks, t: TranslateFn): ContextMenuAction[] {
  const offer = (key: string, action: (() => void) | undefined): ContextMenuAction[] =>
    action ? [{ name: t(key), action: () => action() }] : [];
  const object = [
    ...offer('feature.inventory.sheet.portraitsManage', callbacks.portraits),
    ...offer('feature.inventory.sheet.copy', callbacks.copy),
    ...offer('feature.inventory.sheet.save', callbacks.save),
  ];
  const defaults = [
    ...offer('feature.dataElement.field.captureDefaults', callbacks.captureDefaults),
    ...offer('feature.dataElement.field.clearDefaults', callbacks.clearDefaults),
  ];
  const folding = [
    ...offer('feature.inventory.sheet.collapseAll', callbacks.collapseAll),
    ...offer('feature.inventory.sheet.expandAll', callbacks.expandAll),
  ];
  const groups = [object, defaults, folding].filter((group) => group.length > 0);
  return groups.flatMap((group, index) => (index > 0 ? [ContextMenuSeparator, ...group] : group));
}
