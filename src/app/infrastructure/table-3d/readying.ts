import type { Object3D } from 'three/webgpu';

/** How many new things are readied one by one; more than that, and the whole scene is readied at once. */
export const READIED_ONE_BY_ONE = 24;

/** Whether a thing stands in a scene, under it however deep. */
export function isWithin(thing: Object3D, scene: Object3D): boolean {
  for (let at: Object3D | null = thing; at; at = at.parent) if (at === scene) return true;
  return false;
}

/**
 * Readies the graphics card for things new to a scene, and answers whether every one of them was
 * readied. A few are readied one after another, each by `one`: readying gives way to the frames being
 * drawn, and on a slow machine a whole scene takes many of them. More than a few are readied with the
 * whole scene at once, by `whole`. A renderer readies one thing at a time, so none is begun before
 * the last is done.
 *
 * A thing taken out of the scene meanwhile is passed over, as what the renderer built for it after it
 * was disposed of would never be let go of; the answer is then no. Nothing more is begun once `stop`
 * says so. A thing that cannot be readied is left to be built on the frame that first draws it.
 */
export async function readyThings(
  things: readonly Object3D[],
  scene: Object3D,
  ways: {
    readonly one: (thing: Object3D) => Promise<unknown>;
    readonly whole: () => Promise<unknown>;
    readonly stop?: () => boolean;
  }
): Promise<boolean> {
  if (things.length > READIED_ONE_BY_ONE) {
    await ways.whole().catch(() => undefined);
    return things.every((thing) => isWithin(thing, scene));
  }
  let all = true;
  for (const thing of things) {
    if (ways.stop?.()) return false;
    if (!isWithin(thing, scene)) {
      all = false;
      continue;
    }
    await ways.one(thing).catch(() => undefined);
  }
  return all;
}
