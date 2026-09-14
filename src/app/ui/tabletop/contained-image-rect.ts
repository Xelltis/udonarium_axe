export interface ContainedImageRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where a picture drawn to fit inside a frame lands, as `object-fit: contain` would place it:
 * scaled to the frame less `padding` on every side, keeping its proportions, and centred.
 *
 * Null when the picture has no size yet or the padding leaves no room.
 */
export function containedImageRect(
  frameWidth: number,
  frameHeight: number,
  naturalWidth: number,
  naturalHeight: number,
  padding = 0
): ContainedImageRect | null {
  const availableWidth = Math.max(0, frameWidth - padding * 2);
  const availableHeight = Math.max(0, frameHeight - padding * 2);
  if (!naturalWidth || !naturalHeight || !availableWidth || !availableHeight) return null;

  const scale = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return {
    left: padding + (availableWidth - width) / 2,
    top: padding + (availableHeight - height) / 2,
    width,
    height,
  };
}
