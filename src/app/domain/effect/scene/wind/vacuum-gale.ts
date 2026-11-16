import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import { type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { floorMark, glow, type Point } from '@axe/domain/effect/scene/parts';
import {
  debrisKindOf,
  debrisRibbon,
  halvesOf,
  layRibbons,
  scatter,
  smooth,
  type WindPaint,
} from '@axe/domain/effect/scene/wind/wind-parts';

/*
 * The gale a wave of the void leaves slicing at its target once it has burst. Sickles of wind go on
 * whirling round the piece, each on its own tipped orbit so that they cross one another like blades
 * swung from every side, white in the middle within a slate sheath, the half of each behind the piece
 * laid before the half in front of it. Each time one passes it leaves a cut hanging in the air, a thin
 * white line through the piece that parts and fades. Leaves and dust are carried round in it and a
 * skirt of dust wheels about the piece's feet. As the sound dies the gale slows and spreads, the
 * blades thin away, what it carried is let go to fall and lie, and swept dust is left on the floor.
 * It stays low about the piece: a gale of blades rather than a funnel.
 *
 * Every length is in cells.
 */

/** How long the gale takes to whirl up, how long it whirls at full strength, and how long it takes to die down, in seconds. */
const RISES_S = 0.16;
const HOLDS_S = 1.05;
const DIES_S = 0.95;
/** How fast its blades whirl at full strength, in radians a second. */
const WHIRLS = 10.5;
/** How many blades whirl round the piece, and how many points each is drawn through. */
const BLADES = 5;
const BLADE_STEPS = 12;
/** How far round its orbit a blade reaches, in radians. */
const BLADE_SPAN = 2;
/** When the cuts are left hanging in the air, in seconds after the burst, and how long each hangs. */
const CUTS = [0.08, 0.22, 0.36, 0.5, 0.64, 0.8, 0.98, 1.2] as const;
const CUT_HANGS_S = 0.5;
/** How many things the gale carries round, and how many shreds of pale air whirl in it. */
const CARRIED = 12;
const SHREDS = 7;
/** The dark the sheath of a blade is taken towards, so that it holds over a bright table. */
const SHEATHED = '#0f1a16';
/** How many waves may land at once before each gale is drawn with less, and how many before it is drawn with the least. */
const CROWDED = 4;
const THRONGED = 8;
/** How long a thing let go lies where it lands before it fades, in seconds. */
const LIES_S = 0.35;

/** How the gale stands at a moment of the burst. */
interface Gale {
  readonly floor: Point;
  readonly chest: Point;
  readonly cell: number;
  readonly seconds: number;
  /** How hard it whirls, from 0 to 1. */
  readonly strength: number;
  /** How far round it has whirled, in radians at full strength. */
  readonly spun: number;
  /** When it starts to die down and when it has died, in seconds. */
  readonly holds: number;
  readonly dies: number;
  /** How high the piece stands, held to a reach the gale can wrap, in table pixels. */
  readonly tall: number;
}

function galeOf(floor: Point, chest: Point, cell: number, t: number, tall: number, ends: number): Gale {
  const dies = Math.min(HOLDS_S + DIES_S, ends - 0.45);
  const holds = Math.min(HOLDS_S, dies - 0.3);
  const fading = within(t, holds, dies);
  const spun = Math.min(t, holds) + (dies - holds) * (fading - (fading * fading) / 2);
  return {
    floor,
    chest,
    cell,
    seconds: t,
    strength: smooth(0, RISES_S, t) * (1 - fading) ** 1.3,
    spun: spun * WHIRLS,
    holds,
    dies,
    tall: Math.min(Math.max(tall, cell * 0.8), cell * 1.8),
  };
}

/**
 * The gale a wave of the void leaves slicing at its target, on the burst's own clock; `ends` is when
 * the burst is cleared, and `crowd` is how many waves of the cast land, every shot on every target: a
 * crowd of them is drawn with less to each. See the head of this file.
 */
export function drawVacuumGale(
  drawn: Staged,
  stage: Stage,
  floor: Point,
  chest: Point,
  ends: number,
  paint: WindPaint,
  crowd: number
): void {
  const U = stage.cell;
  const t = stage.seconds;
  const gale = galeOf(floor, chest, U, t, stage.tall, ends);
  const clearing = 1 - within(t, ends - 0.45, ends);
  const salt = (stage.seed % 997) / 97;
  const most = crowd <= CROWDED ? 0 : crowd <= THRONGED ? 1 : 2;
  layGround(drawn, gale, paint, salt, [10, 4, 2][most], clearing);
  if (gale.strength > 0.01) {
    shreds(drawn, gale, paint, salt, [SHREDS, 3, 1][most]);
    blades(drawn, gale, paint, salt, [BLADES, 2, 1][most], most < 2);
  }
  cuts(drawn, gale, paint, salt, [1, 2, 4][most]);
  carried(drawn, gale, salt, [CARRIED, 4, 2][most], ends);
}

/** A point on a blade's orbit: about the piece's axis at a height, on a plane turned and tipped its own way. */
function onOrbit(gale: Gale, high: number, radius: number, turned: number, tipped: number, round: number): Point {
  const along = { x: Math.cos(turned), y: Math.sin(turned) };
  const up = Math.sin(tipped);
  const level = Math.cos(tipped);
  return {
    x: gale.floor.x + radius * (Math.cos(round) * along.x - Math.sin(round) * along.y * level),
    y: gale.floor.y + radius * (Math.cos(round) * along.y + Math.sin(round) * along.x * level),
    z: gale.floor.z + high + radius * Math.sin(round) * up,
  };
}

/**
 * The blades of the gale: each a sickle of wind running round its own tipped orbit, its head thick
 * and its tail drawn out thin behind it, laid by halves about the piece over a wider slate sheath,
 * and, where `keen`, a white edge along its outer side.
 */
function blades(drawn: Staged, gale: Gale, paint: WindPaint, salt: number, count: number, keen: boolean): void {
  const U = gale.cell;
  const far: EffectRibbon[] = [];
  const near: EffectRibbon[] = [];
  const spread = 1 + 0.35 * (1 - gale.strength);
  for (let blade = 0; blade < count; blade++) {
    const hand = blade % 2 === 0 ? 1 : -1;
    const high = gale.tall * (0.22 + 0.62 * ((blade + 0.5 * scatter(blade, salt + 1)) / count));
    const radius = U * (0.8 + 0.4 * scatter(blade, salt + 2)) * spread;
    const turned = scatter(blade, salt + 3) * Math.PI * 2;
    const tipped = (scatter(blade, salt + 4) - 0.5) * 1.1;
    const head = scatter(blade, salt + 5) * Math.PI * 2 + hand * gale.spun * (0.85 + 0.3 * scatter(blade, salt + 6));
    const span = BLADE_SPAN * (0.6 + 0.4 * gale.strength);
    const points: Point[] = [];
    const widths: number[] = [];
    const alphas: number[] = [];
    for (let step = 0; step <= BLADE_STEPS; step++) {
      const along = step / BLADE_STEPS;
      points.push(onOrbit(gale, high, radius, turned, tipped, head - hand * (1 - along) * span));
      const bowed = 2 * along ** 0.75 - 1;
      widths.push(U * 0.44 * (1 - bowed * bowed) ** 0.8 * (0.55 + 0.45 * gale.strength));
      alphas.push(Math.min(1, along * 2.2));
    }
    const about = points.map((point) => ({ x: gale.floor.x, y: gale.floor.y, z: point.z }));
    const shown = gale.strength * (0.75 + 0.25 * scatter(blade, salt + 7));
    const sheath: EffectRibbon = {
      points,
      widths: widths.map((wide) => wide * 1.6),
      alphas,
      color: mixColor(paint.shadow, SHEATHED, 0.45),
      alpha: 0.9 * shown,
      blend: 'color',
      torn: 0.3,
      soft: 0.18,
      flowed: gale.seconds * 9 + blade,
    };
    const body: EffectRibbon = {
      points,
      widths,
      alphas,
      color: paint.pale,
      core: '#ffffff',
      alpha: shown,
      blend: 'color',
      torn: 0.22,
      soft: 0.08,
      flowed: gale.seconds * 13 + blade * 2,
    };
    const edge: EffectRibbon = {
      points: points.map((point, index) => ({
        x: point.x + (point.x - gale.floor.x) * 0.06,
        y: point.y + (point.y - gale.floor.y) * 0.06,
        z: point.z + widths[index] * 0.15,
      })),
      widths: widths.map((wide) => wide * 0.28),
      alphas,
      color: '#ffffff',
      alpha: shown,
      blend: 'color',
    };
    const behind = halvesOf(sheath, about, paint.shadow, 0.7);
    const before = halvesOf(body, about, paint.shadow, 0.7);
    far.push(behind.far, before.far);
    near.push(behind.near, before.near);
    if (!keen) continue;
    const edged = halvesOf(edge, about, paint.shadow, 0.7);
    far.push(edged.far);
    near.push(edged.near);
  }
  layRibbons(drawn, far);
  layRibbons(drawn, near);
}

/** Shreds of pale air whirling round the piece among the blades, which give the gale a body of its own. */
function shreds(drawn: Staged, gale: Gale, paint: WindPaint, salt: number, count: number): void {
  const U = gale.cell;
  for (let shred = 0; shred < count; shred++) {
    const out = U * (0.55 + 0.45 * scatter(shred, salt + 41));
    const turn = scatter(shred, salt + 42) * Math.PI * 2 + gale.spun * 0.9;
    const root = {
      x: gale.floor.x + Math.cos(turn) * out,
      y: gale.floor.y + Math.sin(turn) * out,
      z: gale.floor.z + gale.tall * (0.2 + 0.6 * scatter(shred, salt + 43)),
    };
    const heading = { x: -Math.sin(turn), y: Math.cos(turn), z: 0.15 };
    const wide = U * (0.45 + 0.25 * scatter(shred, salt + 44));
    drawn.motes.push(
      flowingMote('gust', root, heading, wide, wide * 2.6, gale.seconds * 8 + shred * 2.1, {
        color: mixColor(paint.shadow, paint.pale, 0.55),
        core: '#ffffff',
        alpha: 0.5 * gale.strength,
        forward: U * 0.2,
        variant: shred * 1.3,
      })
    );
  }
}

/**
 * The cuts the gale leaves hanging in the air: each drawn through the piece in an instant as a thin
 * white line over a slate shadow, with a glint where it is drawn; it hangs, then parts into two halves
 * drifting apart, and fades.
 */
function cuts(drawn: Staged, gale: Gale, paint: WindPaint, salt: number, every: number): void {
  const U = gale.cell;
  for (const [index, at] of CUTS.entries()) {
    if (index % every !== 0) continue;
    const scaled = at * (gale.holds / HOLDS_S);
    const age = gale.seconds - scaled;
    if (age < 0 || age >= CUT_HANGS_S) continue;
    const aged = age / CUT_HANGS_S;
    const drawnOn = smooth(0, 0.05, age);
    const round = scatter(index, salt + 11) * Math.PI * 2;
    const slope = (scatter(index, salt + 12) - 0.5) * 1.4;
    const long = U * (1.2 + 0.6 * scatter(index, salt + 13));
    const way = { x: Math.cos(round), y: Math.sin(round), z: slope };
    const norm = Math.hypot(way.x, way.y, way.z);
    const middle = {
      x: gale.chest.x + (scatter(index, salt + 14) - 0.5) * U * 0.5,
      y: gale.chest.y + (scatter(index, salt + 15) - 0.5) * U * 0.5,
      z: gale.chest.z + (scatter(index, salt + 16) - 0.5) * gale.tall * 0.6,
    };
    const parted = U * 0.12 * smooth(0.35, 1, aged);
    const left = Math.min(1, (1 - aged) * 2.2);
    for (const hand of drawnOn > 0.05 ? ([-1, 1] as const) : []) {
      const shifted = { ...middle, z: middle.z + hand * parted };
      const from = {
        x: shifted.x - (way.x / norm) * long * 0.5,
        y: shifted.y - (way.y / norm) * long * 0.5,
        z: shifted.z - (way.z / norm) * long * 0.5,
      };
      const reach = long * drawnOn;
      const points = [0, 0.25, 0.5, 0.75, 1].map((share) => ({
        x: from.x + (way.x / norm) * reach * share,
        y: from.y + (way.y / norm) * reach * share,
        z: from.z + (way.z / norm) * reach * share,
      }));
      const half = hand < 0 ? [0, 1, 1, 1, 0.4] : [0.4, 1, 1, 1, 0];
      layRibbons(drawn, [
        {
          points,
          widths: half.map((wide) => wide * U * 0.17),
          color: paint.shadow,
          alpha: 0.6 * left,
          blend: 'color',
          soft: 0.4,
        },
        {
          points,
          widths: half.map((wide) => wide * U * 0.065),
          color: '#ffffff',
          core: '#ffffff',
          alpha: left,
          blend: 'color',
        },
      ]);
    }
    if (age < 0.07)
      drawn.motes.push(glow(middle, U * 0.9, mixColor(paint.pale, '#ffffff', 0.5), 0.8 * (1 - age / 0.07), U * 0.4));
  }
}

/**
 * The leaves, twigs and grit the gale carries round the piece, each on its own ring and bobbing up and
 * down; as it dies each is let go in its turn, flung out the way it was going to fall, land and lie.
 */
function carried(drawn: Staged, gale: Gale, salt: number, count: number, ends: number): void {
  const U = gale.cell;
  const fall = U * 14;
  for (let thing = 0; thing < count; thing++) {
    const hand = thing % 3 === 0 ? -1 : 1;
    const radius = U * (0.55 + 0.75 * scatter(thing, salt + 21));
    const high = gale.tall * (0.12 + 0.85 * scatter(thing, salt + 22));
    const pace = 0.75 + 0.5 * scatter(thing, salt + 23);
    const from = scatter(thing, salt + 24) * Math.PI * 2;
    const letGo = gale.holds + (gale.dies - gale.holds) * (0.1 + 0.85 * scatter(thing, salt + 25));
    const arrives = 0.05 + 0.25 * scatter(thing, salt + 26);
    const t = gale.seconds;
    if (t < arrives) continue;
    const kind = debrisKindOf(thing);
    const size =
      U * (kind === 'stone' ? 0.1 + 0.05 * scatter(thing, salt + 27) : 0.22 + 0.1 * scatter(thing, salt + 27));
    const swept = (round: number, at: number): Point => ({
      x: gale.floor.x + Math.cos(round) * radius,
      y: gale.floor.y + Math.sin(round) * radius,
      z: gale.floor.z + high + U * 0.18 * Math.sin(at * 5 + thing),
    });
    if (t < letGo) {
      const round = from + hand * gale.spun * pace;
      drawn.ribbons.push(
        debrisRibbon({
          kind,
          at: swept(round, t),
          size,
          turn: t * (9 + thing) + thing,
          tip: Math.sin(t * 7 + thing) * 0.9,
          alpha: Math.min(1, (t - arrives) * 8) * Math.min(1, (ends - t) * 3),
          variant: thing + salt,
        })
      );
      continue;
    }
    const thenFading = within(letGo, gale.holds, gale.dies);
    const spunThen =
      (Math.min(letGo, gale.holds) + (gale.dies - gale.holds) * (thenFading - (thenFading * thenFading) / 2)) * WHIRLS;
    const round = from + hand * spunThen * pace;
    const start = swept(round, letGo);
    const flown = t - letGo;
    const speed = U * (1.5 + 2 * scatter(thing, salt + 28)) * (0.4 + 0.6 * (1 - thenFading));
    const lands = Math.sqrt((2 * Math.max(0, start.z - gale.floor.z)) / fall);
    const inAir = Math.min(flown, lands);
    const drift = (speed * (1 - Math.exp(-2 * inAir))) / 2;
    const tangent = { x: -Math.sin(round) * hand, y: Math.cos(round) * hand };
    const landed = flown >= lands;
    const lying = flown - lands;
    const alpha = landed ? 1 - within(lying, LIES_S * 0.5, LIES_S + 0.4) : 1;
    if (alpha <= 0.01) continue;
    drawn.ribbons.push(
      debrisRibbon({
        kind,
        at: {
          x: start.x + (tangent.x * 0.8 + Math.cos(round) * 0.6) * drift,
          y: start.y + (tangent.y * 0.8 + Math.sin(round) * 0.6) * drift,
          z: Math.max(gale.floor.z + size * 0.15, start.z - 0.5 * fall * inAir * inAir),
        },
        size,
        turn: landed ? thing * 1.3 : flown * (8 + thing) + thing,
        tip: landed ? 0 : Math.sin(flown * 9 + thing) * 0.9,
        alpha: alpha * Math.min(1, (ends - t) * 3),
        variant: thing + salt,
      })
    );
  }
}

/**
 * What the gale does to the floor about the piece: a shadow under it while it whirls, a skirt of dust
 * wheeling about the piece's feet, and the dust it sweeps up left lying in a ring as it dies.
 */
function layGround(drawn: Staged, gale: Gale, paint: WindPaint, salt: number, wisps: number, clearing: number): void {
  const U = gale.cell;
  const t = gale.seconds;
  if (gale.strength > 0.01)
    drawn.floor.push(floorMark('disc', gale.floor, U * 1.6, 1, paint.shadow, 0.42 * gale.strength, 'color', 0));
  const laid = smooth(0.15, 0.8, t) * clearing;
  if (laid > 0.01) {
    drawn.floor.push(
      floorMark('scorch', gale.floor, U * 1.25, 1, paint.dustDeep, 0.38 * laid, 'color', (salt * 7) % 89, t * 0.3),
      floorMark('ring', gale.floor, U * 1.05, 0.22, paint.dust, 0.45 * laid, 'color', 0)
    );
  }
  if (gale.strength <= 0.01) return;
  for (let wisp = 0; wisp < wisps; wisp++) {
    const out = U * (0.45 + 0.7 * scatter(wisp, salt + 31));
    const turn = scatter(wisp, salt + 32) * Math.PI * 2 + gale.spun * (U / (out + U * 0.4));
    const root = {
      x: gale.floor.x + Math.cos(turn) * out,
      y: gale.floor.y + Math.sin(turn) * out,
      z: gale.floor.z + U * (0.08 + 0.3 * scatter(wisp, salt + 33)),
    };
    const heading = { x: -Math.sin(turn), y: Math.cos(turn), z: 0.25 };
    const wide = U * (0.38 + 0.3 * scatter(wisp, salt + 34));
    const deep = wisp % 2 === 0;
    drawn.motes.push(
      flowingMote('wisp', root, heading, wide, wide * 2.4, t * 5 + wisp * 1.7, {
        color: deep ? paint.dustDeep : paint.dust,
        core: deep ? undefined : mixColor(paint.dust, '#ffffff', 0.5),
        alpha: (deep ? 0.5 : 0.55) * gale.strength,
        forward: U * 0.2,
        variant: wisp * 0.9,
      })
    );
  }
}
