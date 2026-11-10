import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectKind } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import {
  type EffectStagingOptions,
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
  it('draws a burst in the scene, and leaves a look not yet made anew and a run of stages to be drawn over it', () => {
    expect(isDrawnInScene(makePreset('burst'))).toBe(true);
    expect(isDrawnInScene(makePreset('frost'))).toBe(false);
    expect(isDrawnInScene({ isStaged: true, effectKind: 'burst' })).toBe(false);
    expect(sceneLingerMsOf({ isStaged: true, effectKind: 'burst' })).toBe(0);
    expect(sceneLingerMsOf(makePreset('frost'))).toBe(0);
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

  it('draws the great blade in the scene only once the look it strikes with is drawn there', () => {
    const blade = makePreset('skyblade', { durationMs: 3000 });
    blade.impactKind = 'flame';
    expect(isDrawnInScene(blade)).toBe(true);
    blade.impactKind = 'frost';
    expect(isDrawnInScene(blade)).toBe(false);
    expect(sceneLingerMsOf(blade)).toBe(0);
  });
});
