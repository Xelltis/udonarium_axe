import type { TableWorldSheet } from '@axe/domain/tabletop/world/table-world';
import { FACES_OVER_FLOOR, LAID_OVER_FACES, SHEETS_OVER_FACES } from '@axe/infrastructure/table-3d/floor-order';
import type { DarknessTaking } from '@axe/infrastructure/table-3d/veil';
import {
  BackSide,
  Color,
  DoubleSide,
  FrontSide,
  type Material,
  MeshBasicNodeMaterial,
  MeshLambertNodeMaterial,
  type Texture,
} from 'three/webgpu';

/**
 * What a face wears: the picture, how it is laid, and whether it is glass, or else the colour it is
 * painted; and, for a face of a block with no thickness, how it is drawn as a sheet, with the way it
 * looks where it lies flat.
 */
export type FaceLook = {
  pictureUrl: string;
  tilePx: number;
  glass: boolean;
  colour?: string;
  laidOver?: boolean;
  sheet?: TableWorldSheet;
  facing?: 'up' | 'down';
};

/** The sides of its shape a face is drawn from, as part of the key its material is shared by. */
type DrawnFrom = 'front' | 'back' | 'both';

const SIDES = { front: FrontSide, back: BackSide, both: DoubleSide } as const;

/** What the key of a sheet's look begins with, before the sides it is drawn from. */
const SHEET_KEY = 'sheet-';

/**
 * The sides of its shape a face is drawn from. Every face is drawn from both but a sheet's seen from
 * outside only: an upright one from its front, as the sides of a block are wound facing out, and a
 * flat one from its back where it looks up and its front where it looks down, as every flat face is
 * wound facing down.
 */
function drawnFrom(face: FaceLook): DrawnFrom {
  if (face.sheet !== 'outside') return 'both';
  return face.facing === 'up' ? 'back' : 'front';
}

/** How a glass face is drawn: a pale blue, mostly clear. */
const GLASS_COLOUR = 0xcfe6ff;
const GLASS_OPACITY = 0.25;

/** The key faces drawn with one material share. */
export function lookOf(face: FaceLook): string {
  if (face.sheet && !face.laidOver) return `${SHEET_KEY}${drawnFrom(face)}|${lookOf({ ...face, sheet: undefined })}`;
  if (face.laidOver) return `over|${face.pictureUrl}`;
  if (!face.glass && !face.pictureUrl && face.colour) return `colour|${face.colour}`;
  return face.glass || !face.pictureUrl ? 'glass' : `${face.pictureUrl}|${face.tilePx > 0}`;
}

/** The picture the faces sharing a key wear, or null for glass and for a painted colour, which wear none. */
export function pictureOfLook(look: string): string | null {
  if (look.startsWith(SHEET_KEY)) return pictureOfLook(look.slice(look.indexOf('|') + 1));
  if (look === 'glass' || look.startsWith('colour|')) return null;
  if (look.startsWith('over|')) return look.slice('over|'.length);
  return look.slice(0, look.lastIndexOf('|'));
}

/**
 * The material a face of a block or of the table's walls is drawn with: the picture laid over another
 * face, the colour it is painted, glass, or its picture, tiled or stretched. Every face is drawn
 * ahead of the board, so the top of a block made as high as nothing hides the board it lies on, a
 * face of a block with no thickness ahead of the face of another it lies against, and a picture laid
 * over a face ahead of that face. A sheet's face with another of its block a hair behind it is drawn
 * from outside only, so the two do not show through each other.
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
  const side = SIDES[drawnFrom(face)];
  const order = face.sheet ? SHEETS_OVER_FACES : FACES_OVER_FLOOR;
  if (!face.glass && !face.pictureUrl && face.colour) {
    const painted = new MeshLambertNodeMaterial({ color: new Color(face.colour), side, ...order });
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
          side,
          ...order,
        })
      : new MeshLambertNodeMaterial({ side, transparent: true, alphaTest: 0.01, ...order });
  if (!face.glass && face.pictureUrl) material.map = pictureOf(face.pictureUrl, face.tilePx > 0);
  cover(material, face.glass || !face.pictureUrl ? 'unlit' : 'lit');
  return material;
}
