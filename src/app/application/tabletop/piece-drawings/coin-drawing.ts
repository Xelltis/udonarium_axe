import type { DrawnPlace, GridLook, PiecePictures } from '@axe/application/tabletop/piece-drawings/piece-drawing';
import type { PlayingPose } from '@axe/application/tabletop/piece-motions.service';
import type { Coin } from '@axe/domain/coin/coin';
import { tableCoinOf, type TableWorldCoin } from '@axe/domain/tabletop/world/table-coins';

/** What every coin is drawn with alike: how big a cell is, and how the coins playing a move lie now. */
export interface CoinLook extends GridLook {
  readonly poses: ReadonlyMap<string, PlayingPose>;
}

/** How many cells across a coin is drawn, one of no size as one. */
export function coinSizeOf(coin: Coin): number {
  return coin.size > 0 ? coin.size : 1;
}

/** A coin drawn at a place: a disc with the side it landed on turned out, flipping where a move has it. */
export function drawCoin(
  coin: Coin,
  place: DrawnPlace,
  { gridSize, poses }: CoinLook,
  pictures: PiecePictures
): TableWorldCoin[] {
  const drawn = tableCoinOf({
    id: coin.identifier,
    ...place,
    sizePx: coinSizeOf(coin) * gridSize,
    rotateDeg: coin.rotate,
    backUp: poses.get(coin.identifier)?.backUp ?? coin.face === 'back',
    frontPictureUrl: pictures.urlOf(coin.frontImage),
    backPictureUrl: pictures.urlOf(coin.backImage),
  });
  const playing = poses.get(coin.identifier);
  if (!drawn) return [];
  return [playing ? { ...drawn, motion: playing.pose } : drawn];
}
