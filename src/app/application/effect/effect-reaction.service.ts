import { computed, inject, Injectable } from '@angular/core';
import { effectElapsedOf, EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { EffectSceneLooksService } from '@axe/application/effect/effect-scene-looks.service';
import { PieceLinksService } from '@axe/application/tabletop/piece-links.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import type { EffectJolt } from '@axe/domain/effect/effect-reaction';

const NO_JOLTS: ReadonlyMap<string, EffectJolt> = new Map();

/**
 * How far each piece the effects being played strike is thrown now, and how far each one who cast
 * them leans in, by the piece's identifier. Every seat works it out from the casts it plays and only
 * draws the pieces off where they stand, so nothing more is sent and nothing is moved. A part is
 * drawn as its body, so a blow to a part throws its body. How the pieces are thrown is worked out by
 * the looks of the effects, which are loaded apart from the page: until they are, no piece is thrown,
 * as nothing of an effect is drawn in the scene.
 */
@Injectable({ providedIn: 'root' })
export class EffectReactionService {
  private readonly playback = inject(EffectPlaybackService);
  private readonly tabletop = inject(TabletopService);
  private readonly objectStore = inject(ObjectStore);
  private readonly links = inject(PieceLinksService);
  private readonly sceneLooks = inject(EffectSceneLooksService);

  /** The piece a struck piece is drawn as: its body, for a part; itself otherwise. */
  private drawnAs(identifier: string): string {
    const piece = this.objectStore.get(identifier);
    return piece instanceof GameCharacter ? (this.links.bodyOf(piece)?.identifier ?? identifier) : identifier;
  }

  readonly jolts = computed<ReadonlyMap<string, EffectJolt>>(
    () => {
      const casts = this.playback.activeCasts();
      if (casts.length < 1) return NO_JOLTS;
      const looks = this.sceneLooks.looks();
      if (!looks) return NO_JOLTS;
      const now = this.playback.now();
      const cellPx = this.tabletop.gridSize();
      const all = new Map<string, EffectJolt>();
      for (const active of casts) {
        // Each cast keeps the blows it lands from when it was played, rather than working them out each frame.
        const jolts = looks.effectJoltsOf(
          active.preset,
          active.cast,
          effectElapsedOf(active, now),
          cellPx,
          active.blows
        );
        // A cast that strikes a body and its parts throws the body once, by the hardest of the blows.
        const thrown = new Map<string, EffectJolt>();
        for (const [struck, jolt] of jolts) {
          const identifier = this.drawnAs(struck);
          const was = thrown.get(identifier);
          if (!was || reachOf(jolt) > reachOf(was)) thrown.set(identifier, jolt);
        }
        for (const [identifier, jolt] of thrown) {
          const was = all.get(identifier);
          all.set(identifier, was ? { x: was.x + jolt.x, y: was.y + jolt.y, z: was.z + jolt.z } : jolt);
        }
      }
      return all.size < 1 ? NO_JOLTS : all;
    },
    { equal: (a, b) => a === b || (a.size === 0 && b.size === 0) }
  );
}

/** How far a jolt throws a piece, whichever way. */
function reachOf(jolt: EffectJolt): number {
  return Math.hypot(jolt.x, jolt.y, jolt.z);
}
