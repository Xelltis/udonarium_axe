import { frameAspectFor, MIN_TRAY_AREA, trayFor } from '@axe/domain/dice/dice-3d/tray-size';

const areaOf = (tray: { halfWidth: number; halfDepth: number }) => tray.halfWidth * 2 * tray.halfDepth * 2;

describe('trayFor', () => {
  it('takes the shape of the stage it is drawn in', () => {
    const tray = trayFor(2, 2);
    expect(tray.halfWidth / tray.halfDepth).toBeCloseTo(2, 9);
  });

  it('gives a handful of dice the least floor', () => {
    expect(areaOf(trayFor(1, 2))).toBeCloseTo(MIN_TRAY_AREA, 9);
    expect(areaOf(trayFor(2, 2))).toBeCloseTo(MIN_TRAY_AREA, 9);
  });

  it('gives more dice more floor', () => {
    expect(areaOf(trayFor(20, 2))).toBeGreaterThan(areaOf(trayFor(10, 2)));
    expect(areaOf(trayFor(10, 2))).toBeGreaterThan(areaOf(trayFor(2, 2)));
  });

  it('gives the floor asked for, and more for every die past two', () => {
    expect(areaOf(trayFor(1, 4 / 3, 192))).toBeCloseTo(192, 9);
    expect(areaOf(trayFor(2, 4 / 3, 40))).toBeCloseTo(40, 9);
    expect(areaOf(trayFor(4, 4 / 3, 40))).toBeGreaterThan(40);
  });
});

describe('frameAspectFor', () => {
  it('gives a few dice a wide strip and more dice a deeper frame', () => {
    expect(frameAspectFor(1)).toBe(4);
    expect(frameAspectFor(4)).toBe(4);
    expect(frameAspectFor(5)).toBeLessThan(frameAspectFor(4));
    expect(frameAspectFor(20)).toBeLessThan(frameAspectFor(10));
    expect(frameAspectFor(50)).toBeLessThan(frameAspectFor(20));
  });
});
