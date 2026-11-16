import { nothingStaged, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun, type ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { drawSpark, layShockRing } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  floorMark,
  glow,
  haze,
  hueOf,
  keptFor,
  lerpPoint,
  type Point,
  stageKey,
  starBurst,
  throwerFor,
} from '@axe/domain/effect/scene/parts';
import {
  BOLT_LINGER_S,
  CLOUD,
  detailOf,
  GLOOM,
  kept,
  layBodyArcs,
  layCrackles,
  layGroundBurst,
  layGroundCrawl,
  layStrikeFlash,
  skitteringSparks,
  struckBodyOf,
} from '@axe/domain/effect/scene/storm/bolt-parts';
import { boltAfterimage, boltRibbons, boltShape } from '@axe/domain/effect/scene/storm/lightning';
import { boltStrokesOf, stormEndsAt } from '@axe/domain/effect/thunder-looks';

/*
 * The greatest of the bolts, a storm. The floor darkens under a ring of cloud that wheels overhead,
 * lit from within, and leaders feel their way down out of it on every side while a ring of light
 * closes on the target. Then a column of lightning comes down and stands: a colossal trunk wound
 * with thinner ones, taking a new shape every twentieth of a second, forking to the floor about it
 * and to every other piece the cast strikes, while rings roll out along the floor, discharges crawl
 * over it and sparks pour from its foot. It ends in one last stroke, thicker and whiter than all the
 * rest. After it bolts go on falling about the place, each fainter, and what is left crackles over
 * the piece, until the thunder has rolled away; the cloud thins, and the soot is left to cool.
 */

/** How high over the floor the cloud hangs, in cells, and how wide its ring is. */
const CLOUD_HIGH = 6.5;
const CLOUD_WIDE = 2.4;
/** How far the dark under the storm reaches, in cells, and how dark it is. */
const GLOOM_REACH = 5.5;
const GLOOM_DEEP = 0.5;
/** How many leaders feel their way down before the column, and how far from the target they come down at the most, in cells. */
const LEADERS = 5;
const LEADERS_WITHIN = 1.9;
/** How long the last stroke is seen and how long its track glows after it, in seconds. */
const LAST_STROKE_S = 0.12;
const LAST_TRACK_S = 0.3;
/** How often a ring rolls out from the foot of the column, and a bolt falls after it is gone, in seconds. */
const RING_EVERY_S = 0.3;
const AFTERSHOCK_EVERY_S = 0.16;
/** How long each bolt that falls afterwards is seen, in seconds, and how far from the target it falls at the most, in cells. */
const AFTERSHOCK_S = 0.09;
const AFTERSHOCKS_WITHIN = 3;
/** How far from the target another piece may stand and still draw a fork off the column, in cells. */
const FORKS_REACH = 6;

const fountains = new Map<string, ThrownMote[]>();

/** A storm of lightning: see the header. */
export function drawStorm(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell } = stage;
  const strikes = stage.blowsAt[0] ?? boltStrokesOf(3, stage.duration)[0];
  const lastAt = (stage.blowsAt[1] ?? stormEndsAt(stage.duration, strikes)) - strikes;
  const t = stage.seconds - strikes;
  const rolls = Math.max(lastAt + 0.6, stage.duration - strikes);
  const ends = stage.duration + BOLT_LINGER_S - strikes;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const hue = hueOf(ramp);
  const body = struckBodyOf(stage);
  const { floor, head } = body;
  const forward = cell * 0.4;
  const sky: Point = { x: floor.x, y: floor.y - cell * 0.3, z: floor.z + cell * CLOUD_HIGH };
  const gathered = strikes > 0.05 ? within(stage.seconds, 0, strikes * 0.8) : within(t, -0.01, 0.08);
  const brooding = gathered * (1 - within(t, rolls - 0.3, rolls + 0.5));
  layGloom(drawn, floor, sky, cell, ramp, stage.seconds, stage.seed, brooding, stage.targets.length);
  if (t < 0) {
    layLeaders(drawn, stage, sky, floor, ramp, within(stage.seconds, 0, strikes));
    return drawn;
  }
  const detail = detailOf(stage);
  const others = stage.targets
    .filter((target) => target.index !== stage.index)
    .map((target) => ({ x: target.x, y: target.y, z: target.z + target.widthPx * 0.7 }))
    .filter((point) => Math.hypot(point.x - floor.x, point.y - floor.y) < cell * FORKS_REACH)
    .slice(0, kept(3, detail));
  if (t < lastAt) {
    const flicker = Math.floor(t / 0.05);
    const next = seededRun(stage.seed * 61 + flicker * 7);
    const surge = 1 - within(t, 0, 0.12);
    const power = 0.72 + 0.28 * next() + 0.3 * surge;
    const trunk = boltShape(sky, head, stage.seed, flicker, {
      breaks: 5,
      jag: 0.05,
      forks: kept(7, detail),
      forkReach: 0.36,
      reaches: others,
      floorZ: floor.z + cell * 0.05,
    });
    drawn.ribbons.push(...boltRibbons(trunk, cell, ramp, Math.min(1, power), 3.2 + 1.2 * surge));
    for (const strand of [1, 2].slice(0, kept(2, detail * detail, 0))) {
      const off = { ...sky, x: sky.x + cell * (strand === 1 ? 1 : -0.9), y: sky.y + cell * (strand - 1.5) * 0.5 };
      const wound = boltShape(off, head, stage.seed + strand * 17, flicker, { breaks: 4, jag: 0.1, forks: 1 });
      drawn.ribbons.push(...boltRibbons(wound, cell, ramp, 0.9 * Math.min(1, power), 1.3));
    }
    const lit = Math.min(1, 0.4 + 0.2 * next() + 0.6 * surge);
    layStrikeFlash(drawn, head, floor, cell, ramp, lit, forward, 1.7, 0.4 + 0.6 * surge);
    layBodyArcs(drawn, body, cell, ramp, stage.seed, flicker, kept(5, detail), 1, 0.6);
    layShockRing(drawn, floor, cell * 0.3, cell * 4.2, cell * 0.22, hue, t % RING_EVERY_S, RING_EVERY_S);
    drawn.motes.push(...starBurst(head, cell * 4, hue, t / 0.32, forward * 1.5, 8, stage.seed));
  }
  layGroundBurst(drawn, stage, floor, ramp, t, ends, {
    soot: 0.35,
    ring: 4.4,
    crawl: 3.4,
    crawls: kept(7, detail, 2),
    sparks: 60,
    crawlS: lastAt,
    thick: 0.55,
  });
  const fountain = keptFor(fountains, stageKey(stage, ends), () => {
    const th = throwerFor({ ...stage, seed: stage.seed + 31 }, ends);
    return skitteringSparks(th, floor, th.count(70), [0.05, Math.max(0.1, lastAt)], [3, 10]);
  });
  for (const [index, spark] of fountain.entries()) drawSpark(drawn, spark, t, cell, ramp, index, forward);
  const after = t - lastAt;
  if (after >= 0) {
    const last = boltShape(sky, head, stage.seed, 9001, {
      breaks: 5,
      jag: 0.05,
      forks: kept(8, detail),
      forkReach: 0.4,
      reaches: others,
      floorZ: floor.z + cell * 0.05,
    });
    if (after < LAST_STROKE_S) {
      const power = 1 - 0.4 * (after / LAST_STROKE_S);
      drawn.ribbons.push(...boltRibbons(last, cell, ramp, power, 5));
      layStrikeFlash(drawn, head, floor, cell, ramp, power, forward, 2.4);
      layBodyArcs(drawn, body, cell, ramp, stage.seed + 5, 0, kept(6, detail), power, 0.7);
    } else {
      drawn.ribbons.push(...boltAfterimage(last, cell, ramp, 1 - (after - LAST_STROKE_S) / LAST_TRACK_S, 3.6));
    }
    drawn.motes.push(...starBurst(head, cell * 5.5, hue, after / 0.4, forward * 1.5, 8, stage.seed + 1));
    layShockRing(drawn, floor, cell * 0.4, cell * 6, cell * 0.3, hue, after, 0.5);
    layShockRing(drawn, floor, cell * 0.3, cell * 4, cell * 0.22, ramp[4], after - 0.07, 0.4);
    layGroundBurst(
      drawn,
      stage,
      floor,
      ramp,
      after,
      ends - lastAt,
      {
        soot: 0.9,
        ring: 3,
        crawl: 4,
        crawls: kept(8, detail, 2),
        sparks: 60,
        crawlS: 0.9,
        thick: 0.6,
      },
      1
    );
    layAftershocks(drawn, stage, sky, floor, ramp, after, rolls - lastAt);
    layCrackles(drawn, body, cell, ramp, stage.seed, after, 0.3, rolls - lastAt, 0.18);
  }
  return drawn;
}

/**
 * The dark the storm lays over the floor and the cloud wheeling over it, lit from within now and
 * then, as thick as `brooding` says; the dark is thinned where several storms of one cast lay theirs
 * over each other.
 */
function layGloom(
  drawn: Staged,
  floor: Point,
  sky: Point,
  cell: number,
  ramp: readonly string[],
  seconds: number,
  seed: number,
  brooding: number,
  storms: number
): void {
  if (brooding <= 0) return;
  const shared = brooding / Math.max(1, storms) ** 0.4;
  drawn.floor.push(floorMark('disc', floor, cell * GLOOM_REACH, 1, GLOOM, GLOOM_DEEP * shared, 'color', 0));
  drawn.floor.push(floorMark('disc', floor, cell * GLOOM_REACH * 0.55, 1, GLOOM, 0.3 * shared, 'color', 0));
  const wheeled = seconds * 0.9 + (seed % 7);
  for (let puff = 0; puff < 14; puff++) {
    const inner = puff >= 9;
    const turn = wheeled * (inner ? -1.4 : 1) + (puff / (inner ? 5 : 9)) * Math.PI * 2;
    const out = cell * CLOUD_WIDE * (inner ? 0.4 : 1) * (0.9 + 0.1 * Math.sin(puff * 2.3));
    const at = {
      x: sky.x + Math.cos(turn) * out,
      y: sky.y + Math.sin(turn) * out,
      z: sky.z + cell * 0.35 * Math.sin(puff * 1.7 + seconds),
    };
    drawn.motes.push({
      ...haze(at, cell * (inner ? 2.4 : 3), inner ? GLOOM : CLOUD, (inner ? 0.7 : 0.6) * brooding, 0),
      exactDepth: true,
    });
  }
  const beat = Math.floor(seconds / 0.11);
  const next = seededRun(seed * 19 + beat * 53);
  if (next() < 0.55) {
    const turn = next() * Math.PI * 2;
    const at = {
      x: sky.x + Math.cos(turn) * cell * CLOUD_WIDE * 0.8,
      y: sky.y + Math.sin(turn) * cell * CLOUD_WIDE * 0.8,
      z: sky.z - cell * 0.2,
    };
    drawn.motes.push(glow(at, cell * 2.6, ramp[4], 0.55 * brooding, cell * 0.3));
    const across = { x: sky.x - (at.x - sky.x) * 0.6, y: sky.y - (at.y - sky.y) * 0.6, z: at.z };
    const lit = boltShape(at, across, seed, beat, { breaks: 4, jag: 0.14, forks: 1 });
    drawn.ribbons.push(...boltRibbons(lit, cell, ramp, 0.8 * brooding, 0.3));
  }
}

/**
 * The leaders feeling their way down out of the cloud before the column, each from its own place in
 * the ring to its own place on the floor about the target, and the ring of light closing on it.
 */
function layLeaders(
  drawn: Staged,
  stage: Stage,
  sky: Point,
  floor: Point,
  ramp: readonly string[],
  feeling: number
): void {
  const { cell } = stage;
  const flicker = Math.floor(stage.seconds / 0.05);
  const next = seededRun(stage.seed * 43 + 9);
  for (let leader = 0; leader < LEADERS; leader++) {
    const turn = (leader / LEADERS) * Math.PI * 2 + next();
    const far = cell * LEADERS_WITHIN * (0.3 + 0.7 * next());
    const comes = within(feeling, leader * 0.1, 0.75 + leader * 0.05) ** 1.4;
    if (comes <= 0) continue;
    const from = {
      x: sky.x + Math.cos(turn) * cell * CLOUD_WIDE * 0.7,
      y: sky.y + Math.sin(turn) * cell * CLOUD_WIDE * 0.7,
      z: sky.z,
    };
    const lands = { x: floor.x + Math.cos(turn) * far, y: floor.y + Math.sin(turn) * far, z: floor.z + cell * 0.05 };
    const tip = lerpPoint(from, lands, comes * (0.6 + 0.4 * next()));
    const shape = boltShape(from, tip, stage.seed + leader * 11, flicker, {
      floorZ: floor.z,
      breaks: 4,
      jag: 0.09,
      forks: 2,
      forkReach: 0.22,
    });
    drawn.ribbons.push(...boltRibbons(shape, cell, ramp, 0.9, 0.5));
    drawn.motes.push({ ...glow(tip, cell * 0.4, '#ffffff', 1, cell * 0.3), shape: 'star', spin: flicker + leader });
  }
  const closing = cell * (3.2 - 2.6 * feeling);
  drawn.floor.push(floorMark('ring', floor, closing, 0.04, hueOf(ramp), 0.55 * feeling, 'color', 0));
  drawn.floor.push(floorMark('ring', floor, closing, 0.02, ramp[4], 0.85 * feeling, 'light', 0));
  drawn.floor.push(floorMark('ring', floor, closing * 0.6, 0.03, ramp[4], 0.6 * feeling, 'light', 0));
  drawn.lights.push({ ...sky, z: sky.z - cell, color: ramp[4], strength: 0.9 * feeling, reachPx: cell * 6 });
}

/**
 * The bolts that go on falling about the place after the last stroke, `after` seconds after it and
 * until `until`: one every beat or so, each fainter than the one before, each lighting the
 * floor where it lands and leaving its track for a moment.
 */
function layAftershocks(
  drawn: Staged,
  stage: Stage,
  sky: Point,
  floor: Point,
  ramp: readonly string[],
  after: number,
  until: number
): void {
  const from = 0.28;
  if (after < from || after >= until) return;
  const { cell } = stage;
  const beat = Math.floor((after - from) / AFTERSHOCK_EVERY_S);
  const next = seededRun(stage.seed * 97 + beat * 31 + 1);
  const since = after - from - beat * AFTERSHOCK_EVERY_S - next() * AFTERSHOCK_EVERY_S * 0.4;
  if (since < 0 || since >= AFTERSHOCK_S + 0.12) return;
  const fainter = 1 - 0.5 * within(after, from, until);
  const turn = next() * Math.PI * 2;
  const far = cell * (0.7 + (AFTERSHOCKS_WITHIN - 0.7) * next());
  const lands = { x: floor.x + Math.cos(turn) * far, y: floor.y + Math.sin(turn) * far, z: floor.z + cell * 0.05 };
  const leaves = { x: sky.x + Math.cos(turn) * cell * 1.2, y: sky.y + Math.sin(turn) * cell * 1.2, z: sky.z };
  const shape = boltShape(leaves, lands, stage.seed + beat * 3, beat, {
    breaks: 5,
    jag: 0.07,
    forks: 3,
    forkReach: 0.3,
    floorZ: floor.z + cell * 0.05,
  });
  if (since >= AFTERSHOCK_S) {
    drawn.ribbons.push(...boltAfterimage(shape, cell, ramp, (1 - (since - AFTERSHOCK_S) / 0.12) * fainter, 1.2));
    return;
  }
  const power = fainter * (1 - 0.4 * (since / AFTERSHOCK_S));
  drawn.ribbons.push(...boltRibbons(shape, cell, ramp, power, 1.4));
  layStrikeFlash(drawn, { ...lands, z: lands.z + cell * 0.15 }, lands, cell, ramp, power * 0.7, cell * 0.4, 0.8);
  layGroundCrawl(drawn, lands, cell, ramp, stage.seed + beat, beat, 4, cell * 1.4, power, 0.4);
  drawn.motes.push(
    ...starBurst(
      { ...lands, z: lands.z + cell * 0.15 },
      cell * 2,
      hueOf(ramp),
      since / AFTERSHOCK_S,
      cell * 0.4,
      4,
      beat
    )
  );
}
