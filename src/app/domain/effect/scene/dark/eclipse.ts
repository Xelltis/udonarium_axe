import { darkStrikesAt } from '@axe/domain/effect/dark-looks';
import { NEEDLES_FROM } from '@axe/domain/effect/dark-reaction';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { drawBlackSmoke, drawInkMotes } from '@axe/domain/effect/scene/dark/dark-drift';
import {
  type BlackFlame,
  type DarkTones,
  darkTonesOf,
  drawDarkBeat,
  drawDim,
  drawShards,
  layBlackFlames,
  layDarkRing,
  layDarkScorch,
} from '@axe/domain/effect/scene/dark/dark-parts';
import { type BlackSun, drawBlackSun } from '@axe/domain/effect/scene/dark/eclipse-sun';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { floorMark, glow, haze, type Point } from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';

/*
 * An eclipse. A pale sun kindles over the table and a black disc slides across it; as the last of it
 * is covered a bead of light flashes on the rim and the light goes out of the whole table. The disc
 * hangs there, black, a thin corona burning round it. Then needles of pale light fall from its rim
 * onto everything it is cast on, faster and faster, each pricking a glint out of what it strikes;
 * and the corona flares: a ring of light is thrown wide off the disc, one last volley comes down,
 * and everything struck goes up in black fire edged in violet, in a black beat. The fire burns down,
 * the disc thins away and the light comes back, over scorches, smoke and embers.
 *
 * It hangs once, over the first target, however many it is cast on.
 */

const LINGER_S = SCENE_LINGER_S.darkorb ?? 1.6;
/** When the black disc has covered the sun, in seconds, and at the most as a share of the time before the corona flares. */
const COVERED_S = 0.9;
const COVERED_SHARE = 0.4;
/** How long a needle takes to fall and how long its line stays, in seconds. */
const FALLS_S = 0.09;
const STAYS_S = 0.14;
/** How long the black fire burns on what is struck, in seconds. */
const BURNS_S = 1.3;

/** Where the black sun of a stage hangs and how large it is: over the first target of the cast, by that target's size. */
function sunOf(stage: Stage): BlackSun {
  const lead = stage.targets[0] ?? { ...stage, widthPx: stage.cell };
  const unit = lead.widthPx * stage.preset.sizeScale;
  const tall = lead.index === stage.index ? stage.tall : lead.widthPx;
  return {
    at: { x: lead.x, y: lead.y - unit * 0.6, z: lead.groundZ + tall + unit * 3.1 },
    radius: unit * 1.15,
  };
}

/** One needle of light fallen from the rim of the disc onto a point: its line, its sheath of violet, and the glint it pricks. */
function drawNeedle(
  drawn: Staged,
  from: Point,
  onto: Point,
  floorZ: number,
  cell: number,
  tones: DarkTones,
  since: number,
  thick: number
): void {
  if (since < 0 || since >= FALLS_S + STAYS_S) return;
  const fallen = Math.min(1, since / FALLS_S);
  const left = since < FALLS_S ? 1 : 1 - (since - FALLS_S) / STAYS_S;
  const far = Math.hypot(onto.x - from.x, onto.y - from.y, onto.z - from.z) || 1;
  const way = { x: (onto.x - from.x) / far, y: (onto.y - from.y) / far, z: (onto.z - from.z) / far };
  const head = { x: from.x + way.x * far * fallen, y: from.y + way.y * far * fallen, z: from.z + way.z * far * fallen };
  const velocity = { x: way.x * 1000, y: way.y * 1000, z: way.z * 1000 };
  const trail = (far * fallen) / 1000;
  const forward = cell * 0.5;
  const line = (size: number, color: string, alpha: number, blend: 'light' | 'color', nearer: number) =>
    drawn.motes.push({
      ...head,
      size,
      color,
      alpha,
      blend,
      shape: 'spark',
      velocity,
      trail,
      forward: forward + nearer,
    });
  line(cell * 0.3 * thick * left, tones.edge, 0.85 * left, 'color', 0);
  line(cell * 0.13 * thick * left, '#ffffff', left, 'color', 1);
  line(cell * 0.45 * thick, tones.glow, 0.8 * left, 'light', 0);
  if (since < FALLS_S) return;
  const pricked = (since - FALLS_S) / STAYS_S;
  drawn.motes.push({
    ...glow(onto, cell * 0.7 * thick, '#ffffff', 1 - pricked, forward + 2),
    shape: 'star',
    spin: far,
  });
  drawn.motes.push(haze(onto, cell * 0.3 * thick, tones.edge, 0.8 * (1 - pricked), forward + 1));
  const under = { x: onto.x, y: onto.y, z: floorZ };
  drawn.floor.push(
    floorMark('ring', under, cell * (0.12 + 0.3 * pricked) * thick, 0.25, tones.pale, 1 - pricked, 'light', 0)
  );
}

/** The needles that fall on one target: more and more of them until the corona flares, and one last heavy volley as it does. */
function drawNeedles(drawn: Staged, stage: Stage, sun: BlackSun, tones: DarkTones, from: number, flares: number): void {
  const { cell } = stage;
  const t = stage.seconds;
  const next = seededRun(stage.seed * 47 + 23);
  const count = Math.max(6, 16 - stage.targets.length);
  for (let needle = 0; needle < count + 3; needle++) {
    const last = needle >= count;
    const share = Math.pow((needle + next() * 0.6) / count, 0.7);
    const fires = last
      ? flares - FALLS_S + (needle - count) * 0.012
      : from + (flares - FALLS_S - 0.1 - from) * Math.min(1, share);
    const turn = next() * Math.PI * 2;
    const out = cell * next() * 0.42;
    const high = next() < 0.3 ? 0 : stage.tall * (0.15 + next() * 0.7);
    const rim = next() * Math.PI * 2;
    const start = {
      x: sun.at.x + Math.cos(rim) * sun.radius * 0.85,
      y: sun.at.y + Math.sin(rim) * sun.radius * 0.3,
      z: sun.at.z - sun.radius * 0.75,
    };
    const onto = {
      x: stage.x + Math.cos(turn) * out * (last ? 0.3 : 1),
      y: stage.y + Math.sin(turn) * out * (last ? 0.3 : 1),
      z: stage.z + high,
    };
    drawNeedle(drawn, start, onto, stage.groundZ, cell, tones, t - fires, last ? 2.2 : 1);
  }
}

/** The black fire that takes what is struck: tongues standing up all about it, tall at once and burning down. */
function fireOn(stage: Stage, floor: Point, since: number): BlackFlame[] {
  const { cell } = stage;
  const next = seededRun(stage.seed * 31 + 3);
  const dying = 1 - within(since, BURNS_S * 0.45, BURNS_S);
  const up = outCubic(within(since, 0, 0.14));
  const flames: BlackFlame[] = [];
  const tongues = stage.targets.length > 4 ? 8 : 12;
  for (let index = 0; index < tongues; index++) {
    const turn = (index / tongues) * Math.PI * 2 + next() * 0.5;
    const out = cell * (0.1 + next() * 0.5);
    const tall = Math.max(stage.tall, cell) * (1.5 + next() * 1.3);
    flames.push({
      root: { x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: floor.z },
      heading: { x: Math.cos(turn) * 0.16 + Math.sin(since * 5 + index) * 0.1, y: Math.sin(turn) * 0.16, z: 1 },
      wide: cell * (0.4 + next() * 0.25) * (0.45 + 0.55 * dying),
      long: tall * up * (0.25 + 0.75 * dying) * (0.86 + 0.14 * Math.sin(since * 17 + index * 2.3)),
      flowed: since * 3.6 + index,
      variant: index,
      alpha: Math.min(1, dying * 3),
    });
  }
  return flames;
}

/** An eclipse: see the header. */
export function drawEclipse(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const ends = duration + LINGER_S;
  if (t >= ends) return drawn;
  const flares = stage.blowsAt[0] ?? darkStrikesAt('darkorb', 3, duration)?.[0] ?? duration * 0.6;
  const since = t - flares;
  const tones = darkTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
  const lead = (stage.targets[0] ?? stage).index === stage.index;
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const chest = { x: stage.x, y: stage.y, z: stage.z + stage.tall * 0.5 };
  const forward = cell * 0.4;
  const sun = sunOf(stage);
  const covered = Math.min(COVERED_S, flares * COVERED_SHARE);
  const needlesFrom = flares * NEEDLES_FROM;
  const dark = Math.min(
    within(t, covered * 0.25, covered),
    1 - within(t, flares + 0.5, Math.max(flares + 0.9, duration))
  );

  if (lead) {
    const reach = Math.max(stage.areaPx, cell * 3);
    drawn.floor.push(floorMark('disc', floor, reach * 1.5, 1, '#000000', 0.9 * dark, 'color', 0));
    drawn.floor.push(floorMark('disc', floor, reach * 0.9, 1, '#000000', 0.3 * dark, 'color', 0));
    drawDim(drawn, { ...floor, z: floor.z + cell }, reach * 1.4, 0.35 * dark, cell * 0.2);
    drawBlackSun(drawn, sun, tones, { t, covered, flares, ends: Math.max(flares + 1, duration), seed: stage.seed });
    if (since >= 0 && since < 0.5) {
      drawn.floor.push(floorMark('disc', floor, reach * 1.3, 1, tones.edge, 0.3 * (1 - since / 0.5), 'light', 0));
      drawn.lights.push({ ...chest, color: tones.edge, strength: 1.8 * (1 - since / 0.5), reachPx: reach * 1.4 });
    }
  }

  drawDim(drawn, chest, Math.max(stage.tall, cell) * 2.4, 0.32 * dark, forward);
  drawNeedles(drawn, stage, sun, tones, needlesFrom, flares);
  if (t >= needlesFrom && since < 0) {
    const pricked = within(t, needlesFrom, flares);
    drawn.floor.push(floorMark('ring', floor, cell * (1.3 - 0.4 * pricked), 0.06, tones.edge, 0.8, 'color', 0));
    drawn.floor.push(floorMark('ring', floor, cell * (1.3 - 0.4 * pricked), 0.03, tones.pale, 0.9, 'light', 0));
    drawn.motes.push(glow(chest, cell * 1.6, tones.glow, 0.35 * pricked, forward));
  }
  if (since < 0) return drawn;

  drawDarkBeat(drawn, chest, floor, cell * 1.1, tones, since, 0.11);
  if (since < BURNS_S) layBlackFlames(drawn, fireOn(stage, floor, since), tones, forward);
  if (since < 0.4) {
    const left = 1 - since / 0.4;
    drawn.motes.push(glow(chest, cell * 3.4, tones.glow, 0.8 * left, forward));
    drawn.motes.push(haze(chest, cell * 2.2, tones.edge, 0.55 * left, forward));
  }
  layDarkRing(drawn, floor, cell * 0.4, cell * 3.8, cell * 0.34, tones, since, 0.55);
  drawShards(drawn, stage.seed, chest, floor.z, stage.targets.length > 4 ? 14 : 26, cell, since, tones, forward);
  layDarkScorch(drawn, floor, cell * 1.25, tones, since, ends - flares, stage.seed);
  drawBlackSmoke(
    drawn,
    stage.seed,
    floor,
    cell,
    since,
    tones,
    { count: 12, out: [0, cell * 0.8], born: [0.5, Math.max(0.7, ends - flares - 1.5)], tall: cell * 2.2 },
    forward
  );
  drawInkMotes(
    drawn,
    stage.seed,
    floor,
    cell,
    since,
    tones,
    { count: 22, out: [0, cell * 1.2], born: [0.2, Math.max(0.4, ends - flares - 1.5)], rise: cell * 1.5 },
    forward
  );
  return drawn;
}
