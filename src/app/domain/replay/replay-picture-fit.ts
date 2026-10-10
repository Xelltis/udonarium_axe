/** The size of a picture or of the box it is fitted into. */
export interface ReplayFrameSize {
  width: number;
  height: number;
}

/**
 * Where to draw a picture so it covers the target entirely, scaled evenly and centred, with the
 * overflow off the edges.
 *
 * A picture with no size simply fills the target.
 */
export function coverRect(
  source: ReplayFrameSize,
  target: ReplayFrameSize
): { x: number; y: number; width: number; height: number } {
  if (source.width < 1 || source.height < 1) return { x: 0, y: 0, width: target.width, height: target.height };
  const scale = Math.max(target.width / source.width, target.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return { x: (target.width - width) / 2, y: (target.height - height) / 2, width, height };
}

/**
 * A picture fitted inside a box.
 *
 * `grow` says whether one smaller than the box is blown up to fill it: that is what
 * `object-fit: contain` does, while a portrait laid beside the dialogue is only ever
 * brought down to size.
 */
export function containRect(
  source: ReplayFrameSize,
  maxWidth: number,
  maxHeight: number,
  grow = false
): { width: number; height: number } {
  if (source.width < 1 || source.height < 1) return { width: 0, height: 0 };
  const fitted = Math.min(maxWidth / source.width, maxHeight / source.height);
  const scale = grow ? fitted : Math.min(fitted, 1);
  return { width: source.width * scale, height: source.height * scale };
}
