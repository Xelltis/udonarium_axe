import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { effectJoltsOf } from '@axe/domain/effect/effect-reaction';
import { bladeTonesOf } from '@axe/domain/effect/scene/blade/blade-tones';
import { type Staged } from '@axe/domain/effect/scene/choreography';
import { type EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import {
  bundledOf,
  CASTER,
  castOnTarget,
  CELL,
  crescentBodiesOf,
  cutOf,
  hotEdgesOf,
  lengthOf,
  seamsOf,
  stagedAt,
  TARGET,
  whiteLinesOf,
  widestOf,
} from '@axe/testing/blade-effect-stage';

const cast = castOnTarget();

/** The blade held ready: the white-hearted band of seven points from its hilt to its point. */
function heldOf(drawn: Staged): EffectRibbon {
  return drawn.ribbons.find((ribbon) => ribbon.points.length === 7 && ribbon.core === '#ffffff')!;
}

/** The blades of the great swords drawn, each from its point to its shoulders: their edges, bands of seven points drawn to nothing at the point. */
function swordOf(drawn: Staged): EffectRibbon[] {
  return drawn.ribbons.filter(
    (ribbon) =>
      ribbon.points.length === 7 &&
      ribbon.blend === 'color' &&
      !ribbon.core &&
      Array.isArray(ribbon.widths) &&
      ribbon.widths[0] === 0
  );
}

/** The arcs of the fan a falling sword leaves: the bands of thirteen points. */
function fanOf(drawn: Staged): EffectRibbon[] {
  return drawn.ribbons.filter((ribbon) => ribbon.points.length === 13);
}

/** The crescent a blade left: the longest of the bodies drawn that is no afterimage, or none. */
function crescentOf(drawn: Staged): EffectRibbon | undefined {
  return crescentBodiesOf(drawn)
    .filter((body) => !body.soft)
    .sort((a, b) => lengthOf(b) - lengthOf(a))[0];
}

/** The floor darkened about the target, or none. */
function hushOf(drawn: Staged) {
  return drawn.floor.find((mark) => mark.shape === 'disc' && mark.blend === 'color');
}

describe('a drawing cut', () => {
  const iai = cutOf('iai', 2612);
  const opensAt = effectBlowsOf(iai)[0].atMs / 1000;
  /** The line: the white band of fifteen points lying through the target. */
  const lineOf = (drawn: Staged) =>
    drawn.ribbons.find((ribbon) => ribbon.points.length === 15 && ribbon.color === '#ffffff');

  it('dims the floor about the target before the blade is drawn, and clears it once the cut has opened', () => {
    expect(hushOf(stagedAt(iai, cast, 0.5))!.alpha).toBeGreaterThan(0.5);
    expect(hushOf(stagedAt(iai, cast, 0.5))!.radius).toBeGreaterThan(CELL * 4);
    expect(hushOf(stagedAt(iai, cast, opensAt + 0.7))).toBeUndefined();
  });

  it('draws its line within the first moments, long before its blow', () => {
    expect(lineOf(stagedAt(iai, cast, 0.05))).toBeUndefined();
    expect(lineOf(stagedAt(iai, cast, 0.2))).toBeDefined();
    expect(opensAt).toBeGreaterThan(0.9);
  });

  it('lays the line level from behind its caster through the target and cells past it', () => {
    const line = lineOf(stagedAt(iai, cast, 0.3))!;
    const xs = line.points.map((point) => point.x);
    const zs = line.points.map((point) => point.z);

    expect(Math.max(...xs)).toBeGreaterThan(CASTER.x);
    expect(Math.min(...xs)).toBeLessThan(TARGET.x - CELL * 2);
    expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(1);
    expect(line.points.every((point) => Math.abs(point.y - TARGET.y) < 1)).toBe(true);
  });

  it('flashes as a blinding streak and thins to a hair that lies still until the cut opens', () => {
    const flashing = widestOf(lineOf(stagedAt(iai, cast, 0.16))!);
    const lying = widestOf(lineOf(stagedAt(iai, cast, 0.6))!);
    const later = widestOf(lineOf(stagedAt(iai, cast, opensAt - 0.05))!);

    expect(flashing).toBeGreaterThan(CELL * 0.3);
    expect(lying).toBeLessThan(CELL * 0.08);
    expect(later).toBe(lying);
    expect(stagedAt(iai, cast, 0.6).motes.filter((mote) => mote.shape === 'spark')).toEqual([]);
  });

  it('lays the line as a hard band within a dark sheath, which still holds it once it has thinned', () => {
    const tones = bladeTonesOf('#ffffff', '#7fd4ff');
    const lying = stagedAt(iai, cast, 0.6).ribbons.filter((ribbon) => ribbon.points.length === 15);
    const sheath = lying.find((ribbon) => ribbon.color === tones.rim)!;
    const white = lineOf(stagedAt(iai, cast, 0.6))!;

    expect(sheath.blend).toBe('color');
    expect(sheath.alpha).toBe(1);
    expect(widestOf(sheath)).toBeGreaterThan(widestOf(white) * 2);
    expect(lying.some((ribbon) => ribbon.color === tones.body && ribbon.alpha === 1)).toBe(true);
  });

  it('bursts the hair open along its whole length as its blow lands', () => {
    const before = stagedAt(iai, cast, opensAt - 0.03);
    const opened = stagedAt(iai, cast, opensAt + 0.2);
    const gash = seamsOf(opened).sort((a, b) => lengthOf(b) - lengthOf(a))[0];

    expect(seamsOf(before)).toEqual([]);
    expect(lengthOf(gash)).toBeGreaterThan(CELL * 4.5);
    expect(widestOf(gash)).toBeGreaterThan(CELL * 0.2);
    expect(opened.motes.filter((mote) => mote.shape === 'spark').length).toBeGreaterThan(20);
  });

  it('flickers more cuts over the target after the first, one after another, each its own way', () => {
    const linesAt = (since: number) => whiteLinesOf(stagedAt(iai, cast, opensAt + since));
    const tipsAt = (since: number) =>
      linesAt(since)
        .map((line) => Math.round(((line.points.at(-1)!.z - line.points[0].z) / lengthOf(line)) * 10))
        .filter((tip) => tip !== 0);

    expect(tipsAt(0.02)).toEqual([]);
    expect(new Set([...tipsAt(0.09), ...tipsAt(0.16), ...tipsAt(0.23), ...tipsAt(0.3)]).size).toBeGreaterThanOrEqual(3);
    expect(tipsAt(0.6)).toEqual([]);
  });

  it('scatters petals of light from where the line was and leaves them falling', () => {
    const petalsAt = (seconds: number) =>
      stagedAt(iai, cast, seconds).motes.filter((mote) => mote.shape === 'flake' && mote.variant !== undefined);
    const lowest = (seconds: number) => Math.min(...petalsAt(seconds).map((petal) => petal.z));

    expect(petalsAt(opensAt + 0.6).length).toBeGreaterThan(12);
    expect(lowest(opensAt + 1.1)).toBeLessThan(lowest(opensAt + 0.5));
  });

  it('draws at once and opens as the blade of its bundled sound clicks home', () => {
    const [blow] = effectBlowsOf(bundledOf('一閃'));

    expect(blow.atMs).toBeGreaterThan(950);
    expect(blow.atMs).toBeLessThan(1100);
  });
});

describe('a cleave', () => {
  const cleave = cutOf('heavy', 2256, 3);
  const strikes = effectBlowsOf(cleave)[0].atMs / 1000;

  it('raises a great sword high over the target, drawn back towards its caster, long before it falls', () => {
    const held = stagedAt(cleave, cast, strikes * 0.6);
    const [blade] = swordOf(held);
    const [tip, shoulders] = [blade.points[0], blade.points.at(-1)!];

    expect(fanOf(held)).toEqual([]);
    expect(tip.z).toBeGreaterThan(CELL * 2.5);
    expect(tip.x).toBeGreaterThan(TARGET.x + CELL * 0.4);
    expect(shoulders.z).toBeGreaterThan(CELL * 1.5);
    expect(widestOf(blade)).toBeGreaterThan(CELL * 0.18);
    expect(hushOf(held)).toBeDefined();
    expect(held.motes.filter((mote) => mote.shape === 'spark').length).toBeGreaterThan(0);
  });

  it('brings the sword down over the top in an instant, leaving a fan, until its point is in the ground past the target', () => {
    const falling = stagedAt(cleave, cast, strikes - 0.01);
    const zs = fanOf(falling).flatMap((ribbon) => ribbon.points.map((point) => point.z));
    const blade = swordOf(stagedAt(cleave, cast, strikes + 0.05)).at(-1)!;
    const tip = blade.points[0];
    const over = blade.points.reduce((nearest, point) =>
      Math.abs(point.x - TARGET.x) < Math.abs(nearest.x - TARGET.x) ? point : nearest
    );

    expect(fanOf(stagedAt(cleave, cast, strikes - 0.15))).toEqual([]);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(CELL * 1.5);
    expect(swordOf(falling).length).toBeGreaterThan(1);
    expect(tip.z).toBeLessThan(CELL * 0.1);
    expect(tip.x).toBeLessThan(TARGET.x);
    expect(over.z).toBeGreaterThan(0);
    expect(over.z).toBeLessThan(CELL * 1.5);
  });

  it('leaves the sword standing where it struck, then breaks it into light', () => {
    expect(swordOf(stagedAt(cleave, cast, strikes + 0.4)).length).toBeGreaterThan(0);
    expect(swordOf(stagedAt(cleave, cast, strikes + 1.2))).toEqual([]);
    expect(stagedAt(cleave, cast, strikes + 0.75).motes.some((mote) => mote.shape === 'flake')).toBe(true);
  });

  it('cuts the target from over its head to its feet in one upright line', () => {
    const [line] = whiteLinesOf(stagedAt(cleave, cast, strikes + 0.03));
    const zs = line.points.map((point) => point.z);

    expect(line.points.every((point) => Math.abs(point.x - TARGET.x) < 1 && Math.abs(point.y - TARGET.y) < 1)).toBe(
      true
    );
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(CELL * 2);
  });

  it('stands a pillar of light up out of the blow for an instant', () => {
    const pillarOf = (since: number) =>
      stagedAt(cleave, cast, strikes + since).ribbons.filter(
        (ribbon) => ribbon.points.length === 4 && ribbon.points.every((point) => Math.abs(point.x - TARGET.x) < 1)
      );
    const top = Math.max(...pillarOf(0.1).flatMap((ribbon) => ribbon.points.map((point) => point.z)));

    expect(top).toBeGreaterThan(CELL * 5);
    expect(pillarOf(0.6)).toEqual([]);
  });

  it('breaks nothing before it lands, then splits the ground on past the target and heaves rock out of it', () => {
    const before = stagedAt(cleave, cast, strikes - 0.02);
    const after = stagedAt(cleave, cast, strikes + 0.3);
    const split = after.floor.filter((mark) => mark.shape === 'fissure');
    const crags = after.motes.filter((mote) => mote.shape === 'crag');

    expect(before.floor.filter((mark) => mark.shape === 'fissure')).toEqual([]);
    expect(before.motes.filter((mote) => mote.shape === 'crag')).toEqual([]);
    expect(split[0].x).toBeLessThan(TARGET.x - CELL);
    expect(split[0].radius).toBeGreaterThan(CELL * 2.5);
    expect(crags.length).toBeGreaterThanOrEqual(6);
    expect(crags.every((crag) => crag.x < TARGET.x)).toBe(true);
  });

  it('heaves its crags one after another, the nearest first, and flings stones and dust up', () => {
    const at = (since: number, shape: string) =>
      stagedAt(cleave, cast, strikes + since).motes.filter((mote) => mote.shape === shape).length;

    expect(at(0.06, 'crag')).toBeGreaterThan(0);
    expect(at(0.06, 'crag')).toBeLessThan(at(0.3, 'crag'));
    expect(at(0.3, 'chunk')).toBeGreaterThan(8);
    expect(at(0.5, 'smoke')).toBeGreaterThan(4);
  });

  it('lets the split glow at first and go cold, and clears everything by the end', () => {
    const glowAt = (since: number) =>
      stagedAt(cleave, cast, strikes + since).floor.filter((mark) => mark.shape === 'fissure' && mark.blend === 'light')
        .length;
    const after = stagedAt(cleave, cast, 2.256 + 0.7);

    expect(glowAt(0.3)).toBeGreaterThan(0);
    expect(glowAt(1.36)).toBe(0);
    expect(after.ribbons.length + after.motes.length + after.floor.length).toBe(0);
  });

  it('presses the one it strikes down, not back', () => {
    const jolt = effectJoltsOf(cleave, cast, strikes * 1000 + 200, CELL).get('t0')!;

    expect([jolt.x, jolt.y]).toEqual([0, 0]);
    expect(jolt.z).toBeLessThan(0);
  });

  it('lands as its bundled sound crashes, most of a second in', () => {
    const [blow] = effectBlowsOf(bundledOf('兜割り'));

    expect(blow.atMs).toBeGreaterThan(850);
    expect(blow.atMs).toBeLessThan(930);
  });
});

describe('a wide sweep', () => {
  const sweep = cutOf('wide', 1752, 3);
  const crosses = effectBlowsOf(sweep)[0].atMs / 1000;

  it('holds a blade drawn back to one side of the target, growing, before it swings', () => {
    const reach = (share: number) => lengthOf(heldOf(stagedAt(sweep, cast, crosses * share)));

    expect(crescentBodiesOf(stagedAt(sweep, cast, crosses * 0.5))).toEqual([]);
    expect(reach(0.7)).toBeGreaterThan(reach(0.2));
    expect(Math.abs(heldOf(stagedAt(sweep, cast, crosses * 0.7)).points.at(-1)!.y - TARGET.y)).toBeGreaterThan(CELL);
  });

  it('sweeps a crescent level right across, cells wider than the target either side', () => {
    const body = crescentOf(stagedAt(sweep, cast, crosses + 0.1))!;
    const ys = body.points.map((point) => point.y);
    const zs = body.points.map((point) => point.z);

    expect(Math.max(...ys)).toBeGreaterThan(TARGET.y + CELL * 1.9);
    expect(Math.min(...ys)).toBeLessThan(TARGET.y - CELL * 1.9);
    expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(CELL * 1.2);
  });

  it('leaves a longer and thicker crescent than one stroke does, which hangs longer', () => {
    const single = cutOf('single', 1752, 3);
    const one = effectBlowsOf(single)[0].atMs / 1000;
    const of = (cut: typeof sweep, at: number) => crescentOf(stagedAt(cut, cast, at));

    expect(widestOf(of(sweep, crosses + 0.1)!)).toBeGreaterThan(widestOf(of(single, one + 0.1)!) * 1.2);
    expect(lengthOf(of(sweep, crosses + 0.1)!)).toBeGreaterThan(lengthOf(of(single, one + 0.1)!) * 1.3);
    expect(of(sweep, crosses + 0.66)).toBeDefined();
    expect(of(single, one + 0.66)).toBeUndefined();
  });

  it('sends the cut flying on past the target, away from the caster, scoring the floor under it', () => {
    const flying = stagedAt(sweep, cast, crosses + 0.25);
    const west = Math.min(...hotEdgesOf(flying).flatMap((edge) => edge.points.map((point) => point.x)));
    const scores = flying.floor.filter((mark) => mark.shape === 'fissure' && mark.blend === 'color');

    expect(hotEdgesOf(flying).length).toBeGreaterThanOrEqual(2);
    expect(west).toBeLessThan(TARGET.x - CELL * 3);
    expect(scores.some((score) => Math.abs(Math.sin(score.turn)) > 0.9)).toBe(true);
    expect(scores.some((score) => Math.abs(Math.cos(score.turn)) > 0.9 && score.x < TARGET.x - CELL)).toBe(true);
    expect(hotEdgesOf(stagedAt(sweep, cast, crosses + 0.75)).every((edge) => edge.points[11].x > TARGET.x - CELL)).toBe(
      true
    );
  });

  it('stands a wall of dust up along the stroke', () => {
    const dust = stagedAt(sweep, cast, crosses + 0.4).motes.filter((mote) => mote.shape === 'smoke');
    const ys = dust.map((cloud) => cloud.y);

    expect(dust.length).toBeGreaterThan(8);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(CELL * 4);
  });

  it('gathers one blade at the first of several targets, and flies one cut on from it', () => {
    const two = {
      ...cast,
      targets: [
        { identifier: 't0', ...TARGET, z: 0 },
        { identifier: 't1', x: TARGET.x, y: TARGET.y + CELL * 2, z: 0 },
      ],
    };
    const held = stagedAt(sweep, two, crosses * 0.8).ribbons.filter(
      (ribbon) => ribbon.points.length === 7 && ribbon.core === '#ffffff'
    );

    expect(held).toHaveLength(1);
    expect(hotEdgesOf(stagedAt(sweep, two, crosses + 0.1 + 0.2))).toHaveLength(3);
  });

  it('lays no ring on the floor', () => {
    for (let since = 0; since < 1.5; since += 0.05) {
      expect(stagedAt(sweep, cast, crosses + since).floor.some((mark) => mark.shape === 'ring')).toBe(false);
    }
  });

  it('crosses as the rush of its bundled sound breaks', () => {
    const [blow] = effectBlowsOf(bundledOf('大斬撃'));

    expect(blow.atMs).toBeGreaterThan(330);
    expect(blow.atMs).toBeLessThan(400);
  });
});

describe('every form of a cut', () => {
  const STYLES = ['single', 'combo', 'iai', 'wide', 'heavy'] as const;

  it.each(STYLES)('draws nothing of a %s cut under the floor', (style) => {
    const cut = cutOf(style, 2500, 3);
    for (let at = 0; at < 3.2; at += 0.025) {
      const drawn = stagedAt(cut, cast, at);
      expect(drawn.ribbons.every((ribbon) => ribbon.points.every((point) => point.z >= 0))).toBe(true);
      expect(drawn.motes.every((mote) => mote.z >= 0)).toBe(true);
    }
  });

  it.each(STYLES)('keeps a %s cut on three targets within what a scene may draw', (style) => {
    const cut = cutOf(style, 2500, 3);
    const three = {
      ...cast,
      targets: [0, 1, 2].map((index) => ({ identifier: `t${index}`, x: TARGET.x, y: TARGET.y + CELL * index, z: 0 })),
    };
    for (let at = 0; at < 3.4; at += 0.033) {
      const drawn = stagedAt(cut, three, at);
      expect(drawn.motes.filter((mote) => mote.blend === 'light').length).toBeLessThan(4096);
      expect(drawn.motes.filter((mote) => mote.blend === 'color').length).toBeLessThan(4096);
      expect(drawn.floor.length).toBeLessThan(256);
      expect(drawn.ribbons.reduce((sum, ribbon) => sum + ribbon.points.length, 0)).toBeLessThan(4096);
    }
  });

  it.each(STYLES)('draws a %s cut the same whoever looks, and nothing once it has lingered', (style) => {
    const cut = cutOf(style, 2000, 3);

    expect(stagedAt(cut, cast, 0.9)).toEqual(stagedAt(cut, cast, 0.9));
    const after = stagedAt(cut, cast, 5);
    expect(after.ribbons.length + after.motes.length + after.floor.length).toBe(0);
  });
});
