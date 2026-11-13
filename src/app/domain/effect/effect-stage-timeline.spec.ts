import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { type EffectStage } from '@axe/domain/effect/effect-stage';
import { stagedCutPictures, stagedEffectDuration } from '@axe/domain/effect/effect-stage-timeline';
import { type CutPictureContext, cutPictureSprites } from '@axe/domain/effect/effect-timeline';
import { type EffectSpriteOptions } from '@axe/domain/effect/timeline/shared';

describe('stagedCutPictures()', () => {
  const created: EffectPreset[] = [];

  function makePreset(): EffectPreset {
    const preset = new EffectPreset();
    preset.name = 'ためし';
    preset.kind = 'burst';
    preset.colorPrimary = '#ffffff';
    preset.durationMs = 900;
    preset.initialize();
    created.push(preset);
    return preset;
  }

  function stage(overrides: Partial<EffectStage> = {}): EffectStage {
    return { role: 'impact', kind: 'burst', durationMs: 400, ...overrides };
  }

  function castOn(count = 1): EffectCast {
    return {
      presetIdentifier: 'preset',
      casterIdentifier: 'caster',
      origin: { x: 0, y: 0, z: 0 },
      targets: Array.from({ length: count }, (_, index) => ({
        identifier: `target-${index}`,
        x: 400,
        y: 0,
        z: 0,
      })),
      seed: 7,
    };
  }

  const options: EffectSpriteOptions = { baseSize: 50, resolveImage: () => 'blob:token' };

  /** What each stage running at a moment is handed to cut, in the order they are handed it. */
  function handed(
    preset: EffectPreset,
    stages: readonly EffectStage[],
    cast: EffectCast,
    elapsedMs: number
  ): (CutPictureContext & { kind: string })[] {
    const seen: (CutPictureContext & { kind: string })[] = [];
    stagedCutPictures(preset, stages, cast, elapsedMs, options, (kind, context) => seen.push({ ...context, kind }));
    return seen;
  }

  afterEach(() => {
    for (const preset of created.splice(0)) preset.destroy();
  });

  it('hands nothing on for a run with no stages', () => {
    expect(handed(makePreset(), [], castOn(), 0)).toEqual([]);
  });

  it('hands on the stage the clock is inside of', () => {
    const stages = [stage({ role: 'travel', kind: 'projectile', durationMs: 600 }), stage({ kind: 'frost' })];

    expect(handed(makePreset(), stages, castOn(), 300).map((context) => context.kind)).toEqual(['projectile']);
    expect(handed(makePreset(), stages, castOn(), 800).map((context) => context.kind)).toEqual(['frost']);
  });

  it('hands nothing on before the run starts or after it ends', () => {
    expect(handed(makePreset(), [stage()], castOn(), -10)).toEqual([]);
    expect(handed(makePreset(), [stage()], castOn(), 900)).toEqual([]);
  });

  it('gives every stage on every target a key of its own', () => {
    const stages = [stage({ role: 'field', kind: 'flame', durationMs: 800 }), stage({ kind: 'frost' })];

    const prefixes = handed(makePreset(), stages, castOn(3), 200).map((context) => context.prefix);

    expect(prefixes).toContain('2-1');
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('waits for the stagger before the next target starts', () => {
    const preset = makePreset();
    preset.staggerMs = 300;

    expect(handed(preset, [stage()], castOn(2), 100).map((context) => context.prefix)).toEqual(['0-0']);
  });

  it('leaves the effect itself alone while it lays its stages out', () => {
    // The stage lays its own values over a preset everybody at the table shares.
    const preset = makePreset();

    const [context] = handed(preset, [stage({ kind: 'frost', colorPrimary: '#00ffff', grade: 3 })], castOn(), 200);

    expect(context.preset.colorPrimary).toBe('#00ffff');
    expect(preset.kind).toBe('burst');
    expect(preset.colorPrimary).toBe('#ffffff');
    expect(preset.durationMs).toBe(900);
  });

  it('sets each branch of a spawn off away from where the run reached, and on to what it does', () => {
    const withBranches = (branches: number) =>
      handed(
        makePreset(),
        [
          stage({
            role: 'spawn',
            kind: 'burst',
            durationMs: 100,
            branches,
            spreadDeg: 120,
            children: [stage({ kind: 'frost', durationMs: 400 })],
          }),
        ],
        castOn(),
        200
      );

    const branches = withBranches(3).filter((context) => context.kind === 'frost');
    expect(branches).toHaveLength(3);
    expect(branches.every((context) => context.center.x !== 400 || context.center.y !== 0)).toBe(true);
    expect(withBranches(4).filter((context) => context.kind === 'frost')).toHaveLength(4);
  });

  it('tells a stage the length of its own window, not the length of the run', () => {
    const preset = makePreset();
    preset.stages = JSON.stringify([
      { role: 'travel', kind: 'projectile', durationMs: 600 },
      { role: 'impact', kind: 'burst', durationMs: 400 },
    ]);

    expect(handed(preset, preset.stageList, castOn(), 700).map((context) => context.preset.duration)).toEqual([400]);
  });

  it('lays out the same list once however many targets it plays on', () => {
    const seen = new Set(handed(makePreset(), [stage()], castOn(3), 200).map((context) => context.preset));

    expect(seen.size).toBe(1);
  });

  it('runs a field for as long as it was given', () => {
    const stages = [stage({ role: 'field', kind: 'flame', durationMs: 3000 }), stage({ durationMs: 400 })];

    expect(handed(makePreset(), stages, castOn(), 2000).map((context) => context.kind)).toEqual(['flame']);
  });

  it('cuts up a piece’s picture where a stage cuts it, through the cutting a single look has', () => {
    const preset = makePreset();
    const stages = [stage({ kind: 'burst', durationMs: 200 }), stage({ kind: 'dissolve', durationMs: 1000 })];
    preset.stages = JSON.stringify(stages);

    expect(cutPictureSprites(preset, castOn(), 100, options)).toEqual([]);
    expect(cutPictureSprites(preset, castOn(), 900, options).every((piece) => piece.key.startsWith('0-1-'))).toBe(true);
    expect(cutPictureSprites(preset, castOn(), 900, options).length).toBeGreaterThan(0);
  });
});

describe('stagedEffectDuration()', () => {
  it('runs until the last stage finishes', () => {
    expect(
      stagedEffectDuration([
        { role: 'travel', kind: 'projectile', durationMs: 600 },
        { role: 'impact', kind: 'burst', durationMs: 400 },
      ])
    ).toBe(1000);
  });
});
