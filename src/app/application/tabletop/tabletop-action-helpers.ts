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

/** What the dialogue for making several dice at once is opened with. */
export interface DiceCreateDialogOption {
  /** Which kind is offered first, by its place in the creation menu. */
  typeIndex?: number;
  defaultCount?: number;
  maxCount?: number;
}

/** What it answers with: the kind, by its place in that menu, and how many of them. */
export interface DiceCreateRequest {
  typeIndex: number;
  count: number;
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
