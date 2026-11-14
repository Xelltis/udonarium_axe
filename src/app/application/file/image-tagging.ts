import { ImageTag } from '@axe/domain/media/image-tag';

/**
 * Files a picture under a tag, on the tag it already has or on a new one where it has none, and
 * gives that tag back. A picture taken in twice is the same picture, so it keeps its one tag.
 */
export function tagImage(imageIdentifier: string, tag: string): ImageTag {
  const held = ImageTag.get(imageIdentifier) ?? ImageTag.create(imageIdentifier);
  held.tag = tag;
  return held;
}
