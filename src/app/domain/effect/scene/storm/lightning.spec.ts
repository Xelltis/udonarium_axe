import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import {
  boltAfterimage,
  boltRibbons,
  boltShape,
  lightningRibbons,
  partOf,
} from '@axe/domain/effect/scene/storm/lightning';

const SKY = { x: 400, y: 300, z: 450 };
const HEAD = { x: 400, y: 300, z: 50 };
const RAMP = rampOf('#dcefff', '#7b5cff', 7);
const CELL = 50;

function widestOf(widths: readonly number[] | number): number {
  return typeof widths === 'number' ? widths : Math.max(...widths);
}

describe('boltShape()', () => {
  it('runs a trunk from where it leaves to where it strikes, broken in two as many times as it is told', () => {
    const { main } = boltShape(SKY, HEAD, 3, 0, { breaks: 5 });

    expect(main).toHaveLength(33);
    expect(main[0]).toEqual(SKY);
    expect(main.at(-1)).toEqual(HEAD);
  });

  it('is jagged at every size, its great bends thrown further aside than its small ones', () => {
    const { main } = boltShape(SKY, HEAD, 3, 0, { breaks: 5, jag: 0.1 });
    const asideOf = (index: number) => Math.hypot(main[index].x - SKY.x, main[index].y - SKY.y);
    const kinkOf = (index: number) =>
      Math.hypot(
        main[index].x - (main[index - 1].x + main[index + 1].x) / 2,
        main[index].y - (main[index - 1].y + main[index + 1].y) / 2
      );
    const kinks = Array.from({ length: 31 }, (_unused, index) => kinkOf(index + 1));

    expect(asideOf(16)).toBeGreaterThan(0);
    expect(kinks.filter((kink) => kink > 0.5).length).toBeGreaterThan(20);
    expect(Math.max(...kinks)).toBeLessThan(400 * 0.1 * 2);
  });

  it('throws its forks off the trunk and on the way it runs, none of them below the floor', () => {
    const { main, forks } = boltShape(SKY, HEAD, 5, 0, { forks: 5, floorZ: 2 });

    expect(forks).toHaveLength(5);
    for (const fork of forks) {
      expect(main).toContainEqual(fork[0]);
      expect(fork.at(-1)!.z).toBeLessThan(fork[0].z);
      expect(Math.min(...fork.map((point) => point.z))).toBeGreaterThanOrEqual(2);
    }
  });

  it('throws a fork to each point it is given to reach for, leaving the trunk above it', () => {
    const near = { x: 520, y: 340, z: 40 };
    const { main, forks } = boltShape(SKY, HEAD, 5, 0, { reaches: [near] });

    expect(forks).toHaveLength(1);
    expect(forks[0].at(-1)).toEqual(near);
    expect(main).toContainEqual(forks[0][0]);
    expect(forks[0][0].z).toBeGreaterThan(near.z + CELL);
  });

  it('takes the same shape for the same seed and flicker, and another along another path for another flicker', () => {
    const again = boltShape(SKY, HEAD, 5, 2, { forks: 3 });

    expect(boltShape(SKY, HEAD, 5, 2, { forks: 3 })).toEqual(again);
    expect(boltShape(SKY, HEAD, 5, 3, { forks: 3 }).main[16]).not.toEqual(again.main[16]);
  });
});

describe('partOf()', () => {
  it('is the first share of a line, and never less than its first stroke', () => {
    const { main } = boltShape(SKY, HEAD, 3, 0, { breaks: 4 });

    expect(partOf(main, 0.5)).toEqual(main.slice(0, 9));
    expect(partOf(main, 0)).toEqual(main.slice(0, 2));
    expect(partOf(main, 1)).toEqual(main);
  });
});

describe('boltRibbons()', () => {
  const shape = boltShape(SKY, HEAD, 3, 0, { forks: 3 });
  const ribbons = boltRibbons(shape, CELL, RAMP, 1);
  const trunk = ribbons.filter((ribbon) => ribbon.points === shape.main);

  it('lays a dark sheath under the light of the bolt, wider than it, so that it reads on a bright floor', () => {
    const sheath = trunk[0];
    const light = trunk.find((ribbon) => ribbon.blend === 'light')!;

    expect(sheath.blend).toBe('color');
    expect(sheath.soft).toBeGreaterThan(0);
    expect(widestOf(sheath.widths)).toBeGreaterThan(widestOf(light.widths) * 2);
    const channels = [1, 3, 5].map((at) => parseInt(sheath.color.slice(at, at + 2), 16));
    expect(Math.max(...channels)).toBeLessThan(110);
  });

  it('keeps white for its heart: the light is white in its middle and a hard white core lies over it', () => {
    const light = trunk.find((ribbon) => ribbon.blend === 'light')!;
    const core = trunk.at(-1)!;

    expect(light.core).toBe('#ffffff');
    expect([core.color, core.blend]).toEqual(['#ffffff', 'color']);
    expect(widestOf(core.widths)).toBeLessThan(widestOf(light.widths));
    expect(trunk.filter((ribbon) => ribbon.blend === 'light')).toHaveLength(1);
  });

  it('thins the trunk towards where it strikes and its forks to nothing', () => {
    const widths = trunk[0].widths as number[];
    const fork = ribbons.find((ribbon) => ribbon.points === shape.forks[0] && ribbon.blend === 'light')!;

    expect(widths.at(-1)!).toBeLessThan(widths[0]);
    expect(widths.at(-1)!).toBeGreaterThan(widths[0] * 0.4);
    expect((fork.widths as number[]).at(-1)!).toBeLessThan((fork.widths as number[])[0] * 0.3);
  });

  it('is as heavy as it is told, and nothing once it has no power left', () => {
    const heavy = boltRibbons(shape, CELL, RAMP, 1, 2);

    expect(widestOf(heavy[2].widths)).toBeCloseTo(widestOf(ribbons[2].widths) * 2);
    expect(boltRibbons(shape, CELL, RAMP, 0)).toEqual([]);
  });
});

describe('boltAfterimage()', () => {
  it('leaves the track of the bolt as colour, not light, fading to nothing', () => {
    const shape = boltShape(SKY, HEAD, 3, 0, { forks: 2 });
    const track = boltAfterimage(shape, CELL, RAMP, 0.5);

    expect(track.length).toBeGreaterThan(0);
    expect(track.every((ribbon) => ribbon.blend === 'color')).toBe(true);
    expect(track[0].alpha).toBeLessThan(boltAfterimage(shape, CELL, RAMP, 1)[0].alpha);
    expect(boltAfterimage(shape, CELL, RAMP, 0)).toEqual([]);
  });
});

describe('lightningRibbons()', () => {
  it('draws the small bolts of a breath and of a paralysis as it always did', () => {
    const ribbons = lightningRibbons(SKY, HEAD, 3, 0, CELL, RAMP, 1, 0);

    expect(ribbons.slice(0, 4).map((ribbon) => [ribbon.widths, ribbon.blend])).toEqual([
      [CELL * 0.7, 'color'],
      [CELL * 0.5, 'light'],
      [CELL * 0.16, 'light'],
      [CELL * 0.05, 'color'],
    ]);
    expect(ribbons).toHaveLength(7);
  });
});
