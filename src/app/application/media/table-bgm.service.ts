import { inject, Injectable } from '@angular/core';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Jukebox } from '@axe/domain/media/jukebox';
import { tableBgmModeOf } from '@axe/domain/media/table-bgm';
import { GameTable } from '@axe/domain/tabletop/game-table';

/**
 * Puts on the music a table asks for when somebody switches the room to it.
 *
 * Asked on the screen of whoever switched, as the table's cut-ins are, and the room's jukebox
 * carries the music to everyone else. Loading a room or making a table switches nothing and asks
 * nothing.
 */
@Injectable({ providedIn: 'root' })
export class TableBgmService {
  private readonly objectStore = inject(ObjectStore);
  private readonly audioStorage = inject(AudioStorage);

  /**
   * Does what the table asks of the music: stops it, or puts its track on unless that track is
   * already playing, which carries on rather than starting again. A track the room no longer has
   * leaves the music as it is.
   */
  playFor(table: GameTable): void {
    const jukebox = this.objectStore.get<Jukebox>('Jukebox');
    if (!jukebox) return;
    switch (tableBgmModeOf(table)) {
      case 'stop':
        if (jukebox.isPlaying) jukebox.stop();
        return;
      case 'play': {
        const identifier = table.tableBgmIdentifier;
        if (!identifier || !this.audioStorage.get(identifier)) return;
        if (jukebox.isPlaying && jukebox.audioIdentifier === identifier) return;
        jukebox.play(identifier);
        return;
      }
      case '':
        return;
    }
  }
}
