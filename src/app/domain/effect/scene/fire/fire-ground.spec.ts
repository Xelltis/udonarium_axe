import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { type Stage } from '@axe/domain/effect/scene/choreography';
import {
  flameFrontAt,
  frontReachesAt,
  frontShareAt,
  groundFiresAt,
  throwGroundFires,
} from '@axe/domain/effect/scene/fire/fire-ground';
import { throwerFor } from '@axe/domain/effect/scene/parts';

const CELL = 50;
const FLOOR = { x: 400, y: 300, z: 0 };

function stageOf(): Stage {
  return {
    x: 400,
    y: 300,
    z: 0,
    groundZ: 0,
    cell: CELL,
    tall: CELL,
    seconds: 0,
    duration: 3,
    index: 0,
    areaPx: 150,
    origin: null,
    targets: [],
    mouth: null,
    blowsAt: [0],
    seed: 7,
    preset: new EffectPreset('preset'),
  };
}

describe('the fire a great blast throws over the floor', () => {
  it('runs its front out fast and slows it to the edge, reaching each share when it says', () => {
    expect(frontShareAt(0, 0.5)).toBe(0);
    expect(frontShareAt(0.25, 0.5)).toBeGreaterThan(0.8);
    expect(frontShareAt(0.5, 0.5)).toBe(1);
    for (const share of [0.1, 0.5, 0.9]) {
      expect(frontShareAt(frontReachesAt(share, 0.5), 0.5)).toBeCloseTo(share, 6);
    }
  });

  it('stands the front as a ring of licks leaning the way they run, sinking and cooling as they go', () => {
    const early = flameFrontAt(FLOOR, 30, 150, CELL, 0.05, 0.5, 20, 3);
    const late = flameFrontAt(FLOOR, 30, 150, CELL, 0.4, 0.5, 20, 3);
    const radiusOf = (flames: typeof early) =>
      flames.reduce((sum, flame) => sum + Math.hypot(flame.at.x - FLOOR.x, flame.at.y - FLOOR.y), 0) / flames.length;

    expect(early).toHaveLength(20);
    expect(radiusOf(late)).toBeGreaterThan(radiusOf(early) * 1.5);
    expect(radiusOf(late)).toBeLessThanOrEqual(150 * 1.06);
    expect(late[0].long).toBeLessThan(early[0].long);
    expect(late[0].heat).toBeLessThan(early[0].heat);
    for (const flame of early) {
      const outward = (flame.at.x - FLOOR.x) * flame.heading.x + (flame.at.y - FLOOR.y) * flame.heading.y;
      expect(outward).toBeGreaterThan(0);
      expect(flame.heading.z).toBeGreaterThan(0);
    }
    expect(flameFrontAt(FLOOR, 30, 150, CELL, 0.5, 0.5, 20, 3)).toHaveLength(0);
  });

  it('lights each fire it leaves as the front passes over it, and burns it down to nothing', () => {
    const fires = throwGroundFires(throwerFor(stageOf(), 5), 12, [1, 1.5]);
    const far = fires.reduce((a, b) => (a.out > b.out ? a : b));
    const lit = frontReachesAt(far.out, 0.5);
    const burningAt = (t: number) => groundFiresAt([far], FLOOR, 150, CELL, t, 0.5);

    expect(burningAt(lit - 0.01)).toHaveLength(0);
    expect(burningAt(lit + 0.2)).toHaveLength(1);
    expect(burningAt(lit + 0.2)[0].long).toBeGreaterThan(burningAt(lit + far.burns * 0.95)[0].long);
    expect(burningAt(lit + far.burns + 0.01)).toHaveLength(0);
    expect(fires.every((fire) => fire.out > 0 && fire.out <= 1)).toBe(true);
    expect(throwGroundFires(throwerFor(stageOf(), 5), 12, [1, 1.5])).toEqual(fires);
  });
});
