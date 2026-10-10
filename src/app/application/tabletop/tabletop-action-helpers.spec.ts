import {
  getDiceMenuItems,
  getDicePlacements,
  getRangeMenuItems,
  getTrumpCardCodes,
  TERRAIN_TEXTURE_PATH,
  TRUMP_BACK_IMAGE_PATH,
} from '@axe/application/tabletop/tabletop-action-helpers';
import { DiceType } from '@axe/domain/dice/dice-symbol';

describe('tabletop-action-helpers', () => {
  it('lists the codes for all fifty-four playing cards', () => {
    const codes = getTrumpCardCodes();

    expect(codes).toHaveLength(54);
    expect(codes[0]).toBe('c01');
    expect(codes[12]).toBe('c13');
    expect(codes[13]).toBe('d01');
    expect(codes[51]).toBe('s13');
    expect(codes[52]).toBe('x01');
    expect(codes[53]).toBe('x02');
  });

  it('describes the dice creation menu', () => {
    expect(getDiceMenuItems()).toEqual([
      { menuName: 'D4', diceName: 'D4', type: DiceType.D4, imagePathPrefix: '4_dice' },
      { menuName: 'D6', diceName: 'D6', type: DiceType.D6, imagePathPrefix: '6_dice' },
      { menuName: 'D8', diceName: 'D8', type: DiceType.D8, imagePathPrefix: '8_dice' },
      { menuName: 'D10', diceName: 'D10', type: DiceType.D10, imagePathPrefix: '10_dice' },
      { menuName: 'D10 (00-90)', diceName: 'D10', type: DiceType.D10_10TIMES, imagePathPrefix: '100_dice' },
      { menuName: 'D12', diceName: 'D12', type: DiceType.D12, imagePathPrefix: '12_dice' },
      { menuName: 'D20', diceName: 'D20', type: DiceType.D20, imagePathPrefix: '20_dice' },
    ]);
  });

  it('describes the range area menu', () => {
    expect(getRangeMenuItems()).toEqual([
      { menuName: 'feature.tabletop.action.rangeShapeLine', typeName: 'LINE' },
      { menuName: 'feature.tabletop.action.rangeShapeCorn', typeName: 'CORN' },
      { menuName: 'feature.tabletop.action.rangeShapeTriangle', typeName: 'TRIANGLE' },
      { menuName: 'feature.tabletop.action.rangeShapeSquare', typeName: 'SQUARE' },
      { menuName: 'feature.tabletop.action.rangeShapePentagon', typeName: 'PENTAGON' },
      { menuName: 'feature.tabletop.action.rangeShapeHexagon', typeName: 'HEXAGON' },
      { menuName: 'feature.tabletop.action.rangeShapeCircle', typeName: 'CIRCLE' },
      { menuName: 'feature.tabletop.action.rangeShapeCustom', typeName: 'CUSTOM' },
    ]);
  });

  describe('where several dice made at once go', () => {
    it('puts a single one where the table was asked', () => {
      expect(getDicePlacements({ x: 100, y: 200 }, 1)).toEqual([{ x: 75, y: 175 }]);
    });

    it('lays the rest beside it rather than in a pile on it', () => {
      const placements = getDicePlacements({ x: 100, y: 200 }, 3);

      expect(placements.map((placement) => placement.x)).toEqual([75, 130, 185]);
      expect(new Set(placements.map((placement) => placement.y)).size).toBe(1);
    });

    it('starts another row once five stand in one', () => {
      expect(getDicePlacements({ x: 100, y: 200 }, 6)[5]).toEqual({ x: 75, y: 230 });
    });

    it('places nothing where none was asked for', () => {
      expect(getDicePlacements({ x: 0, y: 0 }, 0)).toEqual([]);
      expect(getDicePlacements({ x: 0, y: 0 }, -3)).toEqual([]);
      expect(getDicePlacements({ x: 0, y: 0 }, Number.NaN)).toEqual([]);
    });
  });

  it('provides the image paths for terrain and card backs', () => {
    expect(TERRAIN_TEXTURE_PATH).toBe('./assets/images/terrain_crate.webp');
    expect(TRUMP_BACK_IMAGE_PATH).toBe('./assets/images/trump/z02.webp');
  });
});
