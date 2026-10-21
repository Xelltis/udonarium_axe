import { DataElement, DataElementAttribute } from '@axe/domain/data/data-element';

/**
 * Whether a resource's current value may rise past its maximum, as one kept to track a bonus whose
 * maximum is the value it goes back to.
 *
 * Only `true` counts, so a field an older version saved, which knows nothing of the setting, is held
 * at its maximum as before.
 */
export function allowsOverResource(element: DataElement): boolean {
  return element.isNumberResource && element.getAttribute(DataElementAttribute.OVER_RESOURCE) === 'true';
}
