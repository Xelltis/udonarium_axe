import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectKind } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import {
  drawsOnlyPicturesOver,
  type EffectStagingOptions,
  hasScenePart,
  isDrawnInScene,
  sceneLingerMsOf,
  stageEffect,
} from '@axe/domain/effect/scene/effect-frame';

const CELL = 50;

function makePreset(kind: EffectKind, fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = kind;
  preset.grade = 2;
  preset.durationMs = 1200;
  preset.staggerMs = 100;
  preset.colorPrimary = '#ffd27f';
  preset.colorSecondary = '#ff5a33';
  Object.assign(preset, fields);
  return preset;
}

function castOn(...points: [number, number][]): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: '',
    origin: null,
    targets: points.map(([x, y], index) => ({ identifier: `t${index}`, x, y, z: 0 })),
    seed: 11,
  };
}

function staged(
  preset: EffectPreset,
  cast: EffectCast,
  elapsedMs: number,
  options: Partial<EffectStagingOptions> = {}
): Staged {
  const drawn = nothingStaged();
  stageEffect(preset, cast, elapsedMs, { cellPx: CELL, ...options }, drawn);
  return drawn;
}

describe('isDrawnInScene()', () => {
  it('draws a burst wholly in the scene, and a look that cuts a piece’s picture all but the picture', () => {
    expect(isDrawnInScene(makePreset('burst'))).toBe(true);
    expect(isDrawnInScene(makePreset('bisect'))).toBe(false);
    expect(hasScenePart(makePreset('bisect'))).toBe(true);
    expect(isDrawnInScene({ isStaged: true, effectKind: 'burst' })).toBe(false);
    expect(hasScenePart({ isStaged: true, effectKind: 'burst' })).toBe(false);
    expect(sceneLingerMsOf({ isStaged: true, effectKind: 'burst' })).toBe(0);
    expect(sceneLingerMsOf(makePreset('bisect'))).toBe(0);
  });

  it('draws a run with a stage that cuts a piece’s picture in the scene, but for the picture', () => {
    const run = makePreset('burst', { staggerMs: 0 });
    run.stages = JSON.stringify([
      { role: 'impact', kind: 'burst', durationMs: 400 },
      { role: 'impact', kind: 'bisect', durationMs: 400 },
    ]);
    const cast = castOn([100, 100]);

    expect(isDrawnInScene(run)).toBe(false);
    expect(hasScenePart(run)).toBe(true);
    expect(drawsOnlyPicturesOver(run)).toBe(true);
    expect(sceneLingerMsOf(run)).toBeGreaterThan(0);
    expect(staged(run, cast, 200).motes.length).toBeGreaterThan(0);
    expect(staged(run, cast, 600).motes.length).toBeGreaterThan(0);
  });
});

describe('stageEffect()', () => {
  it('draws on after its playback while what it leaves clears, then nothing, each target after the one before it', () => {
    const preset = makePreset('burst');
    const cast = castOn([100, 100], [300, 100]);
    const lingers = sceneLingerMsOf(preset);

    expect(lingers).toBeGreaterThan(0);
    expect(staged(preset, cast, 1200 + 100 + lingers * 0.5).motes.length).toBeGreaterThan(0);
    expect(staged(preset, cast, 1200 + 100 + lingers + 10).motes).toHaveLength(0);
    const early = staged(preset, cast, 50);
    expect(early.motes.length).toBeGreaterThan(0);
    expect(early.motes.every((mote) => Math.abs(mote.x - 100) < CELL * 4)).toBe(true);
    const both = staged(preset, cast, 150);
    expect(both.motes.some((mote) => Math.abs(mote.x - 300) < CELL)).toBe(true);
  });

  it('skips a hidden target and plays where a target that is followed stands now', () => {
    const preset = makePreset('burst');
    const cast = castOn([100, 100]);

    expect(staged(preset, cast, 100, { hiddenIdentifiers: new Set(['t0']) }).motes).toHaveLength(0);
    const moved = staged(preset, cast, 30, { resolveFooting: () => ({ x: 900, y: 900, z: 0, groundZ: 0 }) });
    expect(moved.floor.every((mark) => mark.x === 900 && mark.y === 900)).toBe(true);
  });

  it('lays its marks on the floor under a target that flies, and lets nothing fall through that floor', () => {
    const preset = makePreset('burst');
    const cast = castOn([100, 100]);
    const flying = { resolveFooting: () => ({ x: 100, y: 100, z: 100, groundZ: 20 }) };

    for (const at of [30, 300, 700, 1100]) {
      const drawn = staged(preset, cast, at, flying);
      expect(drawn.floor.every((mark) => mark.z === 20)).toBe(true);
      expect(drawn.motes.every((mote) => mote.z >= 20)).toBe(true);
    }
  });

  it('grows with a piece of more cells, as large as it is', () => {
    const preset = makePreset('burst');
    const cast = castOn([100, 100]);
    const ringOf = (cells: number) =>
      staged(preset, cast, 100, { resolveSize: () => cells }).floor.find((mark) => mark.shape === 'ring')!.radius;

    expect(ringOf(3)).toBeCloseTo(ringOf(1) * 3, 5);
  });

  it('throws more for a higher grade and less for a lower one', () => {
    const count = (grade: number) => staged(makePreset('burst', { grade }), castOn([100, 100]), 120).motes.length;

    expect(count(3)).toBeGreaterThan(count(2));
    expect(count(2)).toBeGreaterThan(count(1));
  });
});

describe('the looks of fire drawn in the scene', () => {
  const FIRE: readonly EffectKind[] = ['flame', 'nova', 'mushroom', 'breath'];

  it.each(FIRE)('draws %s in the scene while it plays, over the floor, and nothing once it has cleared', (kind) => {
    const preset = makePreset(kind, { durationMs: 3000 });
    const cast = { ...castOn([100, 100]), origin: { x: 400, y: 100, z: 30 } };

    expect(isDrawnInScene(preset)).toBe(true);
    for (const at of [600, 1500, 2600]) {
      const drawn = staged(preset, cast, at);
      expect(drawn.motes.length).toBeGreaterThan(0);
      expect(drawn.motes.every((mote) => mote.z >= 0 && Number.isFinite(mote.x) && Number.isFinite(mote.size))).toBe(
        true
      );
    }
    const cleared = staged(preset, cast, 3000 + sceneLingerMsOf(preset) + 10);
    expect(cleared.motes).toHaveLength(0);
    expect(cleared.floor).toHaveLength(0);
  });

  it('strikes a piece caught round a great blast smaller and a moment after its heart', () => {
    for (const kind of ['nova', 'mushroom'] as const) {
      const preset = makePreset(kind, { durationMs: 3000, areaRadius: 3, grade: 3 });
      const cast = castOn([100, 100], [200, 100]);
      const goesOff = effectBlowsOf(preset)[0].atMs;
      const caughtAt = (elapsed: number) => staged(preset, cast, elapsed).motes.filter((mote) => mote.x > 160);

      expect(caughtAt(goesOff + 20)).toHaveLength(0);
      expect(caughtAt(goesOff + 400).length).toBeGreaterThan(0);
      const heart = staged(preset, castOn([100, 100]), goesOff + 400).motes.length;
      expect(caughtAt(goesOff + 400).length).toBeLessThan(heart);
    }
  });

  it('breathes fire out of the caster towards the target, from the caster as it stands now', () => {
    const preset = makePreset('breath', { durationMs: 3000 });
    const cast = { ...castOn([100, 100]), casterIdentifier: 'caster', origin: { x: 400, y: 100, z: 30 } };
    const nearest = (drawn: Staged) => Math.max(...drawn.motes.map((mote) => mote.x));

    expect(nearest(staged(preset, cast, 40))).toBeGreaterThan(360);
    const moved = staged(preset, cast, 40, {
      resolveFooting: (identifier) => (identifier === 'caster' ? { x: 600, y: 100, z: 0, groundZ: 0 } : null),
    });
    expect(nearest(moved)).toBeGreaterThan(560);
  });
});

describe('the cuts and blows drawn in the scene', () => {
  it('draws a cut as bands of light sweeping across the target, and a blow as a star of spikes', () => {
    const cut = makePreset('slash', { durationMs: 1000 });
    cut.slashStyle = 'single';
    const cast = { ...castOn([100, 100]), origin: { x: 300, y: 100, z: 30 } };
    const crosses = effectBlowsOf(cut)[0].atMs;

    expect(isDrawnInScene(cut)).toBe(true);
    expect(staged(cut, cast, crosses).ribbons.length).toBeGreaterThan(0);
    const blow = makePreset('bash', { durationMs: 1000 });
    const struck = staged(blow, cast, effectBlowsOf(blow)[0].atMs + 30);
    expect(struck.motes.some((mote) => mote.shape === 'tongue')).toBe(true);
  });

  it('swings its arc about its caster, through the target, not round it', () => {
    const cut = makePreset('slash', { durationMs: 1000 });
    cut.slashStyle = 'single';
    const cast = { ...castOn([100, 100]), origin: { x: 300, y: 100, z: 30 } };
    const crosses = effectBlowsOf(cut)[0].atMs;
    const edge = staged(cut, cast, crosses + 250).ribbons.find((ribbon) => ribbon.blend === 'color' && ribbon.core)!;
    const xs = edge.points.map((point) => point.x);

    // The caster stands to the east: the arc reaches no further west than the target, and curves back east.
    expect(Math.min(...xs)).toBeCloseTo(100, 0);
    expect(xs[xs.length - 1]).toBeGreaterThan(110);
  });

  it('draws a cut as a crescent, thin at both ends, which thins and fades where it lies once the blade has passed', () => {
    const cut = makePreset('slash', { durationMs: 1000 });
    cut.slashStyle = 'single';
    const cast = { ...castOn([100, 100]), origin: { x: 300, y: 100, z: 30 } };
    const crosses = effectBlowsOf(cut)[0].atMs;
    const edgeAt = (ms: number) =>
      staged(cut, cast, ms).ribbons.find((ribbon) => ribbon.blend === 'color' && ribbon.core)!;

    const swinging = edgeAt(crosses);
    const widths = swinging.widths as number[];
    expect(widths[0]).toBeLessThan(Math.max(...widths) * 0.15);
    expect(widths[widths.length - 1]).toBeLessThan(Math.max(...widths) * 0.15);
    const passed = edgeAt(crosses + 240);
    const later = edgeAt(crosses + 300);
    expect(later.points.at(-1)).toEqual(passed.points.at(-1));
    expect(later.alpha).toBeLessThan(passed.alpha);
    expect(Math.max(...(later.widths as number[]))).toBeLessThan(Math.max(...(passed.widths as number[])));
  });

  it.each(['single', 'combo', 'iai', 'wide', 'heavy'] as const)(
    'keeps every blade of a %s cut over the floor',
    (style) => {
      const cut = makePreset('slash', { durationMs: 2500, grade: 3 });
      cut.slashStyle = style;
      const cast = { ...castOn([100, 100]), origin: { x: 300, y: 100, z: 30 } };
      for (let at = 0; at < 3000; at += 25) {
        for (const ribbon of staged(cut, cast, at).ribbons) {
          expect(ribbon.points.every((point) => point.z >= CELL * 0.1)).toBe(true);
        }
      }
    }
  );

  it('brings a cleave down from above', () => {
    const cleave = makePreset('slash', { durationMs: 2000, grade: 3 });
    cleave.slashStyle = 'heavy';
    const cast = { ...castOn([100, 100]), origin: { x: 300, y: 100, z: 30 } };
    const crosses = effectBlowsOf(cleave)[0].atMs;
    const headAt = (ms: number) => {
      const edge = staged(cleave, cast, ms).ribbons.find((ribbon) => ribbon.blend === 'color' && ribbon.core);
      return edge!.points[edge!.points.length - 1].z;
    };

    expect(headAt(crosses - 40)).toBeGreaterThan(headAt(crosses + 60));
  });

  it('draws the great blade in the scene with the look it strikes with, a picture it cuts left over the table', () => {
    const blade = makePreset('skyblade', { durationMs: 3000 });
    blade.impactKind = 'flame';
    expect(isDrawnInScene(blade)).toBe(true);
    blade.impactKind = 'bisect';
    expect(isDrawnInScene(blade)).toBe(false);
    expect(drawsOnlyPicturesOver(blade)).toBe(true);
    expect(sceneLingerMsOf(blade)).toBe(sceneLingerMsOf(makePreset('skyblade', { impactKind: 'flame' })));
    const cast = { ...castOn([100, 100]), origin: { x: 400, y: 100, z: 30 } };
    expect(staged(blade, cast, 1000).ribbons.length + staged(blade, cast, 1000).motes.length).toBeGreaterThan(0);
  });

  it('strikes as a burst where a shot names a look that itself strikes with another', () => {
    const shot = makePreset('projectile', { durationMs: 1200, staggerMs: 0 });
    shot.impactKind = 'ballistic';
    const burstShot = makePreset('projectile', { durationMs: 1200, staggerMs: 0 });
    burstShot.impactKind = 'burst';
    const cast = { ...castOn([100, 100]), origin: { x: 400, y: 100, z: 30 } };
    const landsAt = effectBlowsOf(shot)[0].atMs;

    expect(isDrawnInScene(shot)).toBe(true);
    expect(staged(shot, cast, landsAt + 200)).toEqual(staged(burstShot, cast, landsAt + 200));
  });
});

describe('every look drawn in the scene', () => {
  const KINDS: readonly EffectKind[] = [
    'projectile',
    'ballistic',
    'arrowrain',
    'beam',
    'raybeam',
    'arc',
    'drain',
    'bolt',
    'frost',
    'vortex',
    'heal',
    'aura',
    'barrier',
    'warp',
    'curse',
    'miasma',
    'gravity',
    'impact',
    'rubble',
    'upheaval',
  ];

  it.each(KINDS)('draws %s while it plays, finite and over the floor, and nothing once it has cleared', (kind) => {
    const preset = makePreset(kind, { durationMs: 2000, grade: 2 });
    const cast = { ...castOn([100, 100]), origin: { x: 300, y: 100, z: 30 } };

    expect(isDrawnInScene(preset)).toBe(true);
    let drew = 0;
    for (let at = 0; at < 2000 + sceneLingerMsOf(preset); at += 50) {
      const drawn = staged(preset, cast, at);
      drew += drawn.motes.length + drawn.ribbons.length;
      for (const mote of drawn.motes) {
        expect([mote.x, mote.y, mote.z, mote.size, mote.alpha].every(Number.isFinite)).toBe(true);
        expect(mote.z).toBeGreaterThanOrEqual(-0.001);
      }
      for (const ribbon of drawn.ribbons) {
        expect(ribbon.points.every((point) => [point.x, point.y, point.z].every(Number.isFinite))).toBe(true);
      }
    }
    expect(drew).toBeGreaterThan(0);
    const cleared = staged(preset, cast, 2000 + sceneLingerMsOf(preset) + 10);
    expect(cleared.motes.length + cleared.ribbons.length + cleared.floor.length).toBe(0);
  });

  it('lands a shot with the look its preset gives for landing', () => {
    const shot = makePreset('projectile', { durationMs: 1000 });
    shot.impactKind = 'frost';
    const cast = { ...castOn([100, 100]), origin: { x: 300, y: 100, z: 30 } };
    const landed = staged(shot, cast, 900);

    expect(isDrawnInScene(shot)).toBe(true);
    expect(landed.motes.some((mote) => mote.shape === 'tongue')).toBe(true);
  });
});

describe('a volley of missiles', () => {
  it('flies each missile on its own course and lands them apart', () => {
    const volley = makePreset('projectile', { durationMs: 2100 });
    volley.projectileStyle = 'missile';
    volley.shots = 4;
    volley.shotInterval = 120;
    volley.impactKind = 'burst';
    const cast = { ...castOn([100, 100]), origin: { x: 500, y: 100, z: 30 } };
    // Two missiles in the air at once: their heads, the comets of their bodies, are in different places.
    const flying = staged(volley, cast, 330).motes.filter((mote) => mote.shape === 'comet' && mote.color !== '#d9dde2');
    const ys = flying.map((mote) => Math.round(mote.y));
    expect(new Set(ys).size).toBeGreaterThan(1);
    // Every one has landed by the end: the marks they leave are not all on one spot.
    const landed = staged(volley, cast, 2000).floor.filter((mark) => mark.shape === 'scorch');
    expect(new Set(landed.map((mark) => `${Math.round(mark.x)}|${Math.round(mark.y)}`)).size).toBeGreaterThan(1);
  });
});

describe('the things that fly', () => {
  const cast = { ...castOn([100, 100]), origin: { x: 600, y: 100, z: 30 } };
  /** Whether what is drawn holds a band drawn to a point: the head of an arrow or the nose of a missile. */
  const pointed = (drawn: Staged) =>
    drawn.ribbons.some(
      (ribbon) =>
        Array.isArray(ribbon.widths) && ribbon.widths.at(-1) === 0 && ribbon.widths[0] > 0 && ribbon.blend === 'color'
    );

  it('flies an arrow as an arrow, with its shaft, its head and its feathers', () => {
    const arrow = makePreset('projectile', { durationMs: 1000 });
    arrow.projectileStyle = 'arrow';
    const flying = staged(arrow, cast, 120);

    expect(pointed(flying)).toBe(true);
    expect(flying.ribbons.filter((ribbon) => ribbon.blend === 'color').length).toBeGreaterThanOrEqual(5);
  });

  it('flies a cruise missile as a missile, with its nose, its fins and its flame', () => {
    const missile = makePreset('projectile', { durationMs: 2600 });
    missile.projectileStyle = 'cruise';
    const flying = staged(missile, cast, 600);

    expect(pointed(flying)).toBe(true);
    expect(flying.motes.some((mote) => mote.shape === 'comet' && mote.blend === 'light')).toBe(true);
  });

  it('rains arrows as arrows, falling and then standing where they struck', () => {
    const rain = makePreset('arrowrain', { durationMs: 2400 });
    const falling = staged(rain, cast, 1300);
    const stuck = staged(rain, cast, 2300);

    expect(pointed(falling)).toBe(true);
    expect(stuck.ribbons.length).toBeGreaterThan(20);
  });
});

describe('a run of stages drawn in the scene', () => {
  it('draws each stage where and when it runs: the shot flying, then what it bursts into at the target', () => {
    const run = makePreset('projectile', { durationMs: 1200 });
    run.stages = JSON.stringify([
      { role: 'travel', kind: 'projectile', durationMs: 500 },
      { role: 'impact', kind: 'burst', durationMs: 400 },
    ]);
    const cast = { ...castOn([100, 100]), origin: { x: 600, y: 100, z: 30 } };

    expect(isDrawnInScene(run)).toBe(true);
    const flying = staged(run, cast, 250);
    expect(flying.motes.length + flying.ribbons.length).toBeGreaterThan(0);
    expect(flying.floor.filter((mark) => mark.shape === 'scorch')).toHaveLength(0);
    const burst = staged(run, cast, 650);
    expect(burst.floor.some((mark) => mark.shape === 'scorch' && Math.abs(mark.x - 100) < 1)).toBe(true);
    expect(sceneLingerMsOf(run)).toBeGreaterThan(0);
  });

  it('throws each branch of a spawn its own way', () => {
    const run = makePreset('projectile', { durationMs: 1200 });
    run.stages = JSON.stringify([
      { role: 'travel', kind: 'projectile', durationMs: 300 },
      {
        role: 'spawn',
        kind: 'burst',
        durationMs: 120,
        branches: 3,
        spreadDeg: 120,
        children: [{ role: 'impact', kind: 'burst', durationMs: 400 }],
      },
    ]);
    const cast = { ...castOn([100, 100]), origin: { x: 600, y: 100, z: 30 } };
    const scorches = staged(run, cast, 420).floor.filter((mark) => mark.shape === 'scorch');

    expect(new Set(scorches.map((mark) => `${Math.round(mark.x)}|${Math.round(mark.y)}`)).size).toBeGreaterThan(2);
  });
});

describe('the looks that strike a piece down', () => {
  const cast = { ...castOn([100, 100]), origin: { x: 600, y: 100, z: 30 } };

  it('draws blood wholly in the scene: drops flying, then splats where they land', () => {
    const gore = makePreset('gore', { durationMs: 1300 });
    expect(isDrawnInScene(gore)).toBe(true);
    expect(staged(gore, cast, 100).motes.length).toBeGreaterThan(10);
    expect(staged(gore, cast, 1200).floor.filter((mark) => mark.shape === 'scorch').length).toBeGreaterThan(5);
  });

  it('leaves the picture of a piece cut in two over the table and draws the rest in the scene', () => {
    const cut = makePreset('bisect', { durationMs: 2000 });
    expect(isDrawnInScene(cut)).toBe(false);
    expect(hasScenePart(cut)).toBe(true);
    expect(drawsOnlyPicturesOver(cut)).toBe(true);
    expect(staged(cut, cast, 300).motes.length).toBeGreaterThan(0);
    expect(sceneLingerMsOf(cut)).toBe(0);
  });
});

describe('the looks the fourth review asked to be drawn again', () => {
  const cast = { ...castOn([400, 100]), origin: { x: 100, y: 100, z: 30 } };

  it('launches a ballistic missile straight up off its pad before bringing it down on its mark', () => {
    const missile = makePreset('ballistic', { durationMs: 4200, staggerMs: 0 });
    const lands = effectBlowsOf(missile)[0].atMs;
    const bodyAt = (ms: number) => staged(missile, cast, ms).ribbons.filter((ribbon) => ribbon.blend === 'color');

    const climbing = bodyAt(lands * 0.2);
    expect(climbing.length).toBeGreaterThan(0);
    expect(climbing.every((ribbon) => ribbon.points.every((point) => Math.abs(point.x - 100) < CELL))).toBe(true);
    const diving = bodyAt(lands * 0.9);
    expect(diving.length).toBeGreaterThan(0);
    expect(diving.every((ribbon) => ribbon.points.every((point) => Math.abs(point.x - 400) < CELL * 3))).toBe(true);
    expect(staged(missile, cast, lands * 0.7).floor.some((mark) => mark.shape === 'sigil')).toBe(true);
  });
});
