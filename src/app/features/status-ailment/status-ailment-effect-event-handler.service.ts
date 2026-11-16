import { DestroyRef, inject, Injectable } from '@angular/core';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { statusAilmentPlanted$ } from '@axe/core/event/domain-events';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';

/**
 * Plays the effect of the same name over a piece as a state is put on it, where the room asked for
 * that.
 *
 * Only the device that put the state on hears of it, and the cast service hands the effect to
 * everybody, so it plays once at every seat however many seats there are. States put on in one go,
 * as one command aimed at several pieces puts them, are cast together: one effect over all of them
 * rather than one a piece on top of each other. Taking a state off plays nothing.
 */
@Injectable({ providedIn: 'root' })
export class StatusAilmentEffectEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectStore = inject(ObjectStore);
  private readonly library = inject(EffectLibraryService);
  private readonly castService = inject(EffectCastService);
  /** The pieces each state was put on since the last cast, by the state's name, in the order they were put on. */
  private readonly waiting = new Map<string, string[]>();

  private get catalog(): StatusAilmentCatalog {
    return StatusAilmentCatalog.instance;
  }

  constructor() {
    statusAilmentPlanted$.subscribe((event) => {
      if (!this.catalog.playsEffectOnPlant) return;
      const first = this.waiting.size < 1;
      const pieces = this.waiting.get(event.name) ?? [];
      if (!pieces.includes(event.characterIdentifier)) pieces.push(event.characterIdentifier);
      this.waiting.set(event.name, pieces);
      if (first) queueMicrotask(() => this.castWaiting());
    }, this.destroyRef);
  }

  /** Casts the effect of each state that was put on, over the pieces it was put on that stand on the table. */
  private castWaiting(): void {
    const waiting = [...this.waiting];
    this.waiting.clear();
    for (const [name, identifiers] of waiting) {
      const preset = this.library.findByName(name);
      if (!preset) continue;
      const pieces = identifiers
        .map((identifier) => this.objectStore.get<GameCharacter>(identifier))
        .filter((piece): piece is GameCharacter => piece instanceof GameCharacter && piece.isVisibleOnTable);
      while (pieces.length > 0) this.castService.fire(preset, pieces.splice(0, preset.targetLimit), null);
    }
  }
}
