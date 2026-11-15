import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectKind } from '@axe/domain/effect/effect-kind';
import { effectJoltsOf } from '@axe/domain/effect/effect-reaction';
import { type Staged } from '@axe/domain/effect/scene/choreography';
import {
  bladePresetOf,
  bundledOf,
  castOnTarget,
  CELL,
  stagedAt,
  TARGET,
  widestOf,
} from '@axe/testing/blade-effect-stage';

const cast = castOnTarget();

/** A great blade of three seconds that strikes with a kind of look. */
function bladeOf(impactKind: EffectKind, primary = '#ffeaa8', secondary = '#ffb320') {
  const preset = bladePresetOf('skyblade', 3000, 3);
  preset.impactKind = impactKind;
  preset.colorPrimary = primary;
  preset.colorSecondary = secondary;
  return preset;
}

const blade = bladeOf('heal');
const strikes = effectBlowsOf(blade)[0].atMs / 1000;

/** The bands of the blade itself: those of seven points, from its point to its shoulders. */
function bladeBandsOf(drawn: Staged) {
  return drawn.ribbons.filter((ribbon) => ribbon.points.length === 7 && ribbon.blend === 'color');
}

/** Where the sword's point is, and how high the top of its blade stands. */
function swordOf(drawn: Staged) {
  const [band] = bladeBandsOf(drawn);
  return { tip: band.points[0], shoulders: band.points.at(-1)! };
}

describe('the great blade', () => {
  it('forms out of a seam of light over the target, point down, in its first moments', () => {
    const forming = stagedAt(blade, cast, 0.08);
    const formed = stagedAt(blade, cast, 0.6);
    const { tip, shoulders } = swordOf(formed);

    expect(widestOf(bladeBandsOf(forming)[1])).toBeLessThan(widestOf(bladeBandsOf(formed)[1]) * 0.6);
    expect(tip.z).toBeGreaterThan(CELL * 0.6);
    expect(shoulders.z).toBeGreaterThan(tip.z + CELL);
    expect(Math.hypot(tip.x - TARGET.x, tip.y - TARGET.y)).toBeLessThan(CELL * 0.5);
  });

  it('is a sword: a blade drawn to a point, a guard across it wider than the blade, a grip and a pommel', () => {
    const drawn = stagedAt(blade, cast, 1);
    const [outline] = bladeBandsOf(drawn);
    const widths = outline.widths as number[];
    const guard = drawn.ribbons.filter((ribbon) => ribbon.points.length === 3 && ribbon.blend === 'color');
    const grip = drawn.ribbons.filter((ribbon) => ribbon.points.length === 2 && ribbon.blend === 'color');

    expect(widths[0]).toBeLessThan(widths.at(-1)! * 0.15);
    expect(widths.every((width, index) => index === 0 || width >= widths[index - 1])).toBe(true);
    expect(Math.max(...guard.map(widestOf))).toBeGreaterThan(widestOf(outline) * 2);
    expect(grip.length).toBeGreaterThan(0);
    expect(Math.max(...grip.map(widestOf))).toBeLessThan(widestOf(outline) * 0.6);
    expect(drawn.motes.some((mote) => mote.shape === 'puff' && mote.z > guard[0].points[0].z)).toBe(true);
  });

  it('is laid as colour, with pale edges about a flat of its colour and a darker fuller', () => {
    const bands = bladeBandsOf(stagedAt(blade, cast, 1));

    expect(bands.length).toBeGreaterThanOrEqual(3);
    expect(widestOf(bands[2])).toBeLessThan(widestOf(bands[1]));
    expect(bands[1].color).not.toBe(bands[2].color);
  });

  it('draws a sword of a deep colour dark within pale edges', () => {
    const dark = bladeBandsOf(stagedAt(bladeOf('miasma', '#d8c6ff', '#5a1f8a'), cast, 1));
    const light = bladeBandsOf(stagedAt(blade, cast, 1));
    const lightness = (hex: string) =>
      parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);

    expect(lightness(dark[2].color)).toBeLessThan(120);
    expect(lightness(dark[1].color)).toBeGreaterThan(lightness(dark[2].color) * 3);
    expect(lightness(light[2].color)).toBeGreaterThan(300);
  });

  it('hangs a beat, draws up, and drops into the floor as its blow lands', () => {
    const tipAt = (seconds: number) => swordOf(stagedAt(blade, cast, seconds)).tip.z;

    expect(Math.abs(tipAt(1) - tipAt(0.7))).toBeLessThan(CELL * 0.15);
    expect(tipAt(strikes - 0.14)).toBeGreaterThan(tipAt(1) + CELL * 0.15);
    expect(tipAt(strikes - 0.14)).toBeGreaterThan(CELL * 0.8);
    expect(tipAt(strikes)).toBeLessThan(0);
    expect(tipAt(strikes)).toBeGreaterThan(-CELL * 0.4);
  });

  it('comes down just past the target, so the one it strikes is not behind it', () => {
    const { tip } = swordOf(stagedAt(blade, cast, strikes + 0.1));

    expect(tip.x).toBeLessThan(TARGET.x - CELL * 0.1);
    expect(tip.x).toBeGreaterThan(TARGET.x - CELL * 0.6);
  });

  it('stands where it struck, then breaks into shards of light that rise', () => {
    const standing = stagedAt(blade, cast, strikes + 0.5);
    const gone = stagedAt(blade, cast, strikes + 1.3);
    const shards = gone.motes.filter((mote) => mote.shape === 'flake');

    expect(bladeBandsOf(standing).length).toBeGreaterThan(0);
    expect(bladeBandsOf(gone)).toEqual([]);
    expect(shards.length).toBeGreaterThan(5);
  });

  it('strikes with the look it was given, and with nothing before it lands', () => {
    const flame = bladeOf('flame', '#ffd08a', '#ff4a12');
    const count = (drawn: Staged) => drawn.motes.length + drawn.ribbons.length;

    expect(count(stagedAt(flame, cast, strikes + 0.3))).toBeGreaterThan(
      count(stagedAt(blade, cast, strikes + 0.3)) + 10
    );
    expect(stagedAt(flame, cast, strikes - 0.3).motes.filter((mote) => mote.shape === 'blaze')).toEqual([]);
  });

  it.each([
    ['flame', 'tongue'],
    ['frost', 'flake'],
    ['upheaval', 'chunk'],
    ['miasma', 'smoke'],
    ['smite', 'star'],
  ] as const)('hangs what is its own about a sword that strikes with %s', (impactKind, shape) => {
    const waiting = stagedAt(bladeOf(impactKind), cast, 1.1);

    expect(waiting.motes.filter((mote) => mote.shape === shape).length).toBeGreaterThan(4);
  });

  it('presses the one it strikes down, not back', () => {
    const jolt = effectJoltsOf(blade, cast, strikes * 1000 + 200, CELL).get('t0')!;

    expect([jolt.x, jolt.y]).toEqual([0, 0]);
    expect(jolt.z).toBeLessThan(0);
  });

  it('is drawn for every bundled great blade through to its end without leaving the floor far below', () => {
    for (const name of ['光の大剣', '炎の大剣', '氷の大剣', '雷の大剣', '大地の大剣', '闇の大剣']) {
      const preset = bundledOf(name);
      for (let at = 0; at < 5; at += 0.1) {
        const drawn = stagedAt(preset, cast, at);
        expect(drawn.ribbons.every((ribbon) => ribbon.points.every((point) => point.z > -CELL * 0.8))).toBe(true);
      }
      preset.destroy();
    }
  });
});
