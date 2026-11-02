import { SurfaceFrame } from '@axe/domain/tabletop/surface-space';
import { PagePicture, pointOnFace, TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';

/** The alias a light source is known by. */
export const LIGHT_SOURCE_KIND = 'light-source';

/** How far the page lifts a light off the face it stands on. */
const LIFT_PX = 0.25;

/** How clear a light is drawn while it is put out. */
const PUT_OUT_OPACITY = 0.4;

/** A light source on the table, as much of it as is drawn. */
export interface LightSourceLayout {
  readonly id: string;
  readonly frame: SurfaceFrame;
  /** Where its corner stands on the face, and how far off the face, in table pixels. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** How high it floats off its place, in table pixels. */
  readonly altitudePx: number;
  /** The side of the cell it stands in, in table pixels. */
  readonly cellPx: number;
  /** Whether it is lit, which it is drawn clear of while not. */
  readonly lit: boolean;
  /** The picture the page takes of what marks the light, its own picture or a bulb. */
  readonly picture: PagePicture | null;
}

/**
 * The sprite a light is drawn with: the picture of what marks it, turned to the reader, its middle
 * half a cell over the light's altitude, which the page lifts it by again for how far the light
 * stands off the face.
 */
export function lightSourceSprites(light: LightSourceLayout): TableWorldSprite[] {
  const picture = light.picture;
  if (!picture || !(picture.widthPx > 0) || !(picture.heightPx > 0)) return [];
  const out = light.z + LIFT_PX + light.altitudePx + light.z + light.cellPx / 2;
  return [
    {
      id: `${light.id}#mark`,
      owner: light.id,
      kind: LIGHT_SOURCE_KIND,
      centre: pointOnFace(light.frame, light.x + light.cellPx / 2, light.y + light.cellPx / 2, out),
      widthPx: picture.widthPx,
      heightPx: picture.heightPx,
      facing: 'eye',
      look: { kind: 'picture', url: picture.url },
      brightness: 1,
      ...(light.lit ? {} : { opacity: PUT_OUT_OPACITY }),
      twoSided: true,
    },
  ];
}
