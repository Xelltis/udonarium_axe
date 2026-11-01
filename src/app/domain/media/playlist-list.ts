import { SyncObject } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { InnerXml } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { encodeAttributeValue } from '@axe/core/util/xml-util';
import { Playlist } from '@axe/domain/media/playlist';

/** The element each playlist is written as, and each of its tracks. */
const PLAYLIST = 'list';
const ENTRY = 'entry';

/** A playlist as a save keeps it: its name, whether it is the room's first, and its tracks in order. */
interface SavedPlaylist {
  name: string;
  isDefault: boolean;
  entries: string[];
}

/**
 * A holder for writing the room's playlists into a saved room as `playlist.xml`, and for putting
 * them back from it in place of the room's own.
 *
 * A track is kept by its sound's identifier, the hash of its bytes, so it is found again wherever
 * the same sound is held. One whose sound is not held is kept on the list all the same and plays
 * once the sound comes in.
 */
@SyncObject('playlist-list')
export class PlaylistList extends ObjectNode implements InnerXml {
  /** Takes the list straight back out of the store, so it is never shared with the room. */
  override onStoreAdded() {
    super.onStoreAdded();
    ObjectStore.instance.remove(this);
  }

  /** Each of the room's playlists in order, the first one first, with its tracks. */
  override innerXml(): string {
    return Playlist.all()
      .map((playlist) => {
        const entries = playlist.entries
          .map((identifier) => `<${ENTRY} audio="${encodeAttributeValue(identifier)}"/>`)
          .join('');
        const first = playlist.isDefault ? ' default="true"' : '';
        return `<${PLAYLIST} name="${encodeAttributeValue(playlist.name ?? '')}"${first}>${entries}</${PLAYLIST}>`;
      })
      .join('');
  }

  /**
   * Puts the saved playlists in place of the room's: the room's first one takes the saved first
   * one's name and tracks where it stands, as it is never deleted, and the others are made afresh
   * in the order they were saved, in place of those there were.
   */
  override parseInnerXml(element: Element): void {
    const saved = Array.from(element.children)
      .filter((child) => child.tagName === PLAYLIST)
      .map(readSavedPlaylist);
    const first = saved.find((playlist) => playlist.isDefault);
    const firstHere = Playlist.instance;
    if (firstHere) {
      firstHere.name = first?.name ?? '';
      firstHere.entries = first?.entries ?? [];
    }
    for (const playlist of Playlist.all()) {
      if (!playlist.isDefault) playlist.destroy();
    }
    const now = Date.now();
    saved
      .filter((playlist) => !playlist.isDefault)
      .forEach((playlist, index) => Playlist.create(playlist.name, playlist.entries, now + index));
  }
}

function readSavedPlaylist(element: Element): SavedPlaylist {
  const entries: string[] = [];
  for (const child of Array.from(element.children)) {
    const identifier = child.tagName === ENTRY ? (child.getAttribute('audio') ?? '') : '';
    if (identifier && !entries.includes(identifier)) entries.push(identifier);
  }
  return {
    name: element.getAttribute('name') ?? '',
    isDefault: element.getAttribute('default') === 'true',
    entries,
  };
}
