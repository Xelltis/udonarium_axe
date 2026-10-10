import { DataElement } from '@axe/domain/data/data-element';

export const INTERNAL_RESOURCE_NAMES: ReadonlySet<string> = new Set(['ICON', 'POS']);

/**
 * Whether a resource is one this tool keeps for its own use, the `ICON` picture index or the `POS`
 * portrait position, rather than one players track. Such resources are left out of resource lists.
 */
export function isInternalResource(element: DataElement): boolean {
  return INTERNAL_RESOURCE_NAMES.has(element.name);
}
