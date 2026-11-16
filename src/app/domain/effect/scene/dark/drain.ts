import { darkStrikesAt } from '@axe/domain/effect/dark-looks';
import { beatAt, DRAIN_BEAT_MS } from '@axe/domain/effect/dark-reaction';
import {
  type Choreography,
  nothingStaged,
  outCubic,
  type Stage,
  type Staged,
  within,
} from '@axe/domain/effect/scene/choreography';
import { drawInkMotes } from '@axe/domain/effect/scene/dark/dark-drift';
import {
  type DarkTones,
  darkTonesOf,
  drawDarkBeat,
  drawDim,
  drawShards,
} from '@axe/domain/effect/scene/dark/dark-parts';
import { drawDrinker } from '@axe/domain/effect/scene/dark/drain-drinker';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectMote } from '@axe/domain/effect/scene/effect-scene';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { acrossOf, floorMark, glow, haze, type Point, wayBetween } from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';
import { chestOf, originOf } from '@axe/domain/effect/scene/shot/stream-ends';

/*
 * A draining: a theft of life. Three strands whip out from the one who drains to the target and hook
 * into it, in a black beat. Then they pull: thick ropes of crimson in a dark sheath, pale down their
 * middle, a swelling running down each from the target at every beat of the pull, and motes of the
 * target's light torn out of it and carried along them. The target stands dimmed under it, the light
 * gone out of the floor about it, wisps of its own light peeling off it to the hooks. The one who
 * drains is wreathed in what arrives, higher at every beat. At the last the strands snap at the
 * hooks and whip back into the drinker, who flares; the target is left dim, motes of grey sinking
 * about it, and the drinker glowing.
 */

const LINGER_S = SCENE_LINGER_S.drain ?? 1.2;
/** How many strands hook into a target, and how many points each is drawn through. */
const STRANDS = 3;
const POINTS = 22;
/** How far each strand bows aside and up at its middle, as shares of its length, and where on the target it hooks, in cells aside and shares of its height. */
const BOWS = [-0.17, 0.02, 0.18];
const RISES = [0.1, 0.24, 0.13];
const HOOKS_ASIDE = [-0.22, 0, 0.22];
const HOOKS_HIGH = [0.62, 0.38, 0.75];
/**
 * How far behind its middle the points of a drop a strand carries lie, in widths of the drop, and
 * how wide it is at each: a round head running ahead, drawn out to a point behind it.
 */
const DROP_BEHIND = [-0.5, -0.36, 0, 0.6, 1.4, 2.4];
const DROP_WIDTHS = [0.2, 0.72, 1, 0.82, 0.45, 0];
/** How long the strands take to whip back once they snap, in seconds. */
const WHIPS_BACK_S = 0.2;
/** The violet-black of a strand's sheath, which the deepest of the effect's colour is taken towards, and the violet of the haze about it. */
const SHEATH = '#1a0530';
const HAZE = '#4a1478';
/** The crimson the heart of a strand is taken towards, whatever the effect's colours. */
const BLOOD = '#ff1f4b';

/** The ends and the frame of the strands of one target. */
interface Strands {
  readonly from: Point;
  readonly chest: Point;
  readonly side: Point;
  readonly lift: Point;
  readonly length: number;
  readonly tall: number;
  readonly cell: number;
  /** How hard the strands are drawn taut by the pull now, from 0 to 1: the harder, the less they bow. */
  readonly taut: number;
}

/** A hard-edged bead of a colour. */
function bead(at: Point, size: number, color: string, alpha: number, forward: number, variant = 0): EffectMote {
  return { ...at, size, color, alpha, blend: 'color', shape: 'puff', variant, forward };
}

/** Where a strand hooks into the target. */
function hookOf(strands: Strands, strand: number): Point {
  const aside = HOOKS_ASIDE[strand] * strands.cell;
  return {
    x: strands.chest.x + strands.side.x * aside,
    y: strands.chest.y + strands.side.y * aside,
    z: strands.chest.z + (HOOKS_HIGH[strand] - 0.5) * strands.tall,
  };
}

/** A point of a strand, a share of the way from the drinker to its hook: bowed aside and up, and running with a slow wave. */
function strandAt(strands: Strands, strand: number, share: number, t: number, slack: number): Point {
  const hook = hookOf(strands, strand);
  const arch = Math.sin(Math.PI * share);
  const wave = Math.sin(share * 8 - t * 5 + strand * 2.1) * strands.cell * (0.06 + 0.3 * slack) * arch;
  const slackened = 1 - 0.35 * strands.taut;
  const bow = BOWS[strand] * strands.length * arch * slackened + wave;
  const rise = RISES[strand] * strands.length * arch * slackened + wave * 0.5;
  return {
    x: strands.from.x + (hook.x - strands.from.x) * share + strands.side.x * bow + strands.lift.x * rise,
    y: strands.from.y + (hook.y - strands.from.y) * share + strands.side.y * bow + strands.lift.y * rise,
    z: strands.from.z + (hook.z - strands.from.z) * share + strands.side.z * bow + strands.lift.z * rise,
  };
}

/** The strands of one target at a moment, drawn from the drinker as far as `grown` of the way: sheaths first, then bodies. */
function drawStrands(
  drawn: Staged,
  strands: Strands,
  tones: DarkTones,
  t: number,
  grown: number,
  pulled: number,
  slack: number
): void {
  if (grown <= 0.02) return;
  const { cell } = strands;
  const swollen = 1 - ((pulled * 1.25) % 1.25);
  const lines = Array.from({ length: STRANDS }, (_unused, strand) => {
    const shares = Array.from({ length: POINTS }, (_point, index) => (index / (POINTS - 1)) * grown);
    return {
      shares,
      points: shares.map((share) => strandAt(strands, strand, share, t, slack)),
      widths: shares.map((share) => {
        const bulge = pulled > 0 ? Math.exp(-Math.pow((share - swollen) / 0.11, 2)) : 0;
        const tip = grown < 1 ? Math.min(1, (grown - share) / 0.08 + 0.25) : 1;
        return cell * 0.14 * (0.7 + 0.3 * Math.sin(Math.PI * share)) * (1 + 1.5 * bulge) * tip;
      }),
    };
  });
  const sheath = mixColor(SHEATH, tones.deep, 0.3);
  const heart = mixColor(tones.edge, BLOOD, 0.55);
  for (const line of lines) {
    drawn.ribbons.push({
      points: line.points,
      widths: line.widths.map((width) => width * 3.4),
      color: HAZE,
      alpha: 0.5,
      blend: 'color',
      soft: 1,
    });
    drawn.ribbons.push({
      points: line.points,
      widths: line.widths.map((width) => width * 1.9 + 2),
      color: sheath,
      alpha: 0.95,
      blend: 'color',
      torn: 0.34,
      flowed: -t * 2.6,
    });
  }
  for (const line of lines) {
    drawn.ribbons.push({
      points: line.points,
      widths: line.widths,
      color: tones.edge,
      core: heart,
      alpha: 1,
      blend: 'color',
      torn: 0.16,
      flowed: -t * 3.4,
    });
  }
  for (const line of lines) {
    drawn.ribbons.push({
      points: line.points,
      widths: line.widths.map((width) => width * 0.34),
      color: mixColor(tones.pale, BLOOD, 0.25),
      alpha: 1,
      alphas: line.shares.map((share) => {
        const swell = pulled > 0 ? Math.exp(-Math.pow((share - swollen) / 0.1, 2)) : 0;
        return Math.min(1, 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(share * 18 + t * 14)) + 0.6 * swell);
      }),
      blend: 'color',
    });
  }
}

/**
 * The motes of the target's light carried down the strands to the drinker: each a drop of white light
 * in a skin of crimson, drawn out behind it, running down the strand over its body.
 */
function drawCarried(drawn: Staged, strands: Strands, tones: DarkTones, t: number, since: number, flowing: number) {
  if (flowing <= 0.01) return;
  const { cell } = strands;
  const skin = mixColor(tones.glow, BLOOD, 0.35);
  for (let strand = 0; strand < STRANDS; strand++) {
    for (let mote = 0; mote < 5; mote++) {
      const along = (since * 1.05 + mote / 5 + strand * 0.13) % 1;
      const share = 1 - along;
      const fade = Math.min(1, along * 7, (1 - along) * 7) * flowing;
      if (fade <= 0.01) continue;
      const wide = cell * 0.26 * (0.6 + 0.4 * fade);
      const points = DROP_BEHIND.map((behind) =>
        strandAt(strands, strand, share + (behind * wide) / strands.length, t, 0)
      );
      drawn.ribbons.push({
        points,
        widths: DROP_WIDTHS.map((width) => width * wide),
        color: skin,
        core: '#ffffff',
        alpha: fade,
        blend: 'color',
      });
    }
  }
}

/** What is done to the target while it is held: the light out of it and of the floor, and wisps of its own light peeling off it to the hooks. */
function drawDrained(
  drawn: Staged,
  stage: Stage,
  strands: Strands,
  tones: DarkTones,
  held: number,
  beat: number
): void {
  if (held <= 0.01) return;
  const { cell } = stage;
  const t = stage.seconds;
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const forward = cell * 0.4;
  drawn.floor.push(floorMark('disc', floor, cell * 1.9, 1, '#000000', 0.6 * held, 'color', 0));
  drawn.floor.push(floorMark('ring', floor, cell * (1.05 - 0.12 * beat), 0.09, tones.edge, 0.85 * held, 'color', 0));
  drawn.floor.push(floorMark('ring', floor, cell * (1.05 - 0.12 * beat), 0.04, tones.glow, 0.9 * held, 'light', 0));
  drawDim(drawn, strands.chest, Math.max(stage.tall, cell) * 2.3, (0.42 + 0.14 * beat) * held, forward);
  drawn.motes.push(haze(strands.chest, Math.max(stage.tall, cell) * 1.7, HAZE, (0.3 + 0.15 * beat) * held, forward));
  drawn.lights.push({ ...strands.chest, color: HAZE, strength: (0.5 + 0.4 * beat) * held, reachPx: cell * 2.2 });
  const next = seededRun(stage.seed * 61 + 31);
  for (let wisp = 0; wisp < 12; wisp++) {
    const turn = next() * Math.PI * 2;
    const high = next();
    const pace = 0.8 + next() * 0.9;
    const along = (t * pace + next()) % 1;
    const hook = hookOf(strands, wisp % STRANDS);
    const from = {
      x: stage.x + Math.cos(turn) * cell * 0.35,
      y: stage.y + Math.sin(turn) * cell * 0.35,
      z: stage.z + stage.tall * high,
    };
    const eased = along * along;
    const at = {
      x: from.x + (hook.x - from.x) * eased,
      y: from.y + (hook.y - from.y) * eased,
      z: from.z + (hook.z - from.z) * eased + Math.sin(along * Math.PI) * cell * 0.25,
    };
    const fade = Math.min(1, along * 6, (1 - along) * 5) * held;
    drawn.motes.push(haze(at, cell * 0.22, tones.edge, 0.8 * fade, forward + 2));
    drawn.motes.push(glow(at, cell * 0.3, tones.pale, fade, forward + 2));
    drawn.motes.push(bead(at, cell * 0.09, '#ffffff', fade, forward + 3));
  }
  for (let strand = 0; strand < STRANDS; strand++) {
    const hook = hookOf(strands, strand);
    drawn.motes.push(glow(hook, cell * (0.4 + 0.4 * beat), tones.glow, 0.9 * held, forward + 3));
    drawn.motes.push(haze(hook, cell * (0.26 + 0.12 * beat), tones.edge, held, forward + 3));
    drawn.motes.push(bead(hook, cell * 0.11, '#000000', held, forward + 4, strand + 1));
  }
}

/** A draining: see the header. */
export const drain: Choreography = {
  lingerS: LINGER_S,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell, duration } = stage;
    const t = stage.seconds;
    const ends = duration + LINGER_S;
    if (t >= ends) return drawn;
    const strikes = darkStrikesAt('drain', stage.preset.gradeLevel, duration) ?? [];
    const hooks = stage.blowsAt[0] ?? strikes[0] ?? duration * 0.13;
    const snaps = Math.max(hooks + 0.2, stage.blowsAt[1] ?? strikes[1] ?? duration * 0.62);
    const tones = darkTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
    const from = originOf(stage);
    const chest = chestOf(stage);
    const { way, length } = wayBetween(from, chest);
    const { side, lift } = acrossOf(way);
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const forward = cell * 0.4;
    const hooked = t - hooks;
    const snapped = t - snaps;
    const held = Math.min(within(t, hooks - 0.03, hooks + 0.05), 1 - within(t, snaps, snaps + 0.12));
    const pulling = hooked > 0 && snapped < 0;
    const beat = pulling ? beatAt(hooked * 1000, DRAIN_BEAT_MS) : 0;
    const pulled = pulling ? ((hooked * 1000) / DRAIN_BEAT_MS) % 1 : 0;
    const tall = Math.max(stage.tall, cell * 0.8);
    const strands: Strands = { from, chest, side, lift, length, tall, cell, taut: beat };

    const whipped = within(snapped, 0, WHIPS_BACK_S);
    const grown = snapped >= 0 ? 1 - outCubic(whipped) : outCubic(within(t, 0, hooks));
    drawStrands(drawn, strands, tones, t, grown, pulled, snapped >= 0 ? whipped : 0);
    drawCarried(drawn, strands, tones, t, Math.max(0, hooked), held * within(t, hooks, hooks + 0.2));
    drawDrained(drawn, stage, strands, tones, held, beat);

    drawDarkBeat(drawn, chest, floor, cell * 0.62, tones, hooked);
    drawShards(drawn, stage.seed, chest, floor.z, 10, cell * 0.8, hooked, tones, forward, 0.45);
    if (hooked >= 0 && hooked < 0.3) {
      drawn.lights.push({ ...chest, color: tones.edge, strength: 1.2 * (1 - hooked / 0.3), reachPx: cell * 3 });
    }

    if (snapped >= 0) {
      drawDarkBeat(drawn, chest, floor, cell * 0.55, tones, snapped, 0.08);
      drawShards(drawn, stage.seed + 3, chest, floor.z, 16, cell, snapped, tones, forward, 0.55);
      const dim = 1 - within(snapped, 0.1, Math.max(0.5, ends - snaps));
      drawn.floor.push(floorMark('disc', floor, cell * 1.7, 1, '#000000', 0.5 * dim, 'color', 0));
      drawDim(drawn, chest, Math.max(stage.tall, cell) * 2, 0.4 * dim, forward);
      drawInkMotes(
        drawn,
        stage.seed,
        floor,
        cell,
        snapped,
        tones,
        {
          count: 16,
          out: [0, cell * 0.7],
          born: [0, Math.max(0.2, ends - snaps - 1.4)],
          rise: -cell * 0.7,
          high: stage.tall * 0.9,
        },
        forward
      );
    }

    const lead = (stage.targets[0] ?? stage).index === stage.index;
    if (lead && stage.origin) {
      drawDrinker(drawn, stage, from, tones, { hooks, snaps, ends, beat });
    } else if (!stage.origin && held > 0) {
      drawn.motes.push(glow(from, cell * 1.6, tones.glow, 0.8 * held, forward));
      drawn.motes.push(bead(from, cell * (0.5 + 0.12 * beat), '#000000', held, forward, 3));
    }
    return drawn;
  },
};
