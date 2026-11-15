import { AILMENT_LOOKS, type CurseLook, takesHoldAt } from '@axe/domain/effect/ailment-looks';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { type EffectStagingOptions, stageEffect } from '@axe/domain/effect/scene/effect-frame';
import type { EffectMoteShape } from '@axe/domain/effect/scene/effect-scene';

const CELL = 50;
const FOOT = { x: 400, y: 300 };

function curseOf(moteStyle: string, durationMs = 3000, fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = 'curse';
  preset.tagName = '状態異常';
  preset.grade = 2;
  preset.durationMs = durationMs;
  preset.staggerMs = 0;
  preset.colorPrimary = '#bfd4ff';
  preset.colorSecondary = '#3f4f9c';
  preset.moteStyle = moteStyle;
  Object.assign(preset, fields);
  return preset;
}

const CAST: EffectCast = {
  presetIdentifier: 'preset',
  casterIdentifier: '',
  origin: null,
  targets: [{ identifier: 't0', ...FOOT, z: 0 }],
  seed: 11,
};

function staged(preset: EffectPreset, elapsedMs: number, options: Partial<EffectStagingOptions> = {}): Staged {
  const drawn = nothingStaged();
  stageEffect(preset, CAST, elapsedMs, { cellPx: CELL, ...options }, drawn);
  return drawn;
}

/** Every shape a look draws over a stretch of its playback, sampled every 50 milliseconds. */
function shapesOver(preset: EffectPreset, fromMs: number, toMs: number): Set<EffectMoteShape> {
  const shapes = new Set<EffectMoteShape>();
  for (let ms = fromMs; ms <= toMs; ms += 50) for (const mote of staged(preset, ms).motes) shapes.add(mote.shape);
  return shapes;
}

/** The moment a look has taken hold and a little more, in milliseconds. */
function heldMs(look: CurseLook, durationMs: number): number {
  return takesHoldAt(look, durationMs / 1000) * 1000 + 300;
}

describe('the looks of the states a curse is drawn as', () => {
  const SIGN_OF: Partial<Record<CurseLook, EffectMoteShape>> = {
    poison: 'skull',
    sleep: 'zed',
    confuse: 'swirl',
    charm: 'heart',
    fear: 'eyes',
    blind: 'bar',
    silence: 'cross',
    slow: 'dial',
    shock: 'pentagram',
    curse: 'skull',
  };

  it('hangs the sign of each state that has one by the head once it has taken hold', () => {
    for (const [look, shape] of Object.entries(SIGN_OF) as [CurseLook, EffectMoteShape][]) {
      const preset = curseOf(look === 'shock' ? 'arc' : look === 'curse' ? 'haze' : look);
      const at = heldMs(look, 3000);

      expect([...shapesOver(preset, at, at + 400)], look).toContain(shape);
    }
  });

  it('tells every state from every other by what it draws', () => {
    const drawnAs = new Map<string, string>();
    for (const look of [...AILMENT_LOOKS, 'arc', 'haze']) {
      const preset = curseOf(look);
      const frame = staged(preset, 1500);
      const signature = JSON.stringify([
        [...new Set(frame.motes.map((mote) => mote.shape))].sort(),
        [...new Set(frame.floor.map((mark) => mark.shape))].sort(),
        frame.ribbons.length > 0,
      ]);
      expect(drawnAs.get(signature), `${look} as ${signature}`).toBeUndefined();
      drawnAs.set(signature, look);
    }
  });

  it('pops question marks up beside a confusion, and bubbles out of a poison', () => {
    expect([...shapesOver(curseOf('confuse'), 400, 2400)]).toContain('query');
    expect([...shapesOver(curseOf('poison'), 400, 1400)]).toContain('bubble');
  });

  it('drips a poison and a bleeding down the body and sets flames clinging to one that burns', () => {
    expect([...shapesOver(curseOf('poison'), 400, 2000)]).toContain('comet');
    expect([...shapesOver(curseOf('bleed'), 300, 1500)]).toContain('comet');
    expect([...shapesOver(curseOf('burn'), 400, 800)]).toContain('lick');
  });

  it('draws no dark circle and no shadow for a sleep, as it does for the curse itself', () => {
    const sleep = staged(curseOf('sleep'), 1500);
    const curse = staged(curseOf('haze'), 1500);

    expect(curse.floor.some((mark) => mark.shape === 'sigil')).toBe(true);
    expect(sleep.floor.some((mark) => mark.shape === 'sigil')).toBe(false);
    expect(sleep.motes.some((mote) => mote.shape === 'plume')).toBe(false);
  });

  it('plays a state named by one this version has never heard of as the curse itself', () => {
    const unknown = curseOf('a state from a later version');

    expect(JSON.stringify(staged(unknown, 1500))).toBe(JSON.stringify(staged(curseOf(''), 1500)));
  });

  it('winds vines up round one bound, drawn only where they pass before it', () => {
    const vines = staged(curseOf('bind', 5500), 2000).ribbons;

    expect(vines.length).toBeGreaterThanOrEqual(3);
    expect(vines.every((ribbon) => ribbon.half === 'near' && ribbon.about?.length === ribbon.points.length)).toBe(true);
    const tops = vines.map((ribbon) => Math.max(...ribbon.points.map((point) => point.z)));
    expect(Math.max(...tops)).toBeGreaterThan(CELL * 0.7);
  });

  it('climbs a crust of stone up a body from its feet until it closes over the head, and cracks it', () => {
    const stone = curseOf('petrify', 1400);
    const platesAt = (ms: number) =>
      staged(stone, ms).motes.filter((mote) => mote.shape === 'chunk' && mote.exactDepth);
    const early = platesAt(250);
    const closed = platesAt(heldMs('petrify', 1400));

    expect(early.length).toBeGreaterThan(0);
    expect(closed.length).toBeGreaterThan(early.length);
    expect(Math.max(...early.map((plate) => plate.z))).toBeLessThan(Math.max(...closed.map((plate) => plate.z)));
    expect(Math.max(...closed.map((plate) => plate.z))).toBeGreaterThan(CELL * 0.9);
    expect(staged(stone, 1200).ribbons.length).toBeGreaterThan(0);
    expect(staged(stone, 1200).floor.some((mark) => mark.shape === 'cracks')).toBe(true);
  });

  it('leaves the crust of stone standing through the linger, and nothing after it', () => {
    const stone = curseOf('petrify', 1400);

    expect(staged(stone, 1450).motes.some((mote) => mote.shape === 'chunk')).toBe(true);
    expect(staged(stone, 2001).motes).toHaveLength(0);
  });
});

describe('where the sign of a state hangs', () => {
  const signOf = (drawn: Staged, shape: EffectMoteShape) =>
    drawn.motes.find((mote) => mote.shape === shape && mote.aside !== undefined && mote.alpha === 1)!;

  it('hangs it off the top of the head, as tall as the piece is drawn, and set off to its shoulder across the screen', () => {
    const charm = curseOf('charm', 3000, { scale: 1 });
    const short = signOf(staged(charm, 1000, { resolveHeight: () => 40 }), 'heart');
    const tall = signOf(staged(charm, 1000, { resolveHeight: () => 110 }), 'heart');

    expect(short.z).toBeCloseTo(40, 5);
    expect(tall.z).toBeCloseTo(110, 5);
    expect(tall.aside!.right).toBeGreaterThan(CELL * 0.3);
    expect(tall.aside!.right).toBeCloseTo(short.aside!.right, 5);
    expect([tall.x, tall.y]).toEqual([FOOT.x, FOOT.y]);
  });

  it('hangs it higher, further off and larger on a piece three cells across', () => {
    const charm = curseOf('charm', 3000, { scale: 1 });
    const one = signOf(staged(charm, 1000), 'heart');
    const three = signOf(staged(charm, 1000, { resolveSize: () => 3 }), 'heart');

    expect(one.z).toBeCloseTo(CELL, 5);
    expect(three.z).toBeCloseTo(CELL * 3, 5);
    expect(three.aside!.right).toBeCloseTo(one.aside!.right * 3, 5);
    expect(three.size).toBeCloseTo(one.size * 3, 5);
  });

  it('counts a piece drawn lying flat, or far taller than it is wide, within what a body can be', () => {
    const charm = curseOf('charm', 3000, { scale: 1 });

    expect(signOf(staged(charm, 1000, { resolveHeight: () => 2 }), 'heart').z).toBeCloseTo(CELL * 0.5, 5);
    expect(signOf(staged(charm, 1000, { resolveHeight: () => 900 }), 'heart').z).toBeCloseTo(CELL * 3, 5);
    expect(signOf(staged(charm, 1000, { resolveHeight: () => null }), 'heart').z).toBeCloseTo(CELL, 5);
  });
});

describe('the states that play for as long as their sound', () => {
  /** How much what is drawn moves between two moments: nothing where the two frames are the same. */
  const differs = (preset: EffectPreset, a: number, b: number) =>
    JSON.stringify(staged(preset, a).motes) !== JSON.stringify(staged(preset, b).motes);

  it('keeps zeds rising off a sleeper through the whole of five and a half seconds', () => {
    const sleep = curseOf('sleep', 5460);

    for (let ms = 1700; ms <= 4700; ms += 300) {
      expect(staged(sleep, ms).motes.filter((mote) => mote.shape === 'zed').length, `${ms}`).toBeGreaterThanOrEqual(2);
      expect(differs(sleep, ms, ms + 300), `${ms}`).toBe(true);
    }
  });

  it('tightens the vines on one bound at every beat through the whole of five and a half seconds', () => {
    const bind = curseOf('bind', 5512);
    const girthAt = (ms: number) => {
      const [vine] = staged(bind, ms).ribbons;
      return Math.hypot(vine.points[4].x - FOOT.x, vine.points[4].y - FOOT.y);
    };

    for (const beat of [1, 2, 3]) {
      const squeezes = 900 + beat * 1100;
      expect(girthAt(squeezes + 20), `${beat}`).toBeLessThan(girthAt(squeezes + 900));
    }
    expect(staged(bind, 4800).ribbons.length).toBeGreaterThanOrEqual(3);
  });

  it('draws the same frame at the same moment, whatever was drawn before it', () => {
    for (const look of [...AILMENT_LOOKS, 'arc', 'haze']) {
      const preset = curseOf(look);
      const first = JSON.stringify(staged(preset, 900));
      staged(preset, 300);
      staged(preset, 2200);

      expect(JSON.stringify(staged(preset, 900)), look).toBe(first);
    }
  });
});
