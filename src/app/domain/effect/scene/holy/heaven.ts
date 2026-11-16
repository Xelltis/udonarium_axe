import { holyStrikesAt } from '@axe/domain/effect/holy-looks';
import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import {
  drawBeat,
  drawFeathers,
  drawHoop,
  drawLightSparks,
  drawPillar,
  drawRisingLights,
  type HolyTones,
  holyTonesOf,
  layLightRing,
  layLightScorch,
} from '@axe/domain/effect/scene/holy/holy-parts';
import { circlePoints, floorMark, glow, haze, lightBall, type Point, smokePuff } from '@axe/domain/effect/scene/parts';

/*
 * The light of heaven, the highest grade of a light that smites. A heavy bank of dark cloud rolls in
 * and closes over the place, its shadow falling on it and light flickering within it; then it tears
 * open, its rims lit gold from the gap; shafts of light slant down through it and a pool of light
 * and a great crest spread on the floor; then one immense pillar comes down and the whole place goes
 * white, a ring racing out past its edge. The pillar stands, hoops of light sliding down it, and thins
 * away; the clouds drift apart; a stain of light is left, motes rising off it and feathers falling.
 *
 * Over an area it comes down once, on the first target, as wide as the area, and each of the others
 * it takes in is struck where it stands at the same instant: a flash, a lesser pillar and a stain.
 */

/** How wide the place it comes down on is without an area, in cells from its middle. */
const REACH_CELLS = 1.7;
/** How long the pillar takes to come down, how long the place stays white, and how long the pillar stands, in seconds. */
const FALLS_S = 0.09;
const WHITE_S = 0.28;
const STANDS_S = 0.75;
const THINS_S = 0.8;
/** The colour of the shadow the clouds throw over the place before they part. */
const DUSK = '#2a2740';

/** The first target of the cast that is drawn: where a light over an area comes down. */
function leadOf(stage: Stage): { readonly index: number } {
  return stage.targets[0] ?? stage;
}

/** The light of heaven on one target, lingering `lingerS` seconds after its playback: see the header. */
export function drawHeaven(stage: Stage, lingerS: number): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const lead = leadOf(stage);
  const caught = lead.index !== stage.index && stage.areaPx > 0;
  const t = stage.seconds + (caught ? ((stage.index - lead.index) * stage.preset.stagger) / 1000 : 0);
  const strikes = stage.blowsAt[0] ?? holyStrikesAt('smite', 3, duration) ?? duration * 0.3;
  const since = t - strikes;
  const ends = duration + lingerS;
  if (t < 0 || t >= ends) return drawn;
  const tones = holyTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  if (caught) {
    drawCaught(drawn, stage, floor, tones, since, ends - strikes);
    return drawn;
  }
  const reach = stage.areaPx > 0 ? stage.areaPx : cell * REACH_CELLS;
  const sky = floor.z + Math.max(cell * 4.4, reach * 1.5);
  const forward = cell * 0.4;
  const density = stage.preset.gradeDensity;
  const parted = Math.pow(within(t, strikes * 0.38, strikes * 0.92), 1.6);

  const dusk = within(t, 0, 0.4) * (1 - within(since, -0.05, 0.1));
  if (dusk > 0.01) drawn.floor.push(floorMark('disc', floor, reach * 2.3, 1, DUSK, 0.8 * dusk, 'color', 0));
  drawClouds(drawn, stage.seed, { ...floor, z: sky }, reach, tones, t, parted, since);
  if (since < 0.3) {
    const shining = parted * (1 - within(since, 0, 0.3));
    drawShafts(drawn, stage.seed, floor, sky, reach, cell, tones, t, shining);
    drawn.floor.push(
      floorMark('disc', floor, reach * (0.4 + 0.75 * parted), 1, tones.gold, 0.45 * shining, 'light', 0)
    );
    drawn.floor.push(floorMark('crest', floor, reach * parted, 0.07, tones.amber, 0.7 * shining, 'color', 0, t * 0.3));
    drawn.floor.push(floorMark('crest', floor, reach * parted, 0.04, tones.hot, 0.8 * shining, 'light', 0, t * 0.3));
    drawn.lights.push({
      ...floor,
      z: floor.z + cell * 2,
      color: tones.gold,
      strength: 0.9 * shining,
      reachPx: reach * 2,
    });
  }

  const wide = reach * 1.05;
  const fallen = within(t, strikes - FALLS_S, strikes);
  const stands = 1 - outCubic(within(since, STANDS_S, STANDS_S + THINS_S));
  if (fallen > 0 && since < STANDS_S + THINS_S) {
    const top = floor.z + (sky - floor.z) * 1.7;
    const head = { ...floor, z: top - (top - floor.z) * fallen };
    const swells = since >= 0 ? 1 + 0.2 * Math.max(0, 1 - since / 0.14) : 1;
    drawPillar(drawn, head, top, wide * swells * (0.06 + 0.94 * stands), tones, Math.min(1, stands * 2), t);
    if (since >= 0) {
      for (let hoop = 0; hoop < 4; hoop++) {
        const slid = (since * 1.1 + hoop / 4) % 1;
        const high = (1 - slid) * (sky - floor.z) * 0.9;
        const fade = Math.min(1, slid * 5, (1 - slid) * 4) * stands;
        drawHoop(drawn, { ...floor, z: floor.z + high }, wide * 0.62 * (0.3 + 0.7 * stands), cell * 0.1, tones, fade);
      }
      const foot = { ...floor, z: floor.z + cell * 0.3 };
      drawn.motes.push(haze(foot, reach * 2.2, tones.amber, 0.5 * stands, forward));
      drawn.motes.push(glow(foot, reach * 1.8, tones.hot, 0.6 * stands, forward));
    }
  }
  if (since < 0) return drawn;

  if (since < WHITE_S) {
    const white = 1 - since / WHITE_S;
    const heart = { ...floor, z: floor.z + cell * 0.6 };
    drawn.floor.push(floorMark('disc', floor, reach * 1.5, 1, '#ffffff', white, 'light', 0));
    drawn.floor.push(floorMark('disc', floor, reach * 1.25, 1, '#ffffff', 0.92 * white, 'color', 0));
    drawn.motes.push(haze(heart, reach * 2.6, '#ffffff', 0.9 * white, reach * 0.6));
    drawn.motes.push(lightBall(heart, reach * 1.1, '#ffffff', white, reach * 0.6 + 1));
  }
  drawBeat(drawn, floor, reach * 0.9, tones, since, 0.08);
  layLightRing(drawn, floor, reach * 0.3, reach * 1.6, cell * 0.34, tones, since, 0.5);
  layLightRing(drawn, floor, reach * 0.2, reach * 1.2, cell * 0.16, tones, since - 0.14, 0.6);
  layLightScorch(drawn, floor, reach * 0.8, tones, since, ends - strikes, stage.seed);
  drawLightSparks(
    drawn,
    stage.seed,
    { ...floor, z: floor.z + cell * 0.1 },
    Math.round(20 * density),
    Math.max(cell, reach * 0.5),
    since,
    tones,
    forward
  );
  drawRisingLights(
    drawn,
    stage.seed,
    floor,
    cell,
    since,
    tones,
    {
      count: Math.round(26 * density),
      out: [0, reach],
      born: [0.15, Math.max(0.3, ends - strikes - 1.8)],
      rise: cell * 1.6,
    },
    forward
  );
  drawFeathers(
    drawn,
    stage.seed,
    floor,
    cell,
    since,
    tones,
    {
      count: Math.round(11 * density),
      out: [cell * 0.3, reach * 1.05],
      high: [cell * 1.4, cell * 3.6],
      born: [0.1, 0.9],
      ends: ends - strikes,
    },
    forward
  );
  if (since < 0.5)
    drawn.lights.push({
      ...floor,
      z: floor.z + cell * 1.5,
      color: '#ffffff',
      strength: 2.6 * (1 - since / 0.5),
      reachPx: reach * 2.6,
    });
  else if (stands > 0.02)
    drawn.lights.push({ ...floor, z: floor.z + cell, color: tones.gold, strength: 1.1 * stands, reachPx: reach * 2 });
  return drawn;
}

/** What the light does to a target it takes in round its centre: a flash, a lesser pillar, a ring and a stain where it stands. */
function drawCaught(drawn: Staged, stage: Stage, floor: Point, tones: HolyTones, since: number, lasts: number): void {
  if (since < 0) return;
  const { cell } = stage;
  const forward = cell * 0.4;
  if (since < 0.5) {
    const thins = 1 - outCubic(within(since, 0.08, 0.5));
    drawPillar(
      drawn,
      floor,
      floor.z + cell * 5,
      cell * 0.45 * (0.2 + 0.8 * thins),
      tones,
      Math.min(1, thins * 2),
      since
    );
  }
  drawBeat(drawn, floor, cell * 0.9, tones, since);
  layLightRing(drawn, floor, cell * 0.2, cell * 1.5, cell * 0.12, tones, since, 0.35);
  layLightScorch(drawn, floor, cell * 0.5, tones, since, lasts, stage.seed);
  drawLightSparks(drawn, stage.seed, { ...floor, z: floor.z + cell * 0.1 }, 8, cell, since, tones, forward);
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

/** The colours of a cloud: its dark underside, its body and its lit top. */
const CLOUD = ['#15131e', '#2b2839', '#3b3750'] as const;
/** How many lobes the bank of cloud is made of, in its ring about the gap and in its outer ring. */
const LOBES = 16;
/** How many shreds are torn off the edge of the gap as the clouds part. */
const SHREDS = 10;

/**
 * The clouds over the place: a heavy bank rolling in from all round until it closes over the place,
 * dark beneath, slate in its body and lit dully on top, with light flickering within it; then it tears
 * open from the middle, shreds of it dragged out as the gap widens, the lobes about the gap lit gold
 * on the side that faces it and the light of the gap in their midst; once the light has come down it
 * rolls away and thins.
 */
function drawClouds(
  drawn: Staged,
  seed: number,
  middle: Point,
  reach: number,
  tones: HolyTones,
  t: number,
  parted: number,
  since: number
): void {
  const shown = within(t, 0, 0.3) * (1 - within(since, 0.2, 0.95));
  if (shown <= 0.01) return;
  const next = seededRun(seed * 17 + 5);
  const rolled = outCubic(within(t, 0, 0.5));
  const drifts = Math.max(0, since) * reach * 0.5;
  const gap = reach * 0.6 * parted + drifts;
  if (parted > 0.02) {
    drawn.motes.push(haze(middle, (gap + reach * 0.3) * 2.2, tones.gold, 0.6 * shown * parted, 0));
    drawn.motes.push(glow(middle, (gap + reach * 0.3) * 2.6, tones.hot, 0.9 * shown * parted, 0));
  }
  for (let index = 0; index < LOBES; index++) {
    const turn = ((index + 0.5) / LOBES) * Math.PI * 2;
    const out = (gap + reach * 0.6) * (1 + 0.9 * (1 - rolled));
    drawn.motes.push(
      smokePuff(
        { x: middle.x + Math.cos(turn) * out, y: middle.y + Math.sin(turn) * out, z: middle.z - reach * 0.1 },
        reach * 1.3,
        CLOUD[0],
        0.85 * shown,
        -1
      )
    );
  }
  for (let index = 0; index < LOBES * 2; index++) {
    const inner = index < LOBES;
    const turn = ((index % LOBES) / LOBES + (inner ? 0 : 0.5 / LOBES)) * Math.PI * 2 + next() * 0.3;
    const size = reach * (inner ? 0.72 : 1) * (0.85 + next() * 0.35);
    const out = (gap + reach * (inner ? 0.32 : 0.95) + next() * reach * 0.15) * (1 + 0.9 * (1 - rolled));
    const bob = Math.sin(t * 0.9 + index * 1.7) * reach * 0.03;
    const way = { x: Math.cos(turn), y: Math.sin(turn) };
    const at = { x: middle.x + way.x * out, y: middle.y + way.y * out, z: middle.z + bob - (inner ? 0 : size * 0.1) };
    drawn.motes.push(
      smokePuff({ ...at, z: at.z - size * 0.16 }, size * 1.15, CLOUD[0], 0.95 * shown, 0),
      smokePuff(at, size * 0.95, CLOUD[1], 0.92 * shown, 1),
      smokePuff({ ...at, z: at.z + size * 0.2 }, size * 0.6, CLOUD[2], 0.7 * shown, 2)
    );
  }
  if (parted > 0.02) {
    const rim = circlePoints(middle, gap + reach * 0.16, 40);
    const lit = shown * Math.min(1, parted * 3);
    drawn.ribbons.push(
      {
        points: rim,
        widths: reach * 0.34,
        color: tones.amber,
        core: tones.gold,
        alpha: 0.85 * lit,
        blend: 'color',
        soft: 0.7,
        torn: 0.5,
        flowed: t * 2,
      },
      {
        points: rim,
        widths: reach * 0.16,
        color: tones.hot,
        alpha: lit,
        blend: 'light',
        soft: 0.6,
        torn: 0.4,
        flowed: t * 3,
      }
    );
  }
  const flicker = Math.max(0, Math.sin(t * 13 + seed) * Math.sin(t * 5.3)) * (1 - parted);
  if (flicker > 0.2) drawn.motes.push(glow(middle, reach * 1.2, tones.gold, 0.5 * flicker * shown, 5));
  if (parted <= 0.02 || parted >= 1) return;
  for (let index = 0; index < SHREDS; index++) {
    const turn = (index / SHREDS) * Math.PI * 2 + next() * 0.5;
    const way = { x: Math.cos(turn), y: Math.sin(turn), z: -0.15 };
    const root = { x: middle.x + way.x * gap, y: middle.y + way.y * gap, z: middle.z };
    const tearing = Math.sin(Math.PI * parted);
    drawn.motes.push(
      flowingMote('wisp', root, way, reach * 0.2, reach * (0.3 + 0.5 * tearing), t * 2 + index, {
        color: CLOUD[1],
        core: mixColor(CLOUD[1], tones.amber, 0.55),
        alpha: 0.85 * shown * tearing,
        forward: 3,
        variant: index * 1.3,
      })
    );
  }
}

/** Shafts of light slanting down through the gap in the clouds onto the place, each a band of gold under a band of light, wavering. */
function drawShafts(
  drawn: Staged,
  seed: number,
  floor: Point,
  sky: number,
  reach: number,
  cell: number,
  tones: HolyTones,
  t: number,
  shining: number
): void {
  if (shining <= 0.01) return;
  const next = seededRun(seed * 29 + 13);
  for (let index = 0; index < 7; index++) {
    const turn = next() * Math.PI * 2;
    const out = reach * (0.15 + 0.7 * next());
    const from = { x: floor.x + Math.cos(turn) * out * 0.3, y: floor.y + Math.sin(turn) * out * 0.3, z: sky };
    const onto = { x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: floor.z };
    const points = [from, { x: (from.x + onto.x) / 2, y: (from.y + onto.y) / 2, z: (from.z + onto.z) / 2 }, onto];
    const waver = 0.65 + 0.35 * Math.sin(t * 2.3 + index * 1.9);
    const widths = [cell * 0.12, cell * 0.3, cell * 0.5];
    drawn.ribbons.push(
      {
        points,
        widths,
        color: tones.amber,
        alpha: 0.3 * shining * waver,
        alphas: [0.4, 1, 0.5],
        blend: 'color',
        soft: 1,
      },
      {
        points,
        widths,
        color: tones.hot,
        alpha: 0.45 * shining * waver,
        alphas: [0.4, 1, 0.5],
        blend: 'light',
        soft: 1,
      }
    );
  }
}
