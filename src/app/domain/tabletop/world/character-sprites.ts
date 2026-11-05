import { SurfaceFrame, Vec3 } from '@axe/domain/tabletop/surface-space';
import { SurfaceLean } from '@axe/domain/tabletop/terrain-slope-surface';
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
  /**
   * How far it is tipped over sideways, in degrees, which swings its picture about the middle of
   * its cell's height over its pedestal.
   */
  readonly rollDeg: number;
  /** Whether it casts a shadow of its picture on the face it stands on. */
  readonly dropShadow: boolean;
  /**
   * How the ground under it leans, which what lies on the ground (its pedestal, its shadow and a
   * picture laid as a poster) takes, or null where it is level.
   */
  readonly lean: SurfaceLean | null;
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
  /**
   * Whether its picture, turned to face the reader, is turned again as far as the piece is turned,
   * as on a table seen from above that shows which way a piece faces by turning its picture.
   */
  readonly turnsWithPiece?: boolean;
  /** How opaque its picture is drawn, as less for a piece in stealth. */
  readonly opacity: number;
}

/**
 * Where a character standing on the floor is tipped over about when it is rolled: the middle of its
 * cell's height over the middle of its pedestal, at its altitude. Null for one on a wall or a board,
 * whose picture lies on the face.
 */
export function characterRollPivot(
  character: Pick<CharacterLayout, 'frame' | 'onFloor' | 'x' | 'y' | 'z' | 'sizePx' | 'altitudePx'>
): Vec3 | null {
  if (!character.onFloor) return null;
  const size = character.sizePx;
  return pointOnFace(
    character.frame,
    character.x + size / 2,
    character.y + size / 2,
    character.z + LIFT_PX + character.altitudePx + size / 2
  );
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

/** A direction made of a piece's own directions, across it, down it and out of its face. */
function along(axes: { across: Vec3; down: Vec3; out: Vec3 }, a: number, d: number, o: number): Vec3 {
  return {
    x: axes.across.x * a + axes.down.x * d + axes.out.x * o,
    y: axes.across.y * a + axes.down.y * d + axes.out.y * o,
    z: axes.across.z * a + axes.down.z * d + axes.out.z * o,
  };
}

/**
 * A piece's directions across, down and out of the face, leant as the ground under it leans: the
 * page leans what lies on the ground in the piece's own turned directions, climbing as far across
 * it as the ground climbs to the east and as far down it as the ground climbs to the south.
 */
function leaned(axes: { across: Vec3; down: Vec3; out: Vec3 }, lean: SurfaceLean | null) {
  if (!lean) return axes;
  const east = Math.atan(lean.eastward);
  const south = Math.atan(lean.southward);
  return {
    across: along(axes, Math.cos(east), 0, Math.sin(east)),
    down: along(axes, -Math.sin(east) * Math.sin(south), Math.cos(south), Math.cos(east) * Math.sin(south)),
    out: along(axes, -Math.sin(east) * Math.cos(south), -Math.sin(south), Math.cos(east) * Math.cos(south)),
  };
}

/** How dark and how clear the shadow a character casts is drawn. */
const SHADOW_OPACITY = 0.7;

/**
 * Where the shadow of a character's picture lies within its cell, and how big it is, in table
 * pixels across and down the cell from its corner: the picture squashed to half its height, as the
 * page squashes it. A picture held inside its cell is squashed over the far half of the cell; one
 * as wide as the cell ends at the cell's middle; one of a height asked for ends half a cell past its
 * middle less that height, as the page lays it.
 */
function shadowOf(character: CharacterLayout, width: number, height: number) {
  const size = character.sizePx;
  if (character.fitsInCell) {
    const scale = Math.min(size / width, size / height);
    return { across: size / 2, down: size / 4, w: width * scale, h: (height * scale) / 2, box: size };
  }
  if (character.pictureHeightPx !== null) {
    const tall = character.pictureHeightPx;
    const w = character.pictureWidthPx ?? (tall * width) / height;
    return { across: size / 2, down: 1.5 * size - 1.25 * tall, w, h: tall / 2, box: tall };
  }
  const tall = (size * height) / width;
  return { across: size / 2, down: size / 2 - tall / 4, w: size, h: tall / 2, box: tall };
}

/** Whether the picture of a pedestal reaches past the cell the piece stands on. */
function reachesPast(pedestal: PagePicture, size: number): boolean {
  return (
    (pedestal.offsetX ?? 0) !== 0 ||
    (pedestal.offsetY ?? 0) !== 0 ||
    pedestal.widthPx !== size ||
    pedestal.heightPx !== size
  );
}

/**
 * The sprites a character is drawn with: the pedestal lying on its face, turned as the piece is,
 * the shadow of its picture where it casts one, and its picture. On the floor the picture stands
 * up from the middle of the pedestal at its altitude, turned to the reader or square to the piece,
 * and tipped over sideways as far as the piece is, about the middle of its cell's height; on a wall
 * or a board it lies on the face inside the pedestal, as a poster does. Nothing is drawn of a
 * character whose pedestal the page does not hand over, as while the page draws the piece itself.
 * A picture of the pedestal reaching past the cell, as for the mark of which way the piece faces,
 * lies as far off the cell's middle as it reaches, turned with the piece.
 */
export function characterSprites(character: CharacterLayout): TableWorldSprite[] {
  const pedestal = character.pedestal;
  const size = character.sizePx;
  if (!pedestal || !(size > 0)) return [];
  const axes = turnedOnFace(character.frame, character.rotateDeg);
  const ground = leaned({ ...axes, out: character.frame.normal }, character.lean);
  const middleAcross = character.x + size / 2;
  const middleDown = character.y + size / 2;
  const out = character.z + LIFT_PX;
  const middle = pointOnFace(character.frame, middleAcross, middleDown, out);
  const off = along(
    { ...ground, out: character.frame.normal },
    (pedestal.offsetX ?? 0) + pedestal.widthPx / 2 - size / 2,
    (pedestal.offsetY ?? 0) + pedestal.heightPx / 2 - size / 2,
    0
  );
  const sprites: TableWorldSprite[] = [
    {
      ...lyingPicture(
        { id: character.id, kind: CHARACTER_KIND, frame: character.frame, x: character.x, y: character.y },
        out,
        pedestal
      ),
      id: `${character.id}#pedestal`,
      centre: { x: middle.x + off.x, y: middle.y + off.y, z: middle.z + off.z },
      facing: { across: ground.across, down: ground.down },
      ...(reachesPast(pedestal, size)
        ? { box: { left: 0 - (pedestal.offsetX ?? 0), top: 0 - (pedestal.offsetY ?? 0), width: size, height: size } }
        : {}),
    },
  ];
  const picture = character.picture;
  if (!picture || !(picture.width > 0) || !(picture.height > 0)) return sprites;
  if (character.dropShadow) {
    const shadow = shadowOf(character, picture.width, picture.height);
    const middle = pointOnFace(character.frame, middleAcross, middleDown, out);
    // The page leans the shadow about the middle of the picture's box, from which the squashed
    // shadow lies three quarters of the box's height less half the cell back up the face.
    const pivot = along(
      { ...axes, out: character.frame.normal },
      0,
      shadow.down - size / 2 + (3 * shadow.box) / 4 - size / 2,
      0
    );
    const back = along(ground, 0, size / 2 - (3 * shadow.box) / 4, 0);
    sprites.push({
      id: `${character.id}#shadow`,
      owner: character.id,
      kind: CHARACTER_KIND,
      centre: { x: middle.x + pivot.x + back.x, y: middle.y + pivot.y + back.y, z: middle.z + pivot.z + back.z },
      widthPx: shadow.w,
      heightPx: shadow.h,
      facing: { across: ground.across, down: ground.down },
      look: { kind: 'picture', url: picture.url },
      brightness: 0,
      opacity: SHADOW_OPACITY,
      twoSided: false,
      order: out,
    });
  }
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
    const roll = (character.rollDeg * Math.PI) / 180;
    const cos = Math.cos(roll);
    const sin = Math.sin(roll);
    const across = {
      x: axes.across.x * cos - normal.x * sin,
      y: axes.across.y * cos - normal.y * sin,
      z: axes.across.z * cos - normal.z * sin,
    };
    const down = {
      x: -axes.across.x * sin - normal.x * cos,
      y: -axes.across.y * sin - normal.y * cos,
      z: -axes.across.z * sin - normal.z * cos,
    };
    const pivot = characterRollPivot(character)!;
    const below = size / 2 - (character.fitsInCell ? size / 2 : h / 2);
    sprites.push({
      ...base,
      centre: { x: pivot.x + down.x * below, y: pivot.y + down.y * below, z: pivot.z + down.z * below },
      facing: character.facesEye ? 'eye' : { across, down },
      ...(character.facesEye && character.turnsWithPiece ? { turn: { axis: normal, deg: character.rotateDeg } } : {}),
    });
  } else {
    sprites.push({
      ...base,
      centre: pointOnFace(character.frame, middleAcross, middleDown, out),
      facing: { across: ground.across, down: ground.down },
      order: out,
    });
  }
  return sprites;
}
