import { breathTimingOf } from '@axe/domain/effect/breath-timing';
import { createDefaultEffectPresets } from '@axe/domain/effect/builtin-effect-presets';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { type EffectStagingOptions, sceneLingerMsOf, stageEffect } from '@axe/domain/effect/scene/effect-frame';
import { EFFECT_FRAME_BUDGET } from '@axe/domain/effect/scene/effect-scene';

const CELL = 50;
const CASTER = { x: 100, y: 300, z: 0, groundZ: 0 };
const BREATHS = createDefaultEffectPresets().filter((preset) => preset.effectKind === 'breath');

function breathOf(tagName: string, fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = 'breath';
  preset.grade = 2;
  preset.durationMs = 3000;
  preset.staggerMs = 110;
  preset.tagName = tagName;
  Object.assign(preset, fields);
  return preset;
}

function castOn(...points: [number, number][]): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: 'caster',
    origin: { x: CASTER.x, y: CASTER.y, z: 30 },
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
  stageEffect(
    preset,
    cast,
    elapsedMs,
    { cellPx: CELL, resolveFooting: (identifier) => (identifier === 'caster' ? CASTER : null), ...options },
    drawn
  );
  return drawn;
}

/** The gouts of the stream itself: held to their own depth, a fifth of a cell towards the eye. */
function streamOf(drawn: Staged) {
  return drawn.motes.filter((mote) => mote.exactDepth && mote.forward === CELL * 0.2);
}

/** The shapes that flow, which are placed by their far end: see {@link middleOf}. */
const FLOWING = new Set(['lick', 'wisp', 'jet', 'gust']);

/** Where the middle of a part of the stream is: a shape that flows is placed by its far end and drawn back from it. */
function middleOf(mote: Staged['motes'][number]): { x: number; y: number; z: number } {
  if (!FLOWING.has(mote.shape) || !mote.velocity) return mote;
  const half = ((mote.trail ?? 0) * 100 + mote.size) / 2;
  return {
    x: mote.x - (mote.velocity.x / 100) * half,
    y: mote.y - (mote.velocity.y / 100) * half,
    z: mote.z - (mote.velocity.z / 100) * half,
  };
}

/** The gouts of a stream, without the sheets of its jet. */
function goutsOf(drawn: Staged) {
  return streamOf(drawn).filter((mote) => mote.shape !== 'jet' && mote.shape !== 'gust');
}

const ONE = castOn([400, 300]);
const FOUR = castOn([400, 300], [450, 250], [450, 350], [500, 300]);

describe('a breath', () => {
  it('is drawn in at the mouth before it bursts, with nothing yet down the cone', () => {
    const fire = breathOf('炎');
    const drawn = staged(fire, ONE, 120);

    expect(streamOf(drawn)).toHaveLength(0);
    expect(drawn.motes.length).toBeGreaterThan(8);
    for (const mote of drawn.motes) expect(Math.hypot(mote.x - 120, mote.y - 300)).toBeLessThan(CELL * 1.6);
  });

  it('reaches the target 0.15 seconds after it bursts', () => {
    const fire = breathOf('炎');
    const timing = breathTimingOf(3);
    const furthest = (ms: number) => Math.max(...goutsOf(staged(fire, ONE, ms)).map((mote) => middleOf(mote).x));

    expect(furthest(timing.burstsAt * 1000 + 50)).toBeLessThan(370);
    expect(furthest(timing.reachesAt * 1000 + 10)).toBeGreaterThan(370);
  });

  it('is white at the mouth for an instant as it bursts', () => {
    const timing = breathTimingOf(3);
    const flash = (ms: number) =>
      staged(breathOf('炎'), ONE, ms).motes.filter(
        (mote) => mote.color === '#ffffff' && mote.shape === 'puff' && mote.size > CELL * 0.59
      ).length;

    expect(flash(timing.burstsAt * 1000 + 20)).toBe(1);
    expect(flash(timing.burstsAt * 1000 + 80)).toBe(0);
  });

  it('keeps blowing as thick to four fifths of a long breath, then thins from the mouth and leaves the cone empty', () => {
    const fire = breathOf('炎', { durationMs: 4000 });
    const timing = breathTimingOf(4);
    const thick = [1000, 1700, 2400, 3100].map((ms) => streamOf(staged(fire, ONE, ms)).length);
    const failing = streamOf(staged(fire, ONE, timing.spentAt * 1000 + 250));

    expect(Math.min(...thick)).toBeGreaterThan(150);
    expect(Math.max(...thick) - Math.min(...thick)).toBeLessThan(Math.max(...thick) * 0.25);
    expect(failing.length).toBeGreaterThan(0);
    expect(Math.min(...failing.map((mote) => mote.x))).toBeGreaterThan(160);
    expect(streamOf(staged(fire, ONE, timing.spentAt * 1000 + 1500)).length).toBeLessThan(10);
  });

  it('blows one cone over all its targets rather than a stream at each', () => {
    const fire = breathOf('炎');
    const one = streamOf(staged(fire, ONE, 1500)).length;
    const four = streamOf(staged(fire, FOUR, 1500)).length;

    expect(four).toBeLessThan(one * 2);
  });

  it('holds all of the stream to its own depth, so a piece it passes behind hides it, with the mouth set before the caster', () => {
    const timing = breathTimingOf(3);
    const drawn = staged(breathOf('炎'), ONE, 1500);
    const atMouth = drawn.motes.filter((mote) => Math.hypot(mote.x - 120, mote.y - 300) < 0.01 && mote.z === 30);
    const about = (ms: number) => staged(breathOf('炎'), ONE, ms).motes.filter((mote) => mote.x < 250);

    expect(streamOf(drawn).length).toBeGreaterThan(drawn.motes.length * 0.6);
    expect(atMouth.length).toBeGreaterThan(1);
    expect(atMouth.every((mote) => mote.exactDepth && mote.forward! > CELL * 0.2)).toBe(true);
    for (const ms of [100, timing.burstsAt * 1000 + 20, 1500]) {
      expect(about(ms).length).toBeGreaterThan(0);
      expect(about(ms).every((mote) => mote.exactDepth)).toBe(true);
    }
  });

  it('starts before the caster, and further before and higher above a larger one', () => {
    const fire = breathOf('炎');
    const nearest = (cells: number) => {
      const stream = streamOf(staged(fire, ONE, 1500, { resolveSize: (id) => (id === 'caster' ? cells : 1) }));
      return Math.min(...stream.map((mote) => mote.x));
    };
    const highest = (cells: number) => {
      const stream = streamOf(staged(fire, ONE, 1500, { resolveSize: (id) => (id === 'caster' ? cells : 1) }));
      return Math.max(...stream.filter((mote) => mote.x < 220).map((mote) => mote.z));
    };

    expect(nearest(1)).toBeGreaterThan(CASTER.x + CELL * 0.3);
    expect(nearest(3)).toBeGreaterThan(CASTER.x + CELL * 1.1);
    expect(highest(3)).toBeGreaterThan(highest(1) + CELL * 0.6);
  });

  it('breaks on the target: almost nothing of the stream is drawn inside it or far past it', () => {
    const drawn = goutsOf(staged(breathOf('炎'), ONE, 1500)).map(middleOf);
    const inside = drawn.filter((mote) => Math.hypot(mote.x - 400, mote.y - 300) < CELL * 0.3 && mote.z < CELL);
    const past = drawn.filter((mote) => mote.x > 400 + CELL * 2.2);
    const about = drawn.filter((mote) => Math.hypot(mote.x - 400, mote.y - 300) < CELL * 1.2);

    expect(inside.length).toBeLessThan(drawn.length * 0.03);
    expect(past.length).toBeLessThan(drawn.length * 0.03);
    expect(about.length).toBeGreaterThan(drawn.length * 0.15);
  });

  it('leaves out a hidden target, blowing only over those that are drawn', () => {
    const fire = breathOf('炎');
    const cast = castOn([400, 300], [100, 700]);
    const drawn = staged(fire, cast, 1500, { hiddenIdentifiers: new Set(['t1']) });
    const all = staged(fire, cast, 1500);

    expect(Math.max(...drawn.motes.map((mote) => mote.y))).toBeLessThan(450);
    expect(Math.max(...all.motes.map((mote) => mote.y))).toBeGreaterThan(550);
  });

  it('blows from the next target that is drawn where the first is hidden', () => {
    const drawn = staged(breathOf('炎'), castOn([100, 700], [400, 300]), 1500, {
      hiddenIdentifiers: new Set(['t0']),
    });

    expect(streamOf(drawn).length).toBeGreaterThan(100);
    expect(Math.max(...drawn.motes.map((mote) => mote.y))).toBeLessThan(450);
  });

  it('leaves what burns on the floor after the stream is gone, and nothing once it has cleared', () => {
    const fire = breathOf('炎');
    const timing = breathTimingOf(3);
    const after = staged(fire, ONE, timing.spentAt * 1000 + 1200);
    const cleared = staged(fire, ONE, 3000 + sceneLingerMsOf(fire) + 10);

    expect(streamOf(after).length).toBeLessThan(10);
    expect(after.floor.some((mark) => mark.shape === 'scorch')).toBe(true);
    expect(after.motes.length).toBeGreaterThan(3);
    expect(cleared.motes).toHaveLength(0);
    expect(cleared.floor).toHaveLength(0);
    expect(cleared.ribbons).toHaveLength(0);
  });

  it('leaves its marks on each target as the stream reaches it, the later targets later', () => {
    const fire = breathOf('炎');
    const timing = breathTimingOf(3);
    const marksAt = (ms: number) => staged(fire, FOUR, ms).floor.filter((mark) => mark.shape === 'scorch').length;

    expect(marksAt(timing.reachesAt * 1000 + 30)).toBeLessThan(marksAt(timing.reachesAt * 1000 + 400));
  });

  it('draws in the same breath for a stage of a run, at the place the stage plays', () => {
    const run = breathOf('炎');
    run.stages = JSON.stringify([{ kind: 'breath', durationMs: 2000, role: 'impact' }]);
    const drawn = staged(run, ONE, 1000);

    expect(run.isStaged).toBe(true);
    expect(streamOf(drawn).length).toBeGreaterThan(50);
  });
});

describe('the jet of a breath', () => {
  const jetsOf = (drawn: Staged) => streamOf(drawn).filter((mote) => mote.shape === 'jet' || mote.shape === 'gust');
  const reachOf = (mote: Staged['motes'][number]) => (mote.trail ?? 0) * 100 + mote.size;

  it('runs from the mouth to the piece the stream breaks on, narrow for a short breath and never wider than it is long', () => {
    const far = jetsOf(staged(breathOf('炎'), ONE, 1500));
    const near = jetsOf(staged(breathOf('炎'), castOn([200, 300]), 1500));

    expect(far.length).toBeGreaterThan(2);
    expect(Math.max(...far.map((jet) => jet.x))).toBeGreaterThan(350);
    for (const jet of far) {
      expect(jet.x).toBeGreaterThan(250);
      expect(jet.x).toBeLessThan(400 + CELL * 0.5);
      expect(Math.abs(jet.y - 300)).toBeLessThan(CELL * 0.6);
    }
    for (const jet of near) {
      expect(reachOf(jet)).toBeGreaterThanOrEqual(jet.size);
      expect(jet.x).toBeLessThan(200 + CELL * 0.5);
    }
  });

  it('is not yet blown while the breath is drawn in, grows with the front of the stream and is gone once the breath is spent', () => {
    const timing = breathTimingOf(3);
    const fire = breathOf('炎');
    const longest = (ms: number) => Math.max(0, ...jetsOf(staged(fire, ONE, ms)).map(reachOf));

    expect(longest(timing.burstsAt * 1000 - 50)).toBe(0);
    expect(longest(timing.burstsAt * 1000 + 60)).toBeLessThan(longest(timing.reachesAt * 1000 + 100));
    expect(longest(timing.spentAt * 1000 + 50)).toBe(0);
  });

  it('runs its pattern down it as it blows', () => {
    const fire = breathOf('炎');
    const flowed = (ms: number) => jetsOf(staged(fire, ONE, ms))[1].spin!;

    expect(flowed(1600)).toBeGreaterThan(flowed(1500));
  });

  it('breaks on a piece that stands in its way and is no target of it', () => {
    const fire = breathOf('炎');
    const standing = { x: 250, y: 300, z: 0, groundZ: 0 };
    const withBystander = staged(fire, ONE, 1500, {
      resolveStanding: () => ['caster', 't0', 'bystander'],
      resolveFooting: (identifier) => (identifier === 'caster' ? CASTER : identifier === 'bystander' ? standing : null),
    });
    const open = staged(fire, ONE, 1500, { resolveStanding: () => ['caster', 't0'] });
    const furthest = (drawn: Staged) => Math.max(...jetsOf(drawn).map((jet) => jet.x));
    const beyond = (drawn: Staged) => goutsOf(drawn).filter((mote) => middleOf(mote).x > 300).length;

    expect(furthest(open)).toBeGreaterThan(350);
    expect(furthest(withBystander)).toBeLessThan(250 + CELL * 0.4);
    expect(beyond(withBystander)).toBeLessThan(beyond(open) * 0.7);
  });

  it('passes by a piece standing beside its cone or behind its caster', () => {
    const fire = breathOf('炎');
    const places: Record<string, { x: number; y: number; z: number; groundZ: number }> = {
      caster: CASTER,
      beside: { x: 250, y: 500, z: 0, groundZ: 0 },
      behind: { x: 0, y: 300, z: 0, groundZ: 0 },
    };
    const drawn = staged(fire, ONE, 1500, {
      resolveStanding: () => ['beside', 'behind'],
      resolveFooting: (identifier) => places[identifier] ?? null,
    });

    expect(JSON.stringify(drawn)).toBe(JSON.stringify(staged(fire, ONE, 1500)));
  });
});

describe('the elements of a breath', () => {
  const at = (tagName: string, ms = 1500, cast = ONE) => staged(breathOf(tagName), cast, ms);
  const shapes = (drawn: Staged) => new Set(drawn.motes.map((mote) => mote.shape));

  it('burns as fire: a jet and licks of flame laid deepest first, tongues off its edge, a scorch and little fires left burning', () => {
    const fire = at('炎');
    const timing = breathTimingOf(3);
    const left = at('炎', timing.spentAt * 1000 + 600);
    const licks = streamOf(fire).filter((mote) => mote.shape === 'lick' && mote.blend === 'color');
    const jets = streamOf(fire).filter((mote) => mote.shape === 'jet');
    const ramp = [...new Set([...jets, ...licks].map((mote) => mote.color))];
    const firstOf = (color: string) => fire.motes.findIndex((mote) => mote.shape === 'lick' && mote.color === color);

    expect(licks.length).toBeGreaterThan(100);
    expect(jets).toHaveLength(5);
    expect(jets[0].size).toBeGreaterThan(jets[4].size * 2);
    expect(ramp.length).toBeGreaterThanOrEqual(4);
    expect(firstOf(jets[0].color)).toBeLessThan(firstOf(jets[1].color));
    expect(firstOf(jets[1].color)).toBeLessThan(firstOf(jets[2].color));
    expect(shapes(fire).has('tongue')).toBe(true);
    expect(fire.lights.length).toBeGreaterThan(0);
    expect(left.floor.some((mark) => mark.shape === 'scorch' && mark.blend === 'color')).toBe(true);
    expect(left.motes.filter((mote) => mote.shape === 'puff' && mote.z < CELL * 0.5).length).toBeGreaterThan(2);
  });

  it('blows ice as a fog that sinks, with crystals, and leaves frost creeping out and a mist', () => {
    const ice = at('氷');
    const early = at('氷', 700);
    const frostOf = (drawn: Staged) =>
      Math.max(...drawn.floor.filter((mark) => mark.shape === 'cracks').map((mark) => mark.radius));

    const frosted = (drawn: Staged) =>
      drawn.floor.filter((mark) => mark.shape === 'scorch').reduce((sum, mark) => sum + mark.radius * mark.alpha, 0);

    expect(streamOf(ice).filter((mote) => mote.shape === 'wisp').length).toBeGreaterThan(40);
    expect(streamOf(ice).some((mote) => mote.shape === 'gust' && mote.blend === 'color')).toBe(true);
    expect(shapes(ice).has('flake')).toBe(true);
    expect(early.floor.filter((mark) => mark.shape === 'scorch').length).toBeGreaterThan(1);
    expect(frosted(ice)).toBeGreaterThan(frosted(at('氷', 450)));
    expect(frostOf(ice)).toBeGreaterThan(frostOf(early));
    expect(at('氷', 3600).motes.some((mote) => mote.shape === 'smoke')).toBe(true);
  });

  it('blows poison as a fog of colour with no light in its body, and leaves stains and a fog that clings', () => {
    const poison = at('状態異常');
    const body = streamOf(poison);
    const left = at('状態異常', 3600);

    expect(body.filter((mote) => mote.blend === 'color').length).toBeGreaterThan(body.length * 0.85);
    expect(left.floor.filter((mark) => mark.shape === 'scorch').length).toBeGreaterThanOrEqual(5);
    expect(left.motes.filter((mote) => mote.shape === 'smoke').length).toBeGreaterThanOrEqual(8);
  });

  it('blows thunder as four bolts that take another shape every twentieth of a second, forking off the target', () => {
    const thunder = at('雷', 1500, FOUR);
    const next = at('雷', 1560, FOUR);
    const shapeOf = (drawn: Staged) => JSON.stringify(drawn.ribbons[0].points);

    expect(
      thunder.ribbons.filter(
        (ribbon) => ribbon.core === '#ffffff' && [1.5, 2].some((thick) => ribbon.widths === CELL * 0.16 * thick)
      ).length
    ).toBe(4);
    expect(shapeOf(thunder)).not.toBe(shapeOf(next));
    expect(thunder.ribbons.length).toBeGreaterThan(4 * 7);
    expect(thunder.floor.some((mark) => mark.shape === 'scorch')).toBe(true);
  });

  it('blows wind as white streaks and coils with leaves and grit, throwing no light and leaving no mark', () => {
    const wind = at('風');
    const coils = wind.ribbons.filter((ribbon) => ribbon.color === '#ffffff' && ribbon.blend === 'color');

    expect(coils).toHaveLength(4);
    expect(
      coils.every((coil) => (coil.widths as number[])[0] < 0.001 && (coil.widths as number[]).at(-1)! < 0.001)
    ).toBe(true);
    expect(wind.motes.filter((mote) => mote.shape === 'spark' && mote.color === '#ffffff').length).toBeGreaterThan(15);
    expect(shapes(wind).has('chunk')).toBe(true);
    expect(wind.lights).toHaveLength(0);
    expect(wind.floor).toHaveLength(0);
  });

  it('blows darkness as a black body edged in its colour, with tongues at its edge, darkening the floor and throwing no light', () => {
    const dark = at('闇');
    const jets = streamOf(dark).filter((mote) => mote.shape === 'jet');

    expect(streamOf(dark).filter((mote) => mote.shape === 'lick' && mote.blend === 'color').length).toBeGreaterThan(40);
    expect(jets.at(-1)!.core).toBe('#000000');
    expect(jets[0].color).not.toBe(jets.at(-1)!.color);
    expect(shapes(dark).has('tongue')).toBe(true);
    expect(dark.lights).toHaveLength(0);
    expect(dark.floor.some((mark) => mark.shape === 'disc' && mark.blend === 'color' && mark.color === '#000000')).toBe(
      true
    );
  });

  it('breathes the breath that heals at half the pace, with no scorch, no hard flame and a ring of light', () => {
    const holy = at('回復');
    const timing = breathTimingOf(3);
    const reach = (tagName: string) =>
      Math.max(...streamOf(at(tagName, timing.spentAt * 1000 + 350)).map((mote) => mote.x), 0);

    expect(holy.floor.some((mark) => mark.shape === 'scorch')).toBe(false);
    expect(holy.floor.some((mark) => mark.shape === 'ring' && mark.blend === 'light')).toBe(true);
    expect(streamOf(holy).some((mote) => mote.shape === 'puff' || mote.shape === 'lick' || mote.shape === 'jet')).toBe(
      false
    );
    expect(shapes(holy).has('star')).toBe(true);
    expect(streamOf(at('回復', timing.spentAt * 1000 + 350)).length).toBeGreaterThan(
      streamOf(at('炎', timing.spentAt * 1000 + 350)).length
    );
    expect(reach('回復')).toBeGreaterThan(0);
  });
});

describe('the breaths that come with the room', () => {
  const heaviest = (preset: EffectPreset): EffectPreset => {
    preset.grade = 3;
    return preset;
  };
  const frames = (preset: EffectPreset, cast: EffectCast, visit: (drawn: Staged, ms: number) => void) => {
    const ends = preset.totalDuration(cast.targets.length) + sceneLingerMsOf(preset);
    for (let ms = 0; ms <= ends; ms += 50) visit(staged(preset, cast, ms, { resolveSize: () => 1 }), ms);
  };

  it.each(BREATHS.map((preset) => [preset.name, preset] as const))(
    '%s keeps within what the scene draws in a frame at the highest grade on four targets',
    (_name, preset) => {
      let most = { motes: 0, marks: 0, points: 0 };
      frames(heaviest(preset), FOUR, (drawn) => {
        for (const blend of ['light', 'color'] as const) {
          most = {
            motes: Math.max(most.motes, drawn.motes.filter((mote) => mote.blend === blend).length),
            marks: Math.max(most.marks, drawn.floor.filter((mark) => mark.blend === blend).length),
            points: Math.max(
              most.points,
              drawn.ribbons
                .filter((ribbon) => ribbon.blend === blend)
                .reduce((sum, ribbon) => sum + ribbon.points.length, 0)
            ),
          };
        }
      });

      expect(most.motes).toBeLessThan(EFFECT_FRAME_BUDGET.motes / 2);
      expect(most.marks).toBeLessThan(EFFECT_FRAME_BUDGET.marks / 4);
      expect(most.points).toBeLessThan(EFFECT_FRAME_BUDGET.ribbonPoints / 4);
      expect(most.motes).toBeGreaterThan(100);
    }
  );

  it.each(BREATHS.map((preset) => [preset.name, preset] as const))(
    '%s draws nothing below the floor, far from the caster and the targets, or not a number, and at most two lights of its own',
    (_name, preset) => {
      const astray: string[] = [];
      frames(heaviest(preset), FOUR, (drawn, ms) => {
        const anchors = [...FOUR.targets, CASTER];
        const points = [...drawn.motes, ...drawn.ribbons.flatMap((ribbon) => ribbon.points), ...drawn.floor];
        for (const point of points) {
          const near = Math.min(...anchors.map((anchor) => Math.hypot(point.x - anchor.x, point.y - anchor.y)));
          if (!(near <= CELL * 6) || !(point.z >= -CELL * 0.05)) astray.push(`${ms}: ${point.x},${point.y},${point.z}`);
        }
        for (const mote of drawn.motes) {
          if (!(mote.size >= 0) || !(mote.alpha >= 0) || !(mote.alpha <= 1))
            astray.push(`${ms}: a mote ${mote.size} ${mote.alpha}`);
        }
        if (drawn.lights.length > 2) astray.push(`${ms}: ${drawn.lights.length} lights`);
      });

      expect(astray.slice(0, 5)).toEqual([]);
    }
  );

  it.each(BREATHS.map((preset) => [preset.name, preset] as const))(
    '%s draws the same frame at the same moment, whatever was drawn before it',
    (_name, preset) => {
      const later = JSON.stringify(staged(preset, FOUR, 1300));
      staged(preset, FOUR, 400);
      staged(preset, FOUR, 2600);

      expect(JSON.stringify(staged(preset, FOUR, 1300))).toBe(later);
    }
  );
});
