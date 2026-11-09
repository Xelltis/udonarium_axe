import { FACES_OVER_FLOOR, LAID_OVER_FACES } from '@axe/infrastructure/table-3d/floor-order';
import type { DarknessTaking } from '@axe/infrastructure/table-3d/veil';
import {
  Color,
  DoubleSide,
  type Material,
  MeshBasicNodeMaterial,
  MeshLambertNodeMaterial,
  type Texture,
} from 'three/webgpu';

/** What a face wears: the picture, how it is laid, and whether it is glass, or else the colour it is painted. */
export type FaceLook = { pictureUrl: string; tilePx: number; glass: boolean; colour?: string; laidOver?: boolean };

/** How a glass face is drawn: a pale blue, mostly clear. */
const GLASS_COLOUR = 0xcfe6ff;
const GLASS_OPACITY = 0.25;

/** The key faces drawn with one material share. */
export function lookOf(face: FaceLook): string {
  if (face.laidOver) return `over|${face.pictureUrl}`;
  if (!face.glass && !face.pictureUrl && face.colour) return `colour|${face.colour}`;
  return face.glass || !face.pictureUrl ? 'glass' : `${face.pictureUrl}|${face.tilePx > 0}`;
}

/**
 * The material a face of a block or of the table's walls is drawn with: the picture laid over another
 * face, the colour it is painted, glass, or its picture, tiled or stretched. Every face is drawn
 * ahead of the board, so the top of a block made as high as nothing hides the board it lies on, and
 * a picture laid over a face is drawn ahead of that face.
 *
 * `pictureOf` gives the picture a face wears, and `cover` lays the veil and the darkness over the
 * material made.
 */
export function faceMaterialOf(
  face: FaceLook,
  pictureOf: (url: string, tiled: boolean) => Texture,
  cover: (material: Material, taking?: DarknessTaking) => void
): MeshBasicNodeMaterial | MeshLambertNodeMaterial {
  if (face.laidOver) {
    const over = new MeshBasicNodeMaterial({
      map: pictureOf(face.pictureUrl, false),
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      ...LAID_OVER_FACES,
    });
    cover(over);
    return over;
  }
  if (!face.glass && !face.pictureUrl && face.colour) {
    const painted = new MeshLambertNodeMaterial({
      color: new Color(face.colour),
      side: DoubleSide,
      ...FACES_OVER_FLOOR,
    });
    cover(painted, 'lit');
    return painted;
  }
  const material =
    face.glass || !face.pictureUrl
      ? new MeshBasicNodeMaterial({
          color: GLASS_COLOUR,
          transparent: true,
          opacity: GLASS_OPACITY,
          depthWrite: false,
          side: DoubleSide,
          ...FACES_OVER_FLOOR,
        })
      : new MeshLambertNodeMaterial({ side: DoubleSide, transparent: true, alphaTest: 0.01, ...FACES_OVER_FLOOR });
  if (!face.glass && face.pictureUrl) material.map = pictureOf(face.pictureUrl, face.tilePx > 0);
  cover(material, face.glass || !face.pictureUrl ? 'unlit' : 'lit');
  return material;
}
