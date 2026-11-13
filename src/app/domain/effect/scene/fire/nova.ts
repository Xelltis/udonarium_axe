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
  risingPlumes,
  rollingDust,
  SMOKE,
  thrownBrands,
  thrownGrit,
  thrownRocks,
  thrownSparks,
  WARM,
} from '@axe/domain/effect/scene/fire/fire-parts';
import {
  floorMark,
  glow,
  keptFor,
  type Point,
  stageKey,
  type Thrower,
  throwerFor,
} from '@axe/domain/effect/scene/parts';

/*
 * A great explosion over an area: the heat about it is drawn in to a point in streaks; it goes off in
 * a white flash with a streak of light across it, held for an instant; a fireball swallows the piece,
 * swelling and holding a while before it breaks; two shock rings race out to the edge of the area with
 * a band of dust behind them, and the floor cracks, glowing, under it. The fireball breaks into balls
 * of flame that cool to smoke, and a heavy cloud of smoke rises; burning brands, rocks and grit rain
 * over the area, sparks fly and embers drift. Each piece caught round it is struck as the shock
 * reaches it. The scorch it leaves is wide and cools slowly while the smoke clears.
 */

/** How long it lingers after its playback as its smoke clears, in seconds. */
const LINGER_S = 2.2;
/** How long after it goes off the shock reaches the pieces caught round it, in seconds. */
const REACHES_ROUND_S = 0.14;

const thrownByStage = new Map<string, NovaThrow>();

export const nova: Choreography = {
  lingerS: LINGER_S,
  draw: (stage) => (stage.index === 0 ? drawNova(stage) : drawCaughtBlast(stage, LINGER_S, REACHES_ROUND_S)),
};

interface NovaThrow extends FireThrow {
  /** Where the streaks of heat drawn in start, as a turn about the heart and how far out, in cells. */
  readonly drawnIn: readonly { readonly angle: number; readonly out: number; readonly lift: number }[];
}

function drawNova(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell } = stage;
  const goesOff = stage.blowsAt[0] ?? 0;
  const t = stage.seconds - goesOff;
  const ends = stage.duration + LINGER_S - goesOff;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const heart = { x: stage.x, y: stage.y, z: stage.z + cell * 0.55 };
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const forward = cell * 0.6;
  const area = Math.max(stage.areaPx, cell * 2.5);
  const thrown = keptFor(thrownByStage, stageKey(stage, ends), () => throwNova(throwerFor(stage, ends), heart, floor));

  if (t < 0) {
    drawDrawingIn(drawn, thrown, stage, heart, floor, area, ramp, forward, goesOff);
    return drawn;
  }
  const clearing = 1 - within(t, ends - 0.8, ends);
  const seed = (stage.seed % 89) + 1;

  // The floor: cracks glowing under the blast, a wide scorch, the shock and the dust thrown out.
  const cracking = within(t, 0, 0.12);
  drawn.floor.push(floorMark('cracks', floor, cell * 1.5 * cracking, 0.35, SMOKE, 0.7 * clearing, 'color', seed, seed));
  const glowing = Math.max(0, 1 - t / 2.4);
  if (glowing > 0) {
    drawn.floor.push(floorMark('cracks', floor, cell * 1.5 * cracking, 0.18, ramp[4], glowing, 'light', seed, seed));
  }
  layScorch(drawn, floor, cell * 1.05, ramp, t, 3, clearing, seed);
  layShockRing(drawn, floor, cell * 0.4, area + cell * 0.5, cell * 0.2, ramp[5], t, 0.55);
  layShockRing(drawn, floor, cell * 0.3, area * 0.75, cell * 0.12, ramp[3], t - 0.08, 0.45);
  layDustBand(drawn, floor, area * 1.1, cell * 0.3, ramp, t, 0.9);

  drawFireThrow(drawn, thrown, t, cell, ramp, forward);

  // The heart of the fireball gives light while it swells.
  const swelling = within(t, 0, 0.7);
  if (swelling < 1)
    drawn.motes.push(glow(heart, cell * (1.4 + swelling), ramp[4], 0.3 * (1 - swelling), forward * 1.4));

  drawFlashDisc(drawn, heart, cell * 1.5, ramp, t, 0.08);
  // A streak of light across the flash.
  const streak = within(t, 0, 0.3);
  if (streak < 1) {
    drawn.motes.push({
      ...glow(heart, cell * 0.5 * (1 - streak * 0.7), '#ffffff', 1 - streak, forward * 1.6),
      shape: 'flare',
      trail: 7 + streak * 9,
    });
  }

  if (t < 0.12) {
    drawn.lights.push({ ...heart, color: '#ffffff', strength: 1.6 * (1 - t / 0.12), reachPx: cell * 3 });
  }
  const warm = Math.pow(Math.max(0, 1 - t / 2), 1.5);
  if (warm > 0.02) {
    drawn.lights.push({
      ...heart,
      color: mixColor(ramp[4], WARM, 0.5),
      strength: 1.0 * warm,
      reachPx: area * 0.8 + cell,
    });
  }
  return drawn;
}

/** The heat drawn in before it goes off: streaks closing on the heart, a glow growing in it, and a ring on the floor closing in. */
function drawDrawingIn(
  drawn: Staged,
  thrown: NovaThrow,
  stage: Stage,
  heart: Point,
  floor: Point,
  area: number,
  ramp: readonly string[],
  forward: number,
  goesOff: number
): void {
  const { cell } = stage;
  const gather = goesOff > 0 ? within(stage.seconds, 0, goesOff) : 1;
  const closing = gather * gather;
  for (const streak of thrown.drawnIn) {
    const out = streak.out * cell * (1 - closing);
    const at = {
      x: heart.x + Math.cos(streak.angle) * out,
      y: heart.y + Math.sin(streak.angle) * out,
      z: heart.z + streak.lift * cell * (1 - closing),
    };
    const speed = streak.out * cell * 2 * gather;
    drawn.motes.push({
      ...glow(at, cell * 0.07, ramp[5], 0.4 + 0.6 * gather, forward),
      shape: 'spark',
      velocity: {
        x: -Math.cos(streak.angle) * speed,
        y: -Math.sin(streak.angle) * speed,
        z: -streak.lift * cell * 2 * gather,
      },
      trail: 0.12,
    });
  }
  drawn.motes.push(glow(heart, cell * (0.3 + gather * 0.9), ramp[5], 0.3 + gather * 0.6, forward));
  const ring = area * (1 - gather) + cell * 0.4 * gather;
  drawn.floor.push(floorMark('ring', floor, ring, (cell * 0.06) / ring, ramp[4], 0.3 + 0.6 * gather, 'light', 0));
}

/**
 * A piece caught round a blast: struck as the shock reaches it, `reachesS` seconds after the blast
 * goes off, with a burst of flame, sparks and a scorch, smaller than the heart's.
 */
export function drawCaughtBlast(stage: Stage, lingerS: number, reachesS: number): Staged {
  const drawn = nothingStaged();
  const { cell } = stage;
  const goesOff = (stage.blowsAt[0] ?? 0) + reachesS;
  const t = stage.seconds - goesOff;
  if (t < 0) return drawn;
  const ends = stage.duration + lingerS - goesOff;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const heart = { x: stage.x, y: stage.y, z: stage.z + cell * 0.6 };
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const forward = cell * 0.9;
  const thrown = keptFor(thrownByStage, `caught|${stageKey(stage, ends)}`, () => {
    const th = throwerFor(stage, ends);
    return {
      fire: flungFire(th, heart, th.count(10), { speed: [0.6, 2] }),
      clouds: billowingSmoke(th, heart, th.count(4)),
      sparks: thrownSparks(th, heart, th.count(24)),
      embers: risingEmbers(th, heart, th.count(10)),
      brands: [],
      bits: thrownGrit(th, floor, th.count(10)),
      drawnIn: [],
    };
  });
  const clearing = 1 - within(t, ends - 0.6, ends);
  layScorch(drawn, floor, cell * 0.8, ramp, t, 1.5, clearing, (stage.seed % 89) + 1);
  layShockRing(drawn, floor, cell * 0.3, cell * 1.8, cell * 0.15, ramp[4], t, 0.3);
  drawFireThrow(drawn, thrown, t, cell, ramp, forward);
  drawFlashDisc(drawn, heart, cell * 1.4, ramp, t, 0.06);
  return drawn;
}

/** Throws every part of the blast from its heart, on its own clock from the moment it goes off. */
function throwNova(th: Thrower, heart: Point, floor: Point): NovaThrow {
  const U = th.cell;
  const fire: FireBall[] = [];
  // The fireball swallowing the piece: big balls holding over it a while, swelling, before they break to smoke.
  for (let index = 0; index < th.count(9); index++) {
    const way = th.outward();
    const out = th.range(0, 0.5) * U;
    fire.push({
      mote: th.mote({
        x: heart.x + way.cos * out,
        y: heart.y + way.sin * out,
        z: heart.z + th.range(-0.2, 0.3) * U,
        vx: way.cos * th.range(0.3, 1.2) * U,
        vy: way.sin * th.range(0.3, 1.2) * U,
        vz: th.range(0.2, 1) * U,
        bornAt: th.range(0, 0.05),
        life: th.lifeOf(0.05, 1.1, 1.6),
        gravity: -th.range(0.6, 1.2) * U,
        drag: 3,
        bounce: 0,
      }),
      size: th.range(0.75, 1.1),
      burns: th.range(0.55, 0.7),
      variant: th.range(0, 6),
      taper: 0.15,
      hottest: 3,
    });
  }
  fire.push(
    ...flungFire(th, heart, th.count(25), { speed: [1.5, 5], from: 0.5, smokes: 0.55 }).map((ball) => ({
      ...ball,
      hottest: 3,
    }))
  );
  const clouds = [
    ...billowingSmoke(th, heart, th.count(12), {
      spread: 0.9,
      size: [0.9, 1.5],
      rise: [0.8, 1.6],
      bornAt: [0.3, 0.9],
      life: [2.4, 3.6],
    }),
    ...risingPlumes(th, heart, th.count(6), [0.5, 1.2], [1.2, 1.8], 1.4),
    ...rollingDust(th, floor, th.count(14), [3, 9], [0.7, 1]),
    ...dustColumn(th, floor, th.count(6)),
  ];
  const sparks = thrownSparks(th, heart, th.count(80), [7, 18]);
  const embers = risingEmbers(th, heart, th.count(40), [0, 0.4], 0.6);
  const brands = thrownBrands(th, heart, th.count(6), [3.5, 7]);
  const bits = [...thrownRocks(th, floor, th.count(8), [4, 7]), ...thrownGrit(th, floor, th.count(40), [3, 9])];
  const drawnIn = Array.from({ length: th.count(16) }, () => ({
    angle: th.range(0, Math.PI * 2),
    out: th.range(2.2, 3.6),
    lift: th.range(-0.2, 1.2),
  }));
  return { fire, clouds, sparks, embers, brands, bits, drawnIn };
}
