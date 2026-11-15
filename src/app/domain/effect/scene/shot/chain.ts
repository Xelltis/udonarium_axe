import { nothingStaged, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { glow, hueOf, lerpPoint, type Point, starBurst } from '@axe/domain/effect/scene/parts';
import { CURRENT_LINGER_S, layCurrent, layHandSparks } from '@axe/domain/effect/scene/shot/current';
import { originOf } from '@axe/domain/effect/scene/shot/stream-ends';
import {
  layBodyArcs,
  layCrackles,
  layGroundBurst,
  layStrikeFlash,
  struckBodyOf,
} from '@axe/domain/effect/scene/storm/bolt-parts';
import { boltAfterimage, boltRibbons, boltShape, partOf } from '@axe/domain/effect/scene/storm/lightning';
import { CURRENT_REACHES_AT } from '@axe/domain/effect/thunder-looks';

/*
 * Lightning that chains. It leaps from its caster's hand to the first target, and from each target
 * to the next in the order they were picked, a beat apart; each piece is lit white and struck into
 * the floor as its link lands. The links already made stand as a thin current behind the one that
 * leaps, and the moment the last lands the whole chain surges thick and white at once. Then it lets
 * go link by link from the caster's end, each track glowing for a moment, and what is left crackles
 * over every piece it passed through.
 */

/** How long a link takes to leap from one piece to the next, in seconds. */
const LEAP_S = 0.06;
/** How far apart the links leap where the cast gives its targets no beat of their own, in seconds. */
const BEAT_S = 0.1;
/** How long the whole chain surges once its last link has landed, and how long it stands after that at the least, in seconds. */
const SURGE_S = 0.16;
const STANDS_S = 0.3;
/** Where through the playback of its first link the chain starts to let go at the earliest, as a share of it, and how long after one link the next lets go. */
const LETS_GO_AT = 0.62;
const LETS_GO_APART_S = 0.06;

/** A chain of lightning, as one of its links: see the header. */
export function drawChain(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const hue = hueOf(ramp);
  const body = struckBodyOf(stage);
  const forward = cell * 0.4;
  const mine = Math.max(
    0,
    stage.targets.findIndex((target) => target.index === stage.index)
  );
  const later = stage.targets.length - 1 - mine;
  const staggered = stage.preset.stagger / 1000;
  const beat = staggered >= 0.05 ? staggered : BEAT_S;
  const reaches = (stage.blowsAt[0] ?? duration * CURRENT_REACHES_AT) + (staggered >= 0.05 ? 0 : mine * BEAT_S);
  const u = stage.seconds - reaches;
  const before = stage.targets[mine - 1];
  const from: Point = before
    ? { x: before.x, y: before.y, z: before.z + Math.min(before.widthPx, cell) * 0.6 }
    : originOf(stage);
  const to = lerpPoint(body.foot, body.head, 0.6);
  const heavy = stage.preset.gradeLevel === 3 ? 1.2 : stage.preset.gradeLevel === 1 ? 0.8 : 1;
  const surgesAt = later * beat;
  const letsGoAt =
    Math.max((stage.targets.length - 1) * beat + STANDS_S, duration * LETS_GO_AT) - mine * (beat - LETS_GO_APART_S);
  const ends = duration + CURRENT_LINGER_S - reaches;
  if (u < -LEAP_S) {
    if (!before) layHandSparks(drawn, from, cell, ramp, stage.seed, Math.floor(stage.seconds / 0.03), 0.8);
    return drawn;
  }
  if (u < 0) {
    const leapt = (u + LEAP_S) / LEAP_S;
    const leaping = boltShape(from, to, stage.seed, 1, { breaks: 5, jag: 0.07 });
    const reached = partOf(leaping.main, leapt);
    drawn.ribbons.push(...boltRibbons({ main: reached, forks: [] }, cell, ramp, 1, heavy * 1.3));
    drawn.motes.push(glow(reached[reached.length - 1], cell * 1.4, ramp[4], 1, forward));
    return drawn;
  }
  const flicker = Math.floor(u / 0.05);
  if (u < letsGoAt) {
    const landing = 1 - within(u, 0, 0.1);
    const surged = u - surgesAt;
    const surging = surged >= 0 && surged < SURGE_S ? 1 - 0.5 * (surged / SURGE_S) : 0;
    const power = Math.min(1, 0.62 + 0.14 * Math.sin(u * 37 + stage.seed) + 0.5 * landing + 0.6 * surging);
    const thick = heavy * (0.85 + 0.6 * landing + 0.9 * surging);
    const grounds = landing > 0 || surging > 0 || flicker % 3 === 0 ? 1 : 0;
    layCurrent(drawn, { from, to, seed: stage.seed, flicker, cell, ramp, power, thick, floorZ: body.floor.z, grounds });
    if (!before) layHandSparks(drawn, from, cell, ramp, stage.seed, flicker, 1);
    const lit = Math.max(landing, surging);
    if (lit > 0) layStrikeFlash(drawn, to, body.floor, cell, ramp, lit, forward, 1 + 0.3 * surging);
    layBodyArcs(drawn, body, cell, ramp, stage.seed, flicker, 4, power, 0.42);
    drawn.motes.push(...starBurst(to, cell * 3.4, hue, surged / 0.3, forward * 1.5, 8, stage.seed + 3));
  } else {
    const since = u - letsGoAt;
    const last = boltShape(from, to, stage.seed, Math.floor(letsGoAt / 0.05), { breaks: 5, jag: 0.06 });
    drawn.ribbons.push(...boltAfterimage(last, cell, ramp, 1 - since / 0.25, heavy * 1.2));
    layBodyArcs(drawn, body, cell, ramp, stage.seed, flicker, 3, 1 - within(since, 0, 0.35), 0.36);
    layCrackles(drawn, body, cell, ramp, stage.seed, since, 0.1, ends - letsGoAt, 0.16);
  }
  drawn.motes.push(...starBurst(to, cell * 2.6, hue, u / 0.28, forward * 1.5, 8, stage.seed));
  layGroundBurst(drawn, stage, body.floor, ramp, u, ends, {
    soot: 0.4,
    ring: 2.4,
    crawl: 1.8,
    crawls: 4,
    sparks: 30,
    crawlS: 0.45,
  });
  return drawn;
}
