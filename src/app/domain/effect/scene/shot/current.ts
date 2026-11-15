import { nothingStaged, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import {
  floorMark,
  glow,
  haze,
  hueOf,
  lerpPoint,
  lightBall,
  type Point,
  starBurst,
} from '@axe/domain/effect/scene/parts';
import { originOf } from '@axe/domain/effect/scene/shot/stream-ends';
import {
  layBodyArcs,
  layCrackles,
  layGroundBurst,
  layStrikeFlash,
  struckBodyOf,
} from '@axe/domain/effect/scene/storm/bolt-parts';
import { boltAfterimage, boltRibbons, boltShape, partOf } from '@axe/domain/effect/scene/storm/lightning';
import { CURRENT_BREAKS_AT, CURRENT_REACHES_AT } from '@axe/domain/effect/thunder-looks';

/*
 * A current of lightning that holds between its caster and one target. Sparks gather in the hand and
 * a leader snaps across; then the current stands between the two for as long as it is held, a trunk
 * wound with two thinner strands, writhing into a new shape every twentieth of a second and never
 * going out, only surging and easing, with arcs dropping off it to the floor it passes over and its
 * light thrown along that floor. The piece it holds is lit, small bolts crawling all over it. When
 * it breaks its track glows for a moment, and what is left crackles over the piece.
 */

/** How long a current lingers after its playback, while what is left of it crackles, in seconds. */
export const CURRENT_LINGER_S = 0.7;

/** One length of current between two points at a moment. */
export interface CurrentLink {
  readonly from: Point;
  readonly to: Point;
  readonly seed: number;
  /** Which of its shapes it has taken. */
  readonly flicker: number;
  readonly cell: number;
  readonly ramp: readonly string[];
  /** How bright it is, from 0 to 1, and how thick, where 1 is a bolt out of the sky. */
  readonly power: number;
  readonly thick: number;
  readonly floorZ: number;
  /** How many arcs drop off it to the floor it passes over. */
  readonly grounds: number;
}

/**
 * Lays one length of current: its trunk and the two strands wound about it, the arcs it drops to the
 * floor with a glint where each lands, its light thrown along the floor under it, and a light of its
 * own colour hung on it.
 */
export function layCurrent(drawn: Staged, link: CurrentLink): void {
  const { from, to, seed, flicker, cell, ramp, power, thick, floorZ } = link;
  if (power <= 0) return;
  const next = seededRun(seed * 89 + flicker * 23 + 2);
  const lies = floorZ + cell * 0.04;
  const grounds: Point[] = [];
  for (let ground = 0; ground < link.grounds; ground++) {
    const under = lerpPoint(from, to, 0.2 + 0.6 * next());
    grounds.push({ x: under.x + (next() - 0.5) * cell * 0.9, y: under.y + (next() - 0.5) * cell * 0.9, z: lies });
  }
  const trunk = boltShape(from, to, seed, flicker, { breaks: 5, jag: 0.09, reaches: grounds, floorZ: lies });
  drawn.ribbons.push(...boltRibbons(trunk, cell, ramp, power, thick));
  for (const strand of [1, 2]) {
    const wound = boltShape(from, to, seed + strand * 17, flicker, { breaks: 4, jag: 0.16, floorZ: lies });
    drawn.ribbons.push(...boltRibbons(wound, cell, ramp, 0.85 * power, thick * 0.5));
  }
  for (const [index, ground] of grounds.entries()) {
    drawn.motes.push({
      ...glow({ ...ground, z: ground.z + cell * 0.05 }, cell * 0.3, '#ffffff', power, cell * 0.2),
      shape: 'star',
      spin: flicker + index,
    });
    drawn.floor.push(floorMark('disc', ground, cell * 0.5, 1, ramp[4], 0.5 * power, 'light', 0));
  }
  for (const share of [0.2, 0.4, 0.6, 0.8]) {
    const under = lerpPoint(from, to, share);
    drawn.floor.push(floorMark('disc', { ...under, z: floorZ }, cell * 0.9, 1, hueOf(ramp), 0.16 * power, 'light', 0));
  }
  drawn.lights.push({ ...lerpPoint(from, to, 0.5), color: ramp[4], strength: 0.9 * power, reachPx: cell * 3 });
}

/** The ball of sparks in the hand a current leaves, as large as `grown` says. */
export function layHandSparks(
  drawn: Staged,
  hand: Point,
  cell: number,
  ramp: readonly string[],
  seed: number,
  flicker: number,
  grown: number
): void {
  if (grown <= 0) return;
  const forward = cell * 0.4;
  drawn.motes.push(haze(hand, cell * 1.1 * grown, hueOf(ramp), 0.5, forward));
  drawn.motes.push(glow(hand, cell * 0.9 * grown, ramp[4], 0.9, forward));
  drawn.motes.push(lightBall(hand, cell * 0.26 * grown, '#ffffff', 1, forward + 1));
  const next = seededRun(seed * 57 + flicker * 13);
  for (let arc = 0; arc < 3; arc++) {
    const turn = next() * Math.PI * 2;
    const tilt = (next() - 0.5) * 2;
    const out = cell * 0.55 * grown;
    const to = { x: hand.x + Math.cos(turn) * out, y: hand.y + Math.sin(turn) * out, z: hand.z + tilt * out };
    const shape = boltShape(hand, to, seed + arc, flicker, { breaks: 3, jag: 0.3 });
    drawn.ribbons.push(...boltRibbons(shape, cell, ramp, 0.9, 0.3));
  }
}

/** A current held on one target: see the header. */
export function drawCurrent(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const hue = hueOf(ramp);
  const body = struckBodyOf(stage);
  const hand = originOf(stage);
  const chest = lerpPoint(body.foot, body.head, 0.6);
  const reaches = stage.blowsAt[0] ?? duration * CURRENT_REACHES_AT;
  const breaks = Math.max(reaches + 0.1, duration * CURRENT_BREAKS_AT);
  const forward = cell * 0.4;
  const heavy = stage.preset.gradeLevel === 3 ? 1.25 : stage.preset.gradeLevel === 1 ? 0.8 : 1;
  const flicker = Math.floor(t / 0.05);
  if (t < reaches) {
    const feeling = within(t, 0, reaches);
    layHandSparks(drawn, hand, cell, ramp, stage.seed, Math.floor(t / 0.03), 0.5 + 0.5 * feeling);
    const leader = boltShape(hand, chest, stage.seed, 30 + Math.floor(t / 0.03), { breaks: 4, jag: 0.08 });
    drawn.ribbons.push(...boltRibbons({ main: partOf(leader.main, feeling), forks: [] }, cell, ramp, 0.9, 0.5));
    return drawn;
  }
  const u = t - reaches;
  const link = { from: hand, to: chest, seed: stage.seed, cell, ramp, floorZ: body.floor.z };
  if (t < breaks) {
    const surge = 1 - within(u, 0, 0.14);
    const power = Math.min(1, 0.76 + 0.2 * Math.sin(t * 31 + stage.seed) + 0.4 * surge);
    layCurrent(drawn, { ...link, flicker, power, thick: heavy * (1.15 + 0.6 * surge), grounds: 3 });
    layHandSparks(drawn, hand, cell, ramp, stage.seed, flicker, 1);
    layBodyArcs(drawn, body, cell, ramp, stage.seed, flicker, 5, power, 0.42);
    drawn.motes.push(haze(chest, cell * 1.6, hue, 0.4 * power, forward));
    drawn.motes.push({ ...glow(chest, cell * 0.9, '#ffffff', power, forward + 1), shape: 'star', spin: flicker });
    if (surge > 0) layStrikeFlash(drawn, chest, body.floor, cell, ramp, surge, forward, 1);
    else drawn.lights.push({ ...chest, color: ramp[4], strength: 1.6 * power, reachPx: cell * 4 });
    const next = seededRun(stage.seed * 29 + flicker);
    for (let spark = 0; spark < 3; spark++) {
      const turn = next() * Math.PI * 2;
      const fast = cell * (4 + 5 * next());
      drawn.motes.push({
        ...glow(chest, cell * 0.05, '#ffffff', 1, forward),
        shape: 'spark',
        velocity: { x: Math.cos(turn) * fast, y: Math.sin(turn) * fast, z: cell * (1 + 3 * next()) },
        trail: 0.035,
      });
    }
  } else {
    const since = t - breaks;
    const last = boltShape(hand, chest, stage.seed, Math.floor(breaks / 0.05), { breaks: 5, jag: 0.06 });
    drawn.ribbons.push(...boltAfterimage(last, cell, ramp, 1 - since / 0.25, heavy * 1.2));
    layBodyArcs(drawn, body, cell, ramp, stage.seed, flicker, 3, 1 - within(since, 0, 0.35), 0.36);
    layCrackles(drawn, body, cell, ramp, stage.seed, since, 0.12, duration + CURRENT_LINGER_S - breaks, 0.16);
  }
  drawn.motes.push(...starBurst(chest, cell * 2.6, hue, u / 0.28, forward * 1.5, 8, stage.seed));
  layGroundBurst(drawn, stage, body.floor, ramp, u, duration + CURRENT_LINGER_S - reaches, {
    soot: 0.4,
    ring: 2.4,
    crawl: 1.8,
    crawls: 4,
    sparks: 30,
    crawlS: breaks - reaches,
  });
  return drawn;
}
