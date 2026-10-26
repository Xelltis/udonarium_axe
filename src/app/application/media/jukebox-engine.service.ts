import { DestroyRef, inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { type DjEffects } from '@axe/domain/media/dj-effects';
import { Jukebox } from '@axe/domain/media/jukebox';
import { JukeboxEngine } from '@axe/infrastructure/media/jukebox-engine';

/**
 * Plays the room's jukebox on this peer: puts an engine under every jukebox that comes into the
 * room, and hands the engine of the room's own jukebox what only this peer's hearing has to do with.
 */
@Injectable({ providedIn: 'root' })
export class JukeboxEngineService {
  private readonly objectStore = inject(ObjectStore);
  private readonly engines = new WeakMap<Jukebox, JukeboxEngine>();

  constructor() {
    for (const jukebox of this.objectStore.getObjects<Jukebox>(Jukebox)) this.attach(jukebox);
    inject(ObjectChangeService).objectAdded$.subscribe((event) => {
      const added = this.objectStore.get(event.identifier);
      if (added instanceof Jukebox) this.attach(added);
    }, inject(DestroyRef));
  }

  /** The engine of the room's jukebox, or null while there is none. */
  private get engine(): JukeboxEngine | null {
    const jukebox = this.objectStore.get<Jukebox>('Jukebox');
    return jukebox ? (this.engines.get(jukebox) ?? null) : null;
  }

  /** Eases the room's track and background sounds to the room's levels, as when a reading arrives. */
  refreshMix(): void {
    this.engine?.refreshMix();
  }

  /** Moves the room on to the next track when the one playing is near enough its end to mix into it. */
  tickAutomix(): void {
    this.engine?.tickAutomix();
  }

  /** Puts this peer's music through effects to hear them ahead of sharing them. */
  previewEffects(effects: DjEffects): void {
    this.engine?.applyEffects(effects);
  }

  private attach(jukebox: Jukebox): void {
    if (this.engines.has(jukebox)) return;
    const engine = new JukeboxEngine(jukebox);
    this.engines.set(jukebox, engine);
    engine.attach();
  }
}
