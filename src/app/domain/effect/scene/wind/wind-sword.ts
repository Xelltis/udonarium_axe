import type { LightBladeLook } from '@axe/domain/effect/scene/blade/light-blade';
import type { SwordPaint } from '@axe/domain/effect/scene/blade/sword-paint';
import { alongTorrent, type SwordPose, underTorrent, upBlade } from '@axe/domain/effect/scene/blade/sword-pose';
import { type TorrentLook, torrentWidthAt } from '@axe/domain/effect/scene/blade/sword-torrent';
import type { WakeLook } from '@axe/domain/effect/scene/blade/sword-wake';
import type { Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { type Point, smokePuff } from '@axe/domain/effect/scene/parts';
import {
  curlRibbon,
  debrisKindOf,
  debrisRibbon,
  halvesOf,
  layRibbons,
  scatter,
  windPaintOf,
} from '@axe/domain/effect/scene/wind/wind-parts';

/*
 * The great sword of wind. Its blade is a column of wind: bands of it spiral up the blade round and
 * round, the far half of each behind the blade and the near half before it, carrying leaves up with
 * them. Its torrent is a cyclone laid on its side, bands of wind corkscrewing along it from the
 * wielder through the target, leaves and stones whirled along in them and the dust of the floor torn
 * up off both its sides. What it leaves is curls of wind turning along its path, and leaves coming
 * down.
 *
 * Every length is in cells.
 */

/** How many bands spiral up the blade, how many points each is drawn through, and how many turns each makes. */
const BLADE_BANDS = 3;
const BLADE_POINTS = 18;
const BLADE_TURNS = 2.6;
/** How many bands corkscrew along the torrent, how many points each is drawn through, and how far apart its turns are, in cells. */
const TORRENT_BANDS = 2;
const TORRENT_POINTS = 64;
const TURN_CELLS = 4.2;
/** How fast the bands of the torrent turn about it, in radians a second. */
const TORRENT_TURNS = 6.5;

/** Two ways square to a way and to each other, of length one: one level where it can be, and one over it. */
function squareTo(way: Point): { readonly a: Point; readonly b: Point } {
  const flat = Math.hypot(way.x, way.y);
  const a = flat > 0.01 ? { x: -way.y / flat, y: way.x / flat, z: 0 } : { x: 1, y: 0, z: 0 };
  const b = { x: way.y * a.z - way.z * a.y, y: way.z * a.x - way.x * a.z, z: way.x * a.y - way.y * a.x };
  return { a, b: b.z < 0 ? { x: -b.x, y: -b.y, z: -b.z } : b };
}

/** A band of wind wound about points along a way, as its two halves, in the sword's own sea-green and white. */
function woundBand(
  points: readonly Point[],
  about: readonly Point[],
  wide: readonly number[],
  alpha: number,
  paint: SwordPaint,
  flowed: number
): EffectRibbon[] {
  const wind = windPaintOf(paint.ramp);
  const alphas = points.map((_point, index) => Math.min(1, index / 3, (points.length - 1 - index) / 3));
  const halves = halvesOf(
    {
      points,
      widths: wide,
      color: paint.sheath,
      core: '#ffffff',
      alpha,
      alphas,
      blend: 'color',
      torn: 0.4,
      soft: 0.2,
      flowed,
    },
    about,
    wind.shadow
  );
  return [halves.far, halves.near];
}

/**
 * The wind wound up the blade of a great sword of wind, and the leaves it carries up, about a blade
 * as wide a share of the way up it as `wideAt` gives; see the head of this file.
 */
export function dressWindBlade(
  drawn: Staged,
  pose: SwordPose,
  paint: SwordPaint,
  heading: Point,
  look: LightBladeLook,
  wideAt: (share: number) => number
): void {
  const { grown, seconds: t, seed } = look;
  const U = pose.cell;
  const alpha = look.alpha * Math.min(1, grown * 2);
  if (alpha <= 0.01) return;
  const { a, b } = squareTo(heading);
  const far: EffectRibbon[] = [];
  const near: EffectRibbon[] = [];
  for (let band = 0; band < BLADE_BANDS; band++) {
    const shares = Array.from({ length: BLADE_POINTS }, (_unused, index) => (index / (BLADE_POINTS - 1)) * 1.08);
    const about = shares.map((share) => upBlade(pose, heading, share * grown));
    const points = shares.map((share, index) => {
      const turn = -t * 9 + band * ((Math.PI * 2) / BLADE_BANDS) + share * Math.PI * 2 * BLADE_TURNS;
      const out = wideAt(Math.min(1, share)) * 0.62 + U * 0.22;
      const at = about[index];
      return {
        x: at.x + (a.x * Math.cos(turn) + b.x * Math.sin(turn)) * out,
        y: at.y + (a.y * Math.cos(turn) + b.y * Math.sin(turn)) * out,
        z: at.z + (a.z * Math.cos(turn) + b.z * Math.sin(turn)) * out,
      };
    });
    const wide = shares.map((share) => U * 0.24 * Math.pow(Math.sin(Math.PI * Math.min(1, share / 1.08)), 0.5));
    const [behind, before] = woundBand(points, about, wide, alpha, paint, t * 6 + band);
    far.push(behind);
    near.push(before);
  }
  layRibbons(drawn, far);
  layRibbons(drawn, near);
  for (let leaf = 0; leaf < 10; leaf++) {
    const share = ((t * (0.5 + 0.3 * scatter(leaf, seed + 1)) + scatter(leaf, seed)) % 1) * grown;
    const turn = -t * 9 + leaf * 2.4 + share * Math.PI * 2 * BLADE_TURNS;
    const out = wideAt(Math.min(1, share)) * 0.7 + U * 0.3;
    const at = upBlade(pose, heading, share);
    drawn.ribbons.push(
      debrisRibbon({
        kind: debrisKindOf(leaf * 7),
        at: {
          x: at.x + (a.x * Math.cos(turn) + b.x * Math.sin(turn)) * out,
          y: at.y + (a.y * Math.cos(turn) + b.y * Math.sin(turn)) * out,
          z: at.z + (a.z * Math.cos(turn) + b.z * Math.sin(turn)) * out,
        },
        size: U * (0.22 + 0.08 * scatter(leaf, seed + 2)),
        turn: turn * 1.5,
        tip: t * 5 + leaf,
        alpha: alpha * Math.min(1, (1 - share / Math.max(grown, 0.01)) * 5),
        variant: leaf + seed,
      })
    );
  }
}

/** The cyclone the torrent of a great sword of wind is; see the head of this file. */
export function drawWindTorrent(drawn: Staged, pose: SwordPose, paint: SwordPaint, look: TorrentLook): void {
  const U = pose.cell;
  const { since, seed } = look;
  if (look.head - look.tail < U * 0.4 || look.alpha <= 0.01) return;
  const side = { x: -pose.way.y, y: pose.way.x, z: 0 };
  const far: EffectRibbon[] = [];
  const near: EffectRibbon[] = [];
  const around = (by: number, turn: number, out: number): Point => {
    const middle = alongTorrent(pose, by);
    return {
      x: middle.x + side.x * Math.cos(turn) * out,
      y: middle.y + side.y * Math.cos(turn) * out,
      z: Math.max(pose.floorZ + U * 0.05, middle.z + Math.sin(turn) * out * 0.85),
    };
  };
  const wind = windPaintOf(paint.ramp);
  for (let band = 0; band < TORRENT_BANDS; band++) {
    const bys = Array.from(
      { length: TORRENT_POINTS },
      (_unused, index) => look.tail + ((look.head - look.tail) * index) / (TORRENT_POINTS - 1)
    );
    const about = bys.map((by) => alongTorrent(pose, by));
    const points = bys.map((by) =>
      around(
        by,
        since * TORRENT_TURNS + band * ((Math.PI * 2) / TORRENT_BANDS) + (by / (U * TURN_CELLS)) * Math.PI * 2,
        torrentWidthAt(pose, look, by) * 0.6 + U * 0.12
      )
    );
    const wide = bys.map((by) => U * 0.46 * Math.min(1, torrentWidthAt(pose, look, by) / (pose.thick * 0.5)));
    const alphas = points.map((_point, index) => Math.min(1, index / 3, (points.length - 1 - index) / 3));
    const sheath = halvesOf(
      {
        points,
        widths: wide.map((width) => width * 1.6),
        color: mixColor(wind.shadow, paint.rim, 0.5),
        alpha: 0.9 * look.alpha,
        alphas,
        blend: 'color',
        torn: 0.3,
        soft: 0.2,
        flowed: since * 8 + band,
      },
      about,
      wind.shadow,
      0.75
    );
    const body = halvesOf(
      {
        points,
        widths: wide,
        color: mixColor(paint.sheath, paint.body, 0.35),
        core: '#ffffff',
        alpha: look.alpha,
        alphas,
        blend: 'color',
        torn: 0.3,
        soft: 0.12,
        flowed: since * 12 + band,
      },
      about,
      wind.shadow,
      0.75
    );
    far.push(sheath.far, body.far);
    near.push(sheath.near, body.near);
  }
  layRibbons(drawn, far);
  layRibbons(drawn, near);
  for (let index = 0; index < 18; index++) {
    const share = (scatter(index, seed + 32) + since * 1.1) % 1;
    const by = look.tail + (look.head - look.tail) * share;
    const out = torrentWidthAt(pose, look, by) * (0.4 + 0.3 * scatter(index, seed + 33));
    drawn.ribbons.push(
      debrisRibbon({
        kind: debrisKindOf(index),
        at: around(by, since * 18 + index * 1.7, out),
        size: U * (0.24 + 0.1 * scatter(index, seed + 34)),
        turn: since * 12 + index,
        tip: since * 9 + index,
        alpha: look.alpha * Math.min(1, share * 6, (1 - share) * 4),
        variant: index + seed,
      })
    );
  }
  const dust = mixColor(windPaintOf(paint.ramp).dust, paint.ramp[2], 0.15);
  for (let index = 0; index < 12; index++) {
    const age = (since / 0.6 + scatter(index, seed + 35)) % 1;
    const by = look.tail + (look.head - look.tail) * scatter(index, seed + 36);
    const edge = (index % 2 === 0 ? 1 : -1) * torrentWidthAt(pose, look, by) * (0.55 + 0.4 * age);
    const floor = underTorrent(pose, by, edge);
    drawn.motes.push(
      smokePuff(
        { ...floor, z: floor.z + U * (0.2 + 0.9 * age) },
        U * (0.6 + 0.8 * age),
        dust,
        0.5 * look.alpha * Math.min(1, age * 5, (1 - age) * 2),
        U * 0.35
      )
    );
  }
}

/** What a torrent of wind leaves along its path: curls of wind turning on the floor and leaves coming down. */
export function drawWindWake(drawn: Staged, pose: SwordPose, paint: SwordPaint, look: WakeLook): void {
  const U = pose.cell;
  const since = look.seconds - look.timing.releasesAt;
  if (since <= 0.2) return;
  const wind = windPaintOf(paint.ramp);
  const left = look.clearing * Math.min(1, (since - 0.2) * 3);
  for (let curl = 0; curl < 7; curl++) {
    const by = pose.runs * (0.08 + 0.85 * scatter(curl, look.seed + 61));
    const at = underTorrent(pose, by, (scatter(curl, look.seed + 62) - 0.5) * pose.thick * 0.8);
    const fades = 1 - Math.min(1, Math.max(0, since - 0.8 - curl * 0.1) / 1.2);
    drawn.ribbons.push(
      curlRibbon(
        { ...at, z: at.z + U * 0.05 },
        U * 0.55,
        since * 4 + curl,
        U * 0.14,
        0.8 * left * fades,
        wind,
        curl % 2 === 0 ? 1 : -1
      )
    );
  }
  for (let leaf = 0; leaf < 12; leaf++) {
    const born = 0.1 + scatter(leaf, look.seed + 63) * 0.6;
    const age = (since - born) / 1.6;
    if (age <= 0 || age >= 1) continue;
    const by = pose.runs * (0.1 + 0.8 * scatter(leaf, look.seed + 64));
    const floor = underTorrent(pose, by, (scatter(leaf, look.seed + 65) - 0.5) * pose.thick * 1.4);
    drawn.ribbons.push(
      debrisRibbon({
        kind: 'leaf',
        at: { x: floor.x + Math.sin(age * 9 + leaf) * U * 0.3, y: floor.y, z: floor.z + U * (0.05 + 1.6 * (1 - age)) },
        size: U * (0.2 + 0.08 * scatter(leaf, look.seed + 66)),
        turn: age * 12 + leaf,
        tip: Math.sin(age * 10 + leaf) * 0.9,
        alpha: look.clearing * Math.min(1, (1 - age) * 5),
        variant: leaf + look.seed,
      })
    );
  }
}
