/** An inventory tab, which takes pieces let go over it into the place it shows. */
export const INVENTORY_TAB_DROPZONE_SELECTOR = '[data-inventory-tab]';
export const INVENTORY_TAB_ATTRIBUTE = 'data-inventory-tab';

/** The tab an element sits in, null when it is in none. */
export function inventoryTabFromElement(element: Element | null): string | null {
  return element?.closest(INVENTORY_TAB_DROPZONE_SELECTOR)?.getAttribute(INVENTORY_TAB_ATTRIBUTE) ?? null;
}
