import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';

@SyncObject('playlist')
export class Playlist extends GameObject {
  /** The playlist: the music tracks in order. */
  @SyncVar() entries: string[] = [];

  /** The room's playlist, or null before it has been made. */
  static get instance(): Playlist | null {
    return ObjectStore.instance.get<Playlist>('Playlist') ?? null;
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
