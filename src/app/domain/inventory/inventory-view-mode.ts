/** How much of each piece the inventory draws. */
export type InventoryViewMode = 'rich' | 'table' | 'round';

export const INVENTORY_VIEW_MODES: readonly InventoryViewMode[] = ['rich', 'table', 'round'];

export const INVENTORY_VIEW_LABEL_KEYS: Record<InventoryViewMode, string> = {
  rich: 'feature.inventory.panel.viewRich',
  table: 'feature.inventory.panel.viewTable',
  round: 'feature.inventory.panel.viewRound',
};

/** The next way round, for the one button that walks through them. */
export function nextInventoryViewMode(mode: InventoryViewMode): InventoryViewMode {
  const at = INVENTORY_VIEW_MODES.indexOf(mode);
  return INVENTORY_VIEW_MODES[(at + 1) % INVENTORY_VIEW_MODES.length];
}

/** Whether a stored value names one of the ways the inventory can draw its pieces. */
export function isInventoryViewMode(value: unknown): value is InventoryViewMode {
  return typeof value === 'string' && INVENTORY_VIEW_MODES.includes(value as InventoryViewMode);
}
