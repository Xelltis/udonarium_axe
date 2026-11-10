import {
  type Choreography,
  nothingStaged,
  type Stage,
  type Staged,
  within,
} from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import {
  billowingSmoke,
  drawFireThrow,
  drawFlashDisc,
  dustColumn,
  type FireBall,
  type FireThrow,
  flungFire,
  layDustBand,
  layScorch,
  layShockRing,
  risingEmbers,
  rollingDust,
  thrownBrands,
  thrownGrit,
  thrownRocks,
  thrownSparks,
  WARM,
} from '@axe/domain/effect/scene/fire/fire-parts';
import { glow, keptFor, type Point, stageKey, type Thrower, throwerFor } from '@axe/domain/effect/scene/parts';

/*
 * A burst: heat gathers to a point; it goes off in a white flash, held for an instant, with two shock
 * rings racing out along the floor and a band of dust behind them; balls of flame are flung out and
 * up, cooling down the ramp as they rise and turning to smoke; sparks fly, are slowed, fall and
 * bounce; burning brands arc out, land and burn on; rocks and grit are thrown up, tumble and settle;
 * dust rolls out along the floor and a column of it rises; embers drift up and die; the floor under it
 * is scorched white-hot and cools through the fire to soot. The flash is fast and the release slow:
 * the smoke rises away and the scorch cools long after the blow.
 */

/** How long a burst lingers after its playback as its smoke clears, in seconds. */
const LINGER_S = 1.8;

const thrownByStage = new Map<string, FireThrow>();

export const burst: Choreography = { lingerS: LINGER_S, draw: drawBurst };

function drawBurst(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell } = stage;
  const goesOff = stage.blowsAt[0] ?? 0;
  const t = stage.seconds - goesOff;
  const ends = stage.duration + LINGER_S - goesOff;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const heart = { x: stage.x, y: stage.y, z: stage.z + cell * 0.35 };
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const forward = cell * 0.5;

  if (t < 0) {
    // Heat gathers to a point before it goes off.
    const gather = goesOff > 0 ? within(stage.seconds, 0, goesOff) : 1;
    drawn.motes.push(glow(heart, cell * (0.2 + gather * 0.5), ramp[5], 0.4 + gather * 0.5, forward));
    return drawn;
  }
  const thrown = keptFor(thrownByStage, stageKey(stage, ends), () => throwBurst(throwerFor(stage, ends), heart, floor));
  const clearing = 1 - within(t, ends - 0.5, ends);

  layScorch(drawn, floor, cell * 0.62, ramp, t, 1.5, clearing, (stage.seed % 89) + 1);
  layShockRing(drawn, floor, cell * 0.34, cell * 2, cell * 0.13, ramp[4], t, 0.34);
  layShockRing(drawn, floor, cell * 0.22, cell * 1.2, cell * 0.08, ramp[2], t, 0.22);
  layDustBand(drawn, floor, cell * 2.5, cell * 0.17, ramp, t, 0.5);
  drawFireThrow(drawn, thrown, t, cell, ramp, forward);
  drawFlashDisc(drawn, heart, cell * 1.1, ramp, t);
  layLights(drawn, cell, heart, ramp, t);
  return drawn;
}

/** The light it throws over the table: a white flash for an instant and a warm light that dies away as the fire does. */
function layLights(drawn: Staged, cell: number, heart: Point, ramp: readonly string[], t: number): void {
  if (t < 0.08) {
    drawn.lights.push({ ...heart, color: '#ffffff', strength: 1.4 * (1 - t / 0.08), reachPx: cell * 1.6 });
  }
  const warm = Math.pow(Math.max(0, 1 - t / 0.9), 1.5);
  if (warm > 0.02) {
    drawn.lights.push({ ...heart, color: mixColor(ramp[4], WARM, 0.5), strength: 1.1 * warm, reachPx: cell * 3 });
  }
}

/** Throws every part of a burst from its heart, on its own clock from the moment it goes off. */
function throwBurst(th: Thrower, heart: Point, floor: Point): FireThrow {
  const U = th.cell;
  const fire: FireBall[] = [];
  // The heart of the fireball: a few big balls that burn out where it went off.
  for (let index = 0; index < 5; index++) {
    fire.push({
      mote: th.mote({
        x: heart.x + th.range(-0.1, 0.1) * U,
        y: heart.y + th.range(-0.1, 0.1) * U,
        z: heart.z + th.range(-0.1, 0.1) * U,
        vx: th.range(-0.8, 0.8) * U,
        vy: th.range(-0.8, 0.8) * U,
        vz: th.range(0.4, 1.6) * U,
        bornAt: 0,
        life: th.lifeOf(0, 0.18, 0.3),
        gravity: -U,
        drag: 3,
        bounce: 0,
      }),
      size: th.range(0.6, 0.82),
      burns: 1,
      variant: th.range(0, 6),
    });
  }
  fire.push(...flungFire(th, heart, th.count(25)));
  // A column of flame rising straight up out of it.
  for (let index = 0; index < 5; index++) {
    const smokes = th.chance(0.6);
    const bornAt = th.range(0, 0.1);
    fire.push({
      mote: th.mote({
        x: heart.x + th.range(-0.19, 0.19) * U,
        y: heart.y + th.range(-0.19, 0.19) * U,
        z: heart.z,
        vx: th.range(-0.5, 0.5) * U,
        vy: th.range(-0.5, 0.5) * U,
        vz: th.range(4.2, 7.5) * U,
        bornAt,
        life: th.lifeOf(bornAt, smokes ? 1.4 : 0.8, smokes ? 2.2 : 1.3),
        gravity: -0.5 * U,
        drag: 2.4,
        bounce: 0,
      }),
      size: th.range(0.36, 0.54),
      burns: smokes ? th.range(0.5, 0.62) : 1,
      variant: th.range(0, 6),
    });
  }
  const clouds = [
    ...billowingSmoke(th, heart, th.count(10)),
    ...rollingDust(th, floor, th.count(9)),
    ...dustColumn(th, floor, th.count(6)),
  ];
  const sparks = thrownSparks(th, heart, th.count(72));
  const embers = risingEmbers(th, heart, th.count(36));
  const brands = thrownBrands(th, heart, Math.round(th.range(3, 5) * (th.count(10) / 10)));
  const bits = [...thrownRocks(th, floor, th.count(6)), ...thrownGrit(th, floor, th.count(36))];
  return { fire, clouds, sparks, embers, brands, bits };
}
