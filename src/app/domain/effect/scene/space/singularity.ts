import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { moteAt, type ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { STONE } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  ball,
  floorMark,
  glow,
  haze,
  keptFor,
  type Point,
  stageKey,
  starBurst,
  throwerFor,
} from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';
import {
  drawBoldDisc,
  drawBoldHole,
  drawLingering,
  drawShockBody,
  drawStreams,
} from '@axe/domain/effect/scene/space/singularity-body';
import {
  drawBentLight,
  drawDragged,
  drawJets,
  drawScarSmoke,
  type HoleLook,
  layScorchedArea,
  laySpiral,
} from '@axe/domain/effect/scene/space/singularity-parts';
import { type BoldTones, boldTonesOf, layBoldFloorRing } from '@axe/domain/effect/scene/space/space-bold';
import { scatterOf } from '@axe/domain/effect/scene/space/space-parts';
import { spaceBeatAt } from '@axe/domain/effect/space-looks';

/*
 * A singularity. A body of black blinks open high over the middle of the area, rimmed in burning
 * colour, and the light of the table starts to run towards it. Its disc spins up round it in heavy
 * whirling bands, white at its heart and dark at its edge, jets break from its poles, arcs of bent light
 * turn about it, and its pull lays a burning spiral over the floor: heavy streams of dust and earth are
 * dragged in off the whole area along it and up into the disc, grass, leaves and stones with them, and
 * every piece it takes in is dragged towards it, the one under it lifted. Then it falls in: the disc
 * shrinks onto it, faster, everything streaks in, and for an instant there is nothing. A white beat:
 * rays thrown every way, the table lit, a heavy ring of its colour racing out at its height and a surge
 * of dust rolling out over the floor, and everything thrown back out, pieces, stones and dust. Then the
 * air stays bent where it was, a dark lens wavering there, while what it threw up rains back down, and
 * the spiral it scoured smoulders, its glow cooling and smoke curling up off it, under glints drifting
 * down.
 *
 * It opens once, over the first target, however many it takes in; each of the rest is dragged at and
 * thrown out where it stands.
 */

const LINGER_S = SCENE_LINGER_S.gravity ?? 1.5;
/** How long before it falls in the ring starts to shrink, and how long there is nothing before the beat, in seconds. */
const SHRINKS_S = 0.2;
const NOTHING_S = 0.045;
const DUST = '#7a6a5c';

const thrownByStage = new Map<string, readonly ThrownMote[]>();

/** Where the hole hangs: high over the first target of the cast, clear of its head. */
function holeOf(stage: Stage): Point {
  const lead = stage.targets[0] ?? { ...stage, widthPx: stage.cell };
  const tall = lead.index === stage.index ? stage.tall : lead.widthPx;
  return { x: lead.x, y: lead.y, z: lead.groundZ + tall + stage.cell * 2.3 };
}

/** The hole as it is at a moment before it falls in. */
function holeAt(stage: Stage, t: number, fallsAt: number, heading: number): HoleLook {
  const opened = outCubic(within(t, 0.06, 0.45));
  const spun = outCubic(within(t, 0.32, Math.min(1.2, fallsAt * 0.8)));
  const fallen = within(t, fallsAt - SHRINKS_S, fallsAt - NOTHING_S);
  const throb = 1 + 0.06 * Math.sin(t * 13) * spun;
  return {
    radius: stage.cell * (0.36 + 0.48 * spun) * opened * throb * (1 - fallen * fallen),
    spun,
    jets: within(t, Math.min(0.7, fallsAt * 0.45), Math.min(1.05, fallsAt * 0.7)),
    fallen,
    t,
    heading,
  };
}

/** The beat as it falls in: white light at the point, rays every way, the table lit and the air about it lit in its colour. */
function drawBeat(
  drawn: Staged,
  hole: Point,
  floor: Point,
  reach: number,
  tones: BoldTones,
  cell: number,
  since: number,
  seed: number
): void {
  const forward = cell * 0.6;
  if (since < 0.12) {
    const left = 1 - since / 0.12;
    drawn.floor.push(floorMark('disc', floor, reach * 1.2, 1, tones.core, 0.3 * left, 'light', 0));
    drawn.motes.push({ ...glow(hole, cell * 1.2, '#ffffff', left, forward + 5), shape: 'flare', trail: 16, spin: 0 });
    drawn.motes.push({
      ...glow(hole, cell * 0.9, '#ffffff', left, forward + 5),
      shape: 'flare',
      trail: 11,
      spin: Math.PI / 2,
    });
  }
  if (since < 0.45) {
    const left = 1 - since / 0.45;
    drawn.motes.push(glow(hole, cell * (3.4 + 2.4 * (1 - left)), tones.hot, 0.7 * left, forward));
    drawn.motes.push(haze(hole, cell * (4 + 2.4 * (1 - left)), tones.body, 0.45 * left, forward + 1));
    drawn.motes.push(ball(hole, cell * 2.4 * left * left, '#ffffff', 1, forward + 6, 0));
    drawn.motes.push(...starBurst(hole, cell * 4.4, tones.hot, since / 0.45, forward + 3, 12, seed % 11));
    drawn.lights.push({ ...hole, color: tones.hot, strength: 2.4 * left, reachPx: reach * 2 });
    drawn.floor.push(floorMark('disc', floor, reach * 1.3, 1, tones.hot, 0.3 * left, 'light', 0));
  }
}

/** The rings racing out over the floor as it falls in: heavy bands of dust over a rim of its colour, thinning as they go. */
function layShock(drawn: Staged, floor: Point, reach: number, tones: BoldTones, cell: number, since: number): void {
  for (const [delay, lasts, thick] of [
    [0, 0.8, 0.7],
    [0.16, 1.05, 0.4],
  ] as const) {
    const share = (since - delay) / lasts;
    if (share < 0 || share >= 1) continue;
    const left = 1 - share;
    const radius = cell * 0.5 + (reach * 1.45 - cell * 0.5) * outCubic(share);
    const width = (cell * thick * (0.3 + 0.7 * left)) / radius;
    drawn.floor.push(floorMark('ring', floor, radius, Math.min(1, width * 2.4), tones.hot, 0.45 * left, 'light', 0));
    drawn.floor.push(floorMark('ring', floor, radius, Math.min(1, width * 1.6), tones.rim, 0.9 * left, 'color', 0));
    drawn.floor.push(floorMark('ring', floor, radius, width, DUST, left, 'color', 0));
    drawn.floor.push(floorMark('ring', floor, radius, width * 0.3, tones.hot, left, 'color', 0));
  }
}

/** Glints drifting down over the area once it has gone. */
function drawGlints(
  drawn: Staged,
  hole: Point,
  floor: Point,
  reach: number,
  tones: BoldTones,
  cell: number,
  since: number,
  forward: number
): void {
  for (let glint = 0; glint < 34; glint++) {
    const born = 0.3 + 2 * scatterOf(glint, 13);
    const age = (since - born) / 1.6;
    if (age < 0 || age >= 1) continue;
    const turn = scatterOf(glint, 17) * Math.PI * 2;
    const out = reach * 0.9 * Math.sqrt(scatterOf(glint, 19));
    const at = {
      x: floor.x + Math.cos(turn + age) * out,
      y: floor.y + Math.sin(turn + age) * out,
      z: floor.z + (hole.z - floor.z) * (1 - age) * (0.5 + 0.5 * scatterOf(glint, 23)),
    };
    drawn.motes.push({
      ...glow(
        at,
        cell * (0.16 + 0.05 * Math.sin(since * 11 + glint)),
        glint % 3 === 0 ? '#ffffff' : tones.hot,
        1 - age,
        forward
      ),
      shape: 'star',
      spin: glint + since,
    });
  }
}

/** What each piece it takes in other than the first bears where it stands: dust dragged off it towards the hole, and thrown back as it falls in. */
function drawCaught(stage: Stage, tones: BoldTones, fallsAt: number): Staged {
  const drawn = nothingStaged();
  const { cell } = stage;
  const t = stage.seconds;
  const lead = stage.targets[0];
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const centre = lead ? { x: lead.x, y: lead.y } : floor;
  const far = Math.hypot(centre.x - floor.x, centre.y - floor.y) || 1;
  const way = { x: (centre.x - floor.x) / far, y: (centre.y - floor.y) / far };
  const forward = cell * 0.5;
  const since = t - fallsAt;
  if (since < 0) {
    const pull = within(t, 0.3, fallsAt);
    for (let fleck = 0; fleck < 10; fleck++) {
      const p = (t * (0.9 + 0.6 * scatterOf(fleck, 3)) + scatterOf(fleck, 5)) % 1;
      const side = (scatterOf(fleck, 7) - 0.5) * cell * 1.6;
      const at = {
        x: floor.x - way.y * side + way.x * far * 0.5 * p,
        y: floor.y + way.x * side + way.y * far * 0.5 * p,
        z: floor.z + cell * (0.05 + 0.6 * p * p),
      };
      const velocity = { x: way.x * cell * 8, y: way.y * cell * 8, z: cell * 2 * p };
      const fade = Math.min(1, p * 5, (1 - p) * 4) * pull;
      const streak = { ...at, blend: 'color' as const, shape: 'spark' as const, velocity, trail: 0.07, forward };
      drawn.motes.push({ ...streak, size: cell * 0.3, color: tones.rim, alpha: 0.9 * fade });
      drawn.motes.push({ ...streak, size: cell * 0.18, color: fleck % 2 ? DUST : tones.body, alpha: fade });
    }
    const closing = (t * 1.5) % 1;
    layBoldFloorRing(drawn, floor, cell * (0.6 + 1.6 * (1 - closing)), 0.1, tones, 0.9 * pull * closing);
    drawn.floor.push(floorMark('disc', floor, cell * 1.1, 1, tones.rim, 0.45 * pull, 'color', 0));
    return drawn;
  }
  if (since < 0.5) {
    const left = 1 - since / 0.5;
    layBoldFloorRing(drawn, floor, cell * (0.5 + 2.2 * outCubic(since / 0.5)), 0.14 * left + 0.03, tones, left);
  }
  for (let cloud = 0; cloud < 6; cloud++) {
    const age = since / 1.2;
    if (age >= 1) break;
    const turn = Math.atan2(-way.y, -way.x) + (cloud - 2.5) * 0.35;
    const out = cell * (0.4 + 2.4 * outCubic(Math.min(1, age * 2)));
    drawn.motes.push({
      x: floor.x + Math.cos(turn) * out,
      y: floor.y + Math.sin(turn) * out,
      z: floor.z + cell * (0.3 + 0.3 * age),
      size: cell * (0.8 + 0.6 * age),
      color: DUST,
      core: '#b9a585',
      alpha: 0.8 * (1 - age),
      blend: 'color',
      shape: 'billow',
      velocity: { x: Math.cos(turn) * 100, y: Math.sin(turn) * 100, z: 20 },
      trail: (cell * 0.35) / 100,
      spin: age * 2 + cloud,
      variant: cloud,
      forward,
    });
  }
  return drawn;
}

/** The stones it throws as it falls in: some blasted out from it, and some thrown high to rain back down over the area. */
function thrownOf(stage: Stage, hole: Point, fallsAt: number, ends: number): readonly ThrownMote[] {
  const { cell } = stage;
  return keptFor(thrownByStage, stageKey(stage, ends), () => {
    const th = throwerFor(stage, ends);
    const blasted = Array.from({ length: th.count(24) }, () => {
      const way = th.outward();
      const fast = th.range(3, 8) * cell;
      const from = th.range(0.2, 1.2) * cell;
      return th.mote({
        x: hole.x + way.cos * from,
        y: hole.y + way.sin * from,
        z: hole.z + th.range(-0.4, 0.3) * cell,
        vx: way.cos * fast,
        vy: way.sin * fast,
        vz: th.range(-1, 2.5) * cell,
        bornAt: fallsAt,
        life: th.lifeOf(fallsAt, 2.2, 3.2),
        gravity: th.fall,
        drag: 0.5,
        bounce: 0.3,
      });
    });
    const raining = Array.from({ length: th.count(16) }, () => {
      const way = th.outward();
      const born = fallsAt + th.range(0.25, 1.1);
      const out = th.range(0.3, 2.6) * cell;
      return th.mote({
        x: hole.x + way.cos * out,
        y: hole.y + way.sin * out,
        z: hole.z + th.range(0.2, 1.2) * cell,
        vx: way.cos * th.range(0.2, 1) * cell,
        vy: way.sin * th.range(0.2, 1) * cell,
        vz: th.range(-1, 0.5) * cell,
        bornAt: born,
        life: th.lifeOf(born, 2, 2.6),
        gravity: th.fall,
        drag: 0.4,
        bounce: 0.25,
      });
    });
    return [...blasted, ...raining];
  });
}

/** A singularity: see the header. */
export function drawSingularity(stage: Stage): Staged {
  const { cell, duration } = stage;
  const t = stage.seconds;
  const ends = duration + LINGER_S;
  if (t >= ends) return nothingStaged();
  const fallsAt = stage.blowsAt[0] ?? spaceBeatAt('singularity', duration);
  const tones = boldTonesOf(stage.preset.colorSecondary, stage.preset.colorPrimary);
  const lead = stage.targets[0];
  if (lead && lead.index !== stage.index) return drawCaught(stage, tones, fallsAt);
  const drawn = nothingStaged();
  const since = t - fallsAt;
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const hole = holeOf(stage);
  const reach = Math.max(stage.areaPx * 1.1, cell * 1.8);
  const forward = cell * 0.6;
  const heading = (stage.seed % 9) * 0.7;

  if (since < 0) {
    const look: HoleLook = holeAt(stage, t, fallsAt, heading);
    const nothing = t >= fallsAt - NOTHING_S;
    const dark = within(t, 0.1, 0.9);
    drawn.floor.push(floorMark('disc', floor, reach * 1.45, 1, '#000000', 0.45 * dark, 'color', 0));
    drawn.floor.push(floorMark('disc', floor, reach * 0.95, 1, tones.rim, 0.45 * dark, 'color', 0));
    drawn.floor.push(floorMark('disc', floor, reach * 0.45, 1, tones.ink, 0.5 * dark, 'color', 0));
    drawn.motes.push(haze(hole, cell * 6, '#000000', 0.3 * dark, forward * 0.3));
    if (nothing) return drawn;
    const pull = within(t, 0.25, 1) * (1 + look.fallen);
    laySpiral(drawn, floor, reach, tones, -t * (0.9 + 2 * look.fallen), look.spun, look.spun * (1 - look.fallen), cell);
    for (let ring = 0; ring < 2; ring++) {
      const closing = (t * (1 + 2 * look.fallen) + ring * 0.5) % 1;
      const radius = reach * (0.2 + 1.1 * (1 - closing));
      const alpha = look.spun * Math.min(1, closing * 3) * (1 - closing);
      layBoldFloorRing(drawn, floor, radius, 0.05, tones, alpha);
    }
    drawStreams(drawn, floor, hole, reach, look.radius, tones, cell, t, Math.min(1, pull) * (1 - look.fallen * 0.5));
    drawDragged(drawn, floor, hole, reach, tones, cell, t, Math.min(1, pull), forward);
    drawBoldDisc(drawn, hole, look, tones, cell, forward);
    drawBoldHole(drawn, hole, look, tones, cell, forward);
    drawBentLight(drawn, hole, look, tones, cell, forward);
    drawJets(drawn, hole, look, tones, cell, floor.z);
    drawn.lights.push({ ...hole, color: tones.hot, strength: 0.5 + 1.1 * look.spun, reachPx: reach * 1.2 });
    return drawn;
  }

  const lasts = ends - fallsAt;
  const scoured = 1 - within(since, lasts - 1.4, lasts);
  layScorchedArea(drawn, floor, reach, tones, cell, since, lasts, stage.seed);
  laySpiral(drawn, floor, reach, tones, -fallsAt * 2.9, scoured, Math.max(0, 1 - since / 2.6) ** 1.5, cell);
  drawn.floor.push(floorMark('cracks', floor, cell * 2, 0.6, tones.ink, 0.9 * scoured, 'color', (stage.seed % 89) + 1));
  layShock(drawn, floor, reach, tones, cell, since);
  drawShockBody(drawn, hole, floor, reach, tones, cell, since, forward);
  drawBeat(drawn, hole, floor, reach, tones, cell, since, stage.seed);
  drawLingering(drawn, hole, tones, cell, t, within(since, 0.2, 0.5) * (1 - within(since, 1.2, 3)), forward);
  drawScarSmoke(drawn, floor, reach, tones, cell, since, lasts, forward);
  for (const [index, mote] of thrownOf(stage, hole, fallsAt, ends).entries()) {
    const at = moteAt(mote, t);
    if (!at) continue;
    drawn.motes.push({
      ...at,
      size: cell * (0.16 + 0.12 * scatterOf(index, 29)),
      color: STONE,
      alpha: Math.min(1, (1 - at.age) * 3),
      blend: 'color',
      shape: 'chunk',
      spin: at.landed ? index : t * 9 + index,
      variant: index,
      forward,
    });
  }
  drawGlints(drawn, hole, floor, reach, tones, cell, since, forward);
  return drawn;
}
