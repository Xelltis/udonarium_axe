import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import { type BreathElement } from '@axe/domain/effect/scene/breath/breath-looks';
import { type Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { type EffectBlend } from '@axe/domain/effect/scene/effect-scene';
import { hueOf, type Point, wayBetween } from '@axe/domain/effect/scene/parts';

/*
 * The jet of a breath: the one unbroken body of it, from the mouth down the cone to where the stream
 * has got or to the first piece standing in its way, narrow at the mouth and widening, its far end
 * torn into licks, a pattern running down it as fast as the stream. It is laid in sheets, each a cone
 * of its own width, length and colour, the widest and coolest first and the heart, hottest at the
 * mouth, last; each is laid under the gouts of the same sheet of the stream, so the gouts and the jet
 * run together into one body. The jet is what keeps a breath one thing blown from a mouth, however
 * short it is.
 */

/** How far nearer the eye the jet is drawn, in cells. */
const NEARER_CELLS = 0.2;
/** How fast the pattern of a jet runs down it, as a share of the stream's pace. */
const FLOWS_AT = 0.7;
/** The longest a sheet is for its width at the least: a jet shorter than this is drawn narrower. */
const LONG_FOR_WIDE = 1.35;

/** One sheet of a jet, as shares of the cone's width where the jet ends and of the jet's length. */
export interface JetSheet {
  readonly shape: 'jet' | 'gust';
  readonly blend: EffectBlend;
  readonly wide: number;
  readonly long: number;
  readonly color: string;
  readonly core?: string;
  readonly alpha: number;
  /** Which sheet of the stream it is laid under the gouts of, from the widest and coolest at 0. */
  readonly pass: number;
}

const INK = '#07030c';
const SICKLY = '#7fbf2a';
const SAND_DEEP = '#3e2a18';
const SAND_UMBER = '#5c3a1a';

/** The sheets the jet of an element is laid in, what is under first. */
export function jetSheetsOf(element: BreathElement, ramp: readonly string[]): readonly JetSheet[] {
  const sheet = (
    pass: number,
    shape: JetSheet['shape'],
    blend: EffectBlend,
    wide: number,
    long: number,
    color: string,
    alpha: number,
    core?: string
  ): JetSheet => ({ pass, shape, blend, wide, long, color, alpha, core });
  switch (element) {
    case 'fire':
      return [
        sheet(0, 'gust', 'light', 1.9, 1.08, ramp[2], 0.5, ramp[3]),
        sheet(0, 'jet', 'color', 1.3, 1.03, ramp[1], 1),
        sheet(1, 'jet', 'color', 1.15, 1, ramp[2], 1),
        sheet(2, 'jet', 'color', 0.9, 0.92, ramp[3], 1),
        sheet(3, 'jet', 'color', 0.62, 0.8, ramp[4], 1),
        sheet(4, 'jet', 'color', 0.36, 0.62, ramp[5], 1, '#ffffff'),
      ];
    case 'ice':
      return [
        sheet(0, 'gust', 'light', 1.8, 1.05, ramp[2], 0.3, ramp[3]),
        sheet(0, 'gust', 'color', 1.5, 1.05, mixColor(ramp[2], '#ffffff', 0.15), 0.8),
        sheet(1, 'gust', 'color', 1.1, 1, mixColor(ramp[3], '#ffffff', 0.5), 0.85, '#ffffff'),
        sheet(2, 'jet', 'color', 0.45, 0.8, mixColor(ramp[3], '#ffffff', 0.3), 0.95, '#ffffff'),
      ];
    case 'poison':
      return [
        sheet(0, 'gust', 'color', 1.6, 1.05, mixColor(ramp[1], INK, 0.5), 0.92),
        sheet(1, 'gust', 'color', 1.15, 1, mixColor(ramp[1], ramp[2], 0.4), 0.85, mixColor(ramp[1], ramp[2], 0.8)),
        sheet(2, 'jet', 'color', 0.5, 0.8, mixColor(SICKLY, ramp[1], 0.25), 0.9, mixColor(SICKLY, '#ffffff', 0.35)),
      ];
    case 'thunder':
      return [
        sheet(0, 'gust', 'light', 1.7, 1.05, hueOf(ramp), 0.5, ramp[3]),
        sheet(2, 'jet', 'light', 0.5, 0.9, ramp[2], 0.6, ramp[5]),
      ];
    case 'wind':
      return [sheet(0, 'gust', 'color', 1.4, 1.05, mixColor(ramp[2], '#ffffff', 0.6), 0.2, '#ffffff')];
    case 'dark':
      return [
        sheet(0, 'gust', 'light', 1.9, 1.05, ramp[1], 0.45, ramp[2]),
        sheet(0, 'jet', 'color', 1.15, 1, ramp[2], 1),
        sheet(1, 'jet', 'color', 0.92, 0.94, mixColor(ramp[1], INK, 0.45), 1),
        sheet(2, 'jet', 'color', 0.68, 0.85, INK, 1, '#000000'),
      ];
    case 'sand':
      return [
        sheet(0, 'gust', 'color', 1.75, 1.05, mixColor(ramp[0], SAND_DEEP, 0.6), 0.95),
        sheet(1, 'gust', 'color', 1.25, 1, mixColor(SAND_UMBER, ramp[1], 0.4), 0.92, mixColor(ramp[1], ramp[2], 0.55)),
        sheet(2, 'jet', 'color', 0.5, 0.85, mixColor(ramp[1], ramp[2], 0.6), 0.9, mixColor(ramp[2], ramp[3], 0.4)),
      ];
    case 'holy':
      return [
        sheet(0, 'gust', 'light', 1.7, 1.05, ramp[1], 0.14, ramp[2]),
        sheet(0, 'gust', 'color', 1.35, 1.05, ramp[1], 0.3, ramp[3]),
        sheet(2, 'gust', 'light', 0.6, 0.85, ramp[2], 0.2, ramp[5]),
      ];
  }
}

/** A jet as it is at a moment. */
export interface JetPose {
  readonly mouth: Point;
  /** Where the jet ends: where the stream has got, or the piece it breaks on. */
  readonly end: Point;
  /** How wide the cone is where the jet ends, in table pixels. */
  readonly wideThere: number;
  /** How wide the cone is where it reaches, in table pixels: what the pace of the jet's pattern is told by, whatever it breaks on. */
  readonly wideAtReach: number;
  /** How hard it is blown, from 0 to 1, and how far it surges about that. */
  readonly blowing: number;
  readonly surge: number;
  /** How fast the stream runs, in table pixels a second. */
  readonly pace: number;
  readonly seconds: number;
  readonly cell: number;
  readonly seed: number;
}

/** Lays the sheets of a jet that are of one sheet of its stream. */
export function drawJet(drawn: Staged, sheets: readonly JetSheet[], pose: JetPose, pass: number): void {
  if (pose.blowing <= 0.02) return;
  const { way, length } = wayBetween(pose.mouth, pose.end);
  if (length < pose.cell * 0.15) return;
  sheets.forEach((sheet, index) => {
    if (sheet.pass !== pass) return;
    const long = length * sheet.long;
    const wide = Math.min(pose.wideThere * sheet.wide * pose.surge, long / LONG_FOR_WIDE) * (0.4 + 0.6 * pose.blowing);
    const flowed =
      (pose.seconds * pose.pace * FLOWS_AT * 1.5) / Math.max(pose.wideAtReach * sheet.wide, 1) + index * 3.7;
    drawn.motes.push({
      ...flowingMote(sheet.shape, pose.mouth, way, wide, long, flowed, {
        color: sheet.color,
        core: sheet.core,
        alpha: sheet.alpha * Math.min(1, pose.blowing * 1.6),
        blend: sheet.blend,
        forward: pose.cell * NEARER_CELLS,
        variant: (pose.seed % 13) + index * 1.9,
      }),
      exactDepth: true,
    });
  });
}
