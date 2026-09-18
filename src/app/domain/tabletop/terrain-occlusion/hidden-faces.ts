import { OcclusionShape } from '@axe/domain/tabletop/terrain-occlusion/occlusion-shape';

/** How far two heights may differ and still be read as the same, in pixels. */
const HEIGHT_TOLERANCE = 1e-6;

const NOTHING_HIDDEN: ReadonlySet<string> = new Set();

/**
 * Which sides of each block are hidden by the blocks pressed against them.
 *
 * A side is hidden only when every cell it looks out on holds a block that could hide it and
 * reaches at least as low and as high as the side does. A side covered along part of its length,
 * or up to part of its height, stays drawn: cut to the part left showing, its picture would be
 * laid on differently and the table would look different.
 *
 * Blocks with nothing hidden are left out of the answer.
 */
export function hiddenFacesByTerrain(shapes: readonly OcclusionShape[]): Map<string, ReadonlySet<string>> {
  const occludersAt = new Map<number, OcclusionShape[]>();
  for (const shape of shapes) {
    if (!shape.occludes) continue;
    for (const cell of shape.cells) {
      const here = occludersAt.get(cell);
      if (here) here.push(shape);
      else occludersAt.set(cell, [shape]);
    }
  }

  const hidden = new Map<string, ReadonlySet<string>>();
  for (const shape of shapes) {
    if (!shape.cullable) continue;
    let faces: Set<string> | null = null;
    for (const face of shape.faces) {
      if (face.outside.length === 0) continue;
      const covered = face.outside.every(
        (cell) =>
          cell >= 0 &&
          (occludersAt.get(cell) ?? []).some(
            (other) =>
              other !== shape &&
              other.basePx <= shape.basePx + HEIGHT_TOLERANCE &&
              other.topPx >= shape.topPx - HEIGHT_TOLERANCE
          )
      );
      if (!covered) continue;
      faces ??= new Set();
      faces.add(face.key);
    }
    if (faces) hidden.set(shape.identifier, faces);
  }
  return hidden;
}

/** The hidden sides of one block, the same empty set whenever it has none. */
export function hiddenFacesOf(
  hidden: ReadonlyMap<string, ReadonlySet<string>>,
  identifier: string
): ReadonlySet<string> {
  return hidden.get(identifier) ?? NOTHING_HIDDEN;
}
