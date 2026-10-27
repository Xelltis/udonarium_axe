import {
  attackerPoint,
  bandHeight,
  defenderPoints,
  fighterShift,
  stageScale,
  stageSpread,
  standingTransform,
} from '@axe/features/battle-cut-in/battle-stage-layout';

describe('the battle stage layout', () => {
  it('stands the one striking and those struck on opposite sides of the middle', () => {
    expect(attackerPoint('left').x).toBeLessThan(0);
    expect(defenderPoints('left', 1)[0].x).toBeGreaterThan(0);
    expect(attackerPoint('right').x).toBeGreaterThan(0);
    expect(defenderPoints('right', 1)[0].x).toBeLessThan(0);
  });

  it('stands no two of those struck in the same place, and no more than four', () => {
    const points = defenderPoints('left', 6);

    expect(points).toHaveLength(4);
    expect(new Set(points.map((point) => `${point.x},${point.y}`)).size).toBe(4);
    expect(points.every((point) => point.x > 0)).toBe(true);
  });

  it('draws the stage smaller to fit more of those struck across a narrow band', () => {
    expect(stageScale(1400, 530, 4)).toBeLessThan(stageScale(1400, 530, 1));
    expect(stageScale(390, 300, 1)).toBeLessThan(stageScale(1400, 300, 1));
    expect(stageScale(0, 300, 1)).toBe(1);
  });

  it('stands the sides closer on a band taller than it is wide', () => {
    expect(stageSpread(390, 480)).toBeLessThan(stageSpread(1400, 530));
    expect(attackerPoint('left', stageSpread(390, 480)).x).toBeGreaterThan(attackerPoint('left').x);
  });

  it('keeps the band within reason on any screen', () => {
    expect(bandHeight(200)).toBe(240);
    expect(bandHeight(860)).toBe(722);
    expect(bandHeight(1200)).toBe(1008);
  });

  it('brings each side in from off the stage and steps the one striking towards the middle', () => {
    expect(fighterShift('left', 0, 0)).toBeLessThan(0);
    expect(fighterShift('right', 0, 0)).toBeGreaterThan(0);
    expect(fighterShift('left', 1, 0)).toBe(0);
    expect(fighterShift('left', 1, 1)).toBeGreaterThan(0);
    expect(fighterShift('right', 1, 1)).toBeLessThan(0);
  });

  it('grows something stood on the floor about its foot', () => {
    expect(standingTransform({ x: 10, y: 0, z: 0 }, 5, 0)).toBe(
      'translate3d(15.00px, 0.00px, 0.00px) rotateX(-64deg) translate(-50%, -100%)'
    );
    expect(standingTransform({ x: 0, y: 0, z: 0 }, 0, 20, 1.5)).toContain('rotateX(-64deg) scale(1.500) translate');
  });
});
