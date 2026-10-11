import { inject, Injectable } from '@angular/core';
import { ImageFile } from '@axe/core/storage/image-file';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatReaction } from '@axe/domain/chat/chat-reaction';
import { replaceIdentifierIn } from '@axe/domain/media/image-reference';
import { ImageTag, SYSTEM_RESERVED_TAG } from '@axe/domain/media/image-tag';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

/**
 * Puts one picture in the place of another across the room.
 *
 * A picture's identifier is the hash of what it holds, so a picture worked on is a new picture,
 * and what showed the old one goes on showing it until it is told otherwise. This tells it: every
 * object in the room has each mention of the old identifier in what it shares put to the new one,
 * wherever the mention sits, a field of its own, a list or a record written out as text.
 *
 * What was said in the chat, and the stamps put on it, stay as they were said. The other seats'
 * cursors are theirs to change. The old picture itself is not thrown away, since a picture cannot
 * be taken from the other seats, and old lines and recordings still show it; it is put out of the
 * image list instead, and its tag goes over to the new one.
 */
@Injectable({ providedIn: 'root' })
export class ImageRelinkService {
  private readonly objectStore = inject(ObjectStore);

  /** Puts `next` in the place of `old`, and gives back how many objects were changed. */
  replace(old: ImageFile, next: ImageFile): number {
    if (old.identifier === next.identifier) return 0;
    let changed = 0;
    GameObject.batch(() => {
      for (const object of this.objectStore.getObjects()) {
        if (!this.rewrites(object)) continue;
        const context = object.toContext();
        const result = replaceIdentifierIn(context.syncData, old.identifier, next.identifier);
        if (!result.changed) continue;
        context.syncData = result.value;
        object.apply(context);
        object.update();
        changed++;
      }
      this.handOverTag(old.identifier, next.identifier);
    });
    return changed;
  }

  private rewrites(object: GameObject): boolean {
    if (object instanceof ImageTag || object instanceof ChatMessage || object instanceof ChatReaction) return false;
    if (object instanceof PeerCursor) return object === PeerCursor.myCursor;
    return true;
  }

  /**
   * Gives the new picture the old one's tag and keeps it back as the old one was, then files the
   * old one under the reserved tag so it leaves the lists. A new picture that is already filed,
   * one the edit happened to come out the same as, keeps its own tag and its own keeping back.
   */
  private handOverTag(from: string, to: string): void {
    const old = ImageTag.get(from);
    if (old && !ImageTag.get(to)) {
      const next = ImageTag.create(to);
      next.tag = old.tag;
      next.isSecret = old.isSecret;
    }
    (old ?? ImageTag.create(from)).tag = SYSTEM_RESERVED_TAG;
  }
}
