import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { type Stage } from '@axe/domain/effect/scene/choreography';
import { blastAt, type BlastSize, blastWithin, throwBlast } from '@axe/domain/effect/scene/fire/blast';
import { throwerFor } from '@axe/domain/effect/scene/parts';

const CELL = 50;
const SIZE: BlastSize = { reach: 0.7, lobes: 6, licks: 8, swellS: 0.2, burnsS: 0.6, smokeS: 1, rises: 1.3 };
const HEART = { x: 400, y: 300, z: 20 };

function stageOf(seed = 11): Stage {
  const preset = new EffectPreset('preset');
  preset.kind = 'burst';
  return {
    x: 400,
    y: 300,
    z: 0,
    groundZ: 0,
    cell: CELL,
    tall: CELL,
    seconds: 0,
    duration: 1.2,
    index: 0,
    areaPx: 0,
    origin: null,
    targets: [],
    mouth: null,
    blowsAt: [0],
    seed,
    preset,
  };
}

describe('a blast of fire', () => {
  it('throws the same blast from the same seed, and another from another', () => {
    const one = throwBlast(throwerFor(stageOf(11), 3), SIZE);
    const same = throwBlast(throwerFor(stageOf(11), 3), SIZE);
    const other = throwBlast(throwerFor(stageOf(12), 3), SIZE);

    expect(same).toEqual(one);
    expect(other).not.toEqual(one);
    expect(one.lobes).toHaveLength(SIZE.lobes + 1);
    expect(one.licks).toHaveLength(SIZE.licks);
  });

  it('swells out of its heart in an instant, licks of flame torn off it, with no smoke yet', () => {
    const blast = throwBlast(throwerFor(stageOf(), 3), SIZE);
    const reachAt = (t: number) =>
      Math.max(
        ...blastAt(blast, HEART, CELL, t, 0)
          .flames.filter((flame) => flame.shape === 'blaze')
          .map((flame) => Math.hypot(flame.at.x - HEART.x, flame.at.y - HEART.y) + flame.wide / 2)
      );
    const early = blastAt(blast, HEART, CELL, 0.03, 0);

    expect(early.billows).toHaveLength(0);
    expect(early.flames.filter((flame) => flame.shape === 'lick')).toHaveLength(SIZE.licks);
    expect(early.flames.every((flame) => flame.heat > 0.8)).toBe(true);
    expect(reachAt(SIZE.swellS)).toBeGreaterThan(reachAt(0.03) * 1.5);
  });

  it('cools from its edge in, the lobes furthest out going to smoke first and its heart last', () => {
    const blast = throwBlast(throwerFor(stageOf(), 3), SIZE);
    const [heart, ...round] = blast.lobes;
    const outermost = round.reduce((a, b) => (a.out > b.out ? a : b));
    const innermost = round.reduce((a, b) => (a.out < b.out ? a : b));

    expect(Math.max(...blast.lobes.map((lobe) => lobe.burns))).toBeLessThanOrEqual(SIZE.burnsS);
    expect(heart.burns).toBeGreaterThan(SIZE.burnsS * 0.9);
    expect(outermost.burns).toBeLessThan(innermost.burns * 1.25);
    const late = blastAt(blast, HEART, CELL, SIZE.burnsS * 0.9, 0);
    expect(late.flames.length).toBeLessThan(round.length);
    expect(late.flames.every((flame) => flame.heat < 0.35)).toBe(true);
    expect(late.billows.length).toBeGreaterThan(round.length / 2);
  });

  it('rolls up as it burns and is left as smoke that rises on and is gone when its time is up', () => {
    const blast = throwBlast(throwerFor(stageOf(), 3), SIZE);
    const heightAt = (t: number) => {
      const { billows } = blastAt(blast, HEART, CELL, t, 0);
      return billows.reduce((sum, billow) => sum + billow.at.z, 0) / billows.length;
    };
    const smoking = blastAt(blast, HEART, CELL, SIZE.burnsS + 0.3, 0);

    expect(smoking.flames).toHaveLength(0);
    expect(smoking.billows.length).toBeGreaterThan(0);
    expect(heightAt(SIZE.burnsS + 0.6)).toBeGreaterThan(heightAt(SIZE.burnsS) + CELL * 0.3);
    const gone = blastAt(blast, HEART, CELL, SIZE.burnsS + SIZE.smokeS + 0.01, 0);
    expect(gone.flames).toHaveLength(0);
    expect(gone.billows).toHaveLength(0);
  });

  it('keeps every part of it over the floor', () => {
    const blast = throwBlast(throwerFor(stageOf(), 3), { ...SIZE, domed: 0.5 });

    for (let t = 0; t < SIZE.burnsS + SIZE.smokeS; t += 0.05) {
      const { flames, billows } = blastAt(blast, { ...HEART, z: 2 }, CELL, t, 0);
      expect(flames.every((flame) => flame.at.z >= 0)).toBe(true);
      expect(billows.every((billow) => billow.at.z >= 0)).toBe(true);
    }
  });

  it('is cut short to clear within the time there is, and left whole where there is time enough', () => {
    const short = blastWithin(SIZE, 0.85);

    expect(blastWithin(SIZE, 5)).toBe(SIZE);
    expect(short.burnsS + short.smokeS).toBeLessThanOrEqual(0.85);
    expect(short.burnsS / short.smokeS).toBeCloseTo(SIZE.burnsS / SIZE.smokeS, 5);
  });
});
