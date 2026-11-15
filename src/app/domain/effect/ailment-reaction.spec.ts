import { AILMENT_LOOKS, takesHoldAt } from '@axe/domain/effect/ailment-looks';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { effectJoltsOf, joltsEndOf } from '@axe/domain/effect/effect-reaction';

const CELL = 50;

function curseOf(moteStyle: string, durationMs = 3000): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = 'curse';
  preset.tagName = '状態異常';
  preset.durationMs = durationMs;
  preset.staggerMs = 200;
  preset.moteStyle = moteStyle;
  return preset;
}

const CAST: EffectCast = {
  presetIdentifier: 'preset',
  casterIdentifier: 'caster',
  origin: { x: 0, y: 0, z: 30 },
  targets: [
    { identifier: 'first', x: 100, y: 0, z: 0 },
    { identifier: 'second', x: 200, y: 0, z: 0 },
  ],
  seed: 1,
};

/** How far a piece is drawn off where it stands at the most over a stretch of the effect, sampled every 10 milliseconds. */
function furthest(preset: EffectPreset, identifier: string, fromMs: number, toMs: number): number {
  let most = 0;
  for (let ms = fromMs; ms <= toMs; ms += 10) {
    const jolt = effectJoltsOf(preset, CAST, ms, CELL).get(identifier);
    if (jolt) most = Math.max(most, Math.hypot(jolt.x, jolt.y, jolt.z));
  }
  return most;
}

describe('how a piece bears the state it is put in', () => {
  it('moves the piece under every state at some moment of it, and never further than a tenth of a cell', () => {
    for (const look of [...AILMENT_LOOKS, 'arc', 'haze']) {
      const most = furthest(curseOf(look), 'first', 0, 3000);

      expect(most, look).toBeGreaterThan(0.5);
      expect(most, look).toBeLessThanOrEqual(CELL * 0.1);
    }
  });

  it('shivers one in fear for as long as the fear plays, and lets it go as it ends', () => {
    const fear = curseOf('fear', 4000);

    expect(furthest(fear, 'first', 1000, 1200)).toBeGreaterThan(1);
    expect(furthest(fear, 'first', 3000, 3200)).toBeGreaterThan(1);
    expect(effectJoltsOf(fear, CAST, 4000, CELL).has('first')).toBe(false);
    expect(effectJoltsOf(fear, CAST, 4300, CELL).size).toBe(0);
    expect(joltsEndOf(fear, CAST, [])).toBe(4200);
  });

  it('holds one turned to stone still once the stone has closed over it, however it strained before', () => {
    const stone = curseOf('petrify', 1400);
    const closes = takesHoldAt('petrify', 1.4) * 1000;

    expect(furthest(stone, 'first', 100, closes - 100)).toBeGreaterThan(0.3);
    expect(furthest(stone, 'first', closes + 10, 1400)).toBe(0);
  });

  it('presses one made slow down at every tick of the clock', () => {
    const slow = curseOf('slow');
    const ticks = takesHoldAt('slow', 3) * 1000;
    const at = (ms: number) => effectJoltsOf(slow, CAST, ms, CELL).get('first')?.z ?? 0;

    expect(at(ticks + 20)).toBeLessThan(-1);
    expect(at(ticks + 920)).toBeLessThan(-1);
    expect(Math.abs(at(ticks + 800))).toBeLessThan(0.2);
  });

  it('moves each later piece its stagger later, and never the one who cast it', () => {
    const fear = curseOf('fear', 4000);

    expect(effectJoltsOf(fear, CAST, 150, CELL).has('second')).toBe(false);
    expect(furthest(fear, 'second', 1200, 1400)).toBeGreaterThan(1);
    expect(effectJoltsOf(fear, CAST, 1000, CELL).has('caster')).toBe(false);
  });

  it('leaves a curse that is a stage of a run to move no piece', () => {
    const run = curseOf('fear');
    run.stages = JSON.stringify([{ role: 'impact', kind: 'curse', durationMs: 2000 }]);

    expect(furthest(run, 'first', 0, 2000)).toBe(0);
  });
});
