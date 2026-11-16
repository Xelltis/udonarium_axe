import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { type Stage } from '@axe/domain/effect/scene/choreography';
import { CAP_HEIGHT, capAt, crownAt, STEM_S, stemAt, throwCloud } from '@axe/domain/effect/scene/fire/mushroom-cloud';
import { throwerFor } from '@axe/domain/effect/scene/parts';

const CELL = 50;
const FLOOR = { x: 400, y: 300, z: 0 };

function cloudOf() {
  const stage: Stage = {
    x: 400,
    y: 300,
    z: 0,
    groundZ: 0,
    cell: CELL,
    tall: CELL,
    seconds: 0,
    duration: 4,
    index: 0,
    areaPx: 200,
    origin: null,
    targets: [],
    mouth: null,
    blowsAt: [0],
    seed: 9,
    preset: new EffectPreset('preset'),
  };
  return throwCloud(throwerFor(stage, 6));
}

describe('the cloud of the greatest blast', () => {
  it('shoots its stem up to the height of the cap, reddens it as it burns and breaks it', () => {
    const cloud = cloudOf();
    const tallest = (t: number) => Math.max(0, ...stemAt(cloud, FLOOR, CELL, t, 3).map((flame) => flame.long));
    const hottest = (t: number) => Math.max(0, ...stemAt(cloud, FLOOR, CELL, t, 3).map((flame) => flame.heat));

    expect(tallest(0.1)).toBeLessThan(tallest(0.6));
    expect(tallest(0.8)).toBeGreaterThan(CELL * CAP_HEIGHT * 0.85);
    expect(hottest(1.8)).toBeLessThan(hottest(0.3));
    expect(stemAt(cloud, FLOOR, CELL, STEM_S + 0.5, 3)).toHaveLength(0);
    expect(stemAt(cloud, FLOOR, CELL, 0.8, 3).every((flame) => flame.shape === 'lick' && flame.at.z >= 0)).toBe(true);
  });

  it('rolls its cap up to its height and out, the ring widening as it rolls', () => {
    const cloud = cloudOf();
    const spanAt = (t: number) => {
      const { flames, billows } = capAt(cloud, FLOOR, CELL, t);
      const all = [...flames, ...billows];
      return {
        height: all.reduce((sum, part) => sum + part.at.z, 0) / all.length,
        out: Math.max(...all.map((part) => Math.hypot(part.at.x - FLOOR.x, part.at.y - FLOOR.y))),
      };
    };

    expect(capAt(cloud, FLOOR, CELL, 0.2).flames).toHaveLength(0);
    expect(spanAt(0.6).height).toBeLessThan(spanAt(1.8).height);
    expect(spanAt(1.8).height).toBeGreaterThan(CELL * CAP_HEIGHT * 0.9);
    expect(spanAt(2.5).out).toBeGreaterThan(spanAt(0.7).out * 1.5);
  });

  it('burns its cap from white to red and leaves it as smoke that thins away', () => {
    const cloud = cloudOf();
    const hot = capAt(cloud, FLOOR, CELL, 0.55);
    const cooling = capAt(cloud, FLOOR, CELL, 1.4);
    const smoke = capAt(cloud, FLOOR, CELL, 2.6);

    expect(hot.flames.some((flame) => flame.heat > 0.85)).toBe(true);
    expect(hot.billows).toHaveLength(0);
    expect(Math.max(...cooling.flames.map((flame) => flame.heat))).toBeLessThan(0.5);
    expect(cooling.billows.length).toBeGreaterThan(0);
    expect(smoke.flames).toHaveLength(0);
    expect(smoke.billows.length).toBeGreaterThan(0);
    expect(smoke.billows[0].warm).toBe(0);
    const gone = capAt(cloud, FLOOR, CELL, 4.5);
    expect(gone.flames).toHaveLength(0);
    expect(gone.billows).toHaveLength(0);
  });

  it('ends its stem in tongues of every height and flames rising off their tips, never in an edge', () => {
    const cloud = cloudOf();
    const tips = stemAt(cloud, FLOOR, CELL, 1, 3).map((flame) => flame.long);
    const crown = crownAt(cloud, FLOOR, CELL, 1, 3);
    const roots = crown.map((flame) => flame.at.z);

    expect(Math.max(...tips) - Math.min(...tips)).toBeGreaterThan(CELL * CAP_HEIGHT * 0.3);
    expect(crown.length).toBeGreaterThan(8);
    expect(Math.max(...roots) - Math.min(...roots)).toBeGreaterThan(CELL * 0.8);
    expect(Math.max(...roots)).toBeGreaterThan(CELL * CAP_HEIGHT);
    expect(crownAt(cloud, FLOOR, CELL, STEM_S + 0.5, 3)).toHaveLength(0);
  });

  it('leaves the smoke of its cap climbing and broken apart in height rather than lying as a lid', () => {
    const cloud = cloudOf();
    const heights = capAt(cloud, FLOOR, CELL, 3).billows.map((billow) => billow.at.z);

    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(CELL * 1.2);
    expect(heights.reduce((sum, z) => sum + z, 0) / heights.length).toBeGreaterThan(CELL * (CAP_HEIGHT + 1));
  });
});
