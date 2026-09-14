import { ImageContext, ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ImageTag, SYSTEM_RESERVED_TAG } from '@axe/domain/media/image-tag';

const AVRIL_DICE_IMAGES = [
  '1d4_dice[00]',
  '1d4_dice[01]',
  '1d4_dice[02]',
  '1d4_dice[03]',
  '1d6_dice[00]',
  '1d6_dice[01]',
  '1d6_dice[02]',
  '1d6_dice[03]',
  '2d6_dice[00]',
  '2d6_dice[01]',
  '2d6_dice[02]',
  '2d6_dice[03]',
  '1d8_dice[00]',
  '1d8_dice[01]',
  '1d8_dice[02]',
  '1d8_dice[03]',
  '1d10_dice[00]',
  '1d10_dice[01]',
  '1d10_dice[02]',
  '1d10_dice[03]',
  '1d12_dice[00]',
  '1d12_dice[01]',
  '1d12_dice[02]',
  '1d12_dice[03]',
  '1d20_dice[00]',
  '1d20_dice[01]',
  '1d20_dice[02]',
  '1d20_dice[03]',
  '1d100_dice[00]',
  '1d100_dice[01]',
  '1d100_dice[02]',
  '1d100_dice[03]',
];

const AVRIL_IMAGES = ['april[00]', 'april[01]'];

function addSystemImage(imageStorage: ImageStorage, id: string, url: string): void {
  const fileContext: ImageContext = ImageFile.createEmpty(id).toContext();
  fileContext.url = url;
  const file = imageStorage.add(fileContext);
  ImageTag.create(file.identifier).tag = SYSTEM_RESERVED_TAG;
}

/**
 * Registers bundled pictures under fixed identifiers, tagged as reserved for the system so the image
 * browsers leave them out: the dice faces from `april_dice` (`1d6_dice[00]` and the like) and
 * `april[00]` and `april[01]`.
 *
 * The fixed identifiers let a chat message name one of these pictures in any room. The dice faces
 * are what `PeerCursor.diceImageIdentifier` names, but nothing in the app sets a dice type, so no
 * message picks one. The `april` folder is no longer shipped, so the two `april[NN]` entries point
 * at files that do not exist.
 */
export function initAprilDiceImages(imageStorage: ImageStorage): void {
  for (const name of AVRIL_DICE_IMAGES) {
    addSystemImage(imageStorage, name, `./assets/images/april_dice/${name}.png`);
  }
  for (const name of AVRIL_IMAGES) {
    addSystemImage(imageStorage, name, `./assets/images/april/${name}.png`);
  }
}
