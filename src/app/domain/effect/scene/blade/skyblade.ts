import type { EffectKind } from '@axe/domain/effect/effect-kind';
import { drawBladeAura } from '@axe/domain/effect/scene/blade/blade-aura';
import { cutSparks } from '@axe/domain/effect/scene/blade/blade-trail';
import { alongBlade, greatBlade } from '@axe/domain/effect/scene/blade/great-blade';
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
  type Cloud,
  drawCloud,
  drawEmber,
  drawSpark,
  risingEmbers,
  rollingDust,
} from '@axe/domain/effect/scene/fire/fire-parts';
import { floorMark, glow, hueOf, keptFor, type Point, stageKey, throwerFor } from '@axe/domain/effect/scene/parts';

/*
 * A great sword out of the sky. A seam of light opens high over the target and a sword forms out of
 * it, point down: a real blade, edged, fullered and hilted, in the colours it was given. It hangs
 * there a beat, turning nothing but a glint that runs down its edge, motes of its light drifting up
 * about it and its shadow gathering on the floor under it; it draws up a little, trembling, and
 * drops, faster than the eye, a streak of light behind it. It stands in the ground where the target
 * is, quivering, as the look it was given to strike with goes off about it, and then breaks into
 * shards of light that rise and are gone.
 */

/** How long the sword takes to form out of its seam, at the most as a share of the time before it strikes, in seconds. */
const FORMS_S = 0.45;
const FORMS_SHARE = 0.3;
/** How long before it strikes it draws up, and how long its drop takes, in seconds. */
const DRAWS_UP_S = 0.34;
const DROPS_S = 0.13;
/** How long it stands where it struck, and how long it takes to break into light, in seconds. */
const STANDS_S = 0.8;
const BREAKS_S = 0.45;
/** How long the sword is, how high its point hangs over the floor, and how far it draws up, in cells. */
const LENGTH = 2;
const HANGS = 0.85;
const DRAWN_UP = 0.3;
/** How deep its point is driven into the floor, in cells. */
const DRIVEN = 0.26;
/** How far its hilt leans back towards its caster, as a slope, while it hangs and once it stands. */
const LEANS = 0.07;
/** How far past the target its point comes down, in cells, so the one it strikes is not hidden behind it. */
const PAST = 0.24;
/** How many shards of light it breaks into. */
const SHARDS = 18;

/** How the look it strikes with is drawn, as the table of looks drawn in the scene gives it. */
type ImpactLook = (stage: Stage) => Staged;

interface BladeThrown {
  readonly motes: readonly ThrownMote[];
  readonly sparks: readonly ThrownMote[];
  readonly dust: readonly Cloud[];
}

const thrownByStage = new Map<string, BladeThrown>();

/** The great blade, striking with the look `impactOf` gives for its preset's kind of landing, which lingers `lingerS`. */
export function skybladeWith(impactOf: ImpactLook, lingerS: number): Choreography {
  return { lingerS, draw: (stage) => drawSkyblade(stage, impactOf, lingerS) };
}

function drawSkyblade(stage: Stage, impactOf: ImpactLook, lingerS: number): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const strikes = stage.blowsAt[0] ?? duration * 0.68;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const back = backOf(stage);
  const forward = cell * 0.4;
  const length = cell * LENGTH;
  const ends = duration + lingerS;
  const breaksAt = Math.max(strikes, Math.min(strikes + STANDS_S, ends - BREAKS_S));
  const thrown = keptFor(thrownByStage, stageKey(stage, ends), () => {
    const th = throwerFor(stage, ends);
    const up = { x: 0, y: 0, z: 1 };
    return {
      motes: risingEmbers(th, { ...floor, z: floor.z + cell * (HANGS + 0.3) }, th.count(22), [0.1, strikes], 0.35),
      sparks: cutSparks(
        th,
        { ...floor, z: floor.z + cell * 0.1 },
        up,
        th.count(16),
        [4, 10],
        [strikes, strikes + 0.03]
      ),
      dust: rollingDust(throwerFor(stage, ends - strikes), floor, th.count(5), [1.5, 4], [0.35, 0.55]),
    };
  });

  const forms = Math.min(FORMS_S, strikes * FORMS_SHARE);
  const formed = outCubic(within(t, 0, forms));
  const drawsUp = within(t, strikes - DRAWS_UP_S, strikes - DROPS_S);
  const drops = within(t, strikes - DROPS_S, strikes);
  const since = t - strikes;
  const broken = within(t, breaksAt, breaksAt + BREAKS_S);
  const bob = Math.sin(t * 2.6) * 0.04 * (1 - drawsUp);
  const hung = HANGS + bob + DRAWN_UP * Math.sin((drawsUp * Math.PI) / 2);
  const high = since >= 0 ? -DRIVEN : hung + (-DRIVEN - hung) * drops * drops;
  const tremble = Math.sin(t * 83) * 0.012 * drawsUp * (1 - drops);
  const quiver = since >= 0 ? Math.sin(since * 58) * 0.05 * Math.exp(-since * 8) : 0;
  const lean = LEANS + tremble + quiver;
  const size = Math.hypot(lean, 1);
  const axis = { x: (back.x * lean) / size, y: (back.y * lean) / size, z: 1 / size };
  const tip = { x: floor.x - back.x * cell * PAST, y: floor.y - back.y * cell * PAST, z: floor.z + cell * high };

  const omen = Math.min(formed, 1 - broken);
  drawn.floor.push(
    floorMark(
      'disc',
      floor,
      cell * (0.75 - 0.25 * drops),
      1,
      '#0b0a12',
      0.45 * omen * (since >= 0 ? 0.6 : 1),
      'color',
      0
    )
  );
  for (const [index, mote] of thrown.motes.entries()) drawEmber(drawn, mote, t, cell, ramp, index, forward);

  if (broken < 1) {
    const hangs = strikes - DRAWS_UP_S - forms;
    const glint = since < 0 ? (((t - forms) / Math.max(hangs, 0.2)) * 2.2) % 1.1 : within(since, 0.12, 0.5);
    const sword = greatBlade(tip, axis, length, { ramp, alpha: 1 - broken, formed, glint, forward });
    drawn.ribbons.push(...sword.ribbons);
    drawn.motes.push(...sword.motes);
    drawn.lights.push({
      ...alongBlade(tip, axis, length, 0.4),
      color: ramp[4],
      strength: 0.3 * formed * (1 - broken),
      reachPx: cell * 3,
    });
    const waits = formed * (1 - drops) * (since >= 0 ? 0 : 1);
    drawBladeAura(drawn, strikesWith(stage), { tip, axis, length }, cell, ramp, t, stage.seed, waits, forward);
    if (formed < 1) drawSeam(drawn, tip, axis, length, ramp, formed, forward);
    if (drops > 0 && since < 0.12) drawStreak(drawn, tip, axis, length, cell, ramp, since < 0 ? 1 : 1 - since / 0.12);
  }
  if (broken > 0) drawShards(drawn, tip, axis, length, cell, ramp, t - breaksAt, stage.seed, forward);

  if (since >= 0) {
    const flash = 1 - within(since, 0, 0.16);
    if (flash > 0)
      drawn.motes.push(glow({ ...floor, z: floor.z + cell * 0.3 }, cell * 1.3, ramp[4], 0.45 * flash, forward * 2));
    const cracked = 1 - within(t, breaksAt, breaksAt + BREAKS_S + 0.4);
    drawn.floor.push(
      floorMark(
        'cracks',
        floor,
        cell * 0.9 * outCubic(within(since, 0, 0.1)),
        0.3,
        '#1c1712',
        0.7 * cracked,
        'color',
        stage.seed % 89,
        stage.seed
      )
    );
    for (const [index, spark] of thrown.sparks.entries()) drawSpark(drawn, spark, t, cell * 0.8, ramp, index, forward);
    for (const cloud of thrown.dust) drawCloud(drawn, cloud, since, cell, forward);
    const impact = impactOf({ ...stage, seconds: since, duration: Math.max(0.4, duration - strikes), blowsAt: [0] });
    drawn.motes.push(...impact.motes);
    drawn.ribbons.push(...impact.ribbons);
    drawn.floor.push(...impact.floor);
    drawn.lights.push(...impact.lights);
  }
  return drawn;
}

/** The kind of look the sword strikes with, which tells what hangs about it while it waits. */
function strikesWith(stage: Stage): EffectKind {
  return stage.preset.impactEffectKind;
}

/** The way back from the target to the caster over the floor, of length one; to the south for one cast from nowhere. */
function backOf(stage: Stage): { readonly x: number; readonly y: number } {
  const dx = stage.origin ? stage.origin.x - stage.x : 0;
  const dy = stage.origin ? stage.origin.y - stage.y : 1;
  const far = Math.hypot(dx, dy);
  return far < 1 ? { x: 0, y: 1 } : { x: dx / far, y: dy / far };
}

/** The seam of light the sword forms out of: a line down its length, and sparks of it flying in to the blade. */
function drawSeam(
  drawn: Staged,
  tip: Point,
  axis: Point,
  length: number,
  ramp: readonly string[],
  formed: number,
  forward: number
): void {
  drawn.ribbons.push({
    points: [
      alongBlade(tip, axis, length, -0.06),
      alongBlade(tip, axis, length, 0.5),
      alongBlade(tip, axis, length, 1.04),
    ],
    widths: [0, length * 0.05 * (1 - formed), 0],
    color: ramp[4],
    core: '#ffffff',
    alpha: 1 - formed * formed,
    blend: 'light',
  });
  for (let index = 0; index < 12; index++) {
    const at = alongBlade(tip, axis, length, 0.05 + (index / 12) * 0.85);
    const turn = index * 2.4;
    const out = length * 0.4 * (1 - formed);
    const speed = length * 2.2;
    drawn.motes.push({
      ...glow(
        { x: at.x + Math.cos(turn) * out, y: at.y + Math.sin(turn) * out, z: at.z },
        length * 0.022,
        ramp[5],
        1 - formed,
        forward
      ),
      shape: 'spark',
      velocity: { x: -Math.cos(turn) * speed, y: -Math.sin(turn) * speed, z: 0 },
      trail: 0.05,
    });
  }
}

/** The streak of light behind the sword as it drops: a band up from its pommel, and lines racing down beside it. */
function drawStreak(
  drawn: Staged,
  tip: Point,
  axis: Point,
  length: number,
  cell: number,
  ramp: readonly string[],
  alpha: number
): void {
  drawn.ribbons.push({
    points: [alongBlade(tip, axis, length, 0.3), alongBlade(tip, axis, length, 1), alongBlade(tip, axis, length, 1.9)],
    widths: [length * 0.13, length * 0.1, 0],
    color: hueOf(ramp),
    core: ramp[4],
    alpha: 0.6 * alpha,
    alphas: [0.5, 1, 0],
    blend: 'light',
    soft: 0.7,
  });
  for (let index = 0; index < 8; index++) {
    const turn = index * 0.9;
    const at = alongBlade(tip, axis, length, 0.5 + ((index * 5) % 8) * 0.14);
    drawn.motes.push({
      ...glow(
        { x: at.x + Math.cos(turn) * cell * 0.45, y: at.y + Math.sin(turn) * cell * 0.45, z: at.z },
        cell * 0.035,
        ramp[5],
        alpha,
        0
      ),
      shape: 'spark',
      velocity: { x: 0, y: 0, z: -cell * 22 },
      trail: 0.035,
    });
  }
}

/** The shards of light the sword breaks into: flakes loosed all along it, rising, turning and twinkling out. */
function drawShards(
  drawn: Staged,
  tip: Point,
  axis: Point,
  length: number,
  cell: number,
  ramp: readonly string[],
  since: number,
  seed: number,
  forward: number
): void {
  for (let index = 0; index < SHARDS; index++) {
    const born = (((index * 7 + seed) % SHARDS) / SHARDS) * 0.3;
    const age = (since - born) / 0.9;
    if (age <= 0 || age >= 1) continue;
    const at = alongBlade(tip, axis, length, 0.12 + (index / SHARDS) * 0.8);
    const turn = index * 2.4 + seed;
    const out = cell * 0.5 * outCubic(age);
    drawn.motes.push({
      x: at.x + Math.cos(turn) * out,
      y: at.y + Math.sin(turn) * out,
      z: at.z + cell * 0.9 * age,
      size: cell * (0.1 + 0.05 * (index % 3)),
      color: index % 2 === 0 ? ramp[4] : ramp[3],
      alpha: (1 - age) * (0.6 + 0.4 * Math.sin(since * 23 + index * 2.1)),
      blend: 'light',
      shape: 'flake',
      spin: since * (4 + (index % 3)) + index,
      variant: index,
      forward,
    });
  }
}
