import { computed, inject, Injectable } from '@angular/core';
import { EffectFrameService } from '@axe/application/effect/effect-frame.service';
import { type EffectLight, strongestEffectLights } from '@axe/domain/effect/effect-light';

const NO_LIGHTS: readonly EffectLight[] = [];

/**
 * The lights the effects being played and those left standing throw over the table now, the
 * strongest as many as may be thrown: the lights each look throws itself in the table's scene, a
 * flash as a blow lands and a glow over what burns or pours out. Every seat works them out from what
 * it plays, so nothing more is sent.
 */
@Injectable({ providedIn: 'root' })
export class EffectLightService {
  private readonly frames = inject(EffectFrameService);

  readonly lights = computed<readonly EffectLight[]>(
    () => {
      const thrown = this.frames.frame().lights;
      return thrown.length < 1 ? NO_LIGHTS : strongestEffectLights(thrown);
    },
    { equal: (a, b) => a === b || (a.length === 0 && b.length === 0) }
  );
}
