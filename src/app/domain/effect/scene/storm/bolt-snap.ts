import { nothingStaged, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { glow, hueOf, lerpPoint, type Point, starBurst } from '@axe/domain/effect/scene/parts';
import {
  BOLT_LINGER_S,
  detailOf,
  kept,
  layBodyArcs,
  layCrackles,
  layGroundBurst,
  layStrikeFlash,
  struckBodyOf,
} from '@axe/domain/effect/scene/storm/bolt-parts';
import { boltAfterimage, boltRibbons, boltShape, partOf } from '@axe/domain/effect/scene/storm/lightning';
import { boltStrokesOf } from '@axe/domain/effect/thunder-looks';

/*
 * The least of the bolts, a snap: sparks gather in the caster's hand, and a thin bolt cracks from it
 * across to the target, and twice more along other paths, its track glowing between them; the piece
 * is lit white for an instant, small bolts crawl over it, sparks skitter from its feet, and what is
 * left crackles on it until the thunder dies. Cast from nowhere, it drops a short way out of the air
 * onto the head of the piece instead.
 */

/** The strokes of a snap: how long after it first strikes, how strong, and which of its paths. */
const STROKES = [
  [0, 1, 1],
  [0.11, 0.75, 2],
  [0.23, 0.55, 3],
] as const;
/** How long each stroke is seen, and how long its track glows after it, in seconds. */
const STROKE_S = 0.07;
const TRACK_S = 0.16;
/** How far over the head of the piece a snap from nowhere drops from, in cells. */
const DROPS_FROM = 4;

/**
 * A snap of lightning: see the header. `detail` is how much of its forks and of what crawls from it
 * it keeps, where many of them land at once.
 */
export function drawSnap(stage: Stage, detail = detailOf(stage)): Staged {
  const drawn = nothingStaged();
  const { cell } = stage;
  const strikes = stage.blowsAt[0] ?? boltStrokesOf(1, stage.duration)[0];
  const t = stage.seconds - strikes;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const hue = hueOf(ramp);
  const body = struckBodyOf(stage);
  const forward = cell * 0.4;
  const hand = stage.origin;
  const from: Point = hand ?? {
    x: body.head.x + cell * 0.3,
    y: body.head.y - cell * 0.2,
    z: body.head.z + cell * DROPS_FROM,
  };
  const to: Point = hand ? lerpPoint(body.foot, body.head, 0.6) : body.head;
  const shapeOf = (pick: number, forks: number) =>
    boltShape(from, to, stage.seed, pick, {
      breaks: detail < 0.5 ? 4 : 5,
      jag: hand ? 0.07 : 0.09,
      forks,
      forkReach: 0.36,
      floorZ: body.floor.z + cell * 0.05,
    });
  if (t < 0) {
    const feeling = within(stage.seconds, 0, strikes);
    const flicker = Math.floor(stage.seconds / 0.03);
    drawn.motes.push(glow(from, cell * 0.7 * feeling, ramp[4], 0.8, forward));
    drawn.motes.push({ ...glow(from, cell * 0.4 * feeling, '#ffffff', 1, forward + 1), shape: 'star', spin: flicker });
    const leader = boltShape(from, to, stage.seed, 20 + flicker, { breaks: 4, jag: 0.08, floorZ: body.floor.z });
    drawn.ribbons.push(...boltRibbons({ main: partOf(leader.main, feeling), forks: [] }, cell, ramp, 0.8, 0.3));
    return drawn;
  }
  for (const [after, strength, pick] of STROKES) {
    const since = t - after;
    if (since < 0) continue;
    const shape = shapeOf(pick, kept(pick === 1 ? 5 : 2, detail));
    if (since < STROKE_S) {
      const power = strength * (1 - 0.5 * (since / STROKE_S));
      drawn.ribbons.push(...boltRibbons(shape, cell, ramp, power, 1.5 * strength));
      layStrikeFlash(drawn, to, body.floor, cell, ramp, power, forward, 0.9);
      if (hand) drawn.motes.push(glow(from, cell * 1.4, ramp[4], power, forward));
    } else {
      drawn.ribbons.push(...boltAfterimage(shape, cell, ramp, 1 - (since - STROKE_S) / TRACK_S, 1.2));
    }
  }
  drawn.motes.push(...starBurst(to, cell * 2.4, hue, t / 0.28, forward * 1.5, 8, stage.seed));
  layBodyArcs(
    drawn,
    body,
    cell,
    ramp,
    stage.seed,
    Math.floor(t / 0.05),
    kept(4, detail),
    1 - within(t, 0.3, 0.55),
    0.42
  );
  const ends = stage.duration + BOLT_LINGER_S - strikes;
  layGroundBurst(drawn, stage, body.floor, ramp, t, ends, {
    soot: 0.45,
    ring: 2.3,
    crawl: 1.8,
    crawls: kept(5, detail),
    sparks: 32,
    crawlS: 0.6,
  });
  layCrackles(drawn, body, cell, ramp, stage.seed, t, 0.5, stage.duration - strikes, 0.2);
  return drawn;
}
