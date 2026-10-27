export const MAP_STAMP_TAG = 'マップスタンプ';

const IMAGE_STAMP_PREFIX = 'media:';

/**
 * Whether a stamp id on the map points at an uploaded image rather than one of the built-in stamps.
 */
export function isImageStampId(stampId: string): boolean {
  return stampId.startsWith(IMAGE_STAMP_PREFIX);
}

/** The stamp id that places the image with this identifier on the map as a stamp. */
export function toImageStampId(identifier: string): string {
  return IMAGE_STAMP_PREFIX + identifier;
}

/** The image identifier inside an image stamp id, or an empty string for a built-in stamp. */
export function imageStampIdentifier(stampId: string): string {
  return isImageStampId(stampId) ? stampId.slice(IMAGE_STAMP_PREFIX.length) : '';
}
