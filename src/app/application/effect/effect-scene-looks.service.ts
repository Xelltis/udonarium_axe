import { Injectable, signal } from '@angular/core';
import { trackLazyLoad } from '@axe/core/util/lazy-loads';

/** The module that draws the looks of effects in a scene: loaded only once one is wanted, as it is large. */
export type EffectSceneLooks = typeof import('@axe/domain/effect/scene/effect-frame');

/**
 * Holds the looks of effects drawn in a scene once they are loaded. They are loaded the first time
 * anything asks, and until then nothing of an effect drawn in the scene is drawn; the table asks as
 * it is first drawn, well before the first effect plays.
 */
@Injectable({ providedIn: 'root' })
export class EffectSceneLooksService {
  private readonly loaded = signal<EffectSceneLooks | null>(null);
  private loading: Promise<EffectSceneLooks | null> | null = null;

  /** The looks, once loaded; null until then. Reading it asks for them to be loaded. */
  readonly looks = (): EffectSceneLooks | null => {
    const looks = this.loaded();
    if (!looks) void this.load();
    return looks;
  };

  /** Loads the looks, once, and says when they are ready, or null where they could not be loaded. */
  load(): Promise<EffectSceneLooks | null> {
    this.loading ??= trackLazyLoad(import('@axe/domain/effect/scene/effect-frame')).then(
      (looks) => {
        this.loaded.set(looks);
        return looks;
      },
      () => null
    );
    return this.loading;
  }
}
