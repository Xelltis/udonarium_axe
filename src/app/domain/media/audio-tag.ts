import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { ObjectStore } from '@axe/core/sync/object-store';

@SyncObject('audio-tag')
export class AudioTag extends ObjectNode {
  @SyncVar() audioIdentifier: string = '';
  @SyncVar() tag: string = 'BGM';

  /** Whether every one of the words appears somewhere in the tag. No words at all matches every tag. */
  containsWords(words: string[]): boolean {
    return words.every((word) => this.tag.includes(word));
  }

  /** The sounds whose tag contains every search word, leaving out any whose file is not in storage. */
  static searchAudios(searchWords: string[]): AudioFile[] {
    return ObjectStore.instance
      .getObjects<AudioTag>(AudioTag)
      .filter((tag) => tag.containsWords(searchWords))
      .map((tag) => AudioStorage.instance.get(tag.audioIdentifier))
      .filter((audio): audio is AudioFile => audio !== null);
  }

  /** The tag of a sound. Despite the type, it is null when the sound has never been tagged. */
  static get(audioIdentifier: string): AudioTag {
    return ObjectStore.instance.get<AudioTag>(`audiotag_${audioIdentifier}`)!;
  }

  /** Makes a tag for a sound, tagged as BGM, and adds it to the room under the identifier `get` looks for. */
  static create(audioIdentifier: string) {
    const object: AudioTag = new AudioTag(`audiotag_${audioIdentifier}`);

    object.audioIdentifier = audioIdentifier;

    object.initialize();
    return object;
  }

  /**
   * Copies a tag read from a file onto the sound's own tag, then destroys the copy that was read.
   *
   * The tag is made first when the sound has none, and the change is shared with the room.
   */
  override parseInnerXml(_element: Element) {
    let audioTag = AudioTag.get(this.audioIdentifier);
    if (!audioTag) audioTag = AudioTag.create(this.audioIdentifier);
    const context = audioTag.toContext();
    context.syncData = this.toContext().syncData;
    audioTag.apply(context);
    audioTag.update();
    this.destroy();
  }
}
