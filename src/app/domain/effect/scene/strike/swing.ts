import { speedLines, type Swing } from '@axe/domain/effect/scene/blade/crescent';
import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { kickedDust } from '@axe/domain/effect/scene/earth/earth-dust';
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
import { ball, floorMark, keptFor, stageKey, throwerFor } from '@axe/domain/effect/scene/parts';
import { bluntArcRibbons, bluntHeads } from '@axe/domain/effect/scene/strike/blunt-arc';
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
  unit,
} from '@axe/domain/effect/scene/strike/strike-parts';
import { knockTurnOf } from '@axe/domain/effect/strike-looks';

/*
 * A swing: a heavy blow brought down and round from overhead. The weight of it, a great fist of force,
 * is hauled back up over the one who swings it and a little to its left; it comes down in the thick
 * hard-edged arc of a blunt weapon, copies of its head left standing along it and lines of speed
 * along its sweep, dragging its afterimages through the target, and lands. A star bursts out of the point
 * struck, leaning the way the blow carries on, three rings of pressure snap out round it and then go
 * on ringing, quivering about it while the sound of the blow rings; a cone of force and lines of speed
 * burst out the way it is thrown, and it is sent skidding: two scores are dragged along the floor
 * behind its feet, dust boiling up along them. A dent is left where it stood.
 */

/** How long the sweep takes before the blow lands, and how long it runs on after it, in seconds. */
const SWEEP_S = 0.15;
const FOLLOWS_S = 0.08;
/** The turns the head of the swing comes round between, in radians either side of where it lands, and how far back it is hauled before. */
const FROM_TURN = -2;
const TO_TURN = 0.95;
const HAULED_TURN = 0.3;
/** How far the swing reaches either side of where it lands, and how deep it bows back towards the one who swings, in cells. */
const SWING_REACH = 2;
const SWING_DEPTH = 0.6;
/** How thick the arc of the swing is at its head, in cells, and how far round behind its head it trails, in radians. */
const ARC_THICK = 0.86;
const TRAIL_TURN = 1.6;
/** When the rings go on ringing, and when they are still, in seconds after the blow, and how fast they quiver, in turns a second. */
const RINGS_FROM_S = 0.08;
const RINGS_UNTIL_S = 0.45;
const RINGS_HZ = 13;

interface SwingThrow {
  readonly spikes: readonly StarSpike[];
  readonly dust: readonly Cloud[];
  readonly chips: readonly Rock[];
  readonly sparks: readonly ThrownMote[];
}

const thrownByStage = new Map<string, SwingThrow>();

/** A swing on a stage: see the head of this file. */
export function drawSwing(stage: Stage, lingerS: number): Staged {
  const drawn = nothingStaged();
  const { cell } = stage;
  const landsAt = stage.blowsAt[0] ?? 0;
  const t = stage.seconds - landsAt;
  const { struck, floor, way, side } = strikeFrameOf(stage);
  const tones = strikeTonesOf(stage);
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const earth = earthTonesOf(ramp);
  const forward = cell * 0.6;
  const swing: Swing = {
    centre: struck,
    travel: unit({ x: side.x * 0.25, y: side.y * 0.25, z: -1 }),
    toward: { x: -way.x, y: -way.y, z: 0 },
    radius: cell * SWING_REACH,
    depth: SWING_DEPTH,
    from: FROM_TURN,
    to: TO_TURN,
    lowestZ: floor.z + cell * 0.1,
  };
  const sweepsAt = Math.max(0, landsAt - SWEEP_S);
  const head =
    stage.seconds < sweepsAt
      ? FROM_TURN - HAULED_TURN * outCubic(within(stage.seconds, 0, sweepsAt))
      : t < 0
        ? FROM_TURN + -FROM_TURN * Math.pow(within(stage.seconds, sweepsAt, landsAt), 1.6)
        : TO_TURN * outCubic(within(t, 0, FOLLOWS_S));
  const tip = pointOn(swing, head);
  const ahead = pointOn(swing, head + 0.08);
  const heading = unit({ x: ahead.x - tip.x, y: ahead.y - tip.y, z: ahead.z - tip.z });

  if (stage.seconds < sweepsAt) {
    const hauling = within(stage.seconds, 0, sweepsAt);
    drawFist(drawn, tip, cell * (0.3 + 0.18 * hauling), heading, 0, tones, Math.min(1, hauling * 3), cell * 0.3);
    return drawn;
  }
  const spent = within(t, FOLLOWS_S, FOLLOWS_S + 0.3);
  const look = { tones, thick: cell * ARC_THICK, alpha: 1, spent, ghosts: 2, heads: 4, forward };
  const sweptFrom = Math.max(FROM_TURN - HAULED_TURN, head - TRAIL_TURN);
  drawn.ribbons.push(...bluntArcRibbons(swing, sweptFrom, head, look));
  drawn.motes.push(...bluntHeads(swing, sweptFrom, head, look));
  const lines = { tones, thick: look.thick, alpha: 1, spent: within(t, 0, 0.2), flowed: 0, ghosts: 0 };
  drawn.ribbons.push(...speedLines(swing, sweptFrom, head, lines, cell, stage.seed, 7));
  if (t < FOLLOWS_S) drawFist(drawn, tip, cell * 0.62, heading, 0, tones, 1 - within(t, 0, FOLLOWS_S), forward);
  if (t < 0) return drawn;

  const ends = stage.duration + lingerS - landsAt;
  const clearing = 1 - within(t, ends - 0.35, ends);
  const turn = knockTurnOf('swing');
  const knock = unit({
    x: way.x * Math.cos(turn) + side.x * Math.sin(turn),
    y: way.y * Math.cos(turn) + side.y * Math.sin(turn),
    z: 0,
  });
  const toward = Math.atan2(knock.y, knock.x);
  const thrown = keptFor(thrownByStage, stageKey(stage, ends), () => {
    const th = throwerFor(stage, ends);
    return {
      spikes: starSpikes(14, knock, 0.55, stage.seed),
      dust: kickedDust(th, floor, th.count(12), dustOf(earth), {
        speed: [1.4, 3.6],
        size: [0.45, 0.8],
        bornAt: [0, 0.06],
        fan: { toward, spread: 0.9 },
        alpha: 0.8,
        life: [1.1, 1.7],
      }),
      chips: throwRocks(th, floor, th.count(8), {
        size: [0.06, 0.13],
        up: [2.4, 5],
        out: [1, 3],
        bornAt: [0, 0.05],
        fan: { toward, spread: 0.9, share: 0.8 },
        bounce: 0.3,
      }),
      sparks: thrownSparks(th, struck, th.count(14), [3.5, 8], [0, 0.02]),
    };
  });

  layDent(drawn, floor, cell * 0.66 * Math.min(1, t / 0.04 + 0.4), earth, clearing, stage.seed);
  layDustBand(drawn, floor, cell * 1.8, cell * 0.4, ramp, t, 0.5);
  layShockRing(drawn, floor, cell * 0.25, cell * 2, cell * 0.14, tones.glow, t, 0.36);
  laySkid(drawn, stage, knock, 'swing', t, clearing);
  if (t < 0.07) drawn.floor.push(floorMark('disc', floor, cell * 0.8, 1, '#ffffff', 0.32 * (1 - t / 0.07), 'light', 0));
  for (const cloud of thrown.dust) drawCloud(drawn, cloud, t, cell, 0);
  for (const chip of thrown.chips) drawRock(drawn, chip, t, cell, earth);

  const out = within(t, 0, 0.34);
  if (out < 1) {
    drawn.motes.push(
      flowingMote(
        'gust',
        along(struck, knock, cell * 0.12),
        knock,
        cell * 0.7 * (1 - 0.4 * out),
        cell * (1.1 + 1.6 * outCubic(out)),
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
  speedFan(drawn, struck, knock, 0.6, cell * 2.1, t, 0.3, 14, tones, stage.seed, forward);
  const open = (0.8 + 0.2 * outCubic(within(t, 0, 0.035))) * (1 - within(t, 0.08, 0.27));
  drawStar(drawn, along(struck, knock, cell * 0.06), cell * 1.35, thrown.spikes, tones, open, forward);
  drawStamp(drawn, struck, cell * 0.6 * (1 - within(t, 0.03, 0.16)), tones, 1, forward + 4);
  drawPressureRings(drawn, struck, cell * 2.3, tones, t, 0.24, 3, forward - 2);
  drawRinging(drawn, stage, t, tones, forward - 3);
  for (const [index, spark] of thrown.sparks.entries()) drawSpark(drawn, spark, t, cell, ramp, index, forward);
  if (t < 0.14) drawn.lights.push({ ...struck, color: tones.pale, strength: 1 * (1 - t / 0.14), reachPx: cell * 2.2 });
  return drawn;
}

/** A point on a swing a turn round from where it lands. */
function pointOn(swing: Swing, turn: number) {
  const along = Math.sin(turn) * swing.radius;
  const back = (1 - Math.cos(turn)) * swing.radius * swing.depth;
  return {
    x: swing.centre.x + swing.travel.x * along + swing.toward.x * back,
    y: swing.centre.y + swing.travel.y * along + swing.toward.y * back,
    z: Math.max(swing.lowestZ, swing.centre.z + swing.travel.z * along + swing.toward.z * back),
  };
}

/** The rings going on ringing after the blow: two hoops about the point struck, quivering in and out by turns, dying away. */
function drawRinging(drawn: Staged, stage: Stage, t: number, tones: { pale: string }, forward: number): void {
  const left = 1 - within(t, RINGS_FROM_S, RINGS_UNTIL_S);
  if (t < RINGS_FROM_S || left <= 0) return;
  const { struck } = strikeFrameOf(stage);
  for (const [ring, size] of [
    [0, 1.25],
    [1, 1.7],
  ] as const) {
    const quiver = Math.sin((t * RINGS_HZ + ring * 0.5) * Math.PI * 2);
    const wide = stage.cell * size * (1 + 0.05 * quiver * left);
    const alpha = left * (0.4 + 0.35 * quiver);
    drawn.motes.push({
      ...ball(struck, wide, ring === 0 ? '#ffffff' : tones.pale, alpha, forward + 1, 0),
      shape: 'hoop',
    });
  }
}
