import {
  type Choreography,
  nothingStaged,
  outCubic,
  type Stage,
  type Staged,
  within,
} from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import {
  type Bit,
  type Cloud,
  drawBit,
  drawCloud,
  drawFlashDisc,
  drawSpark,
  DUST,
  layShockRing,
  rollingDust,
  thrownGrit,
  thrownRocks,
  thrownSparks,
} from '@axe/domain/effect/scene/fire/fire-parts';
import { floorMark, glow, keptFor, type Point, stageKey, throwerFor } from '@axe/domain/effect/scene/parts';

/*
 * A blow: the force gathers for a beat; it lands in a white flash held through the stop, a star of
 * thick spikes bursting out of the point struck and shrinking away, speed lines racing out after it,
 * sparks flying; a shock ring runs out along the floor and dust is thrown up round the feet. The
 * heaviest breaks the ground: cracks run out under it, rocks are thrown and a second ring follows.
 */

/** How long a blow lingers after its playback while its dust settles, in seconds. */
const LINGER_S = 0.6;

/** One spike of the star, or one speed line: which way it bursts out, how long it reaches, in cells. */
interface Spike {
  readonly way: Point;
  readonly reach: number;
  readonly width: number;
}

interface BlowThrow {
  readonly spikes: readonly Spike[];
  readonly lines: readonly Spike[];
  readonly sparks: readonly ThrownMote[];
  readonly dust: readonly Cloud[];
  readonly bits: readonly Bit[];
}

const thrownByStage = new Map<string, BlowThrow>();

export const bash: Choreography = { lingerS: LINGER_S, draw: drawBash };

function drawBash(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell } = stage;
  const landsAt = stage.blowsAt[0] ?? 0;
  const t = stage.seconds - landsAt;
  const ends = stage.duration + LINGER_S - landsAt;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const struck = { x: stage.x, y: stage.y, z: stage.z + cell * 0.6 };
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const forward = cell * 0.7;
  const heavy = stage.preset.gradeLevel >= 3;
  const thrown = keptFor(thrownByStage, stageKey(stage, ends), () => {
    const th = throwerFor(stage, ends);
    const outward = (count: number, reach: readonly [number, number], width: readonly [number, number]) =>
      Array.from({ length: count }, (_unused, index) => {
        const turn = ((index + th.range(-0.3, 0.3)) / count) * Math.PI * 2;
        const lift = th.range(-0.35, 0.75);
        const flat = Math.sqrt(1 - lift * lift);
        return {
          way: { x: Math.cos(turn) * flat, y: Math.sin(turn) * flat, z: lift },
          reach: th.range(reach[0], reach[1]),
          width: th.range(width[0], width[1]),
        };
      });
    return {
      spikes: outward(heavy ? 10 : 8, [0.6, 1.15], [0.16, 0.26]),
      lines: outward(th.count(12), [1.2, 2.2], [0.03, 0.05]),
      sparks: thrownSparks(th, struck, th.count(18), [3.5, 8], [0, 0.02]),
      dust: rollingDust(th, floor, th.count(heavy ? 12 : 6), [2, 5], [0.45, 0.7]),
      bits: heavy ? [...thrownRocks(th, floor, th.count(6), [3, 5.5]), ...thrownGrit(th, floor, th.count(20))] : [],
    };
  });

  if (t < 0) {
    // The force gathers for a beat before it lands.
    const gather = landsAt > 0 ? within(stage.seconds, 0, landsAt) : 1;
    drawn.motes.push(glow(struck, cell * (1.2 - gather * 0.7), ramp[4], gather * 0.6, forward));
    return drawn;
  }
  const clearing = 1 - within(t, ends - 0.3, ends);

  if (heavy) {
    const seed = (stage.seed % 89) + 1;
    drawn.floor.push(
      floorMark('cracks', floor, cell * 1.4 * Math.min(1, t / 0.08), 0.3, DUST, 0.75 * clearing, 'color', seed, seed)
    );
    layShockRing(drawn, floor, cell * 0.3, cell * 3.2, cell * 0.16, ramp[3], t - 0.08, 0.5);
  }
  layShockRing(drawn, floor, cell * 0.25, cell * 2.2, cell * 0.12, ramp[5], t, 0.32);
  for (const cloud of thrown.dust) drawCloud(drawn, cloud, t, cell, forward);
  for (const bit of thrown.bits) drawBit(drawn, bit, t, cell, ramp, forward);

  // The star: thick spikes bursting out of the point struck and shrinking back, each a tongue of light
  // a step apart in colour, a dark rim, a light body and a white heart.
  const opening = within(t, 0, 0.05);
  const closing = within(t, 0.08, 0.28);
  const star = outCubic(opening) * (1 - closing);
  if (star > 0.01) {
    for (const [colour, wide, blend] of [
      [ramp[1], 1.3, 'color'],
      [ramp[4], 1, 'color'],
      ['#ffffff', 0.5, 'color'],
    ] as const) {
      for (const spike of thrown.spikes) {
        const reach = cell * spike.reach * star;
        const width = cell * spike.width * wide * (0.6 + 0.4 * star);
        if (reach < width) continue;
        drawn.motes.push({
          x: struck.x + spike.way.x * reach,
          y: struck.y + spike.way.y * reach,
          z: struck.z + spike.way.z * reach,
          size: width,
          color: colour,
          alpha: 1,
          blend,
          shape: 'tongue',
          velocity: { x: spike.way.x * reach, y: spike.way.y * reach, z: spike.way.z * reach },
          trail: 1,
          forward: forward * 1.2,
        });
      }
    }
  }
  // Speed lines racing out a beat after it lands.
  const racing = within(t, 0.03, 0.33);
  if (racing > 0 && racing < 1) {
    for (const line of thrown.lines) {
      const out = cell * (0.4 + line.reach * outCubic(racing));
      const at = { x: struck.x + line.way.x * out, y: struck.y + line.way.y * out, z: struck.z + line.way.z * out };
      const speed = cell * line.reach * 3;
      drawn.motes.push({
        ...glow(at, cell * line.width, ramp[5], 1 - racing, forward),
        shape: 'spark',
        velocity: { x: line.way.x * speed, y: line.way.y * speed, z: line.way.z * speed },
        trail: 0.12 * (1 - racing * 0.5),
      });
    }
  }
  for (const [index, spark] of thrown.sparks.entries()) drawSpark(drawn, spark, t, cell, ramp, index, forward);
  drawFlashDisc(drawn, struck, cell * (heavy ? 1 : 0.8), ramp, t, 0.06);

  if (t < 0.1)
    drawn.lights.push({
      ...struck,
      color: '#ffffff',
      strength: (heavy ? 1.6 : 1.2) * (1 - t / 0.1),
      reachPx: cell * 2.2,
    });
  return drawn;
}
