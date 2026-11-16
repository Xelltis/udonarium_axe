import { clamp } from '@axe/core/util/clamp';
import type { BladeTones } from '@axe/domain/effect/scene/blade/blade-tones';
import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import type { Staged } from '@axe/domain/effect/scene/choreography';
import type { EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import type { Point } from '@axe/domain/effect/scene/parts';
import { scatter } from '@axe/domain/effect/scene/wind/wind-parts';

/*
 * The crescent a blade leaves in the air, which is what a cut is seen by. It lies along the arc the
 * blade's tip went, thick at its belly and drawn to needle points at both ends: a dark rim about it so
 * it holds over a bright table, a body of the blade's full colour, a paler band within that, and a
 * white-hot inner edge on the side of the one who swings; a glow about all of it. Behind it hang
 * afterimages of itself, each wider and dimmer; lines of speed run along the sweep inside and outside
 * it; and the air is torn off its leading point in shreds. Once the blade has passed it hangs and
 * dissolves from its tail to its head, thinning and fraying as it goes.
 */

/** The arc a blade's tip is swung along, through what it cuts and bowed back towards the one who swings it. */
export interface Swing {
  /** Where it crosses what it cuts, in table pixels. */
  readonly centre: Point;
  /** The way the tip goes as it crosses, of length one. */
  readonly travel: Point;
  /** The way back to the one who swings, of length one and square to the way the tip goes. */
  readonly toward: Point;
  /** How far the arc reaches either side of where it crosses, in table pixels. */
  readonly radius: number;
  /** How deep the arc bows back, as a share of its reach. */
  readonly depth: number;
  /** The turns the swing starts and ends at, in radians either side of where it crosses. */
  readonly from: number;
  readonly to: number;
  /** The lowest the tip goes, in table pixels up. */
  readonly lowestZ: number;
}

/** How a crescent is drawn: its colours, how thick it is at its belly, in table pixels, and how far gone it is. */
export interface CrescentLook {
  readonly tones: BladeTones;
  readonly thick: number;
  readonly alpha: number;
  /** How far it has dissolved since the blade passed, from 0 as it stops to 1 gone. */
  readonly spent: number;
  /** How far the tears of its edge have run down it, in widths. */
  readonly flowed: number;
  /** How many afterimages hang behind it. */
  readonly ghosts: number;
  /** Whether its white-hot edge is on the outside of its bow, as that of a crescent thrown through the air is; inside it without. */
  readonly leads?: boolean;
  /** How much further its dark rim stands out about its body, as a share of how thick it is; a thin rim without. */
  readonly rim?: number;
}

const STEPS = 22;
/** How far behind the crescent each afterimage hangs, in radians, and how much further out and wider each is than the last. */
const GHOST_LAGS = 0.2;
const GHOST_OUT = 0.1;
const GHOST_WIDER = 0.3;

/** A point of a swing a turn round from where it crosses, set in from the arc towards the inside of its bow. */
export function swingPoint(swing: Swing, turn: number, inward = 0): Point {
  const { centre, travel, toward, radius, depth } = swing;
  const along = Math.sin(turn) * radius;
  const back = (1 - Math.cos(turn)) * radius * depth;
  const inAlong = -depth * Math.sin(turn);
  const inBack = Math.cos(turn);
  const size = Math.hypot(inAlong, inBack) || 1;
  const a = along + (inAlong / size) * inward;
  const b = back + (inBack / size) * inward;
  return {
    x: centre.x + travel.x * a + toward.x * b,
    y: centre.y + travel.y * a + toward.y * b,
    z: Math.max(swing.lowestZ, centre.z + travel.z * a + toward.z * b),
  };
}

/** How wide a crescent is along it: a long needle from its tail, its belly behind its head, and a short needle to its head. */
function belly(share: number): number {
  return Math.pow(Math.sin(Math.PI * Math.pow(share, 1.5)), 1.35);
}

/**
 * The crescent of a swing between two turns, the blade at the later; see the head of this file. As
 * it is spent its tail runs up towards its head, it thins and frays, and at the last it fades.
 */
export function crescentRibbons(swing: Swing, tail: number, head: number, look: CrescentLook): EffectRibbon[] {
  const spent = clamp(look.spent, 0, 1);
  const from = tail + (head - tail) * 0.8 * Math.pow(spent, 0.9);
  if (Math.abs(head - from) < 0.03 || spent >= 1 || look.alpha <= 0.01) return [];
  const { tones } = look;
  const alpha = look.alpha * (1 - Math.pow(spent, 2.5));
  const thick = look.thick * (1 - 0.55 * spent);
  const torn = 0.12 + 0.6 * spent;
  const shares = Array.from({ length: STEPS + 1 }, (_unused, index) => index / STEPS);
  const wide = shares.map((share) => thick * belly(share));
  const arc = (of: Swing, to: number, inward: number, widths: readonly number[] = wide) =>
    shares.map((share, index) => swingPoint(of, from + (to - from) * share, widths[index] * inward));
  const hotAt = look.leads ? -1 : 1;
  const ribbons: EffectRibbon[] = [];
  for (let ghost = Math.round(look.ghosts); ghost >= 1; ghost--) {
    const lagging = head - (head - from) * Math.min(0.7, GHOST_LAGS * ghost);
    const out = { ...swing, radius: swing.radius * (1 + GHOST_OUT * ghost) };
    const widths = wide.map((width) => width * (1 + GHOST_WIDER * ghost));
    const points = arc(out, lagging, 0.5, widths);
    const faint = alpha * (0.62 - 0.17 * ghost);
    ribbons.push(
      { points, widths: widths.map((width) => width * 1.1), color: tones.rim, alpha: faint * 0.45, blend: 'color' },
      {
        points,
        widths,
        color: tones.body,
        core: ghost === 1 ? tones.pale : undefined,
        leans: 0.5 * hotAt,
        alpha: faint,
        blend: 'color',
        torn: 0.55,
        soft: 0.25,
        flowed: look.flowed + ghost * 2.1,
      }
    );
  }
  const middle = arc(swing, head, 0.5);
  ribbons.push(
    {
      points: middle,
      widths: wide.map((width) => width * 2.6),
      color: tones.glow,
      alpha: 0.3 * alpha,
      blend: 'light',
      soft: 1,
    },
    {
      points: middle,
      widths: wide.map((width) => width * 1.16 + thick * (0.05 + (look.rim ?? 0)) * Math.min(1, (width / thick) * 4)),
      color: tones.rim,
      alpha: 0.9 * alpha,
      blend: 'color',
      torn: torn * 0.5,
      flowed: look.flowed,
    },
    {
      points: middle,
      widths: wide,
      color: tones.body,
      core: tones.pale,
      leans: 0.55 * hotAt,
      alpha,
      blend: 'color',
      torn,
      flowed: look.flowed,
    },
    {
      points: arc(swing, head, look.leads ? 0.2 : 0.8),
      widths: wide.map((width) => width * 0.34),
      color: tones.hot,
      core: '#ffffff',
      alpha,
      blend: 'color',
      torn: 0.3 + torn * 0.6,
      flowed: look.flowed * 1.3 + 2,
    },
    {
      points: arc(swing, head, look.leads ? 0.2 : 0.8),
      widths: wide.map((width) => width * 0.7),
      color: tones.pale,
      alpha: 0.4 * alpha,
      blend: 'light',
      soft: 1,
    }
  );
  return ribbons;
}

/**
 * Lines of speed along the sweep of a swing between two turns: thin bands lying along the arc,
 * outside it and in, each over its own stretch of it, which fade as the crescent is spent.
 */
export function speedLines(
  swing: Swing,
  tail: number,
  head: number,
  look: CrescentLook,
  cell: number,
  seed: number,
  count = 9
): EffectRibbon[] {
  const alpha = look.alpha * (1 - clamp(look.spent * 1.6, 0, 1));
  if (alpha <= 0.02 || Math.abs(head - tail) < 0.1) return [];
  const ribbons: EffectRibbon[] = [];
  for (let line = 0; line < count; line++) {
    const starts = tail + (head - tail) * 0.5 * scatter(line, seed + 1);
    const ends = Math.min(head, starts + (head - tail) * (0.35 + 0.45 * scatter(line, seed + 2)));
    const outside = line % 3 !== 0;
    const inward =
      look.thick * (outside ? -0.25 - 0.9 * scatter(line, seed + 3) : 1.15 + 0.5 * scatter(line, seed + 3));
    const points = [0, 0.25, 0.5, 0.75, 1].map((share) => swingPoint(swing, starts + (ends - starts) * share, inward));
    const fine = cell * (0.035 + 0.035 * scatter(line, seed + 4));
    ribbons.push({
      points,
      widths: [0, fine * 0.6, fine, fine * 0.8, 0],
      color: line % 2 === 0 ? '#ffffff' : look.tones.pale,
      alpha: 0.9 * alpha,
      blend: 'color',
    });
  }
  return ribbons;
}

/** The air torn off the leading point of a blade as it swings: shreds flung on the way it is going, off its tip. */
export function drawTipShreds(
  drawn: Staged,
  swing: Swing,
  head: number,
  look: CrescentLook,
  cell: number,
  seconds: number,
  seed: number
): void {
  const alpha = look.alpha * (1 - clamp(look.spent * 2.5, 0, 1));
  if (alpha <= 0.02) return;
  const tip = swingPoint(swing, head - 0.1, look.thick * 0.4);
  const ahead = swingPoint(swing, head + 0.05, look.thick * 0.4);
  const way = { x: ahead.x - tip.x, y: ahead.y - tip.y, z: ahead.z - tip.z };
  const size = Math.hypot(way.x, way.y, way.z) || 1;
  for (let shred = 0; shred < 5; shred++) {
    const spread = (scatter(shred, seed + 5) - 0.65) * 1.2;
    const lean = {
      x: way.x / size - swing.toward.x * spread,
      y: way.y / size - swing.toward.y * spread,
      z: Math.max(0.1, way.z / size + (scatter(shred, seed + 6) - 0.4) * 0.5),
    };
    drawn.motes.push(
      flowingMote(
        'lick',
        tip,
        lean,
        look.thick * (0.3 + 0.2 * scatter(shred, seed + 7)),
        look.thick * (1.1 + 1.3 * scatter(shred, seed + 8)),
        seconds * 9 + shred,
        {
          color: shred % 2 === 0 ? look.tones.body : look.tones.pale,
          core: shred % 2 === 0 ? look.tones.hot : undefined,
          alpha,
          forward: cell * 0.5,
          variant: shred + (seed % 11),
        }
      )
    );
  }
}
