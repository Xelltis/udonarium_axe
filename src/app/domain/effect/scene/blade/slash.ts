import { clamp } from '@axe/core/util/clamp';
import {
  type Chip,
  cutChips,
  cutSparks,
  drawChip,
  drawCrossing,
  drawCutMark,
  drawGlint,
  swingPoint,
  trailRibbons,
} from '@axe/domain/effect/scene/blade/blade-trail';
import { drawCleave } from '@axe/domain/effect/scene/blade/slash-cleave';
import { drawDrawingCut } from '@axe/domain/effect/scene/blade/slash-iai';
import { drawSweep } from '@axe/domain/effect/scene/blade/slash-sweep';
import { chestOf, cutFrameOf, strokeClock, swingOf } from '@axe/domain/effect/scene/blade/slash-swing';
import { type Choreography, nothingStaged, type Stage, type Staged } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { drawSpark } from '@axe/domain/effect/scene/fire/fire-parts';
import { glow, keptFor, type Point, stageKey, throwerFor } from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';
import { SLASH_COMBO_OPENS_AT, slashHits } from '@axe/domain/effect/timeline/blade';

/*
 * A cut. Steel glints where the blade is drawn back, and the blade sweeps an arc through the air
 * across the target from the side its caster stands, fast, leaving the trail every blade leaves:
 * a hard edge and a torn wake that linger and fade. Where it crosses, everything stops on a long line
 * of light; sparks and chips fly the way the blade went, and the cut stays on the target as a slit
 * that closes.
 *
 * The forms differ. One stroke is that and no more. A flurry is five, each from its own side, quick
 * and uneven and the last the heaviest, and the cuts they leave wait on the target and open together
 * a moment after the last. A drawing cut, a wide sweep and a cleave from above are drawn each in a
 * file of its own.
 */

/** How long a cut lingers after its playback while what it leaves clears, in seconds. */
const LINGER_S = SCENE_LINGER_S.slash ?? 0.6;
/** How long a stroke takes to swing through, and the last and heaviest of a flurry, in seconds. */
const STROKE_S = 0.14;
const HEAVY_STROKE_S = 0.17;
/** How long the trail a stroke leaves takes to fade, in seconds. */
const FADES_S = 0.34;
/** How long before its stroke steel glints where the blade is drawn back, in seconds. */
const GLINTS_S = 0.07;
/** How long the cut one stroke leaves stays on the target, in seconds, and the cuts of a flurry once they have opened. */
const CUT_STAYS_S = 0.6;
const OPENED_STAYS_S = 0.8;

interface CutThrown {
  /** The sparks and the chips each stroke throws where it crosses, and the sparks its cut throws as it opens. */
  readonly sparks: readonly (readonly ThrownMote[])[];
  readonly chips: readonly (readonly Chip[])[];
  readonly opening: readonly (readonly ThrownMote[])[];
}

const thrownByStage = new Map<string, CutThrown>();

export const slash: Choreography = { lingerS: LINGER_S, draw: drawSlash };

function drawSlash(stage: Stage): Staged {
  switch (stage.preset.slashLook) {
    case 'iai':
      return drawDrawingCut(stage, LINGER_S);
    case 'heavy':
      return drawCleave(stage, LINGER_S);
    case 'wide':
      return drawSweep(stage, LINGER_S);
    default:
      return drawStrokes(stage);
  }
}

/** One stroke or a flurry of them, each with its glint, its trail, its crossing and the cut it leaves. */
function drawStrokes(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const hits = slashHits(stage.preset.slashLook);
  const flurry = hits.length > 1;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const frame = cutFrameOf(stage);
  const chest = chestOf(stage);
  const forward = cell * 0.5;
  const opensAt = flurry ? SLASH_COMBO_OPENS_AT * duration : Number.POSITIVE_INFINITY;
  const crossings = hits.map((hit, index) => stage.blowsAt[index] ?? (hit.at + hit.span * 0.3) * duration);
  const swings = hits.map((hit) =>
    swingOf(
      hit,
      frame,
      {
        x: chest.x + frame.across.x * hit.offsetX * cell,
        y: chest.y + frame.across.y * hit.offsetX * cell,
        z: chest.z - hit.offsetY * cell,
      },
      cell
    )
  );
  const ends = duration + LINGER_S;
  const thrown = keptFor(thrownByStage, stageKey(stage, ends), () => {
    const th = throwerFor(stage, ends);
    const born = (index: number): [number, number] => [crossings[index], crossings[index] + 0.02];
    return {
      sparks: swings.map((swing, index) =>
        cutSparks(th, swing.centre, swing.travel, th.count(flurry ? 9 : 22), [5, 12], born(index))
      ),
      chips: swings.map((swing, index) =>
        cutChips(th, swing.centre, swing.travel, th.count(flurry ? 2 : 5), crossings[index])
      ),
      opening: flurry
        ? swings.map((swing) =>
            cutSparks(th, swing.centre, swing.travel, th.count(7), [3, 9], [opensAt, opensAt + 0.03])
          )
        : [],
    };
  });

  hits.forEach((hit, index) => {
    const swing = swings[index];
    const crosses = crossings[index];
    const heavy = flurry && index === hits.length - 1;
    const clock = strokeClock(swing, crosses, heavy ? HEAVY_STROKE_S : STROKE_S, FADES_S, t);
    const before = clock.starts - t;
    if (before > 0 && before < GLINTS_S) {
      const growing = 1 - before / GLINTS_S;
      drawGlint(drawn, swingPoint(swing, swing.from), cell * 0.5 * growing, ramp[3], 1, forward, index);
    }
    if (t >= clock.starts) {
      drawn.ribbons.push(
        ...trailRibbons(swing, swing.from, clock.head, {
          ramp,
          thick: cell * clamp(hit.thickness / 60, 0.3, 0.62),
          alpha: 1,
          spent: clock.spent,
          flowed: (t - clock.starts) * 5 + index,
        })
      );
    }
    drawCrossing(drawn, swing.centre, cell, ramp, t - crosses, heavy || !flurry ? 1 : 0.7, forward);
    const half = cell * (heavy ? 0.62 : flurry ? 0.42 : 0.5);
    if (t < opensAt) {
      const stays = flurry ? opensAt - crosses + 0.3 : CUT_STAYS_S;
      drawCutMark(drawn, swing.centre, swing.travel, half, ramp, t - crosses, stays, flurry ? 0.6 : 1, frame.lowestZ);
    } else {
      drawCutMark(drawn, swing.centre, swing.travel, half, ramp, t - opensAt, OPENED_STAYS_S, 1.5, frame.lowestZ);
    }
    for (const [spark, flying] of thrown.sparks[index].entries())
      drawSpark(drawn, flying, t, cell * 0.8, ramp, spark, forward);
    for (const chip of thrown.chips[index]) drawChip(drawn, chip, t, cell, ramp[4], forward);
    for (const [spark, flying] of (thrown.opening[index] ?? []).entries())
      drawSpark(drawn, flying, t, cell * 0.8, ramp, spark, forward);
  });
  if (flurry) drawOpening(drawn, chest, cell, ramp, t - opensAt, forward);
  return drawn;
}

/** The cuts of a flurry opening together: one flash over the target as they do. */
function drawOpening(
  drawn: Staged,
  chest: Point,
  cell: number,
  ramp: readonly string[],
  since: number,
  forward: number
): void {
  if (since < 0 || since >= 0.2) return;
  const left = 1 - since / 0.2;
  drawn.motes.push(glow(chest, cell * (1.1 + 0.5 * (1 - left)), ramp[3], 0.55 * left, forward));
  drawn.lights.push({ ...chest, color: ramp[4], strength: 1.4 * left, reachPx: cell * 2.6 });
}
