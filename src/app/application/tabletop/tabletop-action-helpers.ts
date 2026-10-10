import { DiceType } from '@axe/domain/dice/dice-symbol';

export const TERRAIN_TEXTURE_PATH = './assets/images/terrain_crate.webp';
export const TRUMP_BACK_IMAGE_PATH = './assets/images/trump/z02.webp';

export interface DiceMenuItem {
  menuName: string;
  diceName: string;
  type: DiceType;
  imagePathPrefix: string;
}

export interface RangeMenuItem {
  menuName: string;
  typeName: string;
}

/** The card codes of a full deck of playing cards and its two jokers, which name the bundled card images. */
export function getTrumpCardCodes(): string[] {
  const cardCodes: string[] = [];
  for (const suit of ['c', 'd', 'h', 's']) {
    for (let index = 1; index <= 13; index++) {
      cardCodes.push(suit + ('00' + index).slice(-2));
    }
  }
  cardCodes.push('x01', 'x02');
  return cardCodes;
}

/**
 * The kinds of die the create menu offers, in the order a `typeIndex` counts them.
 *
 * `imagePathPrefix` names the bundled folder each kind's face images are in.
 */
export function getDiceMenuItems(): DiceMenuItem[] {
  return [
    { menuName: 'D4', diceName: 'D4', type: DiceType.D4, imagePathPrefix: '4_dice' },
    { menuName: 'D6', diceName: 'D6', type: DiceType.D6, imagePathPrefix: '6_dice' },
    { menuName: 'D8', diceName: 'D8', type: DiceType.D8, imagePathPrefix: '8_dice' },
    { menuName: 'D10', diceName: 'D10', type: DiceType.D10, imagePathPrefix: '10_dice' },
    { menuName: 'D10 (00-90)', diceName: 'D10', type: DiceType.D10_10TIMES, imagePathPrefix: '100_dice' },
    { menuName: 'D12', diceName: 'D12', type: DiceType.D12, imagePathPrefix: '12_dice' },
    { menuName: 'D20', diceName: 'D20', type: DiceType.D20, imagePathPrefix: '20_dice' },
  ];
}

/** How far apart several dice made at once stand, and how many stand in a row before the next begins. */
const DICE_PLACEMENT_STEP_PX = 55;
const DICE_PLACEMENT_PER_ROW = 5;

export interface DicePlacement {
  x: number;
  y: number;
}

/** A piece the dice can be made as the property of. */
export interface DiceOwnerCandidate {
  identifier: string;
  name: string;
}

/** What the dialogue for making several dice at once is opened with. */
export interface DiceCreateDialogOption {
  /** Which kind is offered first, by its place in the creation menu. */
  typeIndex?: number;
  defaultCount?: number;
  maxCount?: number;
  /** The pieces they can be made for. Left empty where the table has none to offer. */
  ownerCandidates?: readonly DiceOwnerCandidate[];
}

/** What it answers with: the kind, by its place in that menu, how many, and whose they are. */
export interface DiceCreateRequest {
  typeIndex: number;
  count: number;
  /** The piece they belong to, or nothing where they belong to nobody. */
  ownerCharacterIdentifier: string;
  /** Whether the face is the maker's alone to read. */
  hiddenToOthers: boolean;
}

/**
 * Where each of several dice made at once goes.
 *
 * One die is made where the table was asked. Several would stand in a pile on that one spot, so
 * they are laid out in rows from it: a handful can then be read and thrown without being pulled
 * apart first, and a row wraps rather than running off the edge of the table.
 */
export function getDicePlacements(position: { x: number; y: number }, count: number): DicePlacement[] {
  const wanted = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const placements: DicePlacement[] = [];
  for (let index = 0; index < wanted; index++) {
    placements.push({
      x: position.x - 25 + (index % DICE_PLACEMENT_PER_ROW) * DICE_PLACEMENT_STEP_PX,
      y: position.y - 25 + Math.floor(index / DICE_PLACEMENT_PER_ROW) * DICE_PLACEMENT_STEP_PX,
    });
  }
  return placements;
}

/** The range shapes the create menu offers: a translation key for each, and the type it is made as. */
export function getRangeMenuItems(): RangeMenuItem[] {
  return [
    { menuName: 'feature.tabletop.action.rangeShapeLine', typeName: 'LINE' },
    { menuName: 'feature.tabletop.action.rangeShapeCorn', typeName: 'CORN' },
    { menuName: 'feature.tabletop.action.rangeShapeTriangle', typeName: 'TRIANGLE' },
    { menuName: 'feature.tabletop.action.rangeShapeSquare', typeName: 'SQUARE' },
    { menuName: 'feature.tabletop.action.rangeShapePentagon', typeName: 'PENTAGON' },
    { menuName: 'feature.tabletop.action.rangeShapeHexagon', typeName: 'HEXAGON' },
    { menuName: 'feature.tabletop.action.rangeShapeCircle', typeName: 'CIRCLE' },
    { menuName: 'feature.tabletop.action.rangeShapeCustom', typeName: 'CUSTOM' },
  ];
}
