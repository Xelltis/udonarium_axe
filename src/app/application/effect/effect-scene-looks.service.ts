import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import { trackLazyLoad } from '@axe/core/util/lazy-loads';

/** The module that draws the looks of effects in a scene: loaded only once one is wanted, as it is large. */
export type EffectSceneLooks = typeof import('@axe/domain/effect/scene/effect-frame');

/** How the looks are fetched: the module itself, split off the page as it is large. */
export const EFFECT_LOOKS_IMPORT = new InjectionToken<() => Promise<EffectSceneLooks>>('EFFECT_LOOKS_IMPORT', {
  providedIn: 'root',
  factory: () => () => import('@axe/domain/effect/scene/effect-frame'),
});

/**
 * Holds the looks of effects drawn in a scene once they are loaded. They are loaded the first time
 * anything asks, and until then nothing of an effect drawn in the scene is drawn; the table asks as
 * it is first drawn, well before the first effect plays.
 */
@Injectable({ providedIn: 'root' })
export class EffectSceneLooksService {
  private readonly fetchLooks = inject(EFFECT_LOOKS_IMPORT);
  private readonly loaded = signal<EffectSceneLooks | null>(null);
  private loading: Promise<EffectSceneLooks | null> | null = null;
  /** When loading the looks last failed, so that they are asked for again only after a while. */
  private failedAt = Number.NEGATIVE_INFINITY;

  /**
   * The looks, once loaded; null until then. Reading it asks for them to be loaded, and again a while
   * after loading them failed, as a dropped connection may come back.
   */
  readonly looks = (): EffectSceneLooks | null => {
    const looks = this.loaded();
    if (!looks && Date.now() - this.failedAt >= EFFECT_LOOKS_RETRY_MS) void this.load();
    return looks;
  };

  /**
   * Loads the looks, once, and says when they are ready, or null where they could not be loaded; a
   * load that failed is tried again the next time they are asked for.
   */
  load(): Promise<EffectSceneLooks | null> {
    this.loading ??= trackLazyLoad(this.fetchLooks()).then(
      (looks) => {
        this.loaded.set(looks);
        return looks;
      },
      () => {
        this.loading = null;
        this.failedAt = Date.now();
        return null;
      }
    );
    return this.loading;
  }
}

/** How long after loading the looks failed they are asked for again by drawing. */
export const EFFECT_LOOKS_RETRY_MS = 5_000;
