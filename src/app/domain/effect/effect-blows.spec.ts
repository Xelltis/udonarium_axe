import { effectBlowsOf, heldEffectClock, heldMsOf, wallClockOf } from '@axe/domain/effect/effect-blows';
import { EffectKind } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { type EffectStage } from '@axe/domain/effect/effect-stage';

function makePreset(kind: EffectKind, grade: number, fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = kind;
  preset.grade = grade;
  preset.durationMs = 1000;
  Object.assign(preset, fields);
  return preset;
}

describe('effectBlowsOf()', () => {
  it('strikes the instant a burst goes off, and lands nothing where an effect heals or shields', () => {
    expect(effectBlowsOf(makePreset('burst', 2)).map((blow) => blow.atMs)).toEqual([60]);
    expect(effectBlowsOf(makePreset('heal', 3))).toEqual([]);
    expect(effectBlowsOf(makePreset('barrier', 3))).toEqual([]);
  });

  it('lands a blow as a draining takes hold, which pulls the piece, and one as it snaps, which lets it fall back', () => {
    const blows = effectBlowsOf(makePreset('drain', 2, { durationMs: 3000 }));

    expect(blows.map((blow) => blow.atMs)).toEqual([390, 1875]);
    expect(blows.map((blow) => blow.holdMs)).toEqual([90, 90]);
    expect(blows[0].shake).toBe('soft');
    expect(blows[0].push).toBeLessThan(0);
    expect(blows[1].push).toBe(-blows[0].push);
  });

  it('lands a look of darkness as it is seen to strike: spikes, a sphere and an eclipse once, a mire twice', () => {
    const at = (kind: 'shadow' | 'darkorb', grade: number) =>
      effectBlowsOf(makePreset(kind, grade, { durationMs: 5000 })).map((blow) => blow.atMs);

    expect(at('shadow', 1)).toEqual([500]);
    expect(at('shadow', 3)).toEqual([1000, 2950]);
    expect(at('darkorb', 2)).toEqual([1740]);
    expect(at('darkorb', 3)).toEqual([2620]);
  });

  it('lands one blow as the greatest aura breaks out, which holds, shakes lightly and throws no piece', () => {
    const [blow, ...rest] = effectBlowsOf(makePreset('aura', 3, { durationMs: 2500 }));

    expect(rest).toEqual([]);
    expect(blow).toEqual({ atMs: 400, holdMs: 90, shake: 'soft', push: 0 });
    expect(effectBlowsOf(makePreset('aura', 2))).toEqual([]);
  });

  it('shakes at the blows of a cut and of ice of the middle grade and over', () => {
    expect(effectBlowsOf(makePreset('slash', 1))[0].shake).toBe('');
    expect(effectBlowsOf(makePreset('slash', 2))[0].shake).toBe('soft');
    expect(effectBlowsOf(makePreset('frost', 3))[0].shake).toBe('hard');
  });

  it('holds longer, shakes harder and throws the target further at the higher grades', () => {
    const [light, middle, heavy] = [1, 2, 3].map((grade) => effectBlowsOf(makePreset('bash', grade))[0]);

    expect([light.holdMs, middle.holdMs, heavy.holdMs]).toEqual([60, 90, 140]);
    expect([light.shake, middle.shake, heavy.shake]).toEqual(['', 'soft', 'hard']);
    expect(light.push).toBeLessThan(middle.push);
    expect(middle.push).toBeLessThan(heavy.push);
  });

  it('shakes hard as a great sword of the highest grade is driven into the ground, and holds as it lands', () => {
    const [blow, ...rest] = effectBlowsOf(makePreset('skyblade', 3, { durationMs: 3000 }));

    expect(rest).toEqual([]);
    expect(blow).toEqual({ atMs: 1860, holdMs: 140, shake: 'hard', push: 0.16 });
    expect(effectBlowsOf(makePreset('skyblade', 2, { durationMs: 3000 }))[0].shake).toBe('soft');
    expect(effectBlowsOf(makePreset('skyblade', 1, { durationMs: 3000 }))[0].shake).toBe('');
  });

  it('shakes lightly as a cut thrown off a blade lands, of the middle grade and over', () => {
    const cut = (grade: number): EffectPreset => makePreset('projectile', grade, { projectileStyle: 'crescent' });

    expect(effectBlowsOf(cut(1)).map((blow) => blow.shake)).toEqual(['']);
    expect(effectBlowsOf(cut(2)).map((blow) => blow.shake)).toEqual(['soft']);
    expect(effectBlowsOf(cut(3)).map((blow) => blow.shake)).toEqual(['soft']);
  });

  it('strikes as the cut of a drawing cut opens, long after its line is drawn at the start', () => {
    const [blow] = effectBlowsOf(makePreset('slash', 2, { slashStyle: 'iai' }));

    expect(blow.atMs).toBeGreaterThan(350);
    expect(blow.atMs).toBeLessThan(450);
  });

  it('lands one stroke of a cut as its swing begins, not a quarter of the way through', () => {
    const [blow] = effectBlowsOf(makePreset('slash', 1, { slashStyle: 'single' }));

    expect(blow.atMs).toBeGreaterThan(80);
    expect(blow.atMs).toBeLessThan(160);
  });

  it('strikes once for every stroke of a combination, holding only those far enough apart', () => {
    const blows = effectBlowsOf(makePreset('slash', 3, { slashStyle: 'combo' }));

    expect(blows).toHaveLength(5);
    expect(blows.filter((blow) => blow.holdMs > 0).length).toBeGreaterThan(0);
    expect(heldMsOf(blows)).toBeLessThanOrEqual(300);
  });

  it('strikes as each shot of a volley lands, holding it still at only a few of them', () => {
    const volley = makePreset('projectile', 3, { shots: 12 });
    const blows = effectBlowsOf(volley);

    expect(blows.length).toBeGreaterThan(1);
    expect(heldMsOf(blows)).toBeLessThanOrEqual(300);
    for (const [index, blow] of blows.entries()) {
      if (index > 0) expect(blow.atMs).toBeGreaterThanOrEqual(blows[index - 1].atMs);
    }
  });

  it('strikes as a meteor lands, holding everything still and shaking hard at the highest grade', () => {
    const meteor = makePreset('projectile', 3, { projectileStyle: 'meteor', durationMs: 1200 });
    const bolt = makePreset('projectile', 3, { durationMs: 1200 });

    expect(effectBlowsOf(meteor)).toEqual([{ atMs: 1050, holdMs: 140, shake: 'hard', push: 0.16 }]);
    expect(effectBlowsOf(bolt)).toEqual([{ atMs: 340, holdMs: 140, shake: '', push: 0.16 }]);
  });

  it('strikes where each stage of a run lands that strikes', () => {
    const staged = makePreset('projectile', 2);
    const stages: EffectStage[] = [
      { role: 'travel', kind: 'projectile', durationMs: 400 },
      { role: 'impact', kind: 'burst', durationMs: 300 },
      { role: 'field', kind: 'miasma', durationMs: 1000 },
    ];
    staged.stages = JSON.stringify(stages);

    expect(effectBlowsOf(staged).map((blow) => blow.atMs)).toEqual([418]);
  });
});

describe('the blows of rubble', () => {
  it('lands three, one at each heave of the ground, the first held as a blow of its grade and the others only caught', () => {
    const blows = effectBlowsOf(makePreset('rubble', 2, { durationMs: 5616 }));

    expect(blows.map((blow) => blow.atMs)).toEqual([449, 749, 1049]);
    expect(blows.map((blow) => blow.holdMs)).toEqual([90, 50, 50]);
    expect(blows.map((blow) => blow.shake)).toEqual(['soft', 'soft', 'soft']);
    expect(heldMsOf(blows)).toBeLessThanOrEqual(300);
  });

  it('holds the later heaves no longer than a blow of the lowest grade is held', () => {
    expect(effectBlowsOf(makePreset('rubble', 1, { durationMs: 5616 })).map((blow) => blow.holdMs)).toEqual([
      60, 50, 50,
    ]);
    expect(effectBlowsOf(makePreset('rubble', 3, { durationMs: 5616 })).map((blow) => blow.holdMs)).toEqual([
      140, 50, 50,
    ]);
  });

  it('lands one where rubble is a stage of a run, and one where a shot lands in it', () => {
    const staged = makePreset('rubble', 2);
    staged.stages = JSON.stringify([{ role: 'impact', kind: 'rubble', durationMs: 2000 }] satisfies EffectStage[]);
    const bullet = makePreset('projectile', 2, { projectileStyle: 'bullet', impactKind: 'rubble', durationMs: 750 });

    expect(effectBlowsOf(staged)).toHaveLength(1);
    expect(effectBlowsOf(bullet)).toHaveLength(1);
  });

  it('lands a shot of rock later than the bolt of light it is written as, and shakes as it breaks', () => {
    const rock = makePreset('projectile', 2, { impactKind: 'rubble', tagName: '射撃', durationMs: 850 });
    const bolt = makePreset('projectile', 2, { impactKind: 'burst', tagName: '射撃', durationMs: 850 });

    expect(effectBlowsOf(rock)).toEqual([{ atMs: 460, holdMs: 90, shake: 'soft', push: 0.1 }]);
    expect(effectBlowsOf(bolt)).toEqual([{ atMs: 340, holdMs: 90, shake: '', push: 0.1 }]);
  });
});

describe('effectBlowsOf() for a shot that falls from above', () => {
  it('strikes as the ballistic shot comes down, not as it is fired', () => {
    const [blow] = effectBlowsOf(makePreset('ballistic', 3));

    expect(blow.atMs).toBe(860);
  });
});

describe('the blow of a gust', () => {
  function vortexOf(grade: number, areaRadius = 0): EffectPreset {
    const preset = makePreset('vortex', grade);
    preset.durationMs = 1071;
    preset.targeting = 'multi';
    preset.areaRadius = areaRadius;
    return preset;
  }

  it('lands once, as its wall strikes the target, holds an instant and shoves the target as far as a piece is thrown', () => {
    const blows = effectBlowsOf(vortexOf(1));

    expect(blows).toHaveLength(1);
    expect(blows[0].atMs).toBe(350);
    expect(blows[0].holdMs).toBe(60);
    expect(blows[0].shake).toBe('');
    expect(blows[0].push).toBe(0.25);
  });

  it('is landed by no tornado, which stands over its target and strikes nothing', () => {
    expect(effectBlowsOf(vortexOf(2))).toEqual([]);
    expect(effectBlowsOf(vortexOf(3, 3))).toEqual([]);
    expect(effectBlowsOf(vortexOf(1, 2))).toEqual([]);
  });
});

describe('the instant a curse takes hold', () => {
  it('holds everything still for a moment as a curse on its own takes hold, and neither shakes nor throws', () => {
    for (const moteStyle of ['', 'arc', 'sleep', 'petrify', 'bind']) {
      const blows = effectBlowsOf(makePreset('curse', 3, { durationMs: 3000, moteStyle, tagName: '状態異常' }));

      expect(blows, moteStyle).toHaveLength(1);
      expect(blows[0].holdMs, moteStyle).toBeGreaterThanOrEqual(60);
      expect(blows[0].holdMs, moteStyle).toBeLessThanOrEqual(90);
      expect(blows[0].push, moteStyle).toBe(0);
      expect(blows[0].shake, moteStyle).toBe('');
      expect(blows[0].atMs, moteStyle).toBeGreaterThan(0);
      expect(blows[0].atMs, moteStyle).toBeLessThan(1700);
    }
  });

  it('takes hold when the look of the state does: the vines of a binding later than the band of a blindness', () => {
    const holdsAt = (moteStyle: string) =>
      effectBlowsOf(makePreset('curse', 2, { durationMs: 3000, moteStyle }))[0].atMs;

    expect(holdsAt('bind')).toBe(900);
    expect(holdsAt('blind')).toBe(300);
  });

  it('lands nothing for a curse that is a stage of a run, as before', () => {
    const run = makePreset('curse', 2);
    run.stages = JSON.stringify([{ role: 'impact', kind: 'curse', durationMs: 800 }]);

    expect(effectBlowsOf(run)).toEqual([]);
  });
});

describe('heldEffectClock() and wallClockOf()', () => {
  const blows = [
    { atMs: 200, holdMs: 100, shake: '' as const, push: 0.1 },
    { atMs: 500, holdMs: 50, shake: '' as const, push: 0.1 },
  ];

  it('runs with the wall clock up to the first blow, stands still through its hold, and runs on behind', () => {
    expect([0, 150, 200, 250, 299, 300, 400].map((wall) => heldEffectClock(blows, wall))).toEqual([
      0, 150, 200, 200, 200, 200, 300,
    ]);
  });

  it('stands still again at each later blow, as far behind as every hold before it', () => {
    expect([600, 620, 649, 650, 700].map((wall) => heldEffectClock(blows, wall))).toEqual([500, 500, 500, 500, 550]);
  });

  it('finds on the wall clock when a moment of the effect comes, the inverse of the held clock', () => {
    expect([0, 200, 300, 500, 700].map((effect) => wallClockOf(blows, effect))).toEqual([0, 200, 400, 600, 850]);
    for (const effect of [0, 120, 200, 260, 500, 777])
      expect(heldEffectClock(blows, wallClockOf(blows, effect))).toBe(effect);
  });

  it('runs with the wall clock throughout for an effect that lands no blow', () => {
    expect(heldEffectClock([], 1234)).toBe(1234);
    expect(wallClockOf([], 1234)).toBe(1234);
  });
});

describe('the blows of lightning', () => {
  it('lands a snap and a strike once, as the bolt comes after its leader', () => {
    expect(effectBlowsOf(makePreset('bolt', 1, { durationMs: 1332 }))).toEqual([
      { atMs: 80, holdMs: 60, shake: '', push: 0.06 },
    ]);
    expect(effectBlowsOf(makePreset('bolt', 2, { durationMs: 1567 }))).toEqual([
      { atMs: 200, holdMs: 90, shake: 'soft', push: 0.1 },
    ]);
  });

  it('lands a storm twice, as its column comes down and at the last stroke it ends in, holding both', () => {
    expect(effectBlowsOf(makePreset('bolt', 3, { durationMs: 3048 }))).toEqual([
      { atMs: 550, holdMs: 140, shake: 'hard', push: 0.16 },
      { atMs: 1550, holdMs: 140, shake: 'hard', push: 0.16 },
    ]);
  });

  it('lands a current as it reaches its target, long before it breaks', () => {
    expect(effectBlowsOf(makePreset('arc', 2, { durationMs: 900 }))).toEqual([
      { atMs: 90, holdMs: 90, shake: '', push: 0.1 },
    ]);
  });

  it('lands a bolt that is a stage of a run after the leader of its own grade, within its stage', () => {
    const staged = makePreset('bolt', 2);
    staged.stages = JSON.stringify([
      { role: 'travel', kind: 'projectile', durationMs: 400 },
      { role: 'impact', kind: 'bolt', durationMs: 1500 },
    ] satisfies EffectStage[]);

    expect(effectBlowsOf(staged).map((blow) => blow.atMs)).toEqual([600]);
  });

  it('lands a shot of lightning as the shot lands, once', () => {
    const shot = makePreset('projectile', 2, { impactKind: 'bolt', tagName: '射撃', durationMs: 850 });

    expect(effectBlowsOf(shot)).toEqual([{ atMs: 340, holdMs: 90, shake: '', push: 0.1 }]);
  });
});
