import { DataElement, DataElementAttribute } from '@axe/domain/data/data-element';

/** The span a resource's slider runs over, from its lowest to its highest. */
export interface ResourceSliderRange {
  min: number;
  max: number;
}

/**
 * Whether a resource is set to be moved with a slider, in its sheet and in the popup over its
 * piece, as well as typed.
 *
 * Only `true` counts, so a field an older version saved, which knows nothing of the setting, has
 * no slider.
 */
export function showsResourceSlider(element: DataElement): boolean {
  return element.isNumberResource && element.getAttribute(DataElementAttribute.RESOURCE_SLIDER) === 'true';
}

/**
 * The span a slider over what is left of a resource runs: from the lowest it may fall to, 0 where
 * none is set, up to its maximum.
 *
 * There is nothing to slide over while the maximum is not a number above that lowest point, and
 * then there is no slider.
 */
export function resourceSliderRange(lowest: string, highest: string): ResourceSliderRange | null {
  if (highest.trim() === '') return null;
  const max = Number(highest);
  const min = lowest.trim() === '' ? 0 : Number(lowest);
  if (!Number.isFinite(max) || !Number.isFinite(min) || max <= min) return null;
  return { min, max };
}
