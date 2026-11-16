import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { IMPACT_FRONT } from '@axe/domain/effect/scene/earth/impact';
import { sceneLingerMsOf, stageEffect } from '@axe/domain/effect/scene/effect-frame';
import { EFFECT_FRAME_BUDGET, type EffectMote, type EffectRibbon } from '@axe/domain/effect/scene/effect-scene';

const CELL = 50;
const CASTER = { x: 100, y: 300 };
const TARGET = { x: 400, y: 300 };
const LANDS_MS = 161;

function impactOf(fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = 'impact';
  preset.grade = 1;
  preset.durationMs = 2691;
  preset.colorPrimary = '#e6cfa0';
  preset.colorSecondary = '#8a5a32';
  Object.assign(preset, fields);
  return preset;
}

function castOf(caster = true): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: caster ? 'caster' : '',
    origin: caster ? { ...CASTER, z: 30 } : null,
    targets: [{ identifier: 't0', ...TARGET, z: 0 }],
    seed: 11,
  };
}

function staged(preset: EffectPreset, elapsedMs: number, cast = castOf()): Staged {
  const drawn = nothingStaged();
  stageEffect(preset, cast, elapsedMs, { cellPx: CELL }, drawn);
  return drawn;
}

/** The hard pale edges of the crescents, the greater first. */
function frontsOf(drawn: Staged): EffectRibbon[] {
  return drawn.ribbons.filter((ribbon) => ribbon.core === '#fff6e4');
}

function middleOf(ribbon: EffectRibbon): { x: number; y: number } {
  return ribbon.points[Math.floor(ribbon.points.length / 2)];
}

function rocksOf(drawn: Staged): EffectMote[] {
  return drawn.motes.filter((mote) => mote.shape === 'chunk');
}

function slabsOf(drawn: Staged): EffectMote[] {
  return drawn.motes.filter((mote) => mote.shape === 'crag');
}

describe('an impact', () => {
  it('throws nothing before the blow lands', () => {
    const before = staged(impactOf(), LANDS_MS - 40);

    expect(before.motes).toEqual([]);
    expect(before.ribbons).toEqual([]);
  });

  it('lays a flat white flash over the floor for an instant, and no longer', () => {
    const white = (ms: number) =>
      staged(impactOf(), ms).floor.filter((mark) => mark.color === '#ffffff' && mark.blend === 'light').length;

    expect(white(LANDS_MS + 20)).toBeGreaterThan(0);
    expect(white(LANDS_MS + 120)).toBe(0);
  });

  it('races its greater crescent out on the way the blow was struck and the lesser back, each done within its span', () => {
    const preset = impactOf();
    const out = (ms: number) => frontsOf(staged(preset, ms)).map((front) => middleOf(front).x - TARGET.x);
    const early = out(LANDS_MS + 100);
    const late = out(LANDS_MS + 400);

    expect(early[0]).toBeGreaterThan(CELL * 0.3);
    expect(early[1]).toBeLessThan(-CELL * 0.3);
    expect(late[0]).toBeGreaterThan(early[0]);
    expect(late[0]).toBeLessThanOrEqual(IMPACT_FRONT.reach * CELL + 1);
    expect(out(LANDS_MS + IMPACT_FRONT.lastsS * 1000 + 20)).toEqual([]);
  });

  it('strikes on a bearing of its own where no one cast it, and still races a crescent each way', () => {
    const fronts = frontsOf(staged(impactOf(), LANDS_MS + 200, castOf(false)));

    expect(fronts).toHaveLength(2);
    const [greater, lesser] = fronts.map(middleOf);
    expect(
      (greater.x - TARGET.x) * (lesser.x - TARGET.x) + (greater.y - TARGET.y) * (lesser.y - TARGET.y)
    ).toBeLessThan(0);
  });

  it('levers slabs of the floor up as the fronts pass, and leaves them tilted where they fell', () => {
    const preset = impactOf();
    const tips = (ms: number) => slabsOf(staged(preset, ms)).map((slab) => slab.z);
    const lifted = tips(LANDS_MS + 220);
    const left = tips(LANDS_MS + 2000);

    expect(lifted.length).toBeGreaterThanOrEqual(4);
    expect(left).toHaveLength(lifted.length);
    expect(Math.max(...left)).toBeGreaterThan(2);
    expect(Math.max(...lifted)).toBeGreaterThan(Math.max(...left));
    for (const slab of slabsOf(staged(preset, LANDS_MS + 2000))) expect(Math.floor(slab.spin ?? 0)).toBeGreaterThan(50);
  });

  it('fans its rocks out on the way it was struck, and leaves them lying until it clears', () => {
    const preset = impactOf({ grade: 2 });
    const lying = rocksOf(staged(preset, preset.duration + 300));
    const onward = lying.filter((rock) => rock.x > TARGET.x).length;

    expect(lying.length).toBeGreaterThan(40);
    expect(onward).toBeGreaterThan(lying.length * 0.6);
    for (const rock of lying) expect(rock.z).toBeLessThan(CELL * 0.5);
    expect(
      rocksOf(staged(preset, preset.duration + sceneLingerMsOf(preset) - 1)).every((rock) => rock.alpha < 0.05)
    ).toBe(true);
  });

  it('leaves a dent and fissures that glow, go cold and stay dark', () => {
    const preset = impactOf();
    const fissures = (ms: number, blend: string) =>
      staged(preset, ms).floor.filter((mark) => mark.shape === 'fissure' && mark.blend === blend);

    expect(fissures(LANDS_MS + 300, 'light').length).toBeGreaterThan(0);
    expect(fissures(LANDS_MS + 2200, 'light')).toEqual([]);
    expect(fissures(LANDS_MS + 2200, 'color').length).toBeGreaterThanOrEqual(4);
    expect(staged(preset, LANDS_MS + 2200).floor.filter((mark) => mark.shape === 'scorch').length).toBeGreaterThan(0);
  });

  it('draws its rock and dust as colour, and only its flash, glow and sparks as light', () => {
    const drawn = staged(impactOf(), LANDS_MS + 150);

    for (const mote of drawn.motes.filter((each) => each.blend === 'light')) {
      expect(['spark', 'glow', 'puff', 'flare']).toContain(mote.shape);
    }
    expect(rocksOf(drawn).every((rock) => rock.blend === 'color')).toBe(true);
  });

  it('keeps the heaviest of it within what the scene draws in a frame', () => {
    const preset = impactOf({ grade: 3 });
    for (let ms = 0; ms < preset.duration + sceneLingerMsOf(preset); ms += 90) {
      const drawn = staged(preset, ms);
      expect(drawn.motes.length).toBeLessThan(EFFECT_FRAME_BUDGET.motes / 2);
      expect(drawn.floor.length).toBeLessThan(EFFECT_FRAME_BUDGET.marks / 2);
    }
  });
});

describe('the impact a shot lands with', () => {
  it('is the flash and puff of dust it was: no slabs, no fissures and no crescents', () => {
    const bolt = new EffectPreset('preset');
    bolt.kind = 'projectile';
    bolt.projectileStyle = 'blaster';
    bolt.impactKind = 'impact';
    bolt.durationMs = 620;
    for (const ms of [300, 420, 700]) {
      const drawn = staged(bolt, ms);

      expect(slabsOf(drawn)).toEqual([]);
      expect(frontsOf(drawn)).toEqual([]);
      expect(drawn.floor.filter((mark) => mark.shape === 'fissure')).toEqual([]);
    }
    expect(staged(bolt, 420).floor.some((mark) => mark.shape === 'cracks')).toBe(true);
  });
});
