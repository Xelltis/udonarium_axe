import { clamp } from '@axe/core/util/clamp';
import type { BladeTones } from '@axe/domain/effect/scene/blade/blade-tones';
import { type Swing, swingPoint } from '@axe/domain/effect/scene/blade/crescent';
import type { EffectMote, EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { ball } from '@axe/domain/effect/scene/parts';

/*
 * The arc a heavy blunt weapon leaves as it is swung, which no blade leaves: a smear with hard edges,
 * as wide as the weapon's head where it ends and drawn back from it to a point, so it reads as a mass
 * dragged through the air rather than an edge. A near black rim holds it over a bright table, an edge
 * of the blow's colour lies within that, the smear itself is pale and white at its heart, and a hard
 * white line runs along the outside of its bow, the side it is driven on. Behind it hang afterimages of the band, each
 * further out and fainter, and copies of the weapon's head stand along it where the head has just
 * been, each smaller and fainter, as the eye keeps them.
 */

/** How a blunt arc is drawn: its colours, how thick it is at its head, in table pixels, and how far gone it is. */
export interface BluntLook {
  readonly tones: BladeTones;
  readonly thick: number;
  readonly alpha: number;
  /** How far it has faded since the blow, from 0 whole to 1 gone. */
  readonly spent: number;
  /** How many afterimages of the band hang behind it, and how many copies of the head stand along it. */
  readonly ghosts: number;
  readonly heads: number;
  readonly forward: number;
}

const STEPS = 16;
/** How wide the band is at its tail, against its head, and how sharply it widens. */
const TAIL_WIDE = 0.06;
const WIDENS = 0.5;
/** How far behind the band each afterimage hangs, in radians, and how much further out each is. */
const GHOST_LAGS = 0.22;
const GHOST_OUT = 0.07;
/** How far apart along the arc the copies of the head stand, in radians. */
const HEADS_APART = 0.34;

/** How wide the band is a share of the way from its tail to its head. */
function wideAt(share: number): number {
  return TAIL_WIDE + (1 - TAIL_WIDE) * Math.pow(share, WIDENS);
}

/** The bands of a blunt arc between two turns of a swing, the head at the later; see the head of this file. */
export function bluntArcRibbons(swing: Swing, tail: number, head: number, look: BluntLook): EffectRibbon[] {
  const spent = clamp(look.spent, 0, 1);
  const from = tail + (head - tail) * 0.85 * Math.pow(spent, 0.9);
  if (Math.abs(head - from) < 0.03 || spent >= 1 || look.alpha <= 0.01) return [];
  const { tones } = look;
  const alpha = look.alpha * (1 - Math.pow(spent, 2.2));
  const thick = look.thick * (1 - 0.35 * spent);
  const shares = Array.from({ length: STEPS + 1 }, (_unused, index) => index / STEPS);
  const widths = shares.map((share) => thick * wideAt(share));
  const arc = (of: Swing, to: number, inward = 0) =>
    shares.map((share, index) => swingPoint(of, from + (to - from) * share, widths[index] * inward));
  const ribbons: EffectRibbon[] = [];
  for (let ghost = Math.round(look.ghosts); ghost >= 1; ghost--) {
    const lagging = head - (head - from) * Math.min(0.6, GHOST_LAGS * ghost);
    const out = { ...swing, radius: swing.radius * (1 + GHOST_OUT * ghost) };
    const points = arc(out, lagging);
    const faint = alpha * (0.5 - 0.12 * ghost);
    ribbons.push(
      { points, widths: widths.map((width) => width + thick * 0.16), color: tones.rim, alpha: faint, blend: 'color' },
      { points, widths, color: tones.body, alpha: faint, blend: 'color' }
    );
  }
  const middle = arc(swing, head);
  ribbons.push(
    { points: middle, widths: widths.map((width) => width + thick * 0.24), color: tones.rim, alpha, blend: 'color' },
    { points: middle, widths: widths.map((width) => width + thick * 0.08), color: tones.body, alpha, blend: 'color' },
    {
      points: arc(swing, head, 0.06),
      widths: widths.map((width) => width * 0.74),
      color: tones.pale,
      core: '#ffffff',
      alpha,
      blend: 'color',
    },
    {
      points: arc(swing, head, -0.38),
      widths: widths.map((width) => width * 0.16),
      color: '#ffffff',
      alpha,
      blend: 'color',
    }
  );
  return ribbons;
}

/**
 * Copies of the weapon's head standing along a blunt arc behind where its head is now, each the
 * outline of the head as the eye keeps it, a white hoop within a near black one, smaller and fainter
 * the further behind; see the head of this file.
 */
export function bluntHeads(swing: Swing, tail: number, head: number, look: BluntLook): EffectMote[] {
  const alpha = look.alpha * (1 - clamp(look.spent * 1.8, 0, 1));
  if (alpha <= 0.02) return [];
  const motes: EffectMote[] = [];
  for (let copy = 1; copy <= look.heads; copy++) {
    const turn = head - HEADS_APART * copy;
    if (turn <= tail) break;
    const at = swingPoint(swing, turn);
    const size = look.thick * (0.78 - 0.1 * copy);
    const faint = alpha * (0.95 - 0.18 * copy);
    motes.push({ ...ball(at, size * 1.06, look.tones.rim, faint, look.forward + 2, 0), shape: 'hoop' });
    motes.push({ ...ball(at, size, '#ffffff', faint, look.forward + 3, 0), shape: 'hoop' });
  }
  return motes;
}
