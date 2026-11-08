import { SurfaceFrame } from '@axe/domain/tabletop/surface-space';
import type { MotionPose } from '@axe/domain/tabletop/world/piece-motions';

/** The alias a coin is known by. */
export const COIN_KIND = 'coin';

/** How far the page lifts a coin off the face it lies on, so it is drawn over what lies flat there. */
const LIFT_PX = 0.15;

/** How thick a coin is against how wide, and how thin it may get at the least, in table pixels. */
const THICKNESS_RATIO = 0.11;
const MIN_THICKNESS_PX = 5;

/** One side of a coin: which it is, and the picture it shows, or nothing where it shows its emblem. */
export interface TableWorldCoinSide {
  readonly side: 'front' | 'back';
  readonly pictureUrl: string;
}

/** A coin lying on a face: a disc as thick as a coin is, its two sides and its rim. */
export interface TableWorldCoin {
  readonly id: string;
  /** The face it lies on. */
  readonly face: SurfaceFrame;
  /** Where its middle stands on the face, and how far off the face its underside is, in table pixels. */
  readonly x: number;
  readonly y: number;
  readonly base: number;
  readonly radiusPx: number;
  readonly thicknessPx: number;
  /** How far it is turned in the face, in degrees. */
  readonly rotateDeg: number;
  /** The side turned out of the face, read from the room, and the side against it, read from behind. */
  readonly outer: TableWorldCoinSide;
  readonly inner: TableWorldCoinSide;
  /** Whether it lies back up, which turns its rim over with it. */
  readonly backUp: boolean;
  /**
   * Where a move it is playing has it now, as it flips: lifted off its face, grown, and turned over
   * the line running down its face. At rest where not given.
   */
  readonly motion?: MotionPose;
}

/** A coin on the table, as much of it as is drawn. */
export interface CoinLayout {
  readonly id: string;
  readonly frame: SurfaceFrame;
  /** Where its corner stands on the face, and how far off the face, in table pixels. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** How wide it is, in table pixels. */
  readonly sizePx: number;
  readonly rotateDeg: number;
  /** Whether it shows its back, as it does once it lands that way up. */
  readonly backUp: boolean;
  readonly frontPictureUrl: string;
  readonly backPictureUrl: string;
}

/** How a coin is drawn: a disc as wide as the coin, lying on its face with the side it landed on turned out. */
export function tableCoinOf(coin: CoinLayout): TableWorldCoin | null {
  if (!(coin.sizePx > 0)) return null;
  const front: TableWorldCoinSide = { side: 'front', pictureUrl: coin.frontPictureUrl };
  const back: TableWorldCoinSide = { side: 'back', pictureUrl: coin.backPictureUrl };
  return {
    id: coin.id,
    face: coin.frame,
    x: coin.x + coin.sizePx / 2,
    y: coin.y + coin.sizePx / 2,
    base: coin.z + LIFT_PX,
    radiusPx: coin.sizePx / 2,
    thicknessPx: Math.max(MIN_THICKNESS_PX, coin.sizePx * THICKNESS_RATIO),
    rotateDeg: coin.rotateDeg,
    outer: coin.backUp ? back : front,
    inner: coin.backUp ? front : back,
    backUp: coin.backUp,
  };
}
