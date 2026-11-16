import { clamp } from '@axe/core/util/clamp';
import { holyStrikesAt } from '@axe/domain/effect/holy-looks';
import {
  type Choreography,
  nothingStaged,
  outCubic,
  type Stage,
  type Staged,
  within,
} from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import {
  drawBeat,
  drawHoop,
  drawLightSparks,
  drawPillar,
  drawRisingLights,
  type HolyTones,
  holyTonesOf,
  layLightRing,
  layLightScorch,
} from '@axe/domain/effect/scene/holy/holy-parts';
import { floorMark, glow, haze, type Point } from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';

/*
 * A sanctuary. A great crest of light opens on the floor, a ring racing out to its rim as it does,
 * and turns slowly, a lesser crest turning the other way at its heart and glints running round its
 * rim; then walls of light rise from the rim in a white beat, a curtain of deep gold whose light runs
 * upwards in streaks, a hard bright rim along its top, posts of brighter light standing in it and
 * motes of light climbing it, and light bursts up out of the floor under the target. The walls stand and shimmer; then they lift off the floor and thin away into motes rising
 * from the rim, and the crest fades.
 *
 * Over an area it opens once, about the first target, as wide as the area, and the light bursts up
 * under each of the others it takes in at the same instant.
 */

const LINGER_S = SCENE_LINGER_S.sanctuary ?? 1.2;
/** How wide the crest is without an area, in cells from its middle. */
const REACH_CELLS = 1.8;
/** How tall the walls stand, in cells, how long they take to rise, and to lift away, in seconds. */
const WALL_CELLS = 2.8;
const RISES_S = 0.28;
const LIFTS_S = 0.7;
/** How long the walls stand at the least, in seconds, and where through the playback they start to lift. */
const STANDS_LEAST_S = 1;
const LIFTS_AT_SHARE = 0.72;

/** The first target of the cast that is drawn: where a sanctuary over an area opens. */
function leadOf(stage: Stage): { readonly index: number } {
  return stage.targets[0] ?? stage;
}

/** The light bursting up out of the floor under a target as the walls rise: a pillar that thins away, a beat, a ring and a stain. */
function drawUnder(drawn: Staged, stage: Stage, floor: Point, tones: HolyTones, since: number, lasts: number): void {
  if (since < 0) return;
  const { cell } = stage;
  const forward = cell * 0.4;
  if (since < 0.55) {
    const risen = outCubic(within(since, 0, 0.08));
    const thins = 1 - outCubic(within(since, 0.1, 0.55));
    drawPillar(
      drawn,
      floor,
      floor.z + cell * 2.8 * risen,
      cell * 0.36 * (0.15 + 0.85 * thins),
      tones,
      Math.min(1, thins * 2),
      -since
    );
  }
  drawBeat(drawn, floor, cell * 0.6, tones, since);
  layLightRing(drawn, floor, cell * 0.2, cell * 1.5, cell * 0.12, tones, since, 0.35);
  layLightScorch(drawn, floor, cell * 0.5, tones, since, lasts, stage.seed);
  drawLightSparks(drawn, stage.seed, { ...floor, z: floor.z + cell * 0.1 }, 10, cell, since, tones, forward);
  drawRisingLights(
    drawn,
    stage.seed,
    floor,
    cell,
    since,
    tones,
    { count: 6, out: [0, cell * 0.5], born: [0.1, Math.max(0.2, lasts - 1.8)], rise: cell * 1.5 },
    forward
  );
}

/** How much of the walls is seen where they stand before what they ring, against where they stand behind it. */
const SEEN_BEFORE = 0.5;
/** The orange the curtain is taken towards, so that it holds its colour on a bright floor. */
const WALL_ORANGE = '#ff9a10';
/** How many motes climb the walls at once, where the effect keeps all its detail. */
const CLIMBING = 36;

/**
 * The walls of light standing on the rim of the crest: a curtain of deep gold strips side by side,
 * full where it stands behind what it rings and thinner before it, its light running upwards in
 * streaks over it, a hard bright rim along its top and a line of light along its foot, posts of
 * brighter light standing in it and motes of light climbing it; lifted off the floor and thinned
 * away by `lifted`.
 */
function drawWalls(
  drawn: Staged,
  floor: Point,
  reach: number,
  cell: number,
  tones: HolyTones,
  t: number,
  risen: number,
  lifted: number,
  density: number
): void {
  const shown = 1 - lifted;
  if (risen <= 0 || shown <= 0.01) return;
  const strips = Math.round(clamp((Math.PI * 2 * reach) / (cell * 0.5), 20, 48));
  const width = ((Math.PI * 2 * reach) / strips) * 1.6;
  const base = floor.z + lifted * cell * 1.8;
  const tall = cell * WALL_CELLS * risen;
  const posts = Math.max(1, Math.round(strips / 8));
  const deep = mixColor(mixColor(tones.amber, tones.shade, 0.15), WALL_ORANGE, 0.4);
  const body = [1, 0.95, 0.85, 0.6];
  const rays = [0.5, 1, 0.9, 0.3];
  for (let strip = 0; strip < strips; strip++) {
    const turn = (strip / strips) * Math.PI * 2;
    const at = { x: floor.x + Math.cos(turn) * reach, y: floor.y + Math.sin(turn) * reach };
    const shimmer = 0.85 + 0.15 * Math.sin(t * 5.3 + strip * 1.3);
    const points = [0, 0.35, 0.7, 1].map((share) => ({ ...at, z: base + tall * share }));
    const about = points.map((point) => ({ x: floor.x, y: floor.y, z: point.z }));
    for (const [half, seen] of [
      ['far', 1],
      ['near', SEEN_BEFORE],
    ] as const) {
      drawn.ribbons.push(
        {
          points,
          about,
          half,
          widths: width,
          color: deep,
          core: tones.amber,
          alpha: 0.85 * shown * seen,
          alphas: body,
          blend: 'color',
          soft: 0.25,
          torn: 0.18,
          flowed: -t * 1.6 + strip * 0.37,
        },
        {
          points,
          about,
          half,
          widths: width * 0.7,
          color: tones.gold,
          core: tones.pale,
          alpha: 0.55 * shown * shimmer * seen,
          alphas: rays,
          blend: 'light',
          soft: 0.5,
          torn: 0.5,
          flowed: -t * 3.2 + strip * 0.61,
        }
      );
    }
    if (strip % posts !== 0) continue;
    const post = [0, 0.5, 1].map((share) => ({ ...at, z: base + tall * 1.35 * share }));
    drawn.ribbons.push(
      {
        points: post,
        widths: cell * 0.22,
        color: deep,
        core: tones.pale,
        alpha: 0.95 * shown,
        alphas: [1, 0.85, 0],
        blend: 'color',
        soft: 0.3,
      },
      {
        points: post,
        widths: cell * 0.13,
        color: tones.hot,
        core: '#ffffff',
        alpha: shown,
        alphas: [1, 0.85, 0],
        blend: 'light',
        soft: 0.4,
      }
    );
  }
  drawHoop(drawn, { ...floor, z: base + cell * 0.04 }, reach, cell * 0.13, tones, shown);
  drawHoop(drawn, { ...floor, z: base + tall * 0.99 }, reach, cell * 0.1, tones, shown * risen);
  for (let hoop = 0; hoop < 2; hoop++) {
    const climbed = (t * 0.45 + hoop / 2) % 1;
    const fade = Math.min(1, climbed * 5, (1 - climbed) * 3) * shown * risen;
    drawHoop(drawn, { ...floor, z: base + tall * climbed }, reach, cell * 0.05, tones, 0.8 * fade);
  }
  const next = seededRun(Math.round(reach) * 7 + 3);
  for (let mote = 0; mote < Math.round(CLIMBING * density); mote++) {
    const turn = next() * Math.PI * 2;
    const pace = 0.6 + next() * 0.6;
    const climbed = (t * pace + next()) % 1;
    const fade = Math.min(1, climbed * 6, (1 - climbed) * 3) * shown * risen;
    const at = {
      x: floor.x + Math.cos(turn) * reach * 1.02,
      y: floor.y + Math.sin(turn) * reach * 1.02,
      z: base + tall * 1.3 * climbed,
    };
    drawn.motes.push(
      {
        ...haze(at, cell * 0.24, deep, 0.9 * fade, cell * 0.2),
        shape: 'spark',
        velocity: { x: 0, y: 0, z: tall * pace },
        trail: 0.14,
      },
      {
        ...glow(at, cell * 0.16, tones.hot, fade, cell * 0.2 + 1),
        shape: 'spark',
        velocity: { x: 0, y: 0, z: tall * pace },
        trail: 0.12,
      }
    );
  }
}

/** A sanctuary: see the header. */
export const sanctuary: Choreography = {
  lingerS: LINGER_S,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell, duration } = stage;
    const lead = leadOf(stage);
    const caught = lead.index !== stage.index && stage.areaPx > 0;
    const t = stage.seconds + (caught ? ((stage.index - lead.index) * stage.preset.stagger) / 1000 : 0);
    const rises = stage.blowsAt[0] ?? holyStrikesAt('sanctuary', stage.preset.gradeLevel, duration) ?? duration * 0.3;
    const since = t - rises;
    const ends = duration + LINGER_S;
    if (t < 0 || t >= ends) return drawn;
    const tones = holyTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    drawUnder(drawn, stage, floor, tones, since, ends - rises);
    if (caught) return drawn;

    const reach = stage.areaPx > 0 ? stage.areaPx : cell * REACH_CELLS;
    const forward = cell * 0.4;
    const density = stage.preset.gradeDensity;
    const liftsAt = Math.max(rises + STANDS_LEAST_S, duration * LIFTS_AT_SHARE);
    const opened = outCubic(within(t, 0, rises * 0.8));
    const clearing = 1 - within(t, ends - 0.8, ends);
    const lifted = within(t, liftsAt, liftsAt + LIFTS_S);
    const standing = since >= 0 ? 1 - lifted : 0;
    const turn = (stage.seed % 7) + t * 0.16;
    const pulse = 0.75 + 0.25 * Math.sin(t * 4.2);

    drawn.floor.push(floorMark('disc', floor, reach * opened * 1.1, 1, tones.amber, 0.22 * clearing, 'color', 0));
    drawn.floor.push(floorMark('crest', floor, reach * opened, 0.07, tones.shade, 0.8 * clearing, 'color', 0, turn));
    drawn.floor.push(floorMark('crest', floor, reach * opened, 0.045, tones.amber, 0.95 * clearing, 'color', 0, turn));
    drawn.floor.push(
      floorMark(
        'crest',
        floor,
        reach * opened,
        0.03,
        tones.hot,
        clearing * pulse * (0.6 + 0.4 * standing),
        'light',
        0,
        turn
      )
    );
    drawn.floor.push(
      floorMark('crest', floor, reach * 0.4 * opened, 0.1, tones.amber, 0.8 * clearing, 'color', 0, -turn * 2)
    );
    drawn.floor.push(
      floorMark('crest', floor, reach * 0.4 * opened, 0.06, tones.pale, clearing * pulse, 'light', 0, -turn * 2)
    );
    drawn.floor.push(
      floorMark('disc', floor, reach * opened * 1.2, 1, tones.gold, 0.3 * clearing * (0.5 + 0.5 * standing), 'light', 0)
    );
    layLightRing(drawn, floor, cell * 0.2, reach, cell * 0.24, tones, t, Math.max(0.2, rises * 0.8));

    if (since < 0) {
      const glints = Math.round(clamp(reach / (cell * 0.3), 8, 16));
      for (let glint = 0; glint < glints; glint++) {
        const round = (glint / glints) * Math.PI * 2 + t * 2.2;
        const at = {
          x: floor.x + Math.cos(round) * reach * opened,
          y: floor.y + Math.sin(round) * reach * opened,
          z: floor.z + cell * 0.12,
        };
        drawn.motes.push(haze(at, cell * 0.14, tones.amber, 0.8 * opened, forward));
        drawn.motes.push(glow(at, cell * 0.2, tones.hot, opened, forward + 1));
      }
      drawn.lights.push({
        ...floor,
        z: floor.z + cell,
        color: tones.gold,
        strength: 0.7 * opened,
        reachPx: reach * 1.6,
      });
      return drawn;
    }

    drawWalls(drawn, floor, reach, cell, tones, t, outCubic(within(since, 0, RISES_S)), lifted, density);
    if (since < 0.09) {
      const left = 1 - since / 0.09;
      drawn.floor.push(floorMark('ring', floor, reach * 1.02, 0.16, '#ffffff', left, 'light', 0));
      drawn.floor.push(floorMark('ring', floor, reach * 1.02, 0.2, tones.hot, 0.9 * left, 'color', 0));
      drawn.floor.push(floorMark('disc', floor, reach * 1.2, 1, tones.hot, 0.35 * left, 'light', 0));
    }
    layLightRing(drawn, floor, reach, reach * 1.4, cell * 0.22, tones, since, 0.45);
    drawRisingLights(
      drawn,
      stage.seed + 1,
      floor,
      cell,
      since,
      tones,
      {
        count: Math.round(12 * density),
        out: [cell * 0.4, reach * 0.9],
        born: [0.2, Math.max(0.3, liftsAt - rises)],
        rise: cell * 1.2,
      },
      forward
    );
    drawRisingLights(
      drawn,
      stage.seed + 2,
      floor,
      cell,
      since,
      tones,
      {
        count: Math.round(26 * density),
        out: [reach * 0.96, reach * 1.02],
        born: [liftsAt - rises - 0.15, liftsAt - rises + LIFTS_S],
        rise: cell * 2,
      },
      forward
    );
    if (since < 0.4)
      drawn.lights.push({
        ...floor,
        z: floor.z + cell * 1.5,
        color: '#ffffff',
        strength: 2.1 * (1 - since / 0.4),
        reachPx: reach * 2.4,
      });
    else if (standing > 0.02)
      drawn.lights.push({
        ...floor,
        z: floor.z + cell * 1.2,
        color: tones.gold,
        strength: 0.9 * standing,
        reachPx: reach * 2,
      });
    return drawn;
  },
};
