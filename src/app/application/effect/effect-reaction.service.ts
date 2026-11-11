import { computed, inject, Injectable } from '@angular/core';
import { effectElapsedOf, EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { type EffectJolt, effectJoltsOf } from '@axe/domain/effect/effect-reaction';

const NO_JOLTS: ReadonlyMap<string, EffectJolt> = new Map();

/**
 * How far each piece the effects being played strike is thrown now, and how far each one who cast
 * them leans in, by the piece's identifier. Every seat works it out from the casts it plays and only
 * draws the pieces off where they stand, so nothing more is sent and nothing is moved.
 */
@Injectable({ providedIn: 'root' })
export class EffectReactionService {
  private readonly playback = inject(EffectPlaybackService);
  private readonly tabletop = inject(TabletopService);

  readonly jolts = computed<ReadonlyMap<string, EffectJolt>>(
    () => {
      const casts = this.playback.activeCasts();
      if (casts.length < 1) return NO_JOLTS;
      const now = this.playback.now();
      const cellPx = this.tabletop.gridSize();
      const all = new Map<string, EffectJolt>();
      for (const active of casts) {
        // Each cast keeps the blows it lands from when it was played, rather than working them out each frame.
        const jolts = effectJoltsOf(active.preset, active.cast, effectElapsedOf(active, now), cellPx, active.blows);
        for (const [identifier, jolt] of jolts) {
          const was = all.get(identifier);
          all.set(identifier, was ? { x: was.x + jolt.x, y: was.y + jolt.y, z: was.z + jolt.z } : jolt);
        }
      }
      return all.size < 1 ? NO_JOLTS : all;
    },
    { equal: (a, b) => a === b || (a.size === 0 && b.size === 0) }
  );
}
