import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { PROJECTILE_STYLES } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { type EffectStagingOptions, sceneLingerMsOf, stageEffect } from '@axe/domain/effect/scene/effect-frame';
import { EFFECT_FRAME_BUDGET, type EffectMote } from '@axe/domain/effect/scene/effect-scene';
import { METEOR_FLAME_LENGTHS } from '@axe/domain/effect/scene/meteor/meteor-rock';

const CELL = 50;
const CASTER = { x: 100, y: 300, z: 0, groundZ: 0 };

function meteorOf(fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = 'projectile';
  preset.projectileStyle = 'meteor';
  preset.grade = 3;
  preset.durationMs = 1200;
  preset.staggerMs = 130;
  preset.colorPrimary = '#fff3c8';
  preset.colorSecondary = '#ff3a12';
  Object.assign(preset, fields);
  return preset;
}

function castOn(points: [number, number][], caster = true): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: caster ? 'caster' : '',
    origin: caster ? { x: CASTER.x, y: CASTER.y, z: 30 } : null,
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

/** The body of the rock as it falls: the widest of its chunks, held to its own depth before the piece it falls on. */
function rockOf(drawn: Staged): EffectMote | undefined {
  return drawn.motes
    .filter((mote) => mote.shape === 'chunk' && mote.exactDepth && mote.forward === CELL * 0.3)
    .sort((a, b) => b.size - a.size)[0];
}

/** The fire the rock falls in: the tongues torn off its sides, then the sheets of its body, the widest first. */
function flamesOf(drawn: Staged): { sides: EffectMote[]; sheets: EffectMote[] } {
  const rock = rockOf(drawn);
  const before = rock ? drawn.motes.slice(0, drawn.motes.indexOf(rock)) : [];
  const licks = before.filter((mote) => mote.shape === 'lick' && mote.blend === 'color' && mote.exactDepth);
  const sheets = licks.slice(-METEOR_FLAME_LENGTHS.length);
  return { sides: licks.slice(-METEOR_FLAME_LENGTHS.length - 4, -METEOR_FLAME_LENGTHS.length), sheets };
}

/** How long a flame is drawn, in table pixels. */
function lengthOf(flame: EffectMote): number {
  const velocity = flame.velocity!;
  return Math.hypot(velocity.x, velocity.y, velocity.z) * (flame.trail ?? 0) + flame.size;
}

/** The white of the beat it lands in. */
function whiteBeatOf(drawn: Staged): EffectMote[] {
  return drawn.motes.filter(
    (mote) => mote.blend === 'color' && mote.color === '#ffffff' && mote.shape === 'puff' && mote.size >= CELL * 0.8
  );
}

/** What is left of the rock, sunk in its crater. */
function sunkRockOf(drawn: Staged): EffectMote | undefined {
  return drawn.motes
    .filter((mote) => mote.shape === 'chunk' && mote.exactDepth && mote.forward === 2)
    .sort((a, b) => b.size - a.size)[0];
}

const ONE = castOn([[400, 300]]);
const FIVE = castOn([
  [400, 300],
  [500, 250],
  [480, 380],
  [580, 320],
  [360, 200],
]);

describe('a meteor', () => {
  it('lights a glow on the floor under its target and a point in the sky before any rock falls', () => {
    const drawn = staged(meteorOf(), ONE, 100);

    expect(rockOf(drawn)).toBeUndefined();
    expect(drawn.floor.length).toBeGreaterThanOrEqual(2);
    for (const mark of drawn.floor) expect([mark.x, mark.y, mark.shape]).toEqual([400, 300, 'disc']);
    const sky = drawn.motes.filter((mote) => mote.z > CELL * 8.5);
    expect(sky.length).toBeGreaterThanOrEqual(3);
    expect(sky.some((mote) => mote.shape === 'flare')).toBe(true);
  });

  it('widens and brightens the glow on the floor faster and faster as the rock nears', () => {
    const glowAt = (ms: number) => staged(meteorOf(), ONE, ms).floor.find((mark) => mark.blend === 'light')!;
    const [early, middle, late] = [200, 600, 1000].map(glowAt);

    expect(middle.radius).toBeGreaterThan(early.radius);
    expect(late.radius - middle.radius).toBeGreaterThan(middle.radius - early.radius);
    expect(late.alpha).toBeGreaterThan(middle.alpha);
  });

  it('falls for 0.9 seconds from nine cells up, lower and nearer the target at every frame', () => {
    const preset = meteorOf();
    const rocks = Array.from({ length: 18 }, (_unused, index) => rockOf(staged(preset, ONE, 160 + index * 50))!);

    expect(rockOf(staged(preset, ONE, 140))).toBeUndefined();
    expect(rocks[0].z).toBeGreaterThan(CELL * 8.5);
    expect(rocks.at(-1)!.z).toBeLessThan(CELL * 1.5);
    for (const [index, rock] of rocks.entries()) {
      if (index < 1) continue;
      const before = rocks[index - 1];
      expect(rock.z).toBeLessThan(before.z);
      expect(Math.hypot(rock.x - 400, rock.y - 300)).toBeLessThan(Math.hypot(before.x - 400, before.y - 300));
    }
  });

  it('grows the rock from half a cell to 1.3 cells as it nears', () => {
    const preset = meteorOf();

    expect(rockOf(staged(preset, ONE, 160))!.size / CELL).toBeCloseTo(0.5, 1);
    expect(rockOf(staged(preset, ONE, 1045))!.size / CELL).toBeCloseTo(1.3, 1);
  });

  it('draws the rock as a dark body with a white-hot face before it on the way it falls, and cracks glowing over it', () => {
    const drawn = staged(meteorOf(), ONE, 700);
    const rock = rockOf(drawn)!;
    const ahead = (mote: EffectMote) => (mote.x - rock.x) * 1 + (rock.z - mote.z);
    const whiteHot = drawn.motes.filter(
      (mote) =>
        mote.exactDepth &&
        mote.shape === 'puff' &&
        mote.blend === 'color' &&
        mote.color === '#ffffff' &&
        Math.abs(mote.size - rock.size * 0.28) < 0.001
    );
    const cracks = drawn.motes.filter(
      (mote) => mote.exactDepth && mote.shape === 'spark' && mote.blend === 'color' && mote.size === rock.size * 0.07
    );

    expect(rock.blend).toBe('color');
    expect(parseInt(rock.color.slice(1, 3), 16)).toBeLessThan(0x80);
    expect(whiteHot).toHaveLength(1);
    expect(whiteHot[0].size).toBeLessThan(rock.size * 0.3);
    expect(ahead(whiteHot[0])).toBeGreaterThan(rock.size * 0.25);
    expect(drawn.motes.indexOf(whiteHot[0])).toBeGreaterThan(drawn.motes.indexOf(rock));
    expect(cracks).toHaveLength(5);
  });

  it('streams its fire back from before the rock in sheets, the deepest some nine times as long as the rock is wide and the hottest white-hearted, drawn before the rock', () => {
    const drawn = staged(meteorOf(), ONE, 700);
    const rock = rockOf(drawn)!;
    const { sides, sheets } = flamesOf(drawn);
    const lengths = sheets.map((flame) => lengthOf(flame) / rock.size);

    expect(sheets).toHaveLength(METEOR_FLAME_LENGTHS.length);
    expect(sides).toHaveLength(4);
    for (const [index, length] of lengths.entries()) {
      expect(length).toBeLessThanOrEqual(METEOR_FLAME_LENGTHS[index] * 1.15 + 0.001);
      expect(length).toBeGreaterThanOrEqual(METEOR_FLAME_LENGTHS[index] * 0.68);
      if (index > 0) expect(sheets[index].size).toBeLessThan(sheets[index - 1].size);
    }
    expect(Math.max(...METEOR_FLAME_LENGTHS)).toBeGreaterThan(8);
    expect(Math.min(...METEOR_FLAME_LENGTHS)).toBeGreaterThanOrEqual(2.5);
    expect(new Set(sheets.map((flame) => flame.color)).size).toBe(sheets.length);
    expect(sheets.at(-1)!.core).toBe('#ffffff');
    expect(sheets.slice(0, -1).every((flame) => flame.core === undefined)).toBe(true);
    for (const flame of [...sides, ...sheets]) {
      expect(flame.velocity!.z).toBeGreaterThan(0);
      expect(flame.z).toBeGreaterThan(rock.z);
    }
  });

  it('burns from a deep red through orange and yellow to white for a meteor of fire’s colour, and in its own colours otherwise', () => {
    const fiery = flamesOf(staged(meteorOf(), ONE, 700)).sheets.map((flame) => flame.color);
    const cold = flamesOf(staged(meteorOf({ colorPrimary: '#e8f8ff', colorSecondary: '#2f8dff' }), ONE, 700)).sheets;
    const channels = (color: string) => [1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16));

    for (const color of fiery.slice(1, 4)) {
      const [red, green, blue] = channels(color);
      expect(red).toBeGreaterThan(green);
      expect(green).toBeGreaterThan(blue + 40);
    }
    for (const flame of cold.slice(0, 3)) {
      const [red, , blue] = channels(flame.color);
      expect(blue).toBeGreaterThan(red);
    }
  });

  it('flows the pattern of its fire back down it as it falls', () => {
    const flowed = (ms: number) => flamesOf(staged(meteorOf(), ONE, ms)).sheets[0].spin!;

    expect(flowed(800)).toBeGreaterThan(flowed(700));
  });

  it('sheds fire, sparks and embers behind it, and leaves smoke hanging where it passed', () => {
    const preset = meteorOf();
    const falling = staged(preset, ONE, 900);
    const rock = rockOf(falling)!;
    const behind = falling.motes.filter((mote) => mote.exactDepth && mote.z > rock.z + rock.size);
    const after = staged(preset, ONE, 1500);

    expect(behind.filter((mote) => mote.shape === 'lick' && mote.blend === 'color').length).toBeGreaterThan(20);
    expect(behind.filter((mote) => mote.shape === 'spark' && mote.blend === 'light').length).toBeGreaterThan(5);
    expect(behind.filter((mote) => mote.shape === 'wisp').length).toBeGreaterThan(3);
    expect(
      after.motes.filter((mote) => mote.exactDepth && mote.shape === 'wisp' && mote.z > CELL).length
    ).toBeGreaterThan(5);
  });

  it('trails a white-hot band of light from behind the rock, which hangs for 0.4 seconds where it passed', () => {
    const preset = meteorOf();
    const falling = staged(preset, ONE, 800);
    const [trail] = falling.ribbons;

    expect(falling.ribbons).toHaveLength(1);
    expect(trail.blend).toBe('light');
    expect(trail.core).toBe('#ffffff');
    expect(trail.points.at(-1)!.z).toBeLessThan(trail.points[0].z);
    expect(trail.points.at(-1)!.z).toBeGreaterThan(rockOf(falling)!.z);
    expect(trail.alphas![0]).toBeLessThan(trail.alphas!.at(-1)!);
    expect(staged(preset, ONE, 1300).ribbons).toHaveLength(1);
    expect(staged(preset, ONE, 1300).ribbons[0].alphas!.at(-1)!).toBeLessThan(trail.alphas!.at(-1)!);
    expect(staged(preset, ONE, 1460).ribbons).toHaveLength(0);
  });

  it('throws a light that falls with the rock and grows stronger as it nears', () => {
    const preset = meteorOf();
    const lightAt = (ms: number) => {
      const drawn = staged(preset, ONE, ms);
      return { light: drawn.lights[0], rock: rockOf(drawn)!, count: drawn.lights.length };
    };
    const high = lightAt(300);
    const low = lightAt(1000);

    expect(high.count).toBe(1);
    expect([high.light.x, high.light.y, high.light.z]).toEqual([high.rock.x, high.rock.y, high.rock.z]);
    expect(low.light.strength).toBeGreaterThan(high.light.strength * 2);
    expect(high.light.reachPx).toBeGreaterThan(high.rock.z);
  });

  it('strikes 1.05 seconds in with a white beat two frames long, a white light, and no rock left falling', () => {
    const preset = meteorOf();
    const before = staged(preset, ONE, 1040);
    const struck = staged(preset, ONE, 1050);

    expect(rockOf(before)).toBeDefined();
    expect(whiteBeatOf(before)).toHaveLength(0);
    expect(rockOf(struck)).toBeUndefined();
    expect(whiteBeatOf(struck)).toHaveLength(1);
    expect(struck.motes.at(-1)).toBe(whiteBeatOf(struck)[0]);
    expect(struck.lights.some((light) => light.color === '#ffffff' && light.strength > 2)).toBe(true);
    expect(whiteBeatOf(staged(preset, ONE, 1080))).toHaveLength(1);
    expect(whiteBeatOf(staged(preset, ONE, 1090))).toHaveLength(0);
  });

  it('lands with the look its preset lands with as well as what it leaves of its own', () => {
    const burst = staged(meteorOf(), ONE, 1250);
    const healing = staged(meteorOf({ impactKind: 'heal' }), ONE, 1250);

    expect(burst.floor.filter((mark) => mark.shape === 'ring' && mark.blend === 'light').length).toBeGreaterThan(0);
    expect(burst.motes.length).toBeGreaterThan(healing.motes.length + 100);
    expect(sunkRockOf(healing)).toBeDefined();
  });

  it('raises fire out of the crater as it lands, which cools down the ramp together and ends in smoke', () => {
    const preset = meteorOf({ durationMs: 2000 });
    const fireAt = (ms: number) =>
      staged(preset, ONE, ms).motes.filter((mote) => mote.shape === 'lick' && !mote.exactDepth);
    const smokeAt = (ms: number) =>
      staged(preset, ONE, ms).motes.filter((mote) => mote.shape === 'wisp' && !mote.exactDepth);
    const tallest = (ms: number) => Math.max(0, ...fireAt(ms).map(lengthOf));

    expect(fireAt(1040)).toHaveLength(0);
    expect(fireAt(1150)).toHaveLength(15);
    expect(tallest(1300)).toBeGreaterThan(tallest(1100) * 1.5);
    expect(fireAt(1150).some((mote) => mote.core === '#ffffff')).toBe(true);
    expect(fireAt(1700).some((mote) => mote.core === '#ffffff')).toBe(false);
    expect(fireAt(1700).length).toBeLessThan(15);
    expect(fireAt(2100)).toHaveLength(0);
    expect(smokeAt(2100)).toHaveLength(3);
    expect(smokeAt(2800)).toHaveLength(0);
  });

  it('leaves a crater that is molten at first and has cooled to soot before it clears', () => {
    const preset = meteorOf();
    const moltenAt = (ms: number) =>
      staged(preset, ONE, ms).floor.filter(
        (mark) => mark.shape === 'scorch' && mark.blend === 'light' && mark.radius > CELL * 0.7
      );
    const sootAt = (ms: number) =>
      staged(preset, ONE, ms).floor.filter(
        (mark) => mark.shape === 'scorch' && mark.blend === 'color' && mark.radius > CELL * 0.9
      );

    expect(moltenAt(1150).length).toBeGreaterThanOrEqual(1);
    expect(sootAt(1150)).toHaveLength(1);
    expect(staged(preset, ONE, 1150).floor.some((mark) => mark.shape === 'cracks')).toBe(true);
    expect(moltenAt(2700)).toHaveLength(0);
    expect(sootAt(2700)).toHaveLength(1);
    expect(sootAt(2990)[0].alpha).toBeLessThan(sootAt(2700)[0].alpha);
  });

  it('leaves what is left of the rock sunk in the crater, held to its own depth, cooling until its hot face is gone', () => {
    const preset = meteorOf();
    const hot = staged(preset, ONE, 1150);
    const cold = staged(preset, ONE, 2600);
    const faceOf = (drawn: Staged) =>
      drawn.motes.filter((mote) => mote.exactDepth && mote.forward === 2 && mote.shape === 'puff');

    expect(sunkRockOf(staged(preset, ONE, 1060))).toBeUndefined();
    expect(sunkRockOf(hot)!.size).toBeCloseTo(CELL * 0.62, 5);
    expect(sunkRockOf(hot)!.z).toBeLessThan(CELL * 0.1);
    expect(Math.hypot(sunkRockOf(hot)!.x - 400, sunkRockOf(hot)!.y - 300)).toBeLessThan(CELL * 0.3);
    expect(faceOf(hot).length).toBeGreaterThan(0);
    expect(sunkRockOf(cold)).toBeDefined();
    expect(faceOf(cold)).toHaveLength(0);
  });

  it('falls on each target of a cast a stagger after the one before, each from its own side', () => {
    const preset = meteorOf();
    const beats = (ms: number) => whiteBeatOf(staged(preset, FIVE, ms)).map((mote) => `${mote.x},${mote.y}`);
    const falling = staged(preset, FIVE, 900).lights;
    const sides = falling.map((rock, index) => {
      const [x, y] = [FIVE.targets[index].x, FIVE.targets[index].y];
      return Math.round(Math.atan2(rock.y - y, rock.x - x) * 10) / 10;
    });

    expect(beats(1050)).toEqual(['400,300']);
    expect(beats(1180)).toEqual(['500,250']);
    expect(beats(1050 + 130 * 4)).toEqual(['360,200']);
    expect(falling).toHaveLength(5);
    expect(new Set(sides).size).toBe(5);
  });

  it('falls and strikes when it is called by no one', () => {
    const preset = meteorOf();
    const nowhere = castOn([[400, 300]], false);

    expect(rockOf(staged(preset, nowhere, 600))).toBeDefined();
    expect(whiteBeatOf(staged(preset, nowhere, 1050))).toHaveLength(1);
  });

  it('keeps the same choreography in a shorter effect, landing seven eighths of the way through it', () => {
    const short = meteorOf({ durationMs: 600 });

    expect(rockOf(staged(short, ONE, 60))).toBeUndefined();
    expect(rockOf(staged(short, ONE, 100))!.z).toBeGreaterThan(CELL * 8);
    expect(rockOf(staged(short, ONE, 500))!.z).toBeLessThan(CELL * 2);
    expect(whiteBeatOf(staged(short, ONE, 525))).toHaveLength(1);
  });

  it('takes no longer to fall in a longer effect, which only has longer to clear', () => {
    const long = meteorOf({ durationMs: 4000 });

    expect(whiteBeatOf(staged(long, ONE, 1050))).toHaveLength(1);
    expect(sunkRockOf(staged(long, ONE, 3000))).toBeDefined();
  });

  it('only falls as a stage of a run, leaving its landing to the stage after it', () => {
    const run = meteorOf();
    run.stages = JSON.stringify([
      { role: 'travel', kind: 'projectile', durationMs: 800 },
      { role: 'impact', kind: 'heal', durationMs: 400 },
    ]);
    const falling = staged(run, ONE, 500);
    const landed = staged(run, ONE, 900);

    expect(rockOf(falling)).toBeDefined();
    expect(rockOf(landed)).toBeUndefined();
    expect(whiteBeatOf(staged(run, ONE, 800))).toHaveLength(0);
    expect(sunkRockOf(landed)).toBeUndefined();
    expect(landed.floor.some((mark) => mark.shape === 'scorch')).toBe(false);
  });

  it('draws the same frame at the same moment, whatever was drawn before it', () => {
    const preset = meteorOf();
    for (const ms of [700, 1050, 1400]) {
      const first = JSON.stringify(staged(preset, FIVE, ms));
      staged(preset, FIVE, 300);
      staged(preset, FIVE, 2500);

      expect(JSON.stringify(staged(preset, FIVE, ms))).toBe(first);
    }
  });

  it('keeps volleys on four targets and the bundled cast on five within what the scene draws, near them and over the floor', () => {
    const volley = meteorOf({ durationMs: 1500, staggerMs: 100, shots: 6, shotInterval: 110 });
    const four = castOn([
      [400, 300],
      [500, 400],
      [600, 300],
      [700, 400],
    ]);
    const heaviest = { light: 0, color: 0 };
    for (const [preset, cast] of [
      [volley, four],
      [meteorOf(), FIVE],
    ] as const) {
      const ends = preset.totalDuration(cast.targets.length) + sceneLingerMsOf(preset);
      for (let ms = 0; ms <= ends; ms += 40) {
        const drawn = staged(preset, cast, ms);
        for (const blend of ['light', 'color'] as const) {
          const motes = drawn.motes.filter((mote) => mote.blend === blend).length;
          heaviest[blend] = Math.max(heaviest[blend], motes);
          expect(drawn.floor.filter((mark) => mark.blend === blend).length).toBeLessThanOrEqual(
            EFFECT_FRAME_BUDGET.marks
          );
          expect(
            drawn.ribbons
              .filter((ribbon) => ribbon.blend === blend)
              .reduce((sum, ribbon) => sum + ribbon.points.length, 0)
          ).toBeLessThanOrEqual(EFFECT_FRAME_BUDGET.ribbonPoints);
        }
        const points = [...drawn.motes, ...drawn.ribbons.flatMap((ribbon) => ribbon.points)];
        const anchors = [...cast.targets, CASTER];
        for (const point of points) {
          const near = Math.min(...anchors.map((anchor) => Math.hypot(point.x - anchor.x, point.y - anchor.y)));
          expect(near).toBeLessThanOrEqual(CELL * 10);
          expect(point.z).toBeGreaterThanOrEqual(-CELL * 0.4);
        }
      }
    }

    expect(heaviest.light).toBeLessThan(EFFECT_FRAME_BUDGET.motes * 0.5);
    expect(heaviest.color).toBeLessThan(EFFECT_FRAME_BUDGET.motes * 0.75);
  });

  it('is the only look of a shot that draws anything away from its caster before the shot is sent, but for the sight of a sniper', () => {
    for (const look of PROJECTILE_STYLES.filter((style) => style !== 'meteor' && style !== 'tracer')) {
      const drawn = staged(meteorOf({ projectileStyle: look }), ONE, 20);

      for (const mark of drawn.floor) expect(Math.hypot(mark.x - CASTER.x, mark.y - CASTER.y)).toBeLessThan(CELL * 2);
      for (const mote of drawn.motes) expect(Math.hypot(mote.x - CASTER.x, mote.y - CASTER.y)).toBeLessThan(CELL * 2);
    }
  });
});
