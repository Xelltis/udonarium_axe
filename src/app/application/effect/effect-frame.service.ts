import { computed, inject, Injectable } from '@angular/core';
import { effectElapsedOf, EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { nothingStaged } from '@axe/domain/effect/scene/choreography';
import { type EffectFooting, isDrawnInScene, stageEffect } from '@axe/domain/effect/scene/effect-frame';
import { type EffectFrame, EMPTY_EFFECT_FRAME } from '@axe/domain/effect/scene/effect-scene';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

const NOTHING_HIDDEN: ReadonlySet<string> = new Set<string>();

/**
 * What the effects being played draw in the table's scene now, among the pieces and the walls. Every
 * seat works it out from the casts it plays, so nothing more is sent; with nothing of the kind playing
 * it hands back the same empty frame and reads no clock.
 */
@Injectable({ providedIn: 'root' })
export class EffectFrameService {
  private readonly playback = inject(EffectPlaybackService);
  private readonly tabletop = inject(TabletopService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly vision = inject(VisionService);

  readonly frame = computed<EffectFrame>(
    () => {
      const casts = this.playback.activeCasts().filter((active) => isDrawnInScene(active.preset));
      if (casts.length < 1) return EMPTY_EFFECT_FRAME;
      const now = this.playback.now();
      const cellPx = this.tabletop.gridSize();
      const drawn = nothingStaged();
      for (const active of casts) {
        stageEffect(
          active.preset,
          active.cast,
          effectElapsedOf(active, now),
          {
            cellPx,
            hiddenIdentifiers: this.hiddenOf(active.cast.targets.map((target) => target.identifier)),
            resolveFooting: (identifier) => this.footingOf(identifier, cellPx),
            resolveSize: (identifier) => this.sizeOf(identifier),
          },
          drawn
        );
      }
      const empty = drawn.motes.length + drawn.floor.length + drawn.ribbons.length + drawn.lights.length < 1;
      if (empty) return EMPTY_EFFECT_FRAME;
      return drawn;
    },
    { equal: (a, b) => a === b }
  );

  private hiddenOf(identifiers: readonly string[]): ReadonlySet<string> {
    let hidden: Set<string> | null = null;
    for (const identifier of identifiers) {
      const character = this.objectStore.get<GameCharacter>(identifier);
      if (!(character instanceof GameCharacter)) continue;
      this.objectChange.versionOf(identifier)();
      if (this.vision.isTokenVisible(character)) continue;
      hidden ??= new Set<string>();
      hidden.add(identifier);
    }
    return hidden ?? NOTHING_HIDDEN;
  }

  /** How many cells across a piece is, as it stands now; one where it is not on the table. */
  private sizeOf(identifier: string): number {
    const size = (this.objectStore.get<TabletopObject>(identifier) as { size?: unknown } | null)?.size;
    return typeof size === 'number' && size > 0 ? size : 1;
  }

  /** The middle of a piece's foot as it stands now, raised as far as it flies, and the floor under it. */
  private footingOf(identifier: string, cellPx: number): EffectFooting | null {
    const object = this.objectStore.get<TabletopObject>(identifier);
    if (!(object instanceof TabletopObject) || !object.isVisibleOnTable) return null;
    const half = (cellPx * this.sizeOf(identifier)) / 2;
    return {
      x: object.location.x + half,
      y: object.location.y + half,
      z: object.posZ + object.altitude * cellPx,
      groundZ: object.posZ,
    };
  }
}
