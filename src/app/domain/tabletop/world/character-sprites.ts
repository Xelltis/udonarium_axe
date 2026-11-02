import { SurfaceFrame } from '@axe/domain/tabletop/surface-space';
import {
  lyingPicture,
  PagePicture,
  pointOnFace,
  TableWorldSprite,
  turnedOnFace,
} from '@axe/domain/tabletop/world/table-sprites';

/** The alias a character is known by. */
export const CHARACTER_KIND = 'character';

/** How far the page lifts a character off the face it stands on, so it is drawn over what lies flat there. */
const LIFT_PX = 1;

/** A character on the table, as much of it as the canvas draws. */
export interface CharacterLayout {
  readonly id: string;
  /** The face it stands on, and whether that is the floor, where its picture stands up. */
  readonly frame: SurfaceFrame;
  readonly onFloor: boolean;
  /** Where its corner stands on the face, and how far off the face, in table pixels. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** How wide its cell is, in table pixels. */
  readonly sizePx: number;
  readonly rotateDeg: number;
  /** How high its picture floats over its pedestal, in table pixels. */
  readonly altitudePx: number;
  /** The picture the page takes of the pedestal it stands on, which the canvas draws it only with. */
  readonly pedestal: PagePicture | null;
  /** Its picture and how big that is, or null where it has none yet. */
  readonly picture: { readonly url: string; readonly width: number; readonly height: number } | null;
  /** How tall its picture is asked to be, and how wide apart from that, or null where it is not. */
  readonly pictureHeightPx: number | null;
  readonly pictureWidthPx: number | null;
  /** Whether its picture is held inside its cell, as on a table seen from straight above. */
  readonly fitsInCell: boolean;
  /** Whether its picture turns to face the reader, where it stands up. */
  readonly facesEye: boolean;
  /** How opaque its picture is drawn, as less for a piece in stealth. */
  readonly opacity: number;
}

/** How wide and tall a picture is drawn: held inside a square, or at the height or width asked. */
function pictureSize(character: CharacterLayout, width: number, height: number): { w: number; h: number } {
  const size = character.sizePx;
  if (character.fitsInCell || !character.onFloor) {
    const scale = Math.min(size / width, size / height);
    return { w: width * scale, h: height * scale };
  }
  if (character.pictureHeightPx !== null) {
    const h = character.pictureHeightPx;
    return { w: character.pictureWidthPx ?? (h * width) / height, h };
  }
  return { w: size, h: (size * height) / width };
}

/**
 * The sprites a character is drawn with: the pedestal lying on its face, turned as the piece is,
 * and its picture. On the floor the picture stands up from the middle of the pedestal at its
 * altitude, turned to the reader or square to the piece; on a wall or a board it lies on the face
 * inside the pedestal, as a poster does. Nothing is drawn of a character whose pedestal the page
 * does not hand over, as while the page draws the piece itself.
 */
export function characterSprites(character: CharacterLayout): TableWorldSprite[] {
  const pedestal = character.pedestal;
  const size = character.sizePx;
  if (!pedestal || !(size > 0)) return [];
  const axes = turnedOnFace(character.frame, character.rotateDeg);
  const middleAcross = character.x + size / 2;
  const middleDown = character.y + size / 2;
  const out = character.z + LIFT_PX;
  const sprites: TableWorldSprite[] = [
    {
      ...lyingPicture(
        { id: character.id, kind: CHARACTER_KIND, frame: character.frame, x: character.x, y: character.y },
        out,
        pedestal
      ),
      id: `${character.id}#pedestal`,
      centre: pointOnFace(character.frame, middleAcross, middleDown, out),
      facing: axes,
    },
  ];
  const picture = character.picture;
  if (!picture || !(picture.width > 0) || !(picture.height > 0)) return sprites;
  const { w, h } = pictureSize(character, picture.width, picture.height);
  const base = {
    id: `${character.id}#picture`,
    owner: character.id,
    kind: CHARACTER_KIND,
    widthPx: w,
    heightPx: h,
    look: { kind: 'picture', url: picture.url } as const,
    brightness: 1,
    ...(character.opacity < 1 ? { opacity: character.opacity } : {}),
    twoSided: true,
    seeThrough: true,
  };
  if (character.onFloor) {
    const normal = character.frame.normal;
    const rise = character.fitsInCell ? size / 2 : h / 2;
    sprites.push({
      ...base,
      centre: pointOnFace(character.frame, middleAcross, middleDown, out + character.altitudePx + rise),
      facing: character.facesEye ? 'eye' : { across: axes.across, down: { x: -normal.x, y: -normal.y, z: -normal.z } },
    });
  } else {
    sprites.push({
      ...base,
      centre: pointOnFace(character.frame, middleAcross, middleDown, out),
      facing: axes,
      order: out,
    });
  }
  return sprites;
}
