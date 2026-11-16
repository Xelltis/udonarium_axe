import { hexChannels } from '@axe/core/util/hex-color';
import { beamTimingOf } from '@axe/domain/effect/beam-looks';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { prismHuesOf } from '@axe/domain/effect/scene/beam/prism-beam';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { type EffectStagingOptions, stageEffect } from '@axe/domain/effect/scene/effect-frame';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectRibbon } from '@axe/domain/effect/scene/effect-scene';

const CELL = 50;
/** How many points the sheets of a body, a ball laid as a band and a ring about the beam are drawn through. */
const BODY_POINTS = 37;
const BALL_POINTS = 13;
const RING_POINTS = 21;

function beamOf(fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('beam');
  preset.kind = 'beam';
  preset.grade = 3;
  preset.durationMs = 3344;
  preset.staggerMs = 0;
  preset.colorPrimary = '#dff2ff';
  preset.colorSecondary = '#2f7bff';
  Object.assign(preset, fields);
  return preset;
}

const cast: EffectCast = {
  presetIdentifier: 'beam',
  casterIdentifier: 'caster',
  origin: { x: 100, y: 300, z: 30 },
  targets: [{ identifier: 'target', x: 500, y: 300, z: 0 }],
  seed: 7,
};

function staged(preset: EffectPreset, ms: number, options: Partial<EffectStagingOptions> = {}, on = cast): Staged {
  const drawn = nothingStaged();
  stageEffect(preset, on, ms, { cellPx: CELL, ...options }, drawn);
  return drawn;
}

const bodyOf = (drawn: Staged): EffectRibbon[] =>
  drawn.ribbons.filter((ribbon) => ribbon.points.length === BODY_POINTS && ribbon.blend === 'color' && !ribbon.about);
const ballsOf = (drawn: Staged): EffectRibbon[] =>
  drawn.ribbons.filter((ribbon) => ribbon.points.length === BALL_POINTS);
const widest = (ribbon: EffectRibbon): number => Math.max(...(ribbon.widths as number[]));
const brightness = (color: string): number =>
  (hexChannels(color) ?? [0, 0, 0]).reduce((sum, channel) => sum + channel, 0);

describe('a great beam', () => {
  const preset = beamOf();
  const fires = effectBlowsOf(preset)[0].atMs;
  const timing = beamTimingOf(preset.duration / 1000, fires / 1000);

  it('gathers a ball before its caster, on the side of its target, that swells until it is let go', () => {
    const ball = (ms: number) => ballsOf(staged(preset, ms))[1];

    expect(widest(ball(700))).toBeGreaterThan(widest(ball(250)) * 1.5);
    expect(ball(700).points[6].x).toBeGreaterThan(100);
    expect(ball(700).points[6].y).toBeCloseTo(300);
    expect(bodyOf(staged(preset, 700))).toEqual([]);
  });

  it('draws more light in as it gathers, and darkens the floor about it', () => {
    const drawnIn = (ms: number) => staged(preset, ms).motes.filter((mote) => mote.shape === 'spark').length;
    const gloom = staged(preset, 700).floor.filter((mark) => mark.shape === 'disc' && mark.blend === 'color');

    expect(drawnIn(800)).toBeGreaterThan(drawnIn(150));
    expect(gloom.length).toBeGreaterThan(0);
    expect(brightness(gloom[0].color)).toBeLessThan(120);
  });

  it('is there whole in the frame it fires, through its target and far beyond it', () => {
    const body = bodyOf(staged(preset, fires));

    expect(body.length).toBeGreaterThanOrEqual(5);
    expect(body[0].points.at(-1)!.x).toBeGreaterThan(500 + CELL * 4);
    expect(body[0].points[0].x).toBeLessThan(200);
  });

  it('lays its body from a dark rim in to a white heart, every sheet torn and narrower than the one under it', () => {
    const body = bodyOf(staged(preset, fires + 600));

    expect(brightness(body[0].color)).toBeLessThan(150);
    expect(body.at(-1)!.color).toBe('#ffffff');
    for (const sheet of body) expect(sheet.torn).toBeGreaterThan(0);
    for (let index = 1; index < body.length; index++) {
      expect(widest(body[index])).toBeLessThan(widest(body[index - 1]));
    }
  });

  it('stands well clear of the floor, wider than a cell, and fades out where it ends rather than being cut square', () => {
    const body = bodyOf(staged(preset, fires + 600));
    const sheath = body[1];

    expect(widest(sheath)).toBeGreaterThan(CELL);
    expect(Math.min(...sheath.points.map((point) => point.z))).toBeGreaterThan(widest(sheath) * 0.3);
    expect(sheath.alphas!.at(-1)).toBe(0);
    expect(sheath.alphas![10]).toBe(1);
    expect((sheath.widths as number[])[0]).toBeLessThan(widest(sheath));
  });

  it('pours: its pattern has run on from one moment to the next, and licks stream off its edges', () => {
    const at = (ms: number) => staged(preset, fires + ms);

    expect(bodyOf(at(700))[1].flowed).toBeGreaterThan(bodyOf(at(600))[1].flowed!);
    expect(at(600).motes.filter((mote) => mote.shape === 'lick').length).toBeGreaterThan(20);
  });

  it('sheds rings that ride down it, each laid behind its body and before it', () => {
    const drawn = staged(preset, fires + 900);
    const rings = drawn.ribbons.filter((ribbon) => ribbon.points.length === RING_POINTS && ribbon.about);
    const first = drawn.ribbons.indexOf(bodyOf(drawn)[0]);

    expect(rings.filter((ring) => ring.half === 'far').length).toBeGreaterThan(0);
    expect(rings.filter((ring) => ring.half === 'near').length).toBe(rings.length / 2);
    for (const ring of rings) {
      expect(drawn.ribbons.indexOf(ring) < first).toBe(ring.half === 'far');
    }
  });

  it('pours from a ball laid over its muzzle', () => {
    const drawn = staged(preset, fires + 600);
    const balls = ballsOf(drawn);

    expect(balls.length).toBeGreaterThanOrEqual(3);
    expect(drawn.ribbons.indexOf(balls[0])).toBeGreaterThan(drawn.ribbons.indexOf(bodyOf(drawn).at(-1)!));
  });

  it('thins from its muzzle first as it fails, and is gone', () => {
    const failing = bodyOf(staged(preset, (timing.failsAt + (timing.goneAt - timing.failsAt) * 0.5) * 1000))[1];
    const widths = failing.widths as number[];

    expect(widths[3]).toBeLessThan(widths[20] * 0.7);
    expect(bodyOf(staged(preset, timing.goneAt * 1000 + 50))).toEqual([]);
  });

  it('breaks up into embers of light that drift on the way it ran', () => {
    const embers = (ms: number) =>
      staged(preset, timing.failsAt * 1000 + ms).motes.filter(
        (mote) => mote.shape === 'glow' && mote.blend === 'light'
      );
    const meanX = (ms: number) => embers(ms).reduce((sum, mote) => sum + mote.x, 0) / embers(ms).length;

    expect(embers(700).length).toBeGreaterThan(30);
    expect(meanX(1100)).toBeGreaterThan(meanX(700));
  });

  it('burns a trench along the floor under it that glows once it is gone and is left as soot', () => {
    const marks = (ms: number, glowing: boolean) =>
      staged(preset, ms).floor.filter(
        (mark) => mark.blend === 'color' && mark.shape === 'disc' && brightness(mark.color) > 200 === glowing
      );
    const soot = marks(preset.duration + 1000, false);

    expect(Math.max(...soot.map((mark) => mark.x)) - Math.min(...soot.map((mark) => mark.x))).toBeGreaterThan(400);
    expect(marks(timing.goneAt * 1000 + 300, true).length).toBeGreaterThan(0);
    expect(marks(preset.duration + 2000, true)).toEqual([]);
    expect(marks(preset.duration + 2000, false).length).toBeGreaterThan(0);
  });

  it('washes over a piece standing in its line, and not over one standing aside', () => {
    const standing = (y: number): Partial<EffectStagingOptions> => ({
      resolveStanding: () => ['caster', 'target', 'other'],
      resolveFooting: (identifier) => (identifier === 'other' ? { x: 320, y, z: 0, groundZ: 0 } : null),
    });
    const sparks = (y: number) => staged(preset, fires + 600, standing(y)).motes.length;

    expect(sparks(300)).toBeGreaterThan(sparks(600));
    expect(sparks(600)).toBe(staged(preset, fires + 600).motes.length);
  });

  it('gathers further out and higher before a larger caster', () => {
    const from = (cells: number): Partial<EffectStagingOptions> => ({
      resolveFooting: (identifier) => (identifier === 'caster' ? { x: 100, y: 300, z: 0, groundZ: 0 } : null),
      resolveSize: (identifier) => (identifier === 'caster' ? cells : 1),
    });
    const ball = (cells: number) => ballsOf(staged(preset, 700, from(cells)))[1].points[6];

    expect(ball(3).x).toBeGreaterThan(ball(1).x);
    expect(ball(3).z).toBeGreaterThan(ball(1).z);
  });

  it('comes in level from off to one side where it is cast from nowhere', () => {
    const body = bodyOf(staged(preset, fires + 600, {}, { ...cast, casterIdentifier: '', origin: null }));
    const [from, to] = [body[0].points[0], body[0].points.at(-1)!];

    expect(Math.hypot(from.x - 500, from.y - 300)).toBeGreaterThan(CELL * 4);
    expect(from.z).toBeCloseTo(to.z);
  });
});

describe('a beam of many hues', () => {
  const preset = beamOf({ colorPrimary: '#fff3b0', colorSecondary: '#ff4fd8', durationMs: 3000, moteStyle: 'prism' });
  const fires = effectBlowsOf(preset)[0].atMs;
  const hues = new Set(prismHuesOf(rampOf('#fff3b0', '#ff4fd8', 7)[1]));
  const bandsOf = (drawn: Staged) =>
    drawn.ribbons.filter(
      (ribbon) => ribbon.blend === 'color' && !ribbon.about && hues.has(ribbon.color) && widest(ribbon) > CELL * 0.5
    );
  const heartOf = (drawn: Staged) =>
    drawn.ribbons.find((ribbon) => ribbon.points.length === BODY_POINTS && ribbon.color === '#ffffff')!;

  it('takes its hues round the wheel of colour from the colour it is given, all of them apart', () => {
    const hues = prismHuesOf('#ff0000');

    expect(hues).toHaveLength(5);
    expect(new Set(hues).size).toBe(5);
    expect(hexChannels(hues[0])![0]).toBe(255);
    expect(hexChannels(hues[0])![1]).toBeLessThan(40);
    expect(prismHuesOf('#00ff00')[0]).not.toBe(hues[0]);
  });

  it('lays its colour down a thick body in wide bands of five hues, over a dark sheath and under a white heart', () => {
    const drawn = staged(preset, fires + 600);
    const bands = bandsOf(drawn);
    const heart = drawn.ribbons.indexOf(heartOf(drawn));
    const sheath = bodyOf(drawn).find((ribbon) => brightness(ribbon.color) < 100)!;

    expect(new Set(bands.map((band) => band.color)).size).toBe(5);
    expect(Math.max(...bands.map(widest))).toBeGreaterThan(CELL * 1.1);
    expect(widest(sheath)).toBeGreaterThan(Math.max(...bands.map(widest)));
    expect(drawn.ribbons.indexOf(sheath)).toBeLessThan(drawn.ribbons.indexOf(bands[0]));
    for (const band of bands) expect(drawn.ribbons.indexOf(band)).toBeLessThan(heart);
    expect(widest(heartOf(drawn))).toBeLessThan(Math.max(...bands.map(widest)) * 0.4);
  });

  it('pours its bands down the beam the way it runs, each keeping its hue', () => {
    const muzzle = heartOf(staged(preset, fires + 600)).points[0];
    const startsOf = (ms: number, hue: string) =>
      bandsOf(staged(preset, ms))
        .filter((band) => band.color === hue && band.points[0].x > muzzle.x + 1)
        .map((band) => band.points[0].x);
    const hue = [...hues][2];
    const before = Math.min(...startsOf(fires + 600, hue));
    const after = startsOf(fires + 630, hue);

    expect(after.some((start) => start > before + CELL * 0.1 && start < before + CELL * 0.3)).toBe(true);
  });

  it('lights the floor in many hues rather than washing it in one', () => {
    const lit = staged(preset, fires + 600).floor.filter((mark) => mark.blend === 'light' && mark.radius > CELL * 2);

    expect(new Set(lit.map((mark) => mark.color)).size).toBeGreaterThanOrEqual(3);
  });

  it('is drawn as the plain great beam where its particles name no look of a beam', () => {
    const plain = beamOf({ colorPrimary: '#fff3b0', colorSecondary: '#ff4fd8', durationMs: 3000, moteStyle: 'spark' });

    expect(bandsOf(staged(plain, fires + 600))).toEqual([]);
    expect(JSON.stringify(staged(plain, fires + 600))).toBe(
      JSON.stringify(
        staged(beamOf({ colorPrimary: '#fff3b0', colorSecondary: '#ff4fd8', durationMs: 3000 }), fires + 600)
      )
    );
  });
});
