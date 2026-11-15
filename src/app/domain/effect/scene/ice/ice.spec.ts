import { createEffectPreset, DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { sceneLingerMsOf, stageEffect } from '@axe/domain/effect/scene/effect-frame';
import { type EffectMote } from '@axe/domain/effect/scene/effect-scene';

const CELL = 50;
const CASTER = { x: 50, y: 300 };
const TARGET = { x: 400, y: 300 };

function bundled(name: string): EffectPreset {
  return createEffectPreset(DEFAULT_EFFECT_PRESET_SEEDS.find((seed) => seed.name === name)!);
}

function castOn(points: { x: number; y: number }[], caster = true, seed = 11): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: caster ? 'caster' : '',
    origin: caster ? { ...CASTER, z: 30 } : null,
    targets: points.map((point, index) => ({ identifier: `t${index}`, ...point, z: 0 })),
    seed,
  };
}

function staged(preset: EffectPreset, cast: EffectCast, ms: number): Staged {
  const drawn = nothingStaged();
  stageEffect(preset, cast, ms, { cellPx: CELL }, drawn);
  return drawn;
}

function crystalsOf(drawn: Staged): EffectMote[] {
  return drawn.motes.filter((mote) => mote.shape === 'crystal');
}

/** How far a crystal's point is from a place over the floor, in cells. */
function farFrom(mote: EffectMote, place: { x: number; y: number }): number {
  return Math.hypot(mote.x - place.x, mote.y - place.y) / CELL;
}

/** Where a crystal stands out of: its point taken back along the way it is drawn out. */
function rootOf(mote: EffectMote): { x: number; y: number } {
  const reach = mote.trail! * 100 + mote.size;
  return { x: mote.x - (mote.velocity!.x / 100) * reach, y: mote.y - (mote.velocity!.y / 100) * reach };
}

/** How much of a crystal is broken off its top, and how far cracks have climbed it. */
function wearOf(mote: EffectMote): { broken: number; cracks: number } {
  const spin = mote.spin ?? 0;
  return { broken: Math.floor(spin) / 100, cracks: spin - Math.floor(spin) };
}

function rimeOf(drawn: Staged) {
  return drawn.floor.filter((mark) => mark.shape === 'rime' && mark.blend === 'color');
}

describe('the looks of ice', () => {
  const made: EffectPreset[] = [];
  const preset = (name: string): EffectPreset => {
    const one = bundled(name);
    made.push(one);
    return one;
  };

  afterEach(() => {
    for (const one of made.splice(0)) one.destroy();
  });

  describe('hail', () => {
    it('drives shards down onto the target from over its caster, point first, before the first of them strikes', () => {
      const hail = preset('氷礫');
      const first = effectBlowsOf(hail)[0].atMs;
      const flying = crystalsOf(staged(hail, castOn([TARGET]), first - 40));

      expect(flying.length).toBeGreaterThan(0);
      for (const shard of flying) {
        expect(shard.z).toBeGreaterThan(0);
        expect(shard.velocity!.z).toBeLessThan(0);
        expect(shard.velocity!.x).toBeGreaterThan(0);
        expect(shard.x).toBeLessThan(TARGET.x + CELL * 1.2);
      }
    });

    it('lays no rime before it strikes, and spreads a little under the target once it has', () => {
      const hail = preset('氷礫');
      const first = effectBlowsOf(hail)[0].atMs;

      expect(rimeOf(staged(hail, castOn([TARGET]), first - 40))).toEqual([]);
      const rime = rimeOf(staged(hail, castOn([TARGET]), first + 500));
      expect(rime).toHaveLength(1);
      expect(rime[0].radius).toBeLessThan(CELL * 1.5);
    });

    it('leaves its chips lying on the floor about the target after its playback', () => {
      const hail = preset('氷礫');
      const lying = crystalsOf(staged(hail, castOn([TARGET]), hail.duration + 300)).filter(
        (mote) => wearOf(mote).broken === 0
      );

      expect(lying.length).toBeGreaterThan(6);
      for (const chip of lying) {
        expect(chip.z).toBeLessThan(CELL * 0.3);
        expect(farFrom(chip, TARGET)).toBeLessThan(4);
      }
    });

    it('leaves the stump of each great shard standing in the floor where it struck', () => {
      const hail = preset('氷礫');
      const last = effectBlowsOf(hail)[2].atMs;
      const stumps = crystalsOf(staged(hail, castOn([TARGET]), last + 400)).filter((mote) => wearOf(mote).broken > 0.3);

      expect(stumps.length).toBeGreaterThanOrEqual(3);
      for (const stump of stumps) expect(farFrom(stump, TARGET)).toBeLessThan(2);
    });
  });

  describe('ice that freezes', () => {
    it('runs frost over the floor to the target before any crystal bursts up', () => {
      const freeze = preset('氷結');
      const before = staged(freeze, castOn([TARGET]), effectBlowsOf(freeze)[0].atMs - 60);

      expect(crystalsOf(before)).toEqual([]);
      expect(before.floor.some((mark) => mark.shape === 'fissure')).toBe(true);
      expect(rimeOf(before)).toHaveLength(1);
    });

    it('stands its crystals about the target and not on it, each held to its own depth', () => {
      const freeze = preset('氷結');
      const standing = crystalsOf(staged(freeze, castOn([TARGET]), 1200)).filter((mote) => mote.exactDepth);

      expect(standing.length).toBeGreaterThan(10);
      for (const crystal of standing) {
        const root = rootOf(crystal);
        expect(Math.hypot(root.x - TARGET.x, root.y - TARGET.y)).toBeGreaterThan(CELL * 1.3 * 0.28);
      }
    });

    it('stands its tall crystals clear of a target three cells wide, grown by the root of its size and not by all of it', () => {
      const freeze = preset('氷結');
      const drawn = nothingStaged();
      stageEffect(freeze, castOn([TARGET]), 1200, { cellPx: CELL, resolveSize: () => 3 }, drawn);
      const tall = crystalsOf(drawn)
        .filter((mote) => mote.exactDepth)
        .map((mote) => ({ root: rootOf(mote), reach: mote.trail! * 100 + mote.size }))
        .filter((crystal) => crystal.reach > CELL * 1.3);

      expect(tall.length).toBeGreaterThan(3);
      for (const crystal of tall) {
        expect(Math.hypot(crystal.root.x - TARGET.x, crystal.root.y - TARGET.y)).toBeGreaterThan(CELL * 1.5);
        expect(crystal.reach).toBeLessThan(CELL * 1.3 * 2.1 * 2);
      }
    });

    it('lays only clear ice over the target, so it is seen through it', () => {
      const freeze = preset('氷結');
      const over = crystalsOf(staged(freeze, castOn([TARGET]), 1200)).filter((mote) => !mote.exactDepth);

      expect(over).toHaveLength(1);
      expect(over[0].alpha).toBeLessThan(0.5);
    });

    it('cracks its crystals, breaks them from the top and leaves shards lying on rime that draws back', () => {
      const freeze = preset('氷結');
      const cast = castOn([TARGET]);
      const whole = crystalsOf(staged(freeze, cast, 1500)).filter((mote) => mote.exactDepth);
      const broken = crystalsOf(staged(freeze, cast, freeze.duration)).filter((mote) => mote.exactDepth);

      expect(whole.every((mote) => wearOf(mote).broken === 0)).toBe(true);
      expect(broken.some((mote) => wearOf(mote).broken > 0.5)).toBe(true);
      expect(broken.some((mote) => mote.z < CELL * 0.3 && wearOf(mote).broken === 0)).toBe(true);
      const thick = rimeOf(staged(freeze, cast, 1500))[0].width;
      const thinned = rimeOf(staged(freeze, cast, freeze.duration + 900))[0].width;
      expect(thinned).toBeLessThan(thick);
    });

    it('lands a lesser crown under a shot, with no clear ice over its target', () => {
      const shot = preset('氷の矢');
      const cast = castOn([TARGET]);
      const landed = crystalsOf(staged(shot, cast, 700));
      const cast2 = crystalsOf(staged(preset('氷結'), cast, 700));

      expect(landed.filter((mote) => mote.exactDepth).length).toBeGreaterThan(4);
      expect(landed.filter((mote) => mote.exactDepth).length).toBeLessThan(cast2.length);
    });
  });

  describe('the cold that stills an area', () => {
    const points = [TARGET, { x: 480, y: 340 }, { x: 400, y: 160 }];

    it('draws what is over the whole area once, with its first target', () => {
      const zero = preset('絶対零度');
      const drawn = staged(zero, castOn(points), 1500);
      const sheets = rimeOf(drawn).filter((mark) => mark.radius > CELL * 3);

      expect(sheets).toHaveLength(1);
      expect(sheets[0].x).toBe(TARGET.x);
      expect(drawn.motes.filter((mote) => mote.shape === 'flake').length).toBeGreaterThan(40);
    });

    it('hangs its dust still in the air while the area is held', () => {
      const zero = preset('絶対零度');
      const cast = castOn(points);
      const flakes = (ms: number) => staged(zero, cast, ms).motes.filter((mote) => mote.shape === 'flake');
      const early = flakes(1400);
      const later = flakes(1500);

      early.forEach((flake, index) => {
        expect(Math.hypot(flake.x - later[index].x, flake.y - later[index].y)).toBeLessThan(0.01);
      });
    });

    it('freezes each target it catches at its own turn, a spire about each', () => {
      const zero = preset('絶対零度');
      const cast = castOn(points);
      const freezes = effectBlowsOf(zero)[0].atMs;
      const about = (drawn: Staged, place: { x: number; y: number }) =>
        crystalsOf(drawn).filter((mote) => Math.hypot(rootOf(mote).x - place.x, rootOf(mote).y - place.y) < 60);

      const first = staged(zero, cast, freezes + 30);
      expect(about(first, points[0]).length).toBeGreaterThan(0);
      expect(about(first, points[2])).toEqual([]);
      const last = staged(zero, cast, freezes + zero.stagger * 2 + 60);
      expect(about(last, points[2]).length).toBeGreaterThan(0);
    });

    it('shatters every spire and leaves shards lying over the area', () => {
      const zero = preset('絶対零度');
      const cast = castOn(points);
      const shatters = effectBlowsOf(zero)[1].atMs;
      const held = crystalsOf(staged(zero, cast, shatters - 600));
      const after = crystalsOf(staged(zero, cast, shatters + zero.stagger * 2 + 700));

      expect(held.every((mote) => wearOf(mote).broken === 0)).toBe(true);
      expect(after.filter((mote) => wearOf(mote).broken === 0 && mote.z < CELL * 0.4).length).toBeGreaterThan(10);
      expect(after.every((mote) => wearOf(mote).broken > 0.5 || mote.trail! * 100 + mote.size < CELL)).toBe(true);
    });
  });

  describe('a pillar of ice', () => {
    it('closes slabs about the target one after another before it seals', () => {
      const coffin = preset('氷棺');
      const cast = castOn([TARGET]);
      const seals = effectBlowsOf(coffin)[0].atMs;
      const counts = [0.25, 0.6, 0.95].map((share) => crystalsOf(staged(coffin, cast, seals * share)).length);

      expect(counts[0]).toBeLessThan(counts[1]);
      expect(counts[1]).toBeLessThanOrEqual(counts[2]);
      expect(counts[2]).toBe(6);
    });

    it('closes the target in under clear ice, the slabs at its back dark and those before it clear', () => {
      const coffin = preset('氷棺');
      const drawn = crystalsOf(staged(coffin, castOn([TARGET]), effectBlowsOf(coffin)[0].atMs + 400));
      const pillar = drawn.filter((mote) => !mote.exactDepth);
      const slabs = drawn.filter((mote) => mote.exactDepth);

      expect(pillar).toHaveLength(1);
      expect(pillar[0].alpha).toBeLessThan(0.5);
      expect(pillar[0].z).toBeGreaterThan(CELL * 1.4 * 2.4);
      expect(slabs).toHaveLength(6);
      for (const slab of slabs.filter((mote) => mote.y < TARGET.y - 30)) expect(slab.alpha).toBe(1);
      for (const slab of slabs.filter((mote) => mote.y > TARGET.y + 30)) expect(slab.alpha).toBeLessThan(0.5);
    });

    it('cracks further at each of its cracks and is gone the moment it shatters', () => {
      const coffin = preset('氷棺');
      const cast = castOn([TARGET]);
      const [seals, shatters] = effectBlowsOf(coffin).map((blow) => blow.atMs);
      const pillarAt = (ms: number) =>
        crystalsOf(staged(coffin, cast, ms)).filter((mote) => mote.x === TARGET.x && mote.y === TARGET.y);

      expect(wearOf(pillarAt(seals + 300)[0]).cracks).toBe(0);
      const cracked = wearOf(pillarAt(shatters - 30)[0]).cracks;
      expect(cracked).toBeGreaterThan(0.8);
      expect(wearOf(pillarAt((seals + shatters) / 2 + 250)[0]).cracks).toBeLessThan(cracked);
      expect(pillarAt(shatters + 120)).toEqual([]);
      expect(crystalsOf(staged(coffin, cast, shatters + 120)).length).toBeGreaterThan(15);
    });
  });

  describe('a blizzard', () => {
    it('winds its bands round the target by halves, snow and shards of ice whirled in them', () => {
      const blizzard = preset('吹雪');
      const drawn = staged(blizzard, castOn([TARGET]), 1200);

      expect(drawn.ribbons.filter((ribbon) => ribbon.half === 'far').length).toBeGreaterThan(5);
      expect(drawn.ribbons.filter((ribbon) => ribbon.half === 'near').length).toBeGreaterThan(5);
      expect(drawn.motes.filter((mote) => mote.shape === 'flake').length).toBeGreaterThan(50);
      expect(crystalsOf(drawn).length).toBeGreaterThan(4);
    });

    it('spreads rime as it blows, further once it bites, and leaves it after the wind has failed', () => {
      const blizzard = preset('吹雪');
      const cast = castOn([TARGET]);
      const radius = (ms: number) => rimeOf(staged(blizzard, cast, ms))[0].radius;

      expect(radius(400)).toBeLessThan(radius(1400));
      expect(radius(1400)).toBeLessThan(radius(2200));
      const after = staged(blizzard, cast, blizzard.duration + 600);
      expect(after.ribbons).toEqual([]);
      expect(rimeOf(after)).toHaveLength(1);
    });

    it('leaves a tornado of the family of wind as it was, with no ice in it', () => {
      const tornado = preset('竜巻');
      const drawn = staged(tornado, castOn([TARGET]), 1200);

      expect(crystalsOf(drawn)).toEqual([]);
      expect(rimeOf(drawn)).toEqual([]);
    });
  });

  describe('a shot of ice', () => {
    it('flies as an icicle, point first, with a trail of mist behind it', () => {
      const shot = preset('氷の矢');
      const flying = staged(shot, castOn([TARGET]), 150);
      const icicles = crystalsOf(flying);

      expect(icicles).toHaveLength(1);
      expect(icicles[0].velocity!.x).toBeGreaterThan(0);
      expect(icicles[0].x).toBeGreaterThan(CASTER.x);
      expect(icicles[0].x).toBeLessThan(TARGET.x);
      expect(flying.ribbons.some((ribbon) => ribbon.blend === 'color' && (ribbon.soft ?? 0) > 0)).toBe(true);
    });

    it('breaks into shards thrown on the way it flew where it lands', () => {
      const shot = preset('氷の矢');
      const landed = crystalsOf(staged(shot, castOn([TARGET]), 340 + 200)).filter(
        (mote) => mote.trail! * 100 + mote.size < CELL * 0.6
      );
      const onward = landed.filter((mote) => mote.x > TARGET.x).length;

      expect(landed.length).toBeGreaterThan(4);
      expect(onward).toBeGreaterThan(landed.length / 2);
    });

    it('flies the shot of the bundled run as an icicle too, and freezes what it reaches', () => {
      const run = preset('氷結の追撃');
      const cast = castOn([TARGET]);

      expect(crystalsOf(staged(run, cast, 240))).toHaveLength(1);
      expect(crystalsOf(staged(run, cast, 480 + 300)).length).toBeGreaterThan(10);
    });
  });

  it('clears every one of them by the end of its linger', () => {
    for (const name of ['氷礫', '氷結', '絶対零度', '氷棺', '吹雪', '氷の矢']) {
      const one = preset(name);
      const ends = one.duration + sceneLingerMsOf(one);
      const last = staged(one, castOn([TARGET]), ends - 20);
      const faint = [...last.motes, ...last.floor].every((part) => part.alpha < 0.2);

      expect(`${name} ${faint}`).toBe(`${name} true`);
    }
  });
});
