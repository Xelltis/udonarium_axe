import { beamRestPosition } from '@axe/domain/tabletop/contact-support';
import { PickHit } from '@axe/domain/tabletop/pick/pick-index';
import { TERRAIN_PICK_LAYER } from '@axe/domain/tabletop/pick/terrain-pick';
import { WorldBox } from '@axe/domain/tabletop/surface-space';
import { isTableWall } from '@axe/domain/tabletop/table-walls';

/** What the faces of the table answer, as far as a piece moving onto one asks. */
export interface SurfaceFaces {
  /** Where a point of the page lands on a face, across and down from its corner, or null off it. */
  pointOn(surface: string, pageX: number, pageY: number): { readonly localX: number; readonly localY: number } | null;
  /** How far a face runs across and down, in pixels, or null for a face it does not know. */
  sizeOf(surface: string): { readonly width: number; readonly height: number } | null;
  /** Whether a piece may hang over the edge of a face. */
  overhangs(surface: string): boolean;
}

/** A piece's width and height on its face, in pixels. */
export interface PieceSize {
  readonly width: number;
  readonly height: number;
}

/** A beam a piece could rest on, and where the line of sight meets it. */
export interface BeamUnderPointer {
  readonly box: WorldBox;
  readonly at: { x: number; y: number };
}

/**
 * Where a point of the page lands on a face a piece could be moved onto, kept inside the face
 * unless the face lets a piece hang over its edge, as the corner the piece would be put at; or
 * null where the point is off the face altogether.
 */
export function placeOnFace(
  faces: SurfaceFaces,
  surface: string,
  pointer: { x: number; y: number },
  size: PieceSize
): { x: number; y: number } | null {
  const onFace = faces.pointOn(surface, pointer.x, pointer.y);
  const faceSize = faces.sizeOf(surface);
  if (!onFace || !faceSize) return null;
  if (onFace.localX < 0 || onFace.localX > faceSize.width || onFace.localY < 0 || onFace.localY > faceSize.height) {
    return null;
  }
  const rawX = onFace.localX - size.width / 2;
  const rawY = onFace.localY - size.height / 2;
  if (faces.overhangs(surface)) return { x: rawX, y: rawY };
  return {
    x: Math.max(0, Math.min(Math.max(0, faceSize.width - size.width), rawX)),
    y: Math.max(0, Math.min(Math.max(0, faceSize.height - size.height), rawY)),
  };
}

/**
 * The highest beam, a block put on a wall, among what the line of sight through the pointer meets,
 * and where it meets it; the piece's own block, by `selfId`, is passed over.
 */
export function highestBeamAmong(hits: readonly PickHit[], selfId: string | undefined): BeamUnderPointer | null {
  let best: BeamUnderPointer | null = null;
  for (const hit of hits) {
    const target = hit.target;
    if (target.id === selfId || target.layer !== TERRAIN_PICK_LAYER || !isTableWall(target.surface)) continue;
    const shape = target.shapes[0];
    if (shape?.kind !== 'prism') continue;
    const xs = shape.outline.map((point) => point.x);
    const ys = shape.outline.map((point) => point.y);
    const box: WorldBox = {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
      minZ: shape.base,
      maxZ: shape.top,
    };
    if (!best || box.maxZ > best.box.maxZ) best = { box, at: hit.point };
  }
  return best;
}

/** Where a piece of `size` comes to rest on the highest beam under the pointer, or null with no beam there. */
export function beamRestUnder(
  hits: readonly PickHit[],
  selfId: string | undefined,
  size: PieceSize
): { x: number; y: number; z: number } | null {
  const beam = highestBeamAmong(hits, selfId);
  return beam ? beamRestPosition(beam.box, beam.at.x, beam.at.y, size.width, size.height) : null;
}
