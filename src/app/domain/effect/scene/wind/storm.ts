import {
  nothingStaged,
  outCubic,
  type Stage,
  type Staged,
  type StageTarget,
  within,
} from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { floorMark, glow, haze, lightBall, type Point, smokePuff } from '@axe/domain/effect/scene/parts';
import { layStrikeFlash } from '@axe/domain/effect/scene/storm/bolt-parts';
import { boltAfterimage, boltRibbons, boltShape } from '@axe/domain/effect/scene/storm/lightning';
import { drawTornado } from '@axe/domain/effect/scene/wind/tornado';
import {
  debrisKindOf,
  debrisRibbon,
  halvesOf,
  layRibbons,
  scatter,
  type WindPaint,
  windPaintOf,
} from '@axe/domain/effect/scene/wind/wind-parts';
import { stormStrikesOf, tornadoTimingOf } from '@axe/domain/effect/wind-looks';

/*
 * A great storm: a tornado grown huge over the middle of the area, crowned with a thundercloud that
 * spreads out over all of it, dark below and lit from within by lightning flickering through it. The
 * wind takes every piece the storm has caught: each is wrapped in bands of wind, lifted and whirled
 * with leaves and grit about it. Three times lightning strikes down out of the cloud, onto each piece
 * in its turn, white-hot over a dark sheath, lighting the ground and leaving its path burnt into the
 * air for a moment. The storm thins away as the tornado does, and the cloud breaks up as it goes.
 *
 * Every length is in cells.
 */

/** How much larger than a tornado the funnel of a storm is drawn. */
const GROWS = 1.25;
/** How high over the floor the cloud hangs, in cells of the storm's funnel, and how far out over the area it spreads at the least. */
const CLOUD_HIGH_CELLS = 4;
const CLOUD_LEAST_CELLS = 2.8;
/** How many puffs the cloud is built of, and how large each is, in cells. */
const PUFFS = 28;
const PUFF_CELLS = 1.5;
/** How long a stroke of lightning stays whole, and how long its path stays burnt into the air after it, in seconds. */
const STROKE_S = 0.12;
const AFTER_S = 0.3;
/** The colours lightning is drawn in, from its light to its dark. */
const BOLT_LIGHT = '#f6f2ff';
const BOLT_DARK = '#6f4cff';
/** The dark underside of a thundercloud, and its tops. */
const CLOUD_DARK = '#262a3a';
const CLOUD_TOP = '#5d6680';

/** A great storm on one target: the funnel and its cloud over the first, and what the wind does to each of the rest. */
export function drawStorm(stage: Stage): Staged {
  const drawn = nothingStaged();
  const U = stage.cell;
  const t = stage.seconds;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const paint = windPaintOf(ramp);
  const bolt = rampOf(BOLT_LIGHT, BOLT_DARK, 7);
  const timing = tornadoTimingOf(stage.duration);
  const present = Math.min(within(t, 0.1, 0.5), 1 - within(t, timing.thinsAt, timing.goneAt));
  const centre = stage.targets.find((target) => target.index === 0) ?? { ...stage, widthPx: U };
  const tornado = drawTornado(stage.index === 0 ? { ...stage, cell: U * GROWS } : stage);
  addInto(drawn, tornado);
  if (stage.index > 0) {
    drawWrapped(drawn, stage, t, U, paint, present);
    return drawn;
  }
  const reach = Math.max(stage.areaPx * 1.1, U * CLOUD_LEAST_CELLS);
  const cloud = { x: centre.x, y: centre.y, z: centre.groundZ + U * GROWS * CLOUD_HIGH_CELLS };
  const strikes = stormStrikesOf(stage.duration);
  drawCloud(drawn, cloud, reach, t, U, present, strikes, stage.seed);
  const targets: readonly StageTarget[] = stage.targets.length > 0 ? stage.targets : [{ ...centre, index: 0 }];
  for (const [index, target] of targets.entries()) {
    for (const [stroke, at] of strikes.entries()) {
      if (index % strikes.length !== stroke && !(index === 0 && stroke === strikes.length - 1)) continue;
      drawStrike(
        drawn,
        cloud,
        target,
        t - at,
        U,
        bolt,
        stage.seed + index * 31 + stroke * 7,
        index === 0 || targets.length < 3
      );
    }
  }
  if (present > 0.05) drawWrapped(drawn, stage, t, U, paint, present);
  return drawn;
}

/** Adds what another look draws into what is drawn. */
function addInto(drawn: Staged, more: Staged): void {
  drawn.motes.push(...more.motes);
  drawn.ribbons.push(...more.ribbons);
  drawn.floor.push(...more.floor);
  drawn.lights.push(...more.lights);
}

/**
 * The thundercloud: puffs of dark cloud in a wheel turning slowly over the area, dark below and pale on
 * their tops, which gathers as the funnel rises and breaks up as it goes; lightning flickers within
 * it, lighting a puff and then another, and crawls across its underside, brightest as it strikes.
 */
function drawCloud(
  drawn: Staged,
  cloud: Point,
  reach: number,
  t: number,
  U: number,
  present: number,
  strikes: readonly number[],
  seed: number
): void {
  const gathered = outCubic(within(t, 0.2, 0.85)) * present;
  if (gathered <= 0.01) return;
  const forward = U * 0.6;
  const turned = t * 0.5;
  for (let puff = 0; puff < PUFFS; puff++) {
    const ring = puff % 3;
    const round = (puff / PUFFS) * Math.PI * 2 * 3 + turned * (1 + ring * 0.2) + scatter(puff, seed) * 0.5;
    const out = reach * (0.18 + 0.36 * ring + 0.12 * scatter(puff, seed + 1)) * (0.4 + 0.6 * gathered);
    const at = {
      x: cloud.x + Math.cos(round) * out,
      y: cloud.y + Math.sin(round) * out,
      z: cloud.z + U * (0.3 * scatter(puff, seed + 2) - 0.1 * ring),
    };
    const size = U * PUFF_CELLS * (0.75 + 0.5 * scatter(puff, seed + 3)) * (0.5 + 0.5 * gathered);
    drawn.motes.push(smokePuff({ ...at, z: at.z - size * 0.2 }, size * 1.1, CLOUD_DARK, 0.85 * gathered, forward));
    drawn.motes.push(smokePuff({ ...at, z: at.z + size * 0.18 }, size * 0.8, CLOUD_TOP, 0.7 * gathered, forward + 1));
  }
  const flicker = Math.floor(t / 0.07);
  const struck = strikes.reduce((most, at) => (t >= at ? Math.max(most, Math.exp(-(t - at) / 0.12)) : most), 0);
  for (let flash = 0; flash < 3; flash++) {
    const lit = scatter(flicker * 3 + flash, seed + 5);
    if (lit < 0.45 && struck < 0.2) continue;
    const round = scatter(flicker + flash, seed + 6) * Math.PI * 2;
    const out = reach * 0.6 * scatter(flicker * 7 + flash, seed + 7);
    const at = { x: cloud.x + Math.cos(round) * out, y: cloud.y + Math.sin(round) * out, z: cloud.z };
    drawn.motes.push(glow(at, U * (2.4 + 2 * struck), BOLT_LIGHT, (0.35 + 0.5 * struck) * gathered, forward + 2));
  }
  if (flicker % 3 !== 0 || gathered < 0.6) return;
  const from = {
    x: cloud.x + reach * 0.5 * Math.cos(flicker),
    y: cloud.y + reach * 0.5 * Math.sin(flicker),
    z: cloud.z - U * 0.4,
  };
  const to = {
    x: cloud.x - reach * 0.4 * Math.cos(flicker * 1.7),
    y: cloud.y - reach * 0.4 * Math.sin(flicker * 1.7),
    z: cloud.z - U * 0.6,
  };
  const crawl = boltShape(from, to, seed + 9, flicker, { jag: 0.18, forks: 2, forkReach: 0.3 });
  drawn.ribbons.push(...boltRibbons(crawl, U, rampOf(BOLT_LIGHT, BOLT_DARK, 7), 0.75 * gathered, 0.45, 0.2));
}

/**
 * One stroke of lightning out of the cloud onto a piece, `since` seconds after it strikes: whole and
 * white-hot for an instant, flashing on the floor and lighting the table where `lit`, then its path
 * left burnt into the air and fading.
 */
function drawStrike(
  drawn: Staged,
  cloud: Point,
  target: StageTarget,
  since: number,
  U: number,
  ramp: readonly string[],
  seed: number,
  lit: boolean
): void {
  if (since < 0 || since >= STROKE_S + AFTER_S) return;
  const floor = { x: target.x, y: target.y, z: target.groundZ };
  const from = { x: cloud.x * 0.45 + target.x * 0.55, y: cloud.y * 0.45 + target.y * 0.55, z: cloud.z - U * 0.5 };
  const shape = boltShape(from, { ...floor, z: floor.z + U * 0.05 }, seed, 0, {
    forks: 3,
    forkReach: 0.35,
    floorZ: floor.z,
  });
  if (since < STROKE_S) {
    drawn.ribbons.push(...boltRibbons(shape, U, ramp, 1, 1.5));
    const power = 1 - since / STROKE_S;
    if (lit) layStrikeFlash(drawn, { ...floor, z: floor.z + U * 0.5 }, floor, U, ramp, power, U * 0.5, 1.2, 0.8);
    else {
      drawn.motes.push(glow({ ...floor, z: floor.z + U * 0.5 }, U * 1.8, ramp[4], 0.9 * power, U * 0.5));
      drawn.motes.push(lightBall({ ...floor, z: floor.z + U * 0.5 }, U * 0.6, '#ffffff', power, U * 0.5));
      drawn.floor.push(floorMark('disc', floor, U * 2, 1, ramp[4], 0.5 * power, 'light', 0));
    }
  } else {
    drawn.ribbons.push(...boltAfterimage(shape, U, ramp, 1 - (since - STROKE_S) / AFTER_S, 1.2));
  }
  drawn.floor.push(
    floorMark(
      'scorch',
      floor,
      U * 0.6,
      1,
      '#1a1622',
      0.5 * (1 - within(since, 0.1, STROKE_S + AFTER_S)),
      'color',
      seed % 13
    )
  );
  drawn.motes.push(
    haze({ ...floor, z: floor.z + U * 0.3 }, U * 1.2, ramp[2], 0.3 * (1 - since / (STROKE_S + AFTER_S)), U * 0.4)
  );
}

/**
 * A piece the storm has caught, wrapped in bands of wind winding up round it, the far half of each
 * behind it and the near half before it, with leaves and grit whirled about it.
 */
function drawWrapped(drawn: Staged, stage: Stage, t: number, U: number, paint: WindPaint, present: number): void {
  if (present <= 0.01) return;
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const tall = Math.max(stage.tall, U * 0.8);
  const wide = stage.targets.find((target) => target.index === stage.index)?.widthPx ?? U;
  const about = { x: floor.x, y: floor.y, z: floor.z + tall * 0.5 };
  const far: EffectRibbon[] = [];
  const near: EffectRibbon[] = [];
  for (let band = 0; band < 3; band++) {
    const turn = t * (7 + band) + band * 1.3 + stage.seed;
    const high = floor.z + tall * (0.1 + 0.3 * band);
    const points = Array.from({ length: 11 }, (_unused, index) => {
      const round = turn + (index / 10) * Math.PI * 1.1;
      const out = Math.max(U * 0.42, wide * 0.55) * (0.95 + 0.25 * band + 0.15 * Math.sin(t * 3 + band));
      return { x: floor.x + Math.cos(round) * out, y: floor.y + Math.sin(round) * out, z: high + tall * 0.04 * index };
    });
    const halves = halvesOf(
      {
        points,
        widths: points.map((_point, index) => U * 0.26 * Math.sin((Math.PI * (index + 0.5)) / 11)),
        color: paint.edge,
        core: '#ffffff',
        alpha: 0.65 * present,
        alphas: points.map((_point, index) => Math.min(1, (index / 10) * 2.5)),
        blend: 'color',
        torn: 0.6,
        soft: 0.45,
        flowed: t * 8 + band,
      },
      points.map(() => about),
      paint.shadow
    );
    far.push(halves.far);
    near.push(halves.near);
  }
  layRibbons(drawn, far);
  layRibbons(drawn, near);
  for (let leaf = 0; leaf < 6; leaf++) {
    const round = t * (5 + leaf * 0.7) + leaf * 1.05;
    const out = Math.max(U * 0.5, wide * 0.6) * (0.9 + 0.3 * scatter(leaf, stage.seed));
    const high = floor.z + tall * (0.15 + 0.8 * ((t * 0.4 + scatter(leaf, stage.seed + 1)) % 1));
    drawn.ribbons.push(
      debrisRibbon({
        kind: debrisKindOf(leaf * 3 + 1),
        at: { x: floor.x + Math.cos(round) * out, y: floor.y + Math.sin(round) * out, z: high },
        size: U * (0.2 + 0.08 * scatter(leaf, stage.seed + 2)),
        turn: round * 2,
        tip: t * 6 + leaf,
        alpha: present,
        variant: leaf + stage.index,
      })
    );
  }
  drawn.floor.push(
    floorMark(
      'ring',
      floor,
      Math.max(U * 0.6, wide * 0.65),
      0.18,
      mixColor(paint.dust, paint.shadow, 0.3),
      0.5 * present,
      'color',
      0
    )
  );
}
