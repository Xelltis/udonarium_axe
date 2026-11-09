import { computed, inject, Injectable } from '@angular/core';
import { effectElapsedOf, EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { type EffectLight, effectLightsOf, strongestEffectLights } from '@axe/domain/effect/effect-light';

const NO_LIGHTS: readonly EffectLight[] = [];

/**
 * The lights the effects being played throw over the table now, the strongest as many as may be
 * thrown: a flash as each blow lands and a glow over what burns or pours out. Every seat works them
 * out from the casts it plays, so nothing more is sent.
 */
@Injectable({ providedIn: 'root' })
export class EffectLightService {
  private readonly playback = inject(EffectPlaybackService);
  private readonly tabletop = inject(TabletopService);

  readonly lights = computed<readonly EffectLight[]>(
    () => {
      const casts = this.playback.activeCasts();
      if (casts.length < 1) return NO_LIGHTS;
      const now = this.playback.now();
      const cellPx = this.tabletop.gridSize();
      const thrown = casts.flatMap((active) =>
        effectLightsOf(active.preset, active.cast, effectElapsedOf(active, now), cellPx)
      );
      return thrown.length < 1 ? NO_LIGHTS : strongestEffectLights(thrown);
    },
    { equal: (a, b) => a === b || (a.length === 0 && b.length === 0) }
  );
}
