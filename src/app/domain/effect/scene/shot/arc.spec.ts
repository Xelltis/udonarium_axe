import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import { sceneLingerMsOf } from '@axe/domain/effect/scene/effect-frame';
import {
  boltsBetween,
  castOn,
  CELL,
  HAND,
  liesOnFloor,
  stagedAt,
  thunderPresetOf,
  widestOf,
} from '@axe/testing/thunder-effect-stage';

const FIRST = { x: 400, y: 300 };
const SECOND = { x: 520, y: 200 };
const THIRD = { x: 600, y: 380 };

function reachesAt(preset: EffectPreset): number {
  return effectBlowsOf(preset)[0].atMs / 1000;
}

describe('a current of lightning held on one target', () => {
  const current = thunderPresetOf('arc', 2, { durationMs: 900 });
  const cast = castOn([FIRST]);
  const reaches = reachesAt(current);
  const breaks = 0.9 * 0.78;

  it('gathers sparks in the hand and snaps a leader across before it reaches the target', () => {
    const drawn = stagedAt(current, cast, reaches * 0.5);

    expect(drawn.motes.some((mote) => mote.x === HAND.x && mote.y === HAND.y)).toBe(true);
    expect(boltsBetween(drawn, HAND, FIRST)).toEqual([]);
    expect(drawn.ribbons.length).toBeGreaterThan(0);
  });

  it('never goes out while it is held: at every moment a trunk runs from the hand to the target', () => {
    for (let seconds = reaches; seconds < breaks - 0.01; seconds += 0.01) {
      expect([seconds, boltsBetween(stagedAt(current, cast, seconds), HAND, FIRST).length > 0]).toEqual([
        seconds,
        true,
      ]);
    }
  });

  it('writhes, taking a new shape every twentieth of a second', () => {
    const shapes = new Set<number>();
    for (let seconds = reaches + 0.2; seconds < breaks - 0.01; seconds += 0.05) {
      shapes.add(boltsBetween(stagedAt(current, cast, seconds), HAND, FIRST)[0].points[16].y);
    }

    expect(shapes.size).toBeGreaterThanOrEqual(7);
  });

  it('winds two thinner strands about its trunk', () => {
    const strands = boltsBetween(stagedAt(current, cast, reaches + 0.3), HAND, FIRST);

    expect(strands).toHaveLength(3);
    expect(widestOf(strands[0])).toBeGreaterThan(widestOf(strands[1]) * 1.5);
  });

  it('drops arcs off itself to the floor it passes over, and throws its light along that floor', () => {
    const drawn = stagedAt(current, cast, reaches + 0.3);
    const [trunk] = boltsBetween(drawn, HAND, FIRST);
    const dropped = drawn.ribbons.filter(
      (ribbon) =>
        ribbon.blend === 'light' &&
        trunk.points.includes(ribbon.points[0] as never) &&
        ribbon.points.at(-1)!.z < CELL * 0.1 &&
        ribbon.points.at(-1)!.x > HAND.x &&
        ribbon.points.at(-1)!.x < FIRST.x
    );
    const lit = drawn.floor.filter((mark) => mark.blend === 'light' && mark.x > HAND.x + 1 && mark.x < FIRST.x - 1);

    expect(dropped.length).toBeGreaterThanOrEqual(2);
    expect(lit.length).toBeGreaterThanOrEqual(4);
  });

  it('surges as it reaches the target and lights it, then eases without letting go', () => {
    const widthAt = (after: number) => widestOf(boltsBetween(stagedAt(current, cast, reaches + after), HAND, FIRST)[0]);
    const lightAt = (after: number) =>
      Math.max(0, ...stagedAt(current, cast, reaches + after).lights.map((light) => light.strength));

    expect(widthAt(0)).toBeGreaterThan(widthAt(0.3) * 1.3);
    expect(lightAt(0)).toBeGreaterThan(0.8);
    expect(lightAt(0.3)).toBeGreaterThan(0.5);
  });

  it('leaves its track glowing as colour when it breaks, and crackles over the piece after', () => {
    const broken = stagedAt(current, cast, breaks + 0.05);
    let crackles = 0;
    for (let seconds = breaks + 0.12; seconds < 0.9 + sceneLingerMsOf(current) / 1000; seconds += 0.01) {
      if (stagedAt(current, cast, seconds).ribbons.some((ribbon) => ribbon.blend === 'light')) crackles++;
    }

    expect(boltsBetween(broken, HAND, FIRST)).toEqual([]);
    expect(broken.ribbons.some((ribbon) => ribbon.blend === 'color' && ribbon.points[0].x === HAND.x)).toBe(true);
    expect(crackles).toBeGreaterThan(5);
  });

  it('lingers long enough for what is left to crackle', () => {
    expect(sceneLingerMsOf(current)).toBe(700);
  });
});

describe('a current of lightning on two targets or more, a chain', () => {
  const chain = thunderPresetOf('arc', 3, { durationMs: 1400, staggerMs: 140 });
  const cast = castOn([FIRST, SECOND, THIRD]);
  const reaches = reachesAt(chain);
  const beat = 0.14;
  const links = [
    [HAND, FIRST],
    [FIRST, SECOND],
    [SECOND, THIRD],
  ] as const;
  const linkedAt = (seconds: number) =>
    links.map(([from, to]) => boltsBetween(stagedAt(chain, cast, seconds), from, to).length > 0);

  it('leaps from the hand to the first target, and from each target to the next in the order they were picked, a beat apart', () => {
    expect(linkedAt(reaches - 0.07)).toEqual([false, false, false]);
    expect(linkedAt(reaches + 0.01)).toEqual([true, false, false]);
    expect(linkedAt(reaches + beat + 0.01)).toEqual([true, true, false]);
    expect(linkedAt(reaches + beat * 2 + 0.01)).toEqual([true, true, true]);
  });

  it('never sends a link from the caster to any target but the first', () => {
    for (let seconds = 0; seconds < 2.4; seconds += 0.02) {
      const drawn = stagedAt(chain, cast, seconds);

      expect(boltsBetween(drawn, HAND, SECOND)).toEqual([]);
      expect(boltsBetween(drawn, HAND, THIRD)).toEqual([]);
    }
  });

  it('is seen leaping: a link is part of the way across just before it lands', () => {
    const drawn = stagedAt(chain, cast, reaches + beat - 0.03);
    const leaping = drawn.ribbons.filter(
      (ribbon) =>
        ribbon.blend === 'light' &&
        Math.hypot(ribbon.points[0].x - FIRST.x, ribbon.points[0].y - FIRST.y) < 1 &&
        ribbon.points.length > 4
    );

    expect(boltsBetween(drawn, FIRST, SECOND)).toEqual([]);
    expect(leaping.length).toBeGreaterThan(0);
    expect(Math.hypot(leaping[0].points.at(-1)!.x - SECOND.x, leaping[0].points.at(-1)!.y - SECOND.y)).toBeGreaterThan(
      CELL * 0.5
    );
  });

  it('lights each piece and strikes it into the floor as its link lands', () => {
    links.forEach(([, to], link) => {
      const drawn = stagedAt(chain, cast, reaches + beat * link + 0.01);

      expect(drawn.lights.some((light) => Math.hypot(light.x - to.x, light.y - to.y) < 1 && light.strength > 0.8)).toBe(
        true
      );
      expect(drawn.floor.some((mark) => mark.shape === 'ring' && Math.hypot(mark.x - to.x, mark.y - to.y) < 1)).toBe(
        true
      );
    });
  });

  it('keeps the links already made standing, thinner, behind the one that leaps', () => {
    const landed = widestOf(boltsBetween(stagedAt(chain, cast, reaches + 0.01), HAND, FIRST)[0]);
    const standing = widestOf(boltsBetween(stagedAt(chain, cast, reaches + beat + 0.12), HAND, FIRST)[0]);

    expect(standing).toBeLessThan(landed * 0.8);
  });

  it('surges whole the moment its last link lands', () => {
    const before = stagedAt(chain, cast, reaches + beat * 2 - 0.02);
    const surging = stagedAt(chain, cast, reaches + beat * 2 + 0.02);

    for (const [from, to] of links.slice(0, 2)) {
      expect(widestOf(boltsBetween(surging, from, to)[0])).toBeGreaterThan(
        widestOf(boltsBetween(before, from, to)[0]) * 1.5
      );
    }
  });

  it('lets go link by link from the end of its caster', () => {
    let seen = false;
    for (let seconds = reaches + beat * 2 + 0.3; seconds < 2; seconds += 0.01) {
      const linked = linkedAt(seconds);
      if (!linked[0] && linked[2]) seen = true;
      expect([seconds, linked[0] && !linked[2]]).toEqual([seconds, false]);
    }

    expect(seen).toBe(true);
    expect(linkedAt(2.2)).toEqual([false, false, false]);
  });

  it('leaps a beat apart even where the cast gives its targets none', () => {
    const together = thunderPresetOf('arc', 3, { durationMs: 1400, staggerMs: 0 });
    const at = (seconds: number) =>
      links.map(([from, to]) => boltsBetween(stagedAt(together, cast, seconds), from, to).length > 0);

    expect(at(reaches + 0.01)).toEqual([true, false, false]);
    expect(at(reaches + 0.11)).toEqual([true, true, false]);
    expect(at(reaches + 0.21)).toEqual([true, true, true]);
  });

  it('drops arcs to the floor along its links', () => {
    const drawn = stagedAt(chain, cast, reaches + beat * 2 + 0.02);

    expect(drawn.ribbons.filter((ribbon) => ribbon.blend === 'light' && liesOnFloor(ribbon)).length).toBeGreaterThan(0);
  });
});
