import type { DrawnPlace, GridLook, PiecePictures } from '@axe/application/tabletop/piece-drawings/piece-drawing';
import type { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { DICE_FRAME_COLOUR, diceSymbolSprites } from '@axe/domain/tabletop/world/dice-symbol-sprites';
import type { TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';

/** What every die is drawn with alike. */
export interface DiceLook extends GridLook {
  readonly facesEye: boolean;
  /** Whether this seat may read the faces of the dice kept back from it. */
  readonly seesHidden: boolean;
  /** The colour of the frame of a die that is somebody's. */
  readonly owned: string;
}

/**
 * A die drawn at a place: its frame and the picture of its face, the picture black while this seat
 * may not read it, and both dimmed for a die marked as spent.
 */
export function drawDie(
  die: DiceSymbol,
  place: DrawnPlace,
  { gridSize, facesEye, owned, seesHidden }: DiceLook,
  pictures: PiecePictures
): TableWorldSprite[] {
  const picture = pictures.sized(pictures.urlOf(die.imageFile));
  const reads = die.isOpenTo(seesHidden);
  return diceSymbolSprites({
    id: die.identifier,
    ...place,
    sizePx: Math.max(0, die.size) * gridSize,
    rotateDeg: die.rotate,
    picture,
    pictureHeightPx: die.specifyKomaImageFlag ? +die.komaImageHeight : null,
    facesEye,
    pictureBrightness: !reads ? 0 : die.isMine ? 0.5 : die.isUsed ? 0.45 : 1,
    frameBrightness: die.isUsed ? 0.45 : 1,
    frameColour: die.hasOwner ? owned : DICE_FRAME_COLOUR,
  });
}
