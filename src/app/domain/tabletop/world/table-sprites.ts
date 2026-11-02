import type { Matrix3D } from '@axe/core/transform/matrix-3d';
import { TablePoint } from '@axe/domain/tabletop/camera/table-camera';
import { SurfaceFrame, Vec3 } from '@axe/domain/tabletop/surface-space';

/** A band of colour round the inside of a sprite's edge, drawn over the bands before it. */
export interface TableWorldBand {
  readonly widthPx: number;
  /** A colour as the page writes one. */
  readonly colour: string;
}

/** What a sprite shows: a picture, or bands of colour round its edge with nothing inside them. */
export type TableWorldLook =
  | { readonly kind: 'picture'; readonly url: string }
  | { readonly kind: 'frame'; readonly bands: readonly TableWorldBand[]; readonly radiusPx: number };

/**
 * How a sprite lies: along two directions of the board's space, across it and down it, or turned
 * square to the eye however the camera is turned, as a picture that faces the reader is.
 */
export type TableWorldSpriteFacing = 'eye' | { readonly across: Vec3; readonly down: Vec3 };

/**
 * A flat four-cornered thing a piece is drawn with, such as its picture or the frame it stands in,
 * in table pixels.
 */
export interface TableWorldSprite {
  /** Which sprite it is, apart from every other in the scene. */
  readonly id: string;
  /** The identifier of the object it is a part of. */
  readonly owner: string;
  /** What kind of object that is, as its alias names it. */
  readonly kind: string;
  readonly centre: Vec3;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly facing: TableWorldSpriteFacing;
  readonly look: TableWorldLook;
  /** How bright it is drawn, from black at 0 to its own colours at 1, as the page dims a piece. */
  readonly brightness: number;
  /** How opaque it is drawn, 1 where it is not given. */
  readonly opacity?: number;
  /** Whether it shows from behind as well as from in front. */
  readonly twoSided: boolean;
  /**
   * For a sprite lying flat on a face, how far off the face the page lifts it, which says which of
   * the sprites lying in one place is drawn over which: the higher over the lower, and of two as
   * high the later over the earlier. A sprite that stands up from its face has none.
   */
  readonly order?: number;
}

/** Which way the eye's right and the eye's up run in the board's space. */
export interface EyeAxes {
  readonly right: Vec3;
  readonly up: Vec3;
}

function unit(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/**
 * The eye's right and up in the board's space, from the matrix that carries the board into the
 * eye's space (`tableEyeMatrix`). The camera turns the board and an orthographic view scales it
 * across the page, so each is read off that matrix's turn and set to a length of one.
 */
export function eyeAxesOf(eye: Matrix3D): EyeAxes {
  return {
    right: unit({ x: eye.m11, y: eye.m21, z: eye.m31 }),
    up: unit({ x: -eye.m12, y: -eye.m22, z: -eye.m32 }),
  };
}

/** The directions a sprite runs across and down, given which way the eye looks. */
export function spriteAxes(sprite: TableWorldSprite, eye: EyeAxes): { across: Vec3; down: Vec3 } {
  if (sprite.facing !== 'eye') return sprite.facing;
  return { across: eye.right, down: { x: -eye.up.x, y: -eye.up.y, z: -eye.up.z } };
}

/**
 * A sprite's corners, round in order from the top left: across, then down, then back, as a
 * picture laid on it is read.
 */
export function spriteCorners(
  sprite: TableWorldSprite,
  eye: EyeAxes
): [TablePoint, TablePoint, TablePoint, TablePoint] {
  const { across, down } = spriteAxes(sprite, eye);
  const halfWidth = sprite.widthPx / 2;
  const halfHeight = sprite.heightPx / 2;
  const corner = (a: number, d: number): TablePoint => ({
    x: sprite.centre.x + across.x * a + down.x * d,
    y: sprite.centre.y + across.y * a + down.y * d,
    z: sprite.centre.z + across.z * a + down.z * d,
  });
  return [
    corner(-halfWidth, -halfHeight),
    corner(halfWidth, -halfHeight),
    corner(halfWidth, halfHeight),
    corner(-halfWidth, halfHeight),
  ];
}

/** A point of a face carried into the board's space: across it, down it, and out of it into the room. */
export function pointOnFace(frame: SurfaceFrame, across: number, down: number, out = 0): Vec3 {
  return {
    x: frame.origin.x + frame.u.x * across + frame.v.x * down + frame.normal.x * out,
    y: frame.origin.y + frame.u.y * across + frame.v.y * down + frame.normal.y * out,
    z: frame.origin.z + frame.u.z * across + frame.v.z * down + frame.normal.z * out,
  };
}

/**
 * A face's directions across and down, turned in the face by an angle in degrees, the way the page
 * turns a piece on it: clockwise as the face is seen from the room.
 */
export function turnedOnFace(frame: SurfaceFrame, degrees: number): { across: Vec3; down: Vec3 } {
  const turn = (degrees * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const mix = (a: Vec3, b: Vec3, p: number, q: number): Vec3 => ({
    x: a.x * p + b.x * q,
    y: a.y * p + b.y * q,
    z: a.z * p + b.z * q,
  });
  return { across: mix(frame.u, frame.v, cos, sin), down: mix(frame.u, frame.v, -sin, cos) };
}

/** A picture the page takes of a part of a piece, and where the part lies off the piece's corner. */
export interface PagePicture {
  readonly url: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
}

/**
 * The sprite of a piece drawn flat from the picture the page takes of it: lying on the face the
 * piece lies on, as far off the face as given, the picture's corner as far off the piece's corner as
 * the page lays it, and in the order of how far off the face it lies.
 */
export function lyingPicture(
  piece: {
    readonly id: string;
    readonly kind: string;
    readonly frame: SurfaceFrame;
    readonly x: number;
    readonly y: number;
  },
  out: number,
  picture: PagePicture
): TableWorldSprite {
  const across = piece.x + (picture.offsetX ?? 0) + picture.widthPx / 2;
  const down = piece.y + (picture.offsetY ?? 0) + picture.heightPx / 2;
  return {
    id: `${piece.id}#picture`,
    owner: piece.id,
    kind: piece.kind,
    centre: pointOnFace(piece.frame, across, down, out),
    widthPx: picture.widthPx,
    heightPx: picture.heightPx,
    facing: turnedOnFace(piece.frame, 0),
    look: { kind: 'picture', url: picture.url },
    brightness: 1,
    twoSided: false,
    order: out,
  };
}
