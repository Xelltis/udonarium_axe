import { drawDrift } from '@axe/domain/effect/scene/blade/cut-impact';
import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { driftingDust, kickedDust } from '@axe/domain/effect/scene/earth/earth-dust';
import { earthTonesOf, layDent } from '@axe/domain/effect/scene/earth/earth-parts';
import { drawRock, type Rock, throwRocks } from '@axe/domain/effect/scene/earth/earth-rocks';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import {
  type Cloud,
  drawCloud,
  drawSpark,
  layDustBand,
  layShockRing,
  thrownSparks,
} from '@axe/domain/effect/scene/fire/fire-parts';
import { floorMark, keptFor, lerpPoint, stageKey, throwerFor } from '@axe/domain/effect/scene/parts';
import {
  along,
  drawFist,
  drawPressureRings,
  drawStamp,
  drawStar,
  dustOf,
  laySkid,
  speedFan,
  type StarSpike,
  starSpikes,
  strikeFrameOf,
  strikeTonesOf,
} from '@axe/domain/effect/scene/strike/strike-parts';

/*
 * A jab: one hard straight blow. A fist of force is drawn back a cell and more out on the side of the
 * one who throws it, its streak trailing back towards them; it is driven in, and lands. For the
 * instant it lands a star of thick spikes bursts out of the point struck, longest out of its back,
 * the point stamped white in a dark rim, two rings of pressure snapping out round it and the streak
 * of the drive still hanging behind it. A cone of the blow's force bursts out of the far side with
 * lines of speed; dust is kicked out along the floor the way it drove and chips fly; a dent is left
 * under the target, and the dust drifts and settles.
 */

/** How long the drive takes, in seconds, before the blow lands. */
const DRIVE_S = 0.04;
/** How far out on its thrower's side the fist is drawn back, in cells, at the start and at the most. */
const DRAWN_FROM = 1.05;
const DRAWN_MOST = 1.35;
/** How long the star takes to burst open, how long it holds, and when it has shrunk away, in seconds. */
const STAR_OPENS_S = 0.03;
const STAR_HOLDS_S = 0.07;
const STAR_GONE_S = 0.24;

interface JabThrow {
  readonly spikes: readonly StarSpike[];
  readonly dust: readonly Cloud[];
  readonly chips: readonly Rock[];
  readonly sparks: readonly ThrownMote[];
}

const thrownByStage = new Map<string, JabThrow>();

/** A jab on a stage: see the head of this file. */
export function drawJab(stage: Stage, lingerS: number): Staged {
  const drawn = nothingStaged();
  const { cell } = stage;
  const landsAt = stage.blowsAt[0] ?? 0;
  const t = stage.seconds - landsAt;
  const frame = strikeFrameOf(stage);
  const { struck, floor, way } = frame;
  const tones = strikeTonesOf(stage);
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const forward = cell * 0.6;
  const drawnBack = (share: number) =>
    along({ ...struck, z: struck.z + cell * 0.04 }, way, -cell * (DRAWN_FROM + (DRAWN_MOST - DRAWN_FROM) * share));

  if (t < 0) {
    const drivesAt = Math.max(0, landsAt - DRIVE_S);
    if (stage.seconds < drivesAt) {
      const winding = within(stage.seconds, 0, drivesAt);
      drawFist(
        drawn,
        drawnBack(outCubic(winding)),
        cell * (0.26 + 0.12 * winding),
        way,
        cell * 0.8 * winding,
        tones,
        Math.min(1, winding * 4),
        cell * 0.3
      );
      return drawn;
    }
    const driving = outCubic(within(stage.seconds, drivesAt, landsAt));
    const from = drawnBack(1);
    const at = lerpPoint(from, struck, driving);
    drawFist(drawn, at, cell * 0.38, way, cell * 0.8 + Math.hypot(at.x - from.x, at.y - from.y), tones, 1, cell * 0.3);
    return drawn;
  }

  const ends = stage.duration + lingerS - landsAt;
  const clearing = 1 - within(t, ends - 0.35, ends);
  const toward = Math.atan2(way.y, way.x);
  const thrown = keptFor(thrownByStage, stageKey(stage, ends), () => {
    const th = throwerFor(stage, ends);
    const tones = earthTonesOf(ramp);
    return {
      spikes: starSpikes(12, way, 0.6, stage.seed),
      dust: [
        ...kickedDust(th, floor, th.count(10), dustOf(tones), {
          speed: [1.6, 4.4],
          size: [0.45, 0.8],
          bornAt: [0, 0.05],
          fan: { toward, spread: 0.85 },
          alpha: 0.8,
          life: [1.1, 1.6],
        }),
        ...kickedDust(th, floor, th.count(5), tones.dust, {
          speed: [0.6, 1.6],
          size: [0.45, 0.7],
          bornAt: [0, 0.08],
          alpha: 0.5,
        }),
        ...driftingDust(th, floor, th.count(5), tones.dust, 0.45, [0.15, 0.6]),
      ],
      chips: throwRocks(th, floor, th.count(7), {
        size: [0.06, 0.12],
        up: [2.2, 4.5],
        out: [0.8, 2.6],
        bornAt: [0, 0.04],
        fan: { toward, spread: 0.8, share: 0.8 },
        bounce: 0.3,
      }),
      sparks: thrownSparks(th, struck, th.count(10), [3, 7], [0, 0.02]),
    };
  });

  const earth = earthTonesOf(ramp);
  layDent(drawn, floor, cell * 0.6 * Math.min(1, t / 0.04 + 0.4), earth, clearing, stage.seed);
  layDustBand(drawn, floor, cell * 1.4, cell * 0.35, ramp, t, 0.45);
  layShockRing(drawn, floor, cell * 0.2, cell * 1.5, cell * 0.12, tones.glow, t, 0.32);
  laySkid(drawn, stage, way, 'jab', t, clearing);
  if (t < 0.06) drawn.floor.push(floorMark('disc', floor, cell * 0.7, 1, '#ffffff', 0.32 * (1 - t / 0.06), 'light', 0));
  for (const cloud of thrown.dust) drawCloud(drawn, cloud, t, cell, 0);
  for (const chip of thrown.chips) drawRock(drawn, chip, t, cell, earth);

  const trail = 1 - within(t, 0, 0.12);
  if (trail > 0) {
    const from = lerpPoint(drawnBack(1), struck, 1 - trail);
    drawn.ribbons.push(
      { points: [from, struck], widths: [0, cell * 0.42 * trail], color: tones.rim, alpha: trail, blend: 'color' },
      {
        points: [from, struck],
        widths: [0, cell * 0.3 * trail],
        color: tones.body,
        core: tones.hot,
        alpha: trail,
        blend: 'color',
      }
    );
  }
  const out = within(t, 0, 0.3);
  if (out < 1) {
    drawn.motes.push(
      flowingMote(
        'gust',
        along(struck, way, cell * 0.1),
        way,
        cell * 0.55 * (1 - 0.4 * out),
        cell * (1 + 1.4 * outCubic(out)),
        t * 6,
        {
          color: tones.pale,
          core: '#ffffff',
          alpha: 0.75 * (1 - out),
          forward,
          variant: stage.seed % 7,
        }
      )
    );
  }
  speedFan(drawn, struck, way, 0.55, cell * 1.9, t, 0.28, 12, tones, stage.seed, forward);
  const open = (0.8 + 0.2 * outCubic(within(t, 0, STAR_OPENS_S))) * (1 - within(t, STAR_HOLDS_S, STAR_GONE_S));
  drawStar(drawn, along(struck, way, cell * 0.06), cell * 1.15, thrown.spikes, tones, open, forward);
  drawStamp(drawn, struck, cell * 0.5 * (1 - within(t, 0.03, 0.14)), tones, 1, forward + 4);
  drawPressureRings(drawn, struck, cell * 2, tones, t, 0.22, 2, forward - 2);
  for (const [index, spark] of thrown.sparks.entries()) drawSpark(drawn, spark, t, cell, ramp, index, forward);
  drawDrift(drawn, struck, cell, ramp, t, ends * 0.8, 8, stage.seed, 0.7);
  if (t < 0.12)
    drawn.lights.push({ ...struck, color: tones.pale, strength: 1.3 * (1 - t / 0.12), reachPx: cell * 2.2 });
  return drawn;
}
