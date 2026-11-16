import { ImageTag } from '@axe/domain/media/image-tag';
import { ImageTagLock } from '@axe/domain/media/image-tag-lock';

/**
 * Files a picture under exactly this tag, on the tag it already has or on a new one where it has
 * none, and gives that tag back. A picture taken in twice is the same picture, so it keeps its one
 * tag. For a person filing the picture themselves, and for what the tool reserves: whatever the
 * picture was filed under before is replaced.
 */
export function tagImage(imageIdentifier: string, tag: string): ImageTag {
  const held = ImageTag.get(imageIdentifier) ?? ImageTag.create(imageIdentifier);
  if (held.tag !== tag) held.tag = tag;
  return held;
}

/**
 * Files a picture under a tag as {@link tagImage} does, unless the tag it has is kept to someone,
 * and answers that tag where it is, null where the picture was filed. For a tool that files what a
 * person hands it under the tag its own list reads: a picture kept under a private tag would be
 * shown to the room by being filed anywhere else, so it stays where it was put.
 */
export function tagImageUnlessKept(imageIdentifier: string, tag: string): string | null {
  const held = ImageTag.get(imageIdentifier)?.tag ?? '';
  if (held !== tag && ImageTagLock.get(held)?.isLocked) return held;
  tagImage(imageIdentifier, tag);
  return null;
}

/**
 * Files a picture under a tag only where nobody has filed it yet, and gives its tag back. For what
 * brings pictures in on its own, an importer or the tool setting out its samples: a tag is one name,
 * matched whole by the lists and by the locks people keep tags under, so a picture a person has
 * filed stays where they put it.
 */
export function fileUntaggedImage(imageIdentifier: string, tag: string): ImageTag {
  const held = ImageTag.get(imageIdentifier) ?? ImageTag.create(imageIdentifier);
  if (held.tag === '' && tag !== '') held.tag = tag;
  return held;
}
