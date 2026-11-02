import { SurfaceFrame } from '@axe/domain/tabletop/surface-space';
import { pointOnFace, TableWorldSprite, turnedOnFace } from '@axe/domain/tabletop/world/table-sprites';

/** The alias a die is known by, which its sprites are told apart by. */
export const DICE_SYMBOL_KIND = 'dice-symbol';

/** How far the page lifts a die off the face it stands on, so it is drawn over what lies flat there. */
const LIFT_PX = 1;

/** The frame a die stands in: a band of its own colour inside a thin dark rim. */
const FRAME_BAND_PX = 6;
const FRAME_RIM_PX = 2;
const FRAME_RIM_COLOUR = '#212121';
const FRAME_RADIUS_PX = 5;
/** The frame's colour while the die is nobody's. */
export const DICE_FRAME_COLOUR = 'rgb(216, 139, 75)';

/** A die on the table, as much of it as is drawn. */
export interface DiceSymbolLayout {
  readonly id: string;
  /** The face it stands on, the floor, a wall or a white board. */
  readonly frame: SurfaceFrame;
  /** Whether that face is the floor, where the picture stands up; elsewhere it lies on the face. */
  readonly onFloor: boolean;
  /** Where its corner stands on the face, and how far off the face, in table pixels. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly sizePx: number;
  /** How far it is turned on the face, in degrees. */
  readonly rotateDeg: number;
  /** The picture of the face it shows, and how big that picture is, or null for none yet. */
  readonly picture: { readonly url: string; readonly width: number; readonly height: number } | null;
  /** How tall its picture is asked to be drawn, or null where the picture is as wide as the die. */
  readonly pictureHeightPx: number | null;
  /** Whether its picture turns to face the reader, where it stands up. */
  readonly facesEye: boolean;
  readonly pictureBrightness: number;
  readonly frameBrightness: number;
  /** The colour of the frame's band. */
  readonly frameColour: string;
}

/**
 * The sprites a die is drawn with: its frame lying on the face it stands on, and the picture of its
 * face. On the floor the picture stands up from the line through the frame's middle, turned to face
 * the reader or standing square to the die; on a wall or a white board it lies on the face, rising
 * from that line, as a poster does.
 */
export function diceSymbolSprites(die: DiceSymbolLayout): TableWorldSprite[] {
  const size = die.sizePx;
  if (!(size > 0)) return [];
  const axes = turnedOnFace(die.frame, die.rotateDeg);
  const middleAcross = die.x + size / 2;
  const middleDown = die.y + size / 2;
  const out = die.z + LIFT_PX;
  const sprites: TableWorldSprite[] = [
    {
      id: `${die.id}#frame`,
      owner: die.id,
      kind: DICE_SYMBOL_KIND,
      centre: pointOnFace(die.frame, middleAcross, middleDown, out),
      widthPx: size,
      heightPx: size,
      facing: axes,
      look: {
        kind: 'frame',
        bands: [
          { widthPx: FRAME_BAND_PX, colour: die.frameColour },
          { widthPx: FRAME_RIM_PX, colour: FRAME_RIM_COLOUR },
        ],
        radiusPx: FRAME_RADIUS_PX,
      },
      brightness: die.frameBrightness,
      twoSided: false,
      order: out,
    },
  ];
  const picture = die.picture;
  if (!picture || !(picture.width > 0) || !(picture.height > 0)) return sprites;
  const height = die.pictureHeightPx !== null ? die.pictureHeightPx : (size * picture.height) / picture.width;
  const width = die.pictureHeightPx !== null ? (die.pictureHeightPx * picture.width) / picture.height : size;
  if (!(width > 0) || !(height > 0)) return sprites;
  const base = {
    id: `${die.id}#picture`,
    owner: die.id,
    kind: DICE_SYMBOL_KIND,
    widthPx: width,
    heightPx: height,
    look: { kind: 'picture', url: picture.url } as const,
    brightness: die.pictureBrightness,
    twoSided: true,
  };
  if (die.onFloor) {
    const normal = die.frame.normal;
    sprites.push({
      ...base,
      centre: pointOnFace(die.frame, middleAcross, middleDown, out + height / 2),
      facing: die.facesEye ? 'eye' : { across: axes.across, down: { x: -normal.x, y: -normal.y, z: -normal.z } },
    });
  } else {
    const middle = pointOnFace(die.frame, middleAcross, middleDown, out);
    sprites.push({
      ...base,
      centre: {
        x: middle.x - (axes.down.x * height) / 2,
        y: middle.y - (axes.down.y * height) / 2,
        z: middle.z - (axes.down.z * height) / 2,
      },
      facing: axes,
      order: out,
    });
  }
  return sprites;
}
