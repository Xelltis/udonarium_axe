import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { ObjectStore } from '@axe/core/sync/object-store';

/**
 * The tag on a picture the tool brought with it rather than a person, such as the pictures
 * the sample cut-ins are built from. Tagged this way it stays out of the media library,
 * where it would only be in the way of what a person put there.
 *
 * It is a stored value, shared between everyone in a room, so it is this word and not the
 * word for it in whatever language the screen happens to be in.
 */
export const SYSTEM_RESERVED_TAG = 'システム予約';

@SyncObject('image-tag')
export class ImageTag extends ObjectNode {
  @SyncVar() imageIdentifier: string = '';
  @SyncVar() tag: string = '';
  /** Kept from everyone but the game master, who chose to keep it. */
  @SyncVar() isSecret: boolean = false;

  /** Whether every one of the words appears somewhere in the tag. No words at all matches every tag. */
  containsWords(words: string[]): boolean {
    return words.every((word) => this.tag.includes(word));
  }

  /**
   * The pictures whose tags hold every one of the words, among those the seat `sight` may come
   * across, as {@link canBrowseImage} has it.
   */
  static searchImages(searchWords: string[], sight: ImageSight): ImageFile[] {
    return ObjectStore.instance
      .getObjects<ImageTag>(ImageTag)
      .filter((tag) => tag.containsWords(searchWords) && canBrowseImage(tag, sight))
      .map((tag) => ImageStorage.instance.get(tag.imageIdentifier))
      .filter((image): image is ImageFile => image !== null);
  }

  /** The tag of a picture, or null when the picture has never been tagged. */
  static get(imageIdentifier: string): ImageTag | null {
    return ObjectStore.instance.get<ImageTag>(`imagetag_${imageIdentifier}`);
  }

  /** Whether the game master is keeping the picture back. An untagged picture is not. */
  static isSecret(imageIdentifier: string): boolean {
    return ImageTag.get(imageIdentifier)?.isSecret === true;
  }

  /** Makes an empty tag for a picture and adds it to the room, under the identifier `get` looks for. */
  static create(imageIdentifier: string) {
    const object: ImageTag = new ImageTag(`imagetag_${imageIdentifier}`);

    object.imageIdentifier = imageIdentifier;

    object.initialize();
    return object;
  }

  /**
   * Copies a tag read from a file onto the picture's own tag, then destroys the copy that was read.
   *
   * The tag is made first when the picture has none, and the change is shared with the room.
   */
  override parseInnerXml(_element: Element) {
    let imageTag = ImageTag.get(this.imageIdentifier);
    if (!imageTag) imageTag = ImageTag.create(this.imageIdentifier);
    const context = imageTag.toContext();
    context.syncData = this.toContext().syncData;
    imageTag.apply(context);
    imageTag.update();
    this.destroy();
  }
} //

/**
 * Whether a picture belongs in a list of pictures to pick from.
 *
 * Three kinds are held back. What the tool brought with it is not the room's to reuse or to
 * throw away. What the game master has kept is not the players' to come across: it stays
 * out of their lists, and out of the master's own while the master has folded them away.
 * And what is filed under a tag someone keeps to themselves stays out of the lists of whoever
 * `hidesTag` says it is kept from.
 *
 * Nothing here hides a picture already standing on the table. A picture kept back is kept
 * back from the choosing, not from the board — put a face on a piece and everyone sees the
 * piece, whatever this says.
 */
export function canBrowseImage(tag: ImageTag | null, sight: ImageSight, showSecret = true): boolean {
  if (!tag) return true;
  if (tag.tag === SYSTEM_RESERVED_TAG) return false;
  if (sight.hidesTag(tag.tag)) return false;
  if (tag.isSecret) return sight.canSeeSecret && showSecret;
  return true;
}

/**
 * The tags a list of pictures offers to filter by, each once in the order first met: the tag of each
 * picture the seat `sight` may browse, as {@link canBrowseImage} has it, with `showSecret` as it says
 * there. A tag carried only by pictures kept from the seat is not offered, since its name says there
 * is something there to find.
 */
export function browsableImageTags(
  images: readonly { readonly identifier: string }[],
  sight: ImageSight,
  showSecret = true
): string[] {
  const tags = new Set<string>();
  for (const image of images) {
    const imageTag = ImageTag.get(image.identifier);
    if (imageTag?.tag && canBrowseImage(imageTag, sight, showSecret)) tags.add(imageTag.tag);
  }
  return [...tags];
}

/** Whether a tag's pictures are kept from whoever is looking. */
export type TagHidden = (tag: string) => boolean;

/**
 * What a seat may come across of the room's pictures: whether what the master keeps back may be
 * among them, and which tags are kept from it. Every list and picker of pictures, a person's and an
 * AI's alike, is given one, as `ImageTagLockService.sight` makes it for the seat, so none leaves
 * out either.
 */
export interface ImageSight {
  readonly canSeeSecret: boolean;
  readonly hidesTag: TagHidden;
}
