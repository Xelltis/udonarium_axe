import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';

@SyncObject('playlist')
export class Playlist extends GameObject {
  /** The identifier of the playlist every room starts with, which cannot be deleted. */
  static readonly DEFAULT_IDENTIFIER = 'Playlist';

  /** The playlist: the music tracks in order. */
  @SyncVar() entries: string[] = [];

  /**
   * The name somebody gave the playlist.
   *
   * Empty for the room's first playlist until it is renamed, and for one an older version sent,
   * which knows nothing of names.
   */
  @SyncVar() name: string = '';

  /** When the playlist was made, in milliseconds, which puts the playlists in order. 0 for the room's first. */
  @SyncVar() createdAt: number = 0;

  /** The room's first playlist, or null before it has been made. */
  static get instance(): Playlist | null {
    return ObjectStore.instance.get<Playlist>(Playlist.DEFAULT_IDENTIFIER) ?? null;
  }

  /** Every playlist in the room, the first one first and the rest in the order they were made. */
  static all(): Playlist[] {
    return ObjectStore.instance.getObjects(Playlist).sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return (
        (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0) ||
        (a.identifier < b.identifier ? -1 : a.identifier > b.identifier ? 1 : 0)
      );
    });
  }

  /** Makes a new, empty playlist under a name and shares it with the room. */
  static create(name: string): Playlist {
    const playlist = new Playlist();
    playlist.name = name;
    playlist.createdAt = Date.now();
    playlist.initialize();
    return playlist;
  }

  /** Whether this is the playlist every room starts with. */
  get isDefault(): boolean {
    return this.identifier === Playlist.DEFAULT_IDENTIFIER;
  }

  /** Adds a track to the end of the playlist and shares the change. A track already on it is not added twice. */
  addEntry(identifier: string): void {
    if (!this.entries.includes(identifier)) {
      this.entries = [...this.entries, identifier];
    }
  }

  /** Takes a track off the playlist and shares the change. */
  removeEntry(identifier: string): void {
    this.entries = this.entries.filter((id) => id !== identifier);
  }

  /** Moves the track at one position to another, shifting those between, and shares the change. */
  moveEntry(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    const next = [...this.entries];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    this.entries = next;
  }

  /** Whether the track is on the playlist. */
  hasEntry(identifier: string): boolean {
    return this.entries.includes(identifier);
  }
}
