import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type Staged } from '@axe/domain/effect/scene/choreography';
import { sceneLingerMsOf } from '@axe/domain/effect/scene/effect-frame';
import {
  castOn,
  CELL,
  holyPresetOf,
  liesLevel,
  stagedAt,
  standsUpright,
  uprightAt,
  widestOf,
} from '@axe/testing/holy-effect-stage';

const TARGET = { x: 400, y: 300 };
const OTHERS = [
  { x: 500, y: 340 },
  { x: 330, y: 390 },
];

function strikesAt(preset: ReturnType<typeof holyPresetOf>): number {
  return effectBlowsOf(preset)[0].atMs / 1000;
}

describe('the seal, a light that smites at the lowest grade', () => {
  const seal = holyPresetOf('smite', 1, { durationMs: 1802 });
  const cast = castOn([TARGET]);
  const strikes = strikesAt(seal);

  it('kindles a crest level over the head of the target, and drops nothing on it until it strikes', () => {
    const drawn = stagedAt(seal, cast, strikes * 0.6);
    const crests = drawn.floor.filter((mark) => mark.shape === 'crest');

    expect(crests.length).toBeGreaterThan(0);
    for (const crest of crests) {
      expect([crest.x, crest.y]).toEqual([TARGET.x, TARGET.y]);
      expect(crest.z).toBeGreaterThan(CELL * 1.2);
    }
    expect(crests.some((crest) => crest.blend === 'color')).toBe(true);
    expect(drawn.ribbons).toEqual([]);
    expect(drawn.floor.filter((mark) => mark.z < CELL * 0.5)).toEqual([]);
  });

  it('grows the crest as it kindles', () => {
    const radiusAt = (seconds: number) =>
      Math.max(
        ...stagedAt(seal, cast, seconds)
          .floor.filter((mark) => mark.shape === 'crest')
          .map((mark) => mark.radius)
      );

    expect(radiusAt(strikes * 0.2)).toBeLessThan(radiusAt(strikes * 0.8));
  });

  it('drops one thin pillar straight down onto the target as it strikes', () => {
    const pillar = uprightAt(stagedAt(seal, cast, strikes + 0.02), TARGET);

    expect(pillar.length).toBeGreaterThan(0);
    expect(Math.max(...pillar.map(widestOf))).toBeLessThan(CELL);
    expect(Math.min(...pillar.flatMap((ribbon) => ribbon.points.map((point) => point.z)))).toBeCloseTo(0);
    expect(pillar.some((ribbon) => ribbon.blend === 'color')).toBe(true);
    expect(pillar.some((ribbon) => ribbon.blend === 'light')).toBe(true);
  });

  it('leaves a stain of light on the floor with a crest burnt into it, and nothing once it has cleared', () => {
    const stain = stagedAt(seal, cast, strikes + 0.6).floor.filter((mark) => mark.z < 1);
    const ends = (seal.duration + sceneLingerMsOf(seal)) / 1000;

    expect(stain.some((mark) => mark.shape === 'scorch' && mark.blend === 'color')).toBe(true);
    expect(stain.some((mark) => mark.shape === 'crest')).toBe(true);
    expect(stagedAt(seal, cast, ends + 0.001)).toEqual({ motes: [], ribbons: [], floor: [], lights: [] });
  });
});

describe('the judgement, a light that smites at the middle grade', () => {
  const judgement = holyPresetOf('smite', 2, { durationMs: 4310, staggerMs: 240, targeting: 'multi', maxTargets: 4 });
  const strikes = strikesAt(judgement);

  it('shows it coming: a ring closes on the floor about the target before the pillar falls', () => {
    const ringAt = (seconds: number) =>
      Math.max(
        ...stagedAt(judgement, castOn([TARGET]), seconds)
          .floor.filter((mark) => mark.shape === 'ring')
          .map((mark) => mark.radius)
      );

    expect(ringAt(strikes * 0.2)).toBeGreaterThan(ringAt(strikes * 0.8));
    expect(ringAt(strikes * 0.8)).toBeGreaterThan(CELL * 0.6);
  });

  it('brings a thick pillar down on each target in turn, a stagger apart', () => {
    const cast = castOn([TARGET, ...OTHERS]);
    const thickAt = (seconds: number) =>
      [TARGET, ...OTHERS].map((at) =>
        uprightAt(stagedAt(judgement, cast, seconds), at).some((ribbon) => widestOf(ribbon) > CELL * 0.5)
      );

    expect(thickAt(strikes - 0.1)).toEqual([false, false, false]);
    expect(thickAt(strikes + 0.03)).toEqual([true, false, false]);
    expect(thickAt(strikes + 0.27)).toEqual([true, true, false]);
    expect(thickAt(strikes + 0.51)).toEqual([true, true, true]);
  });

  it('is several times as thick as the seal', () => {
    const seal = holyPresetOf('smite', 1, { durationMs: 4310 });
    const widest = (preset: typeof seal) =>
      Math.max(...uprightAt(stagedAt(preset, castOn([TARGET]), strikesAt(preset) + 0.2), TARGET).map(widestOf));

    expect(widest(judgement)).toBeGreaterThan(widest(seal) * 2.5);
  });

  it('strews feathers that drift down round it once it has struck, and never sink below the floor', () => {
    const cast = castOn([TARGET]);
    const feathersAt = (seconds: number) =>
      stagedAt(judgement, cast, seconds).motes.filter((mote) => mote.shape === 'feather');
    const meanHeight = (seconds: number) => {
      const feathers = feathersAt(seconds);
      return feathers.reduce((sum, feather) => sum + feather.z, 0) / feathers.length;
    };

    expect(feathersAt(strikes - 0.05)).toEqual([]);
    expect(feathersAt(strikes + 1).length).toBeGreaterThanOrEqual(6);
    expect(meanHeight(strikes + 2)).toBeLessThan(meanHeight(strikes + 1));
    for (let seconds = strikes; seconds < 5.5; seconds += 0.25) {
      for (const feather of feathersAt(seconds)) expect(feather.z).toBeGreaterThanOrEqual(0);
    }
  });

  it('is neither a healing nor a bolt of lightning: no sigil, and every band straight up or level', () => {
    const cast = castOn([TARGET]);
    const ends = (judgement.duration + sceneLingerMsOf(judgement)) / 1000;
    for (let seconds = 0; seconds < ends; seconds += 0.07) {
      const drawn = stagedAt(judgement, cast, seconds);

      expect(drawn.floor.filter((mark) => mark.shape === 'sigil')).toEqual([]);
      expect(drawn.ribbons.filter((ribbon) => !standsUpright(ribbon) && !liesLevel(ribbon))).toEqual([]);
    }
  });

  it('lays a body of colour under the light of all it draws as it stands, to read on a bright table', () => {
    const drawn = stagedAt(judgement, castOn([TARGET]), strikes + 0.3);
    const bodies = uprightAt(drawn, TARGET).filter((ribbon) => ribbon.blend === 'color');
    const lights = uprightAt(drawn, TARGET).filter((ribbon) => ribbon.blend === 'light');

    expect(Math.max(...bodies.map((ribbon) => ribbon.alpha))).toBeGreaterThan(0.8);
    expect(lights.length).toBeGreaterThan(0);
    for (const shape of ['ring', 'scorch', 'crest'] as const) {
      const marks = drawn.floor.filter((mark) => mark.shape === shape);

      expect([shape, marks.some((mark) => mark.blend === 'color')]).toEqual([shape, true]);
    }
  });
});

describe('the light of heaven, a light that smites at the highest grade', () => {
  const AREA = 3 * CELL;
  const heaven = holyPresetOf('smite', 3, {
    durationMs: 4310,
    staggerMs: 300,
    targeting: 'multi',
    maxTargets: 8,
    areaRadius: 3,
  });
  const strikes = strikesAt(heaven);
  const cast = castOn([TARGET, ...OTHERS]);

  it('darkens the place and gathers clouds over it before it comes down', () => {
    const drawn = stagedAt(heaven, cast, strikes * 0.6);
    const shadow = drawn.floor.filter((mark) => mark.shape === 'disc' && mark.blend === 'color' && mark.radius > AREA);
    const clouds = drawn.motes.filter((mote) => mote.shape === 'smoke');

    expect(shadow.length).toBe(1);
    expect(clouds.length).toBeGreaterThan(20);
    for (const cloud of clouds) expect(cloud.z).toBeGreaterThan(CELL * 3);
    expect(drawn.ribbons.filter(standsUpright)).toEqual([]);
  });

  it('rolls in a bank of cloud dark beneath, and tears it open in a rim of gold before it comes down', () => {
    const closed = stagedAt(heaven, cast, strikes * 0.3);
    const tearing = stagedAt(heaven, cast, strikes * 0.85);
    const darkest = (drawn: Staged) =>
      drawn.motes.filter((mote) => mote.shape === 'smoke' && mote.color === '#15131e' && mote.alpha > 0.8);
    const rimOf = (drawn: Staged) => drawn.ribbons.filter((ribbon) => ribbon.points.length === 41 && ribbon.torn);

    expect(darkest(closed).length).toBeGreaterThan(30);
    expect(rimOf(closed)).toEqual([]);
    expect(rimOf(tearing).length).toBe(2);
    expect(tearing.motes.filter((mote) => mote.shape === 'wisp').length).toBeGreaterThan(5);
  });

  it('parts the clouds: the gap in them is wider just before it comes down than as they gather', () => {
    const gapAt = (seconds: number) =>
      Math.min(
        ...stagedAt(heaven, cast, seconds)
          .motes.filter((mote) => mote.shape === 'smoke' && mote.color === '#15131e' && mote.forward === 0)
          .map((mote) => Math.hypot(mote.x - TARGET.x, mote.y - TARGET.y))
      );

    expect(gapAt(strikes * 0.95)).toBeGreaterThan(gapAt(0.15) + CELL);
  });

  it('comes down once, on the first target, as wide as the area', () => {
    const drawn = stagedAt(heaven, cast, strikes + 0.05);
    const widestAt = (at: { x: number; y: number }) => Math.max(0, ...uprightAt(drawn, at).map(widestOf));

    expect(widestAt(TARGET)).toBeGreaterThanOrEqual(AREA);
    for (const other of OTHERS) {
      expect(widestAt(other)).toBeGreaterThan(0);
      expect(widestAt(other)).toBeLessThan(CELL * 2);
    }
  });

  it('whites the whole area out as it lands, in colour and not in light alone', () => {
    const drawn = stagedAt(heaven, cast, strikes + 0.02);
    const white = drawn.floor.filter(
      (mark) => mark.shape === 'disc' && mark.color === '#ffffff' && mark.x === TARGET.x && mark.radius >= AREA
    );

    for (const blend of ['color', 'light'] as const) {
      const strongest = Math.max(0, ...white.filter((mark) => mark.blend === blend).map((mark) => mark.alpha));

      expect([blend, strongest > 0.8]).toEqual([blend, true]);
    }
  });

  it('strikes every target it takes in at the same instant, whatever their stagger', () => {
    const drawn = stagedAt(heaven, cast, strikes + 0.03);

    for (const at of [TARGET, ...OTHERS]) {
      const beat = drawn.floor.filter(
        (mark) => mark.shape === 'disc' && mark.blend === 'light' && mark.x === at.x && mark.y === at.y
      );

      expect(beat.length).toBeGreaterThan(0);
    }
    expect(stagedAt(heaven, cast, strikes - 0.2).ribbons.filter(standsUpright)).toEqual([]);
  });

  it('comes down whole on each target in turn where it is cast over no area', () => {
    const picked = holyPresetOf('smite', 3, { durationMs: 4310, staggerMs: 300, targeting: 'multi', maxTargets: 4 });
    const drawn = stagedAt(picked, castOn([TARGET, OTHERS[0]]), strikesAt(picked) + 0.35);
    const widestAt = (at: { x: number; y: number }) => Math.max(0, ...uprightAt(drawn, at).map(widestOf));

    expect(widestAt(TARGET)).toBeGreaterThan(CELL);
    expect(widestAt(OTHERS[0])).toBeGreaterThan(CELL);
  });
});
