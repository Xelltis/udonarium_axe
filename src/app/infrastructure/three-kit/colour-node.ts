import type { vec3 } from 'three/tsl';

/** A colour the library's colour-space functions answer, which they do not say is a colour. */
export function colourNode(node: unknown): ReturnType<typeof vec3> {
  return node as ReturnType<typeof vec3>;
}
