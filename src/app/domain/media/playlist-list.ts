import { SyncObject } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { InnerXml } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { encodeAttributeValue } from '@axe/core/util/xml-util';
import { Playlist } from '@axe/domain/media/playlist';

/** The element each playlist is written as, and each of its tracks. */
const PLAYLIST = 'list';
const ENTRY = 'entry';

/** A playlist as a save keeps it: its identifier and name, whether it is the room's first, and its tracks. */
interface SavedPlaylist {
  identifier: string;
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
 * once the sound comes in. Each playlist comes back under the identifier it was saved with, as a
 * scene names the playlist it plays by that.
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
        const identifier = encodeAttributeValue(playlist.identifier);
        const name = encodeAttributeValue(playlist.name ?? '');
        return `<${PLAYLIST} identifier="${identifier}" name="${name}"${first}>${entries}</${PLAYLIST}>`;
      })
      .join('');
  }

  /**
   * Puts the saved playlists in place of the room's, in the order they were saved: the room's first
   * one takes the saved first one's name and tracks where it stands, as it is never deleted. Each of
   * the others takes over the playlist here under its identifier, or comes back under it, or, where
   * the room deleted that identifier, is made afresh; those the save does not bring are deleted.
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
    const others = saved.filter(
      (playlist) => !playlist.isDefault && playlist.identifier !== Playlist.DEFAULT_IDENTIFIER
    );
    const kept = new Set(others.map((playlist) => playlist.identifier).filter((identifier) => identifier.length > 0));
    for (const playlist of Playlist.all()) {
      if (!playlist.isDefault && !kept.has(playlist.identifier)) playlist.destroy();
    }
    const now = Date.now();
    others.forEach((playlist, index) => putBack(playlist, now + index));
  }
}

/**
 * A saved playlist taken in under its identifier where it may be, else made afresh. Coming back
 * under one nothing here goes by, it is said to be coming back first, as somebody who saw it
 * deleted before this browser came in would delete it again otherwise.
 */
function putBack(saved: SavedPlaylist, createdAt: number): void {
  const here = saved.identifier ? ObjectStore.instance.get(saved.identifier) : null;
  if (here instanceof Playlist) {
    here.name = saved.name;
    here.entries = saved.entries;
    here.createdAt = createdAt;
    return;
  }
  if (here || !saved.identifier || ObjectStore.instance.isDeleted(saved.identifier)) {
    Playlist.create(saved.name, saved.entries, createdAt);
    return;
  }
  ObjectStore.instance.announceComingBack([saved.identifier]);
  Playlist.create(saved.name, saved.entries, createdAt, saved.identifier);
}

function readSavedPlaylist(element: Element): SavedPlaylist {
  const entries: string[] = [];
  for (const child of Array.from(element.children)) {
    const identifier = child.tagName === ENTRY ? (child.getAttribute('audio') ?? '') : '';
    if (identifier && !entries.includes(identifier)) entries.push(identifier);
  }
  return {
    identifier: element.getAttribute('identifier') ?? '',
    name: element.getAttribute('name') ?? '',
    isDefault: element.getAttribute('default') === 'true',
    entries,
  };
}
