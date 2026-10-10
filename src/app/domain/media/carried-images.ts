/**
 * An object that holds pictures somewhere the XML cannot be read for them.
 *
 * Saving walks the XML looking for image identifiers, which finds every picture named by an
 * attribute of its own. A drawing kept as one packed string is opaque to that walk: the
 * pictures stuck onto it are named inside the string, so the object has to say so itself or
 * they are left behind and the drawing comes back with holes in it.
 */
export interface CarriesImages {
  readonly carriedImageIdentifiers: readonly string[];
}

/**
 * The image identifiers an object says it carries, for saving alongside the XML.
 *
 * Empty for anything that does not carry images; entries that are not non-empty strings are dropped.
 */
export function carriedImagesOf(value: unknown): readonly string[] {
  const carried = (value as CarriesImages | null)?.carriedImageIdentifiers;
  return Array.isArray(carried)
    ? carried.filter((one): one is string => typeof one === 'string' && one.length > 0)
    : [];
}
