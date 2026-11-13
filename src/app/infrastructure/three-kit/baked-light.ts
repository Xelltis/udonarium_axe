import { disposeObject } from '@axe/infrastructure/three-kit/dispose';
import type { Scene, Texture } from 'three';

/** What bakes a scene into the light everything that mirrors it reflects, as a `PMREMGenerator` does. */
export interface LightBaker {
  fromScene(scene: Scene, sigma?: number): { readonly texture: Texture; dispose(): void };
}

/** The light a studio was baked into, and the render target on the card that holds it, let go of together. */
export interface BakedLight {
  readonly texture: Texture;
  dispose(): void;
}

/**
 * Bakes a studio into the light the things that mirror it reflect, and lets go of the studio at once,
 * its walls and lights never drawn again. The light lives in a render target, which is what holds it
 * on the card, so the target is what is let go of with the light.
 */
export function bakeLight(baker: LightBaker, studio: Scene, sigma: number): BakedLight {
  const target = baker.fromScene(studio, sigma);
  disposeObject(studio);
  return { texture: target.texture, dispose: () => target.dispose() };
}
