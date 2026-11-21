import type { Object3D } from 'three';

/**
 * A shape a VRM model is blended towards by the name it gives it, as `happy`, `blink` or `aa`: the
 * morphs of its meshes it moves, each by the mesh's order in the model (see `meshesOf`), the morph's
 * place in the mesh, and how far the morph goes for the shape all the way.
 */
export interface VrmExpression {
  readonly name: string;
  readonly binds: readonly { readonly mesh: number; readonly morph: number; readonly weight: number }[];
}

/** The hair, the cloth and whatever else of one copy of a model swings as the copy moves. */
export interface SwingingParts {
  /** Moves the swinging on by so many seconds, the copy's matrices worked out as they stand. */
  update(seconds: number): void;
  /** Stands everything that swings at rest, as it was made. */
  reset(): void;
}

/**
 * What a VRM model is rigged with beyond what any model is: the shapes it names, and the parts that
 * swing, which each copy of it has made for its own bones, since what swings is tied to the bones it
 * hangs from and a copy has bones of its own.
 */
export interface VrmRig {
  readonly expressions: readonly VrmExpression[];
  /** Makes the swinging parts of a copy of the model, or nothing for a model with none. */
  swingingOf(copy: Object3D): SwingingParts | null;
}
