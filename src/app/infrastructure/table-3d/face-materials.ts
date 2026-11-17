import type { TableWorldSheet } from '@axe/domain/tabletop/world/table-world';
import {
  FACES_OVER_FLOOR,
  LAID_OVER_FACES,
  SHEETS_OVER_FACES,
  withoutSlant,
} from '@axe/infrastructure/table-3d/floor-order';
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
 * painted; for a face of a block with no thickness, how it is drawn as a sheet; and how the face
 * lies: the way it looks where it lies flat, which an upright face has none of, the heights of its
 * corners where it is a piece of a slope, and whether it lies in the plane of the floor.
 */
export type FaceLook = {
  pictureUrl: string;
  tilePx: number;
  glass: boolean;
  colour?: string;
  laidOver?: boolean;
  sheet?: TableWorldSheet;
  facing?: 'up' | 'down';
  heights?: readonly number[];
  onFloor?: boolean;
};

/** Whether a face lies level, rather than standing upright or running down a slope. */
function liesLevel(face: FaceLook): boolean {
  const heights = face.heights ?? [];
  return face.facing !== undefined && heights.every((height) => height === heights[0]);
}

/**
 * Whether a face is pulled ahead by how steeply it is seen as well as by the depth's steps: a face
 * lying level in the plane of the floor or against another lying level, as a sheet's flat face and
 * the top of a block sunk to the floor do, which a slant the same as the other's would not tell
 * apart from it. Every other face is pulled by the steps alone, so where two faces of the blocks
 * meet at an edge the one nearer is drawn there, however steeply either is seen.
 */
function pulledBySlant(face: FaceLook): boolean {
  return (face.sheet !== undefined || face.onFloor === true) && liesLevel(face);
}

/** The sides of its shape a face is drawn from, as part of the key its material is shared by. */
type DrawnFrom = 'front' | 'back' | 'both';

const SIDES = { front: FrontSide, back: BackSide, both: DoubleSide } as const;

/** What the key of a sheet's look begins with, before the sides it is drawn from. */
const SHEET_KEY = 'sheet-';

/** What the key of the look of a face pulled ahead by its slant begins with, after a sheet's sides. */
const SLANT_KEY = 'slant|';

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
  if (face.laidOver) return `over|${face.pictureUrl}`;
  const pulled = pulledBySlant(face) ? `${SLANT_KEY}${wornOf(face)}` : wornOf(face);
  return face.sheet ? `${SHEET_KEY}${drawnFrom(face)}|${pulled}` : pulled;
}

/** The part of a face's key that tells what it wears. */
function wornOf(face: FaceLook): string {
  if (!face.glass && !face.pictureUrl && face.colour) return `colour|${face.colour}`;
  return face.glass || !face.pictureUrl ? 'glass' : `${face.pictureUrl}|${face.tilePx > 0}`;
}

/** The picture the faces sharing a key wear, or null for glass and for a painted colour, which wear none. */
export function pictureOfLook(look: string): string | null {
  if (look.startsWith(SHEET_KEY)) return pictureOfLook(look.slice(look.indexOf('|') + 1));
  if (look.startsWith(SLANT_KEY)) return pictureOfLook(look.slice(SLANT_KEY.length));
  if (look === 'glass' || look.startsWith('colour|')) return null;
  if (look.startsWith('over|')) return look.slice('over|'.length);
  return look.slice(0, look.lastIndexOf('|'));
}

/**
 * The material a face of a block or of the table's walls is drawn with: the picture laid over another
 * face, the colour it is painted, glass, or its picture, tiled or stretched. Every face is drawn
 * ahead of the board, so the top of a block made as high as nothing hides the board it lies on, a
 * face of a block with no thickness ahead of the face of another it lies against, and a picture laid
 * over a face ahead of that face. Only a face lying level in the plane of the floor or against
 * another is pulled ahead by how steeply it is seen as well; see {@link pulledBySlant}. A sheet's
 * face with another of its block a hair behind it is drawn from outside only, so the two do not
 * show through each other.
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
  const pull = face.sheet ? SHEETS_OVER_FACES : FACES_OVER_FLOOR;
  const order = pulledBySlant(face) ? pull : withoutSlant(pull);
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
