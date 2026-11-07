const TABLE_LAYER_SELECTOR = '#app-table-layer';

/** Whether a drop landed on the table layer, the only place something dropped is put on the table. */
export function isTabletopDropTarget(element: Element | null): boolean {
  return element?.closest(TABLE_LAYER_SELECTOR) != null;
}
