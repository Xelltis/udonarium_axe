import { nothingStaged, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { floorMark, glow, hueOf, lerpPoint, type Point, starBurst } from '@axe/domain/effect/scene/parts';
import {
  BOLT_LINGER_S,
  detailOf,
  GLOOM,
  kept,
  layBodyArcs,
  layCrackles,
  layGroundBurst,
  layStrikeFlash,
  struckBodyOf,
} from '@axe/domain/effect/scene/storm/bolt-parts';
import { boltAfterimage, boltRibbons, boltShape } from '@axe/domain/effect/scene/storm/lightning';
import { boltStrokesOf } from '@axe/domain/effect/thunder-looks';

/*
 * A strike out of the sky. The floor about the target darkens and a ring of light closes on it while
 * a leader feels its way down in steps, forking as it comes, and a streamer rises off the piece to
 * meet it. Then the bolt comes back up the path at once: a thick trunk, white in a dark sheath, with
 * forks reaching for the floor about it, and the table lit hard. It strikes twice more along other
 * paths, each fainter, its track glowing between. Where it lands, discharges crawl out over the
 * floor, sparks skitter, soot glows and cools, and what is left crackles over the piece until the
 * thunder has died away.
 */

/** How high over the floor the bolt leaves the sky, in cells. */
const SKY = 9;
/** The strokes of a strike: how long after the first, how strong, how thick, how many forks, and how far aside it leaves the sky, in cells. */
const STROKES = [
  [0, 1, 2.3, 8, 0],
  [0.16, 0.85, 1.6, 4, 0.7],
  [0.34, 0.7, 1.15, 2, -0.6],
] as const;
/** How long each stroke is seen, and how long its track glows after it, in seconds. */
const STROKE_S = 0.08;
const TRACK_S = 0.15;
/** How far the dark under the strike reaches, in cells, and how dark it is. */
const GLOOM_REACH = 3.8;
const GLOOM_DEEP = 0.45;

/** A strike out of the sky: see the header. */
export function drawStrike(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell } = stage;
  const strikes = stage.blowsAt[0] ?? boltStrokesOf(2, stage.duration)[0];
  const t = stage.seconds - strikes;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const hue = hueOf(ramp);
  const body = struckBodyOf(stage);
  const { floor, head } = body;
  const forward = cell * 0.4;
  const detail = detailOf(stage);
  const lean = ((stage.seed % 5) - 2) * 0.18;
  const skyAt = (aside: number): Point => ({
    x: floor.x + cell * (lean + aside),
    y: floor.y - cell * 0.3,
    z: floor.z + cell * SKY,
  });
  if (t < 0) {
    const feeling = within(stage.seconds, 0, strikes);
    const flicker = Math.floor(stage.seconds / 0.04);
    drawn.floor.push(floorMark('disc', floor, cell * GLOOM_REACH, 1, GLOOM, GLOOM_DEEP * feeling, 'color', 0));
    const closing = cell * (1.9 - 1.4 * feeling);
    drawn.floor.push(floorMark('ring', floor, closing, 0.05, hue, 0.5 * feeling, 'color', 0));
    drawn.floor.push(floorMark('ring', floor, closing, 0.025, ramp[4], 0.8 * feeling, 'light', 0));
    const stepped = Math.sqrt(Math.min(1, (Math.floor(feeling * 6) + 1) / 7));
    const tip = lerpPoint(skyAt(0), head, stepped * 0.92);
    const leader = boltShape(skyAt(0), tip, stage.seed, 40 + flicker, {
      breaks: 5,
      jag: 0.07,
      forks: 3,
      forkReach: 0.2,
    });
    drawn.ribbons.push(...boltRibbons(leader, cell, ramp, 0.9, 0.5));
    drawn.motes.push({ ...glow(tip, cell * 0.3, '#ffffff', 1, forward), shape: 'star', spin: flicker });
    if (feeling > 0.6) {
      const risen = { ...head, z: head.z + cell * 0.9 * within(feeling, 0.6, 1) };
      const streamer = boltShape(head, risen, stage.seed, 70 + flicker, { breaks: 3, jag: 0.2 });
      drawn.ribbons.push(...boltRibbons(streamer, cell, ramp, 0.85, 0.34));
    }
    return drawn;
  }
  drawn.floor.push(
    floorMark('disc', floor, cell * GLOOM_REACH, 1, GLOOM, GLOOM_DEEP * (1 - within(t, 0.45, 1.1)), 'color', 0)
  );
  STROKES.forEach(([after, strength, thick, forks, aside], stroke) => {
    const since = t - after;
    if (since < 0) return;
    const shape = boltShape(skyAt(aside), head, stage.seed, 3 + stroke, {
      breaks: 5,
      jag: 0.06,
      forks: kept(forks, detail),
      forkReach: 0.36,
      floorZ: floor.z + cell * 0.05,
    });
    if (since < STROKE_S) {
      const power = strength * (1 - 0.45 * (since / STROKE_S));
      drawn.ribbons.push(...boltRibbons(shape, cell, ramp, power, thick));
      layStrikeFlash(drawn, head, floor, cell, ramp, power, forward, 1.1 + 0.4 * strength);
      layBodyArcs(drawn, body, cell, ramp, stage.seed + stroke, stroke, kept(4, detail), power, 0.6);
    } else {
      drawn.ribbons.push(...boltAfterimage(shape, cell, ramp, 1 - (since - STROKE_S) / TRACK_S, thick));
    }
  });
  drawn.motes.push(...starBurst(head, cell * 3.2, hue, t / 0.32, forward * 1.5, 8, stage.seed));
  layBodyArcs(drawn, body, cell, ramp, stage.seed, Math.floor(t / 0.05), 4, 1 - within(t, 0.45, 0.85), 0.45);
  const ends = stage.duration + BOLT_LINGER_S - strikes;
  layGroundBurst(drawn, stage, floor, ramp, t, ends, {
    soot: 0.8,
    ring: 3.8,
    crawl: 3.2,
    crawls: kept(7, detail, 2),
    sparks: 60,
    crawlS: 1,
    thick: 0.5,
  });
  layCrackles(drawn, body, cell, ramp, stage.seed, t, 0.6, stage.duration - strikes, 0.17);
  return drawn;
}
