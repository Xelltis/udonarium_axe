import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { type EffectKind } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { type Staged } from '@axe/domain/effect/scene/choreography';
import { sceneLingerMsOf } from '@axe/domain/effect/scene/effect-frame';
import { castOn, CELL, stagedAt } from '@axe/testing/holy-effect-stage';

function darkPresetOf(kind: EffectKind, grade: number, fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = kind;
  preset.grade = grade;
  preset.durationMs = 4000;
  preset.colorPrimary = '#e3b3ff';
  preset.colorSecondary = '#6a1fc2';
  Object.assign(preset, fields);
  return preset;
}

const AT = { x: 400, y: 300 };
const BLACK = '#000000';

function strikesOf(preset: EffectPreset): number[] {
  return effectBlowsOf(preset).map((blow) => blow.atMs / 1000);
}

function blackMotes(drawn: Staged) {
  return drawn.motes.filter((mote) => mote.color === BLACK && mote.blend === 'color');
}

function clearedAt(preset: EffectPreset, cast: EffectCast): number {
  return (preset.totalDuration(cast.targets.length) + sceneLingerMsOf(preset)) / 1000 + 0.01;
}

function isEmpty(drawn: Staged): boolean {
  return drawn.motes.length + drawn.ribbons.length + drawn.floor.length + drawn.lights.length === 0;
}

describe('spikes of shadow', () => {
  const preset = darkPresetOf('shadow', 1, { durationMs: 1855 });
  const cast = castOn([AT]);
  const [stabs] = strikesOf(preset);
  const crags = (drawn: Staged) => drawn.motes.filter((mote) => mote.shape === 'crag');

  it('spreads a pool of shadow under the target before anything stabs out of it', () => {
    const early = stagedAt(preset, cast, stabs * 0.3);
    const late = stagedAt(preset, cast, stabs * 0.75);
    const pool = (drawn: Staged) =>
      Math.max(...drawn.floor.filter((mark) => mark.shape === 'scorch').map((mark) => mark.radius));

    expect(crags(early)).toEqual([]);
    expect(pool(late)).toBeGreaterThan(pool(early));
  });

  it('stabs spikes up through the target at the blow, the tallest standing over its head, each over a burning edge', () => {
    const drawn = stagedAt(preset, cast, stabs + 0.15);
    const tips = crags(drawn).map((mote) => mote.z);

    expect(crags(drawn).length).toBeGreaterThanOrEqual(16);
    expect(crags(drawn).length % 2).toBe(0);
    expect(Math.max(...tips)).toBeGreaterThan(CELL * 1.5);
    expect(new Set(crags(drawn).map((mote) => mote.color)).size).toBe(2);
  });

  it('lands a black beat as it stabs: a black heart at the struck point and the floor lit about it', () => {
    const drawn = stagedAt(preset, cast, stabs + 0.02);

    expect(blackMotes(drawn).some((mote) => mote.shape === 'puff' && mote.z > 0)).toBe(true);
    expect(drawn.floor.some((mark) => mark.blend === 'light' && mark.shape === 'disc')).toBe(true);
    expect(drawn.lights.length).toBeGreaterThan(0);
  });

  it('breaks the spikes and leaves the shadow torn until the look has cleared', () => {
    const left = stagedAt(preset, cast, preset.duration / 1000 + 0.3);

    expect(crags(left)).toEqual([]);
    expect(left.floor.some((mark) => mark.shape === 'fissure')).toBe(true);
    expect(isEmpty(stagedAt(preset, cast, clearedAt(preset, cast)))).toBe(true);
  });

  it('stabs more spikes at the middle grade than at the lowest', () => {
    const more = darkPresetOf('shadow', 2, { durationMs: 1855 });

    expect(crags(stagedAt(more, cast, strikesOf(more)[0] + 0.15)).length).toBeGreaterThan(
      crags(stagedAt(preset, cast, stabs + 0.15)).length
    );
  });
});

describe('a black sphere', () => {
  const preset = darkPresetOf('darkorb', 2, { durationMs: 3788 });
  const cast = castOn([AT]);
  const [bursts] = strikesOf(preset);
  const sphere = (drawn: Staged) =>
    Math.max(
      0,
      ...blackMotes(drawn)
        .filter((mote) => mote.shape === 'puff' && mote.x === AT.x)
        .map((mote) => mote.size)
    );

  it('clamps onto the target, holds, and falls in on itself before it bursts', () => {
    const held = sphere(stagedAt(preset, cast, bursts * 0.5));

    expect(sphere(stagedAt(preset, cast, 0.02))).toBe(0);
    expect(held).toBeGreaterThan(CELL);
    expect(sphere(stagedAt(preset, cast, bursts - 0.03))).toBeLessThan(held * 0.4);
  });

  it('takes the light out of the floor while it drinks, and throws none on it', () => {
    const drawn = stagedAt(preset, cast, bursts * 0.5);

    expect(drawn.floor.some((mark) => mark.color === BLACK && mark.shape === 'disc' && mark.radius > CELL * 3)).toBe(
      true
    );
    expect(drawn.lights).toEqual([]);
  });

  it('bursts in a ring thrown wide at its height and in black fire', () => {
    const drawn = stagedAt(preset, cast, bursts + 0.2);
    const level = drawn.ribbons.filter((ribbon) => ribbon.points.every((point) => point.z === ribbon.points[0].z));

    expect(level.length).toBeGreaterThanOrEqual(2);
    expect(level[0].points[0].z).toBeGreaterThan(0);
    expect(drawn.motes.filter((mote) => mote.shape === 'lick').length).toBeGreaterThan(20);
    expect(isEmpty(stagedAt(preset, cast, clearedAt(preset, cast)))).toBe(true);
  });
});

describe('an abyss', () => {
  const preset = darkPresetOf('shadow', 3, { durationMs: 5042, areaRadius: 3, targeting: 'multi', maxTargets: 8 });
  const others = [
    { x: AT.x + 100, y: AT.y },
    { x: AT.x, y: AT.y - 110 },
  ];
  const cast = castOn([AT, ...others]);
  const [seizes, shuts] = strikesOf(preset);
  const widest = (drawn: Staged, at: { x: number; y: number }) =>
    Math.max(
      0,
      ...drawn.floor
        .filter((mark) => mark.shape === 'scorch' && mark.x === at.x && mark.y === at.y)
        .map((mark) => mark.radius)
    );

  it('opens one mire as wide as its area about the first target, and only a patch under each of the rest', () => {
    const drawn = stagedAt(preset, cast, seizes - 0.1);

    expect(widest(drawn, AT)).toBeGreaterThanOrEqual(3 * CELL);
    for (const other of others) expect(widest(drawn, other)).toBeLessThan(3 * CELL);
    for (const other of others) expect(widest(drawn, other)).toBeGreaterThan(0);
  });

  it('raises hands of shadow all over it, and more about every piece it has caught', () => {
    const alone = stagedAt(preset, castOn([AT]), seizes - 0.02).ribbons.length;
    const three = stagedAt(preset, cast, seizes - 0.02).ribbons.length;

    expect(alone).toBeGreaterThan(8 * 6 * 2);
    expect(three).toBeGreaterThan(3 * 3 * 6 * 2);
    expect(stagedAt(preset, cast, 0.1).ribbons).toEqual([]);
  });

  it('shortens the arms about a piece once they have seized it', () => {
    const lone = castOn([AT]);
    const heightAbout = (seconds: number) => {
      const near = stagedAt(preset, lone, seconds)
        .ribbons.flatMap((ribbon) => ribbon.points)
        .filter((point) => Math.hypot(point.x - AT.x, point.y - AT.y) < CELL * 0.5);
      return near.reduce((sum, point) => sum + point.z, 0) / near.length;
    };

    expect(heightAbout(seizes + 0.6)).toBeLessThan(heightAbout(seizes - 0.03));
  });

  it('raises the hands that seize a piece well over its head before they come down on it', () => {
    const lone = castOn([AT]);
    const near = stagedAt(preset, lone, seizes - 0.25)
      .ribbons.flatMap((ribbon) => ribbon.points)
      .filter((point) => Math.hypot(point.x - AT.x, point.y - AT.y) < CELL * 0.6);

    expect(Math.max(...near.map((point) => point.z))).toBeGreaterThan(CELL * 2);
  });

  it('stands a rim of earth round the pit that sinks into it as the hands drag', () => {
    const lone = castOn([AT]);
    const slabs = (seconds: number) => stagedAt(preset, lone, seconds).motes.filter((mote) => mote.shape === 'crag');
    const topOf = (seconds: number) => Math.max(...slabs(seconds).map((mote) => mote.z));

    expect(slabs(seizes - 0.1).length).toBeGreaterThanOrEqual(12);
    expect(topOf(shuts - 0.05)).toBeLessThan(topOf(seizes - 0.1) * 0.8);
  });

  it('throws a geyser of black fire up over the whole pit as it shuts', () => {
    const lone = castOn([AT]);
    const flames = stagedAt(preset, lone, shuts + 0.15).motes.filter(
      (mote) => mote.shape === 'lick' && mote.blend === 'color' && mote.z > CELL * 1.5
    );

    expect(flames.length).toBeGreaterThanOrEqual(24);
    expect(Math.max(...flames.map((mote) => Math.hypot(mote.x - AT.x, mote.y - AT.y)))).toBeGreaterThan(CELL * 1.2);
  });

  it('shuts over everything: no hand and no mire is left once it has closed', () => {
    const drawn = stagedAt(preset, cast, shuts + 0.5);

    expect(drawn.ribbons).toEqual([]);
    expect(drawn.floor.every((mark) => mark.radius < 3 * CELL || mark.blend === 'light')).toBe(true);
    expect(isEmpty(stagedAt(preset, cast, clearedAt(preset, cast)))).toBe(true);
  });
});

describe('an eclipse', () => {
  const preset = darkPresetOf('darkorb', 3, { durationMs: 4206, areaRadius: 3, targeting: 'multi', maxTargets: 8 });
  const cast = castOn([AT, { x: AT.x + 120, y: AT.y + 40 }, { x: AT.x - 90, y: AT.y + 60 }]);
  const [flares] = strikesOf(preset);
  const high = (drawn: Staged) => blackMotes(drawn).filter((mote) => mote.shape === 'puff' && mote.z > CELL * 3);

  it('hangs one black disc over the first target, however many it is cast on', () => {
    const places = new Set(high(stagedAt(preset, cast, flares * 0.45)).map((mote) => `${mote.x},${mote.y},${mote.z}`));

    expect(places.size).toBe(1);
    expect(high(stagedAt(preset, castOn([AT]), flares * 0.45)).length).toBe(
      high(stagedAt(preset, cast, flares * 0.45)).length
    );
  });

  it('slides the disc across the sun and darkens the table as it covers it', () => {
    const dark = (seconds: number) =>
      Math.max(
        0,
        ...stagedAt(preset, cast, seconds)
          .floor.filter((mark) => mark.color === BLACK && mark.shape === 'disc')
          .map((mark) => mark.alpha)
      );
    const offset = (seconds: number) => high(stagedAt(preset, cast, seconds))[0]?.aside?.right ?? 0;

    expect(offset(0.3)).toBeGreaterThan(offset(0.6));
    expect(offset(flares * 0.45)).toBe(0);
    expect(dark(flares * 0.45)).toBeGreaterThan(dark(0.2));
    expect(dark(flares * 0.45)).toBeGreaterThan(0.6);
  });

  it('drops needles of light on every target before the corona flares, and none before they are due', () => {
    const needles = (seconds: number) =>
      stagedAt(preset, cast, seconds).motes.filter(
        (mote) => mote.shape === 'spark' && mote.color === '#ffffff' && (mote.velocity?.z ?? 0) < -100
      );
    let seen = 0;
    for (let seconds = flares * 0.5; seconds < flares; seconds += 0.02) seen += needles(seconds).length;

    expect(needles(flares * 0.3)).toEqual([]);
    expect(seen).toBeGreaterThan(30);
  });

  it('takes every target in black fire as the corona flares', () => {
    const drawn = stagedAt(preset, cast, flares + 0.25);
    const fires = cast.targets.map(
      (target) =>
        drawn.motes.filter(
          (mote) => mote.shape === 'lick' && Math.hypot(mote.x - target.x, mote.y - target.y) < CELL * 1.5
        ).length
    );

    for (const fire of fires) expect(fire).toBeGreaterThan(12);
    expect(isEmpty(stagedAt(preset, cast, clearedAt(preset, cast)))).toBe(true);
  });
});

describe('a draining', () => {
  const preset = darkPresetOf('drain', 2, { durationMs: 3239, colorPrimary: '#ffc2d4', colorSecondary: '#c8143c' });
  const cast = castOn([AT]);
  const [hooks, snaps] = strikesOf(preset);
  const reach = (drawn: Staged) =>
    Math.max(
      0,
      ...drawn.ribbons.flatMap((ribbon) => ribbon.points).map((point) => Math.hypot(point.x - 50, point.y - 300))
    );
  const span = Math.hypot(AT.x - 50, AT.y - 300);

  it('whips its strands out from the caster and hooks them into the target at the blow', () => {
    expect(reach(stagedAt(preset, cast, hooks * 0.4))).toBeLessThan(span * 0.9);
    expect(reach(stagedAt(preset, cast, hooks + 0.1))).toBeGreaterThan(span * 0.9);
  });

  it('pulls on three strands, each a body over a dark sheath with a thread of light down it, a swelling running down them', () => {
    const drawn = stagedAt(preset, cast, hooks + 0.75);
    const bodies = drawn.ribbons.filter((ribbon) => ribbon.core !== undefined && ribbon.torn !== undefined);
    const sheaths = drawn.ribbons.filter((ribbon) => ribbon.core === undefined && ribbon.torn !== undefined);
    const threads = drawn.ribbons.filter((ribbon) => ribbon.alphas !== undefined);
    const widths = bodies[0].widths as readonly number[];

    expect(bodies).toHaveLength(3);
    expect(sheaths).toHaveLength(3);
    expect(threads).toHaveLength(3);
    expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths) * 1.8);
  });

  it('carries drops of white light down the strands, laid over them, from the target towards the one who drains', () => {
    const drops = (seconds: number) =>
      stagedAt(preset, cast, seconds).ribbons.filter(
        (ribbon) => ribbon.core === '#ffffff' && ribbon.points.length === 6
      );
    const now = drops(hooks + 0.6);
    const head = (drop: (typeof now)[number]) => Math.hypot(drop.points[0].x - 50, drop.points[0].y - 300);
    const tail = (drop: (typeof now)[number]) => Math.hypot(drop.points[5].x - 50, drop.points[5].y - 300);

    expect(drops(hooks * 0.5)).toEqual([]);
    expect(now.length).toBeGreaterThanOrEqual(9);
    for (const drop of now) expect(head(drop)).toBeLessThan(tail(drop));
  });

  it('throws no white light on the table, only the colours of the theft', () => {
    for (let seconds = 0; seconds < snaps + 1; seconds += 0.05) {
      const lights = stagedAt(preset, cast, seconds).lights;

      expect(lights.filter((light) => light.color === '#ffffff')).toEqual([]);
    }
  });

  it('dims the target and takes the light out of the floor under it while it is held', () => {
    const drawn = stagedAt(preset, cast, (hooks + snaps) / 2);

    expect(drawn.floor.some((mark) => mark.color === BLACK && mark.x === AT.x && mark.y === AT.y)).toBe(true);
    expect(blackMotes(drawn).some((mote) => mote.shape === 'glow' && mote.x === AT.x)).toBe(true);
  });

  it('wreathes the one who drains in flame, taller the more it has drunk, and no one where it is cast from nowhere', () => {
    const wreath = (drawn: Staged) =>
      drawn.motes.filter((mote) => mote.shape === 'lick' && Math.hypot(mote.x - 50, mote.y - 300) < CELL);
    const tall = (seconds: number) => Math.max(...wreath(stagedAt(preset, cast, seconds)).map((mote) => mote.z));

    expect(wreath(stagedAt(preset, cast, hooks * 0.5))).toEqual([]);
    expect(tall(snaps - 0.05)).toBeGreaterThan(tall(hooks + 0.1));
    expect(
      stagedAt(preset, castOn([AT], false), (hooks + snaps) / 2).motes.filter((mote) => mote.shape === 'lick')
    ).toEqual([]);
  });

  it('draws the one who drains once, however many it drains', () => {
    const two = castOn([AT, { x: AT.x, y: AT.y + 100 }]);
    const licks = (drawn: Staged) => drawn.motes.filter((mote) => mote.shape === 'lick').length;
    const fields = { staggerMs: 0 };

    expect(licks(stagedAt(Object.assign(preset, fields), two, hooks + 0.5))).toBe(
      licks(stagedAt(preset, cast, hooks + 0.5))
    );
  });

  it('snaps the strands back into the caster and leaves nothing once it has cleared', () => {
    expect(stagedAt(preset, cast, snaps + 0.3).ribbons).toEqual([]);
    expect(isEmpty(stagedAt(preset, cast, clearedAt(preset, cast)))).toBe(true);
  });
});

describe('what lands in darkness', () => {
  it('lands a great blade of the highest grade in the bursting of a sphere, with no eclipse over it', () => {
    const blade = darkPresetOf('skyblade', 3, { durationMs: 3000, impactKind: 'darkorb' });
    const struck = effectBlowsOf(blade)[0].atMs / 1000;
    const drawn = stagedAt(blade, castOn([AT]), struck + 0.2);

    expect(drawn.motes.filter((mote) => mote.shape === 'lick').length).toBeGreaterThan(20);
    expect(blackMotes(drawn).filter((mote) => mote.z > CELL * 3)).toEqual([]);
  });

  it('lands a shot of the highest grade in spikes, with no mire under it', () => {
    const shot = darkPresetOf('projectile', 3, { durationMs: 1000, impactKind: 'shadow' });
    const struck = effectBlowsOf(shot)[0].atMs / 1000;
    const drawn = stagedAt(shot, castOn([AT]), struck + 0.15);

    expect(drawn.motes.some((mote) => mote.shape === 'crag')).toBe(true);
    expect(drawn.ribbons.filter((ribbon) => ribbon.color === '#000000')).toEqual([]);
  });
});
