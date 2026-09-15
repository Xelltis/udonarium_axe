import { AudioFile } from '@axe/core/storage/audio-file';
import { SyncObject } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { InnerXml } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AudioTag } from '@axe/domain/media/audio-tag';

@SyncObject('audio-tag-list')
export class AudioTagList extends ObjectNode implements InnerXml {
  private identifiers: string[] = [];

  // GameObject Lifecycle
  /** Takes the list straight back out of the store, so it is never shared with the room. */
  override onStoreAdded() {
    super.onStoreAdded();
    ObjectStore.instance.remove(this); // ObjectStoreには登録しない
  }

  /** The tags of the listed sounds, each written once. A sound that has no tag is skipped. */
  override innerXml(): string {
    const parts: string[] = [];
    for (const identifier of new Set(this.identifiers)) {
      const tag = AudioTag.get(identifier);
      if (tag) parts.push(tag.toXml());
    }
    return parts.join('');
  }

  /** A holder for writing the tags of the given sounds into a saved room or zip as `audiotag.xml`. */
  static create(audios: AudioFile[]): AudioTagList {
    const audioTagList = new AudioTagList();

    audioTagList.identifiers = audios.map((audio) => audio.identifier);

    return audioTagList;
  }
}
