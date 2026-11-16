import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { sceneLingerMsOf, stageEffect } from '@axe/domain/effect/scene/effect-frame';

const CELL = 50;
const CASTER = { x: 100, y: 300 };
const TARGET = { x: 400, y: 300 };

/** A strike of a grade as the bundled one of that grade plays. */
function strikeOf(grade: 1 | 2 | 3): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = 'bash';
  preset.grade = grade;
  preset.durationMs = [1056, 1080, 2880][grade - 1];
  preset.colorPrimary = '#fff0c0';
  preset.colorSecondary = '#ff6a2b';
  return preset;
}

function castOf(): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: 'caster',
    origin: { ...CASTER, z: 30 },
    targets: [{ identifier: 't0', ...TARGET, z: 0 }],
    seed: 5,
  };
}

function staged(preset: EffectPreset, elapsedMs: number): Staged {
  const drawn = nothingStaged();
  stageEffect(preset, castOf(), elapsedMs, { cellPx: CELL }, drawn);
  return drawn;
}

function stagedOnGiant(preset: EffectPreset, elapsedMs: number): Staged {
  const drawn = nothingStaged();
  stageEffect(preset, castOf(), elapsedMs, { cellPx: CELL, resolveSize: () => 4 }, drawn);
  return drawn;
}

function landsAtOf(preset: EffectPreset): number {
  return effectBlowsOf(preset)[0].atMs;
}

describe('a strike', () => {
  it('draws its fist back out on the side of the one who strikes before a jab lands', () => {
    const jab = strikeOf(1);
    const fist = staged(jab, landsAtOf(jab) * 0.5).motes.filter((mote) => mote.shape === 'puff');

    expect(fist.length).toBeGreaterThan(0);
    expect(fist.every((mote) => mote.x < TARGET.x - CELL * 0.8)).toBe(true);
  });

  it('bursts a star of spikes out of the point struck at the very instant each blow lands, as its stop holds it', () => {
    for (const grade of [1, 2, 3] as const) {
      const preset = strikeOf(grade);
      const spikes = staged(preset, landsAtOf(preset)).motes.filter((mote) => mote.shape === 'tongue');

      expect([grade, spikes.length > 8]).toEqual([grade, true]);
    }
  });

  it('grows by the root of the size of its target, so its star does not cover a giant and those beside it', () => {
    const jab = strikeOf(1);
    const reach = (drawn: Staged) =>
      Math.max(...drawn.motes.filter((mote) => mote.shape === 'tongue').map((mote) => Math.abs(mote.x - TARGET.x)));

    const onGiant = reach(stagedOnGiant(jab, landsAtOf(jab)));
    const onMan = reach(staged(jab, landsAtOf(jab)));

    expect(onGiant / onMan).toBeGreaterThan(1.6);
    expect(onGiant / onMan).toBeLessThan(2.6);
  });

  it('bursts the star of a jab out longest from the far side of the target, the way the blow drives', () => {
    const jab = strikeOf(1);
    const spikes = staged(jab, landsAtOf(jab) + 20).motes.filter((mote) => mote.shape === 'tongue');
    const reach = (far: boolean) =>
      Math.max(...spikes.filter((mote) => mote.x > TARGET.x === far).map((mote) => Math.abs(mote.x - TARGET.x)));

    expect(reach(true)).toBeGreaterThan(reach(false) * 1.2);
  });

  it('brings a swing round in a crescent through the target, from high on the side it is swung from', () => {
    const swing = strikeOf(2);
    const sweeping = staged(swing, landsAtOf(swing) - 20).ribbons;
    const points = sweeping.flatMap((ribbon) => ribbon.points);

    expect(sweeping.length).toBeGreaterThan(2);
    expect(Math.max(...points.map((point) => point.z))).toBeGreaterThan(CELL * 1.2);
    expect(Math.min(...points.map((point) => point.x))).toBeLessThan(TARGET.x - CELL * 0.3);
  });

  it('draws a swing as the hard thick arc of a blunt weapon, full at its head, with outlines of the head along it', () => {
    const swing = strikeOf(2);
    const sweeping = staged(swing, landsAtOf(swing) - 20);
    const arcs = sweeping.ribbons.filter((ribbon) => ribbon.points.length === 17);
    const smear = arcs.find((ribbon) => ribbon.core === '#ffffff')!;
    const widths = smear.widths as number[];

    expect(arcs.length).toBeGreaterThan(3);
    expect(arcs.every((ribbon) => !ribbon.torn && !ribbon.soft && ribbon.blend === 'color')).toBe(true);
    expect(widths.at(-1)).toBeGreaterThan(Math.max(...widths) * 0.95);
    expect(widths.at(-1)).toBeGreaterThan(CELL * 0.5);
    expect(widths[0]).toBeLessThan(widths.at(-1)! * 0.4);
    expect(sweeping.motes.filter((mote) => mote.shape === 'hoop').length).toBeGreaterThanOrEqual(6);
  });

  it('drives a cone of force out of the back of what a crushing blow lands on and on past it, which no lighter blow does', () => {
    const conesOf = (preset: EffectPreset) =>
      staged(preset, landsAtOf(preset) + 100).motes.filter((mote) => mote.shape === 'jet');

    expect(conesOf(strikeOf(3)).some((mote) => mote.x > TARGET.x + CELL * 1.5)).toBe(true);
    expect(conesOf(strikeOf(1))).toEqual([]);
    expect(conesOf(strikeOf(2))).toEqual([]);
  });

  it('shatters the floor under a crushing blow in a web that spreads, and hangs the rocks it tears up before they fall', () => {
    const crush = strikeOf(3);
    const lands = landsAtOf(crush);
    const reachOfWeb = (ms: number) =>
      Math.max(
        ...staged(crush, ms)
          .floor.filter((mark) => mark.shape === 'fissure')
          .map((mark) => Math.hypot(mark.x - TARGET.x, mark.y - TARGET.y) + mark.radius)
      );
    const highRocks = (ms: number) =>
      staged(crush, ms).motes.filter((mote) => mote.shape === 'chunk' && mote.z > CELL * 1.2).length;

    expect(reachOfWeb(lands + 300)).toBeGreaterThan(reachOfWeb(lands + 40) * 1.5);
    expect(highRocks(lands + 600)).toBeGreaterThan(3);
    expect(highRocks(lands + 1600)).toBe(0);
  });

  it('drags scores along the floor behind the target the way each blow knocks it, and leaves them until it clears', () => {
    for (const grade of [1, 2, 3] as const) {
      const preset = strikeOf(grade);
      const late = staged(preset, landsAtOf(preset) + 500).floor.filter(
        (mark) => mark.shape === 'fissure' && mark.x > TARGET.x
      );

      expect([grade, late.length > 0]).toEqual([grade, true]);
      const cleared = preset.duration + sceneLingerMsOf(preset);
      expect([grade, staged(preset, cleared + 10).floor]).toEqual([grade, []]);
    }
  });
});
