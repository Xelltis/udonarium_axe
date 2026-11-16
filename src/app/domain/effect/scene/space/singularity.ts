import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { moteAt, type ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { STONE } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  ball,
  floorMark,
  glow,
  haze,
  keptFor,
  type Point,
  smokePuff,
  stageKey,
  starBurst,
  throwerFor,
} from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';
import {
  drawBentLight,
  drawDisc,
  drawDragged,
  drawHole,
  drawJets,
  type HoleLook,
  laySpiral,
} from '@axe/domain/effect/scene/space/singularity-parts';
import {
  layFloorRing,
  layWound,
  scatterOf,
  type SpaceTones,
  spaceTonesOf,
  tippedCircle,
} from '@axe/domain/effect/scene/space/space-parts';
import { spaceBeatAt } from '@axe/domain/effect/space-looks';

/*
 * A singularity. A point of black blinks open high over the middle of the area, a pale rim of bent
 * light about it, and the light of the table starts to run towards it. Its ring spins up round it in
 * whirling bands, jets break from its poles, arcs of bent light turn about it, and its pull lays a
 * spiral over the floor: dust, grass, leaves and stones are dragged in along it and up into the ring,
 * and every piece it takes in is dragged towards it, the one under it lifted. Then it falls in: the
 * ring shrinks onto it, faster, everything streaks in, and for an instant there is nothing. A white
 * beat: rays thrown every way, the table lit, a shell of light and a ring over the floor racing out,
 * and everything thrown back out, pieces, stones and dust. The floor is left scoured in a spiral,
 * stones lying about it and dust settling, under glints drifting down.
 *
 * It opens once, over the first target, however many it takes in; each of the rest is dragged at and
 * thrown out where it stands.
 */

const LINGER_S = SCENE_LINGER_S.gravity ?? 1.5;
/** How long before it falls in the ring starts to shrink, and how long there is nothing before the beat, in seconds. */
const SHRINKS_S = 0.2;
const NOTHING_S = 0.045;
const DUST = '#8a7b6b';
/** How much colour the bodies of gravity are taken to at the least, as a deep colour and a pale one run through greys between them. */
const VIVID = 0.62;

const thrownByStage = new Map<string, readonly ThrownMote[]>();

/** Where the hole hangs: high over the first target of the cast, clear of its head. */
function holeOf(stage: Stage): Point {
  const lead = stage.targets[0] ?? { ...stage, widthPx: stage.cell };
  const tall = lead.index === stage.index ? stage.tall : lead.widthPx;
  return { x: lead.x, y: lead.y, z: lead.groundZ + tall + stage.cell * 1.7 };
}

/** The hole as it is at a moment before it falls in. */
function holeAt(stage: Stage, t: number, fallsAt: number, heading: number): HoleLook {
  const opened = outCubic(within(t, 0.06, 0.45));
  const spun = outCubic(within(t, 0.32, Math.min(1.2, fallsAt * 0.8)));
  const fallen = within(t, fallsAt - SHRINKS_S, fallsAt - NOTHING_S);
  const throb = 1 + 0.06 * Math.sin(t * 13) * spun;
  return {
    radius: stage.cell * (0.2 + 0.26 * spun) * opened * throb * (1 - fallen * fallen),
    spun,
    jets: within(t, Math.min(0.7, fallsAt * 0.45), Math.min(1.05, fallsAt * 0.7)),
    fallen,
    t,
    heading,
  };
}

/** The beat as it falls in: white light at the point, rays every way, the table lit and a shell of light racing out. */
function drawBeat(
  drawn: Staged,
  hole: Point,
  floor: Point,
  reach: number,
  tones: SpaceTones,
  cell: number,
  since: number,
  seed: number
): void {
  const forward = cell * 0.6;
  if (since < 0.12) {
    const left = 1 - since / 0.12;
    drawn.floor.push(floorMark('disc', floor, reach * 1.2, 1, tones.pale, 0.28 * left, 'light', 0));
    drawn.motes.push({ ...glow(hole, cell * 0.9, '#ffffff', left, forward + 5), shape: 'flare', trail: 14, spin: 0 });
    drawn.motes.push({
      ...glow(hole, cell * 0.7, '#ffffff', left, forward + 5),
      shape: 'flare',
      trail: 10,
      spin: Math.PI / 2,
    });
  }
  if (since < 0.45) {
    const left = 1 - since / 0.45;
    drawn.motes.push(glow(hole, cell * (3 + 2 * (1 - left)), tones.glow, 0.75 * left, forward));
    drawn.motes.push(haze(hole, cell * (3.6 + 2 * (1 - left)), tones.edge, 0.4 * left, forward + 1));
    drawn.motes.push(ball(hole, cell * 1.7 * left * left, '#ffffff', 1, forward + 6, 0));
    drawn.motes.push(...starBurst(hole, cell * 3.2, tones.glow, since / 0.45, forward + 3, 12, seed % 11));
    drawn.lights.push({ ...hole, color: tones.glow, strength: 2.4 * left, reachPx: reach * 2 });
    drawn.floor.push(floorMark('disc', floor, reach * 1.3, 1, tones.glow, 0.3 * left, 'light', 0));
  }
  for (const delay of [0, 0.12]) {
    const share = (since - delay) / 0.45;
    if (share < 0 || share >= 1) continue;
    const left = 1 - share;
    const ring = tippedCircle(hole, cell * (0.4 + (delay > 0 ? 2.6 : 4.2) * outCubic(share)), 48, 0, 0);
    layWound(drawn, ring, hole, {
      sheath: tones.edge,
      light: tones.glow,
      heart: '#ffffff',
      wide: cell * (0.12 + 0.3 * left),
      alpha: left,
      lit: left,
      nearShare: 1,
    });
  }
}

/** The rings racing out over the floor as it falls in, the dust thrown out behind them, and the floor's light fading. */
function layShock(drawn: Staged, floor: Point, reach: number, tones: SpaceTones, cell: number, since: number): void {
  for (const [delay, lasts, thick] of [
    [0, 0.75, 0.42],
    [0.16, 1, 0.22],
  ] as const) {
    const share = (since - delay) / lasts;
    if (share < 0 || share >= 1) continue;
    const left = 1 - share;
    const radius = cell * 0.5 + (reach * 1.45 - cell * 0.5) * outCubic(share);
    const width = (cell * thick * (0.3 + 0.7 * left)) / radius;
    drawn.floor.push(floorMark('ring', floor, radius, width * 2.6, tones.glow, 0.6 * left, 'light', 0));
    drawn.floor.push(floorMark('ring', floor, radius, width * 2, tones.ink, 0.85 * left, 'color', 0));
    drawn.floor.push(floorMark('ring', floor, radius, width * 0.7, tones.pale, left, 'color', 0));
    drawn.floor.push(floorMark('ring', floor, radius * 0.9, width * 4, DUST, 0.5 * left, 'color', 0));
  }
}

/** Dust thrown out along the spiral as it falls in, rolling out over the floor and settling. */
function drawThrownDust(
  drawn: Staged,
  floor: Point,
  reach: number,
  cell: number,
  since: number,
  forward: number
): void {
  for (let puff = 0; puff < 22; puff++) {
    const age = (since - 0.03 - 0.25 * scatterOf(puff, 3)) / 2.2;
    if (age < 0 || age >= 1) continue;
    const turn = scatterOf(puff, 5) * Math.PI * 2 - 1.2 * outCubic(age);
    const out = reach * (0.2 + (0.6 + 0.6 * scatterOf(puff, 7)) * outCubic(Math.min(1, age * 1.6)));
    drawn.motes.push(
      smokePuff(
        {
          x: floor.x + Math.cos(turn) * out,
          y: floor.y + Math.sin(turn) * out,
          z: floor.z + cell * (0.15 + 0.4 * age),
        },
        cell * (0.45 + 0.7 * age),
        DUST,
        0.6 * Math.min(1, age * 10) * (1 - age),
        forward
      )
    );
  }
}

/** Glints drifting down over the area once it has gone. */
function drawGlints(
  drawn: Staged,
  hole: Point,
  floor: Point,
  reach: number,
  tones: SpaceTones,
  cell: number,
  since: number,
  forward: number
): void {
  for (let glint = 0; glint < 30; glint++) {
    const born = 0.3 + 1.6 * scatterOf(glint, 13);
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
        cell * (0.1 + 0.04 * Math.sin(since * 11 + glint)),
        glint % 3 === 0 ? '#ffffff' : tones.pale,
        1 - age,
        forward
      ),
      shape: 'star',
      spin: glint + since,
    });
  }
}

/** What each piece it takes in other than the first bears where it stands: dust dragged off it towards the hole, and thrown back as it falls in. */
function drawCaught(stage: Stage, tones: SpaceTones, fallsAt: number): Staged {
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
      drawn.motes.push({
        ...at,
        size: cell * 0.2,
        color: fleck % 2 ? DUST : tones.deep,
        alpha: 0.85 * fade,
        blend: 'color',
        shape: 'spark',
        velocity,
        trail: 0.06,
        forward,
      });
    }
    const closing = (t * 1.5) % 1;
    drawn.floor.push(
      floorMark('ring', floor, cell * (0.6 + 1.6 * (1 - closing)), 0.12, tones.deep, 0.8 * pull * closing, 'color', 0)
    );
    return drawn;
  }
  if (since < 0.5) {
    const left = 1 - since / 0.5;
    drawn.floor.push(
      floorMark('ring', floor, cell * (0.5 + 2.2 * outCubic(since / 0.5)), 0.12, tones.pale, left, 'color', 0)
    );
    for (let puff = 0; puff < 6; puff++) {
      const turn = Math.atan2(-way.y, -way.x) + (puff - 2.5) * 0.35;
      const out = cell * (0.4 + 2.4 * outCubic(since / 0.5));
      drawn.motes.push(
        smokePuff(
          { x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: floor.z + cell * 0.3 },
          cell * 1.1,
          DUST,
          0.7 * left,
          forward
        )
      );
    }
  }
  return drawn;
}

/** A singularity: see the header. */
export function drawSingularity(stage: Stage): Staged {
  const { cell, duration } = stage;
  const t = stage.seconds;
  const ends = duration + LINGER_S;
  if (t >= ends) return nothingStaged();
  const fallsAt = stage.blowsAt[0] ?? spaceBeatAt('singularity', duration);
  const tones = spaceTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7), VIVID);
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
    const look = holeAt(stage, t, fallsAt, heading);
    const nothing = t >= fallsAt - NOTHING_S;
    const dark = within(t, 0.1, 0.9);
    drawn.floor.push(floorMark('disc', floor, reach * 1.45, 1, '#000000', 0.5 * dark, 'color', 0));
    drawn.floor.push(floorMark('disc', floor, reach * 0.75, 1, tones.ink, 0.4 * dark, 'color', 0));
    drawn.motes.push(haze(hole, cell * 5, '#000000', 0.3 * dark, forward * 0.3));
    if (nothing) return drawn;
    const pull = within(t, 0.25, 1) * (1 + look.fallen);
    laySpiral(drawn, floor, reach, tones, -t * (0.9 + 2 * look.fallen), look.spun, look.spun * (1 - look.fallen), cell);
    for (let ring = 0; ring < 2; ring++) {
      const closing = (t * (1 + 2 * look.fallen) + ring * 0.5) % 1;
      const radius = reach * (0.2 + 1.1 * (1 - closing));
      const alpha = look.spun * Math.min(1, closing * 3) * (1 - closing);
      layFloorRing(drawn, floor, radius, 0.04, tones, alpha);
    }
    drawDragged(drawn, floor, hole, reach, tones, cell, t, Math.min(1, pull), forward);
    drawDisc(drawn, hole, look, tones, cell, forward);
    drawHole(drawn, hole, look, tones, cell, forward);
    drawBentLight(drawn, hole, look, tones, cell, forward);
    drawJets(drawn, hole, look, tones, cell, floor.z);
    drawn.lights.push({ ...hole, color: tones.glow, strength: 0.5 + 1.1 * look.spun, reachPx: reach * 1.2 });
    return drawn;
  }

  const thrown = keptFor(thrownByStage, stageKey(stage, ends), () => {
    const th = throwerFor(stage, ends);
    return Array.from({ length: th.count(22) }, () => {
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
  });
  const scoured = 1 - within(since, ends - fallsAt - 1.4, ends - fallsAt);
  laySpiral(drawn, floor, reach, tones, -fallsAt * 2.9, scoured, Math.max(0, 1 - since / 1.1), cell);
  drawn.floor.push(
    floorMark('cracks', floor, cell * 1.6, 0.5, tones.ink, 0.9 * scoured, 'color', (stage.seed % 89) + 1)
  );
  drawn.floor.push(floorMark('disc', floor, cell * 0.9, 1, '#000000', 0.45 * scoured, 'color', 0));
  layShock(drawn, floor, reach, tones, cell, since);
  drawBeat(drawn, hole, floor, reach, tones, cell, since, stage.seed);
  drawThrownDust(drawn, floor, reach, cell, since, forward);
  for (const [index, mote] of thrown.entries()) {
    const at = moteAt(mote, t);
    if (!at) continue;
    drawn.motes.push({
      ...at,
      size: cell * (0.12 + 0.08 * scatterOf(index, 29)),
      color: STONE,
      alpha: Math.min(1, (1 - at.age) * 3),
      blend: 'color',
      shape: 'chunk',
      spin: at.landed ? index : t * 9 + index,
      variant: index,
      forward,
    });
  }
  if (since < 1.4) {
    const left = 1 - since / 1.4;
    drawn.motes.push(glow(hole, cell * 1.4, tones.glow, 0.5 * left * left, forward));
    drawn.motes.push({ ...glow(hole, cell * 0.3, tones.pale, left, forward + 1), shape: 'star', spin: since * 2 });
  }
  drawGlints(drawn, hole, floor, reach, tones, cell, since, forward);
  return drawn;
}
