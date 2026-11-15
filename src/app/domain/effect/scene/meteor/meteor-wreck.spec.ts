import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged, type Stage } from '@axe/domain/effect/scene/choreography';
import { moteAt } from '@axe/domain/effect/scene/effect-sim';
import { meteorFallOf } from '@axe/domain/effect/scene/meteor/meteor-fall';
import { METEOR_SHEDS_A_SECOND, shedAlong } from '@axe/domain/effect/scene/meteor/meteor-shed';
import {
  CRATER_CELLS,
  craterHeatAt,
  layCrater,
  METEOR_THROWS,
  throwWreck,
} from '@axe/domain/effect/scene/meteor/meteor-wreck';
import { throwerFor } from '@axe/domain/effect/scene/parts';

const CELL = 50;

function stageOf(grade: number, seed = 11): Stage {
  const preset = new EffectPreset('preset');
  preset.kind = 'projectile';
  preset.projectileStyle = 'meteor';
  preset.grade = grade;
  return {
    x: 400,
    y: 300,
    z: 0,
    groundZ: 0,
    cell: CELL,
    tall: CELL,
    seconds: 0,
    duration: 1.2,
    index: 0,
    areaPx: 0,
    origin: { x: 100, y: 300, z: 30 },
    targets: [],
    mouth: null,
    blowsAt: [1.05],
    seed,
    preset,
  };
}

describe('what a meteor sheds as it falls', () => {
  it('sheds by the second of its fall and by its grade, half of its fire turning to smoke', () => {
    const stage = stageOf(2);
    const fall = meteorFallOf(stage, 0, 1, 0, 1.05);
    const shed = shedAlong(throwerFor(stage, 3), fall, 1);
    const heavy = shedAlong(throwerFor(stageOf(3), 3), fall, 1);
    const smoking = shed.gouts.filter((gout) => gout.burns < 1).length;

    expect(shed.gouts).toHaveLength(Math.round(METEOR_SHEDS_A_SECOND.gouts * 0.9));
    expect(shed.sparks).toHaveLength(Math.round(METEOR_SHEDS_A_SECOND.sparks * 0.9));
    expect(shed.embers).toHaveLength(Math.round(METEOR_SHEDS_A_SECOND.embers * 0.9));
    expect(heavy.gouts.length).toBeGreaterThan(shed.gouts.length * 1.5);
    expect(smoking / shed.gouts.length).toBeGreaterThan(0.3);
    expect(smoking / shed.gouts.length).toBeLessThan(0.7);
  });

  it('sheds each thing while the rock falls, from behind where the rock then is', () => {
    const stage = stageOf(3);
    const fall = meteorFallOf(stage, 0, 1, 0, 1.05);
    const shed = shedAlong(throwerFor(stage, 3), fall, 1);

    for (const mote of [...shed.gouts.map((gout) => gout.mote), ...shed.sparks, ...shed.embers]) {
      expect(mote.bornAt).toBeGreaterThanOrEqual(fall.fallsAt);
      expect(mote.bornAt).toBeLessThanOrEqual(fall.landsAt);
      const along =
        ((mote.x - fall.from.x) * fall.way.x +
          (mote.y - fall.from.y) * fall.way.y +
          (mote.z - fall.from.z) * fall.way.z) /
        fall.length;
      expect(along).toBeLessThan(1);
      expect(along).toBeGreaterThan(-0.1);
    }
  });

  it('sheds the less for each meteor of a volley', () => {
    const stage = stageOf(2);
    const fall = meteorFallOf(stage, 0, 1, 0, 1.05);

    expect(shedAlong(throwerFor(stage, 3), fall, 0.25).gouts.length).toBeLessThan(
      shedAlong(throwerFor(stage, 3), fall, 1).gouts.length * 0.3
    );
  });
});

describe('what a meteor leaves where it strikes', () => {
  it('throws most of its rock and grit on the way it was flying', () => {
    const stage = stageOf(3);
    const fall = meteorFallOf(stage, 0, 1, 0, 1.05);
    const wreck = throwWreck(throwerFor(stage, 1.9), fall, 1, true);
    const onward = wreck.bits.filter(
      (bit) => bit.mote.vx * fall.across.x + bit.mote.vy * fall.across.y > Math.hypot(bit.mote.vx, bit.mote.vy) * 0.8
    );

    expect(wreck.bits).toHaveLength(Math.round(METEOR_THROWS.rocks * 1.7) + Math.round(METEOR_THROWS.grit * 1.7));
    expect(onward.length / wreck.bits.length).toBeGreaterThan(0.6);
    expect(onward.length).toBeLessThan(wreck.bits.length);
  });

  it('runs its dust out to both sides of the way it was flying, low over the floor', () => {
    const stage = stageOf(3);
    const fall = meteorFallOf(stage, 0, 1, 0, 1.05);
    const wreck = throwWreck(throwerFor(stage, 1.9), fall, 1, true);
    const sideways = wreck.clouds.map((cloud) => cloud.mote.vx * -fall.across.y + cloud.mote.vy * fall.across.x);

    expect(wreck.clouds.length).toBeGreaterThanOrEqual(METEOR_THROWS.dust);
    for (const [index, cloud] of wreck.clouds.entries()) {
      const onward = cloud.mote.vx * fall.across.x + cloud.mote.vy * fall.across.y;
      expect(Math.abs(sideways[index])).toBeGreaterThan(Math.abs(onward));
      expect(cloud.mote.vz).toBeLessThan(CELL);
    }
    expect(sideways.some((speed) => speed > 0)).toBe(true);
    expect(sideways.some((speed) => speed < 0)).toBe(true);
  });

  it('lets the rock it throws come down and lie within reach of where it struck', () => {
    const stage = stageOf(3);
    const fall = meteorFallOf(stage, 0, 1, 0, 1.05);
    const wreck = throwWreck(throwerFor(stage, 1.9), fall, 1, true);

    for (const bit of wreck.bits) {
      const lies = moteAt(bit.mote, bit.mote.bornAt + bit.mote.life - 0.01)!;
      expect(Math.hypot(lies.x - 400, lies.y - 300)).toBeLessThan(CELL * 6);
      expect(lies.z).toBeGreaterThanOrEqual(0);
    }
  });

  it('raises clods about the rim of the crater of a meteor that falls alone, and none for one of a volley', () => {
    const stage = stageOf(2);
    const fall = meteorFallOf(stage, 0, 1, 0, 1.05);
    const alone = throwWreck(throwerFor(stage, 1.9), fall, 1, true);
    const ofVolley = throwWreck(throwerFor(stage, 1.9), fall, 1 / 6, false);

    expect(alone.clods.length).toBeGreaterThan(6);
    for (const clod of alone.clods) {
      const out = Math.hypot(clod.x - 400, clod.y - 300) / (CELL * CRATER_CELLS);
      expect(out).toBeGreaterThan(0.75);
      expect(out).toBeLessThanOrEqual(1);
    }
    expect(ofVolley.clods).toHaveLength(0);
    expect(ofVolley.bits.length).toBeLessThan(alone.bits.length * 0.3);
  });

  it('cools a crater from molten to soot before what the meteor left clears', () => {
    expect(craterHeatAt(0, 1.95)).toBe(1);
    expect(craterHeatAt(0.7, 1.95)).toBeGreaterThan(0.2);
    expect(craterHeatAt(0.7, 1.95)).toBeLessThan(0.6);
    expect(craterHeatAt(1.5, 1.95)).toBe(0);
    expect(craterHeatAt(2.5, 6)).toBeGreaterThan(0);
    expect(craterHeatAt(2.6, 6)).toBe(0);
  });

  it('lays a whole crater in more marks than that of one of a volley, both on the floor struck', () => {
    const stage = stageOf(2);
    const fall = meteorFallOf(stage, 0, 1, 0, 1.05);
    const whole = nothingStaged();
    const ofVolley = nothingStaged();
    layCrater(whole, fall, ['#200', '#a20', '#f60', '#fa6', '#fe9', '#ffd', '#fff'], 0.1, 1.95, true, 3);
    layCrater(ofVolley, fall, ['#200', '#a20', '#f60', '#fa6', '#fe9', '#ffd', '#fff'], 0.1, 1.95, false, 3);

    expect(whole.floor.map((mark) => mark.shape).sort()).toEqual(
      ['cracks', 'disc', 'ring', 'scorch', 'scorch', 'scorch', 'scorch'].sort()
    );
    expect(ofVolley.floor.map((mark) => `${mark.shape}/${mark.blend}`)).toEqual(['scorch/color', 'scorch/light']);
    for (const mark of [...whole.floor, ...ofVolley.floor]) expect([mark.x, mark.y, mark.z]).toEqual([400, 300, 0]);
  });
});
