import { type BreathLook } from '@axe/domain/effect/scene/breath/breath-looks';
import { type Gout, type GoutState } from '@axe/domain/effect/scene/breath/breath-stream';
import { type Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { type EffectMote } from '@axe/domain/effect/scene/effect-scene';
import { DUST, SMOKE, STONE } from '@axe/domain/effect/scene/fire/fire-parts';
import { ball, glow, hueOf, type Point, smokePuff } from '@axe/domain/effect/scene/parts';

/*
 * How the gouts of a breath are drawn, by element and by the layer of the stream they are of. The
 * body and the heart of a stream are shapes that flow, drawn out the way each gout goes: hard licks
 * for what burns, soft wisps for a fog, a mist or a light. Light is drawn under colour, so what is to
 * show over the body of a stream, its bright heart and its streaks, is colour too, and light is kept
 * for what glows about it. Everything of the stream is held to its own depth, so a piece the stream
 * passes behind hides it.
 */

/** The layers of a stream a gout may be of. */
export type GoutLayer = 'body' | 'core' | 'streak' | 'curl' | 'carried';

/** What the gouts of one stream are drawn with. */
export interface StreamBrush {
  readonly drawn: Staged;
  readonly look: BreathLook;
  /** The steps of the breath's colours, from its deepest at 0 to white at 6. */
  readonly ramp: readonly string[];
  /** How wide a cell is drawn, in table pixels. */
  readonly cell: number;
  readonly seconds: number;
  readonly floorZ: number;
  /** The middle of the cone's axis where the gout is, which what curls off the edge curls away from. */
  readonly axisAt: (along: number) => Point;
}

/** How far nearer the eye the stream is drawn, in cells: enough to keep it off the floor under it, and less than a piece is deep. */
const NEARER_CELLS = 0.2;
/** How far over the floor the middle of a gout is kept, as a share of its size, so the floor does not cut it in two. */
const OVER_FLOOR = 0.3;

const INK = '#07030c';
const SICKLY = '#7fbf2a';
const LEAVES = ['#7a8f3a', '#9aa84a', '#6b7d2e'] as const;
const SAND_DEEP = '#3e2a18';
const SAND_UMBER = '#5c3a1a';
const PEBBLES = ['#4f3f31', '#7a634b', '#352a21'] as const;

/** A part of the stream: held to its own depth. */
function deep(mote: EffectMote): EffectMote {
  return { ...mote, exactDepth: true };
}

/** A part drawn out from where it is along a way, as far as `long`: rooted where it is and reaching out to its tip. */
function drawnOut(mote: EffectMote, shape: EffectMote['shape'], heading: Point, long: number): EffectMote {
  const length = Math.hypot(heading.x, heading.y, heading.z) || 1;
  return {
    ...mote,
    x: mote.x + (heading.x / length) * long,
    y: mote.y + (heading.y / length) * long,
    z: mote.z + (heading.z / length) * long,
    shape,
    velocity: { x: (heading.x / length) * 100, y: (heading.y / length) * 100, z: (heading.z / length) * 100 },
    trail: Math.max(0, long - mote.size) / 100,
  };
}

/**
 * A shape that flows, drawn out from its root along a way as far as `long` and as wide as `wide` at
 * its widest, its pattern run down it as far as `flowed`; of one colour, or taken to a core's in its middle.
 */
export function flowingMote(
  shape: 'lick' | 'wisp' | 'jet' | 'gust',
  root: Point,
  heading: Point,
  wide: number,
  long: number,
  flowed: number,
  paint: {
    readonly color: string;
    readonly core?: string;
    readonly alpha: number;
    readonly blend?: EffectMote['blend'];
    readonly forward: number;
    readonly variant: number;
  }
): EffectMote {
  const length = Math.hypot(heading.x, heading.y, heading.z) || 1;
  const reach = Math.max(long, wide);
  return {
    x: root.x + (heading.x / length) * reach,
    y: root.y + (heading.y / length) * reach,
    z: root.z + (heading.z / length) * reach,
    size: wide,
    color: paint.color,
    core: paint.core,
    alpha: Math.max(0, paint.alpha),
    blend: paint.blend ?? 'color',
    shape,
    velocity: { x: (heading.x / length) * 100, y: (heading.y / length) * 100, z: (heading.z / length) * 100 },
    trail: (reach - wide) / 100,
    spin: flowed,
    variant: paint.variant,
    forward: paint.forward,
  };
}

/** A way taken upwards by a share, as what is hot rises off the way it was blown. */
function risen(heading: Point, by: number): Point {
  return { x: heading.x, y: heading.y, z: heading.z + by };
}

/**
 * The sheets a flame is laid in, the coolest and widest first: how hot a gout must be to be in the
 * sheet, how wide and how long it is there as shares of its own, and the step of the ramp it is.
 */
const FIRE_PASSES = [
  [0, 1.16, 1.06, 1],
  [0, 1, 1, 2],
  [0.24, 0.76, 0.86, 3],
  [0.5, 0.52, 0.7, 4],
  [0.74, 0.32, 0.52, 5],
] as const;

/**
 * How long a gout is drawn out for its length as it leaves the mouth and as it comes to the end of
 * the cone, where it is shorter so that only a little of the stream reaches past what it is blown at;
 * and how much of that length lies behind where the gout is: little at the mouth, so it starts at
 * the mouth rather than within the caster, and half at the end.
 */
const SHRED_LONG_AT_MOUTH = 1.15;
const SHRED_LONG_AT_END = 0.6;
const SHRED_BEHIND_AT_MOUTH = 0.25;
const SHRED_BEHIND_AT_END = 0.5;

/** How many sheets a stream is laid in: see {@link drawGout}. */
export const STREAM_PASSES = FIRE_PASSES.length;

/**
 * Draws one gout of a stream as its element and its layer have it. The body and the heart of a
 * stream are laid a sheet at a time, every gout's widest and coolest colour first and its hottest
 * last, so that the gouts run together into one body edged in its deepest colour rather than each
 * standing out ringed in its own; `pass` says which sheet. The other layers are drawn whole in the first.
 */
export function drawGout(brush: StreamBrush, layer: GoutLayer, gout: Gout, state: GoutState, pass = 0): void {
  const { drawn, look, ramp, cell } = brush;
  const forward = cell * NEARER_CELLS;
  const dying = state.left < 0.3 ? state.left / 0.3 : 1;
  const size = gout.size * state.grown * (0.45 + 0.55 * Math.min(1, state.left * 1.4));
  const at = { x: state.x, y: state.y, z: Math.max(state.z, brush.floorZ + size * OVER_FLOOR) };
  const push = (...motes: EffectMote[]) => {
    for (const mote of motes) drawn.motes.push(deep(mote));
  };
  if (layer === 'streak') {
    if (pass === 0) push(...streakOf(look, ramp, at, gout, state, cell, forward));
    return;
  }
  if (layer === 'carried') {
    if (pass === 0) push(...carriedOf(brush, at, gout, state, forward));
    return;
  }
  if (layer === 'curl') {
    if (pass === 0) push(...curlOf(brush, at, size, gout, state, forward));
    return;
  }
  const hot = layer === 'core';
  const flowed = (brush.seconds - gout.bornAt) * 5 + gout.variant * 7;
  /**
   * A gout drawn as a shape that flows, rooted a little behind where the gout is and drawn out the
   * way it goes, `wide` and `long` of the gout's own size.
   */
  const shred = (
    shape: 'lick' | 'wisp',
    way: Point,
    wide: number,
    long: number,
    paint: { color: string; core?: string; alpha: number; blend?: EffectMote['blend'] }
  ): void => {
    const length = Math.hypot(way.x, way.y, way.z) || 1;
    const reached = Math.min(1, state.along);
    const drawnOut = size * long * (SHRED_LONG_AT_MOUTH - (SHRED_LONG_AT_MOUTH - SHRED_LONG_AT_END) * reached);
    const back = drawnOut * (SHRED_BEHIND_AT_MOUTH + (SHRED_BEHIND_AT_END - SHRED_BEHIND_AT_MOUTH) * reached);
    const root = {
      x: at.x - (way.x / length) * back,
      y: at.y - (way.y / length) * back,
      z: Math.max(brush.floorZ, at.z - (way.z / length) * back),
    };
    const shaped = flowingMote(shape, root, way, size * wide, drawnOut, flowed, {
      ...paint,
      forward,
      variant: gout.variant,
    });
    push({ ...shaped, z: Math.max(shaped.z, brush.floorZ) });
  };
  const far = Math.min(1, state.along);
  switch (look.element) {
    case 'fire': {
      if (hot) {
        if (pass === 3) shred('lick', state.heading, 1, 3.2, { color: ramp[5], alpha: dying });
        if (pass === 4 && state.along < 0.5) shred('lick', state.heading, 0.6, 2.4, { color: '#ffffff', alpha: dying });
        return;
      }
      const heat = 1 - Math.min(1, state.along * (0.45 + 0.55 * gout.edge) + 0.3 * state.breaking);
      const lifted = risen(state.heading, 0.9 * (1 - heat) * (1 - heat));
      const long = 2.5 + 0.9 * gout.edge;
      if (look.fiery && heat < 0.2 && gout.variant < 6 * (0.3 + 0.5 * gout.edge)) {
        if (pass === 0)
          shred('wisp', risen(state.heading, 1.2), 1.4, 2.8, {
            color: mixColor(SMOKE, ramp[0], 0.3),
            alpha: 0.5 * state.left,
          });
        return;
      }
      const cool = heat > 0.3 ? 1 : 0.3 + 0.7 * (heat / 0.3);
      const [from, wide, tall, step] = FIRE_PASSES[pass];
      if (heat < from) return;
      shred('lick', lifted, 1.3 * wide, long * tall, { color: ramp[step], alpha: dying * (pass < 2 ? cool : 1) });
      return;
    }
    case 'ice': {
      if (hot) {
        if (pass === 2)
          shred('lick', state.heading, 0.8, 3.6, {
            color: mixColor(ramp[3], '#ffffff', 0.35),
            core: '#ffffff',
            alpha: 0.95 * dying * (1 - 0.5 * far),
          });
        return;
      }
      if (pass === 0)
        shred('wisp', state.heading, 1.6, 3.2, { color: mixColor(ramp[2], '#ffffff', 0.12), alpha: 0.6 * state.left });
      if (pass === 1)
        shred('wisp', risen(state.heading, 0.12), 1.15, 2.6, {
          color: mixColor(ramp[3], '#ffffff', 0.55),
          core: '#ffffff',
          alpha: 0.75 * state.left,
        });
      return;
    }
    case 'poison': {
      if (hot) {
        if (pass !== 2) return;
        push(glow(at, size * 1.6, ramp[3], 0.22 * state.left, forward));
        shred('lick', state.heading, 0.9, 2.8, {
          color: mixColor(SICKLY, ramp[1], 0.2),
          core: mixColor(SICKLY, '#ffffff', 0.4),
          alpha: 0.9 * dying,
        });
        return;
      }
      const sick = gout.variant >= 3.6;
      if (pass === 0)
        shred('wisp', risen(state.heading, 0.15), 1.6, 2.8, {
          color: mixColor(ramp[1], INK, 0.5),
          alpha: 0.9 * state.left,
        });
      if (pass === 1 && !sick)
        shred('wisp', risen(state.heading, 0.15), 1.15, 2.3, {
          color: mixColor(ramp[1], ramp[2], 0.35),
          core: mixColor(ramp[1], ramp[2], 0.75),
          alpha: 0.8 * state.left,
        });
      if (pass === 2 && sick)
        shred('lick', risen(state.heading, 0.15), 0.85, 2.2, {
          color: mixColor(SICKLY, ramp[1], 0.35),
          core: mixColor(SICKLY, '#ffffff', 0.25),
          alpha: 0.9 * dying,
        });
      return;
    }
    case 'thunder':
      if (pass !== 0 || hot) return;
      shred('wisp', state.heading, 1.3, 2.8, { color: hueOf(ramp), core: ramp[3], alpha: 0.3 * state.left });
      push(glow(at, size * 1.1, ramp[3], 0.28 * state.left, forward));
      return;
    case 'wind':
      if (pass !== 0 || hot) return;
      shred('wisp', state.heading, 0.7, 3, {
        color: mixColor(ramp[2], '#ffffff', 0.6),
        core: '#ffffff',
        alpha: 0.2 * state.left,
      });
      return;
    case 'dark': {
      if (hot) {
        if (pass === 2) shred('lick', state.heading, 1.2, 3.2, { color: '#000000', alpha: dying });
        return;
      }
      if (far > 0.75 && gout.variant < 3) {
        if (pass === 0)
          shred('wisp', risen(state.heading, 0.4), 1.4, 2.6, {
            color: mixColor(INK, ramp[0], 0.3),
            alpha: 0.7 * state.left,
          });
        return;
      }
      const lifted = risen(state.heading, 0.3 * far);
      const long = 2.4 + 0.8 * gout.edge;
      if (pass === 0) shred('lick', lifted, 1.3, long, { color: ramp[2], alpha: dying });
      if (pass === 1) shred('lick', lifted, 1.02, long * 0.88, { color: mixColor(ramp[1], INK, 0.45), alpha: dying });
      if (pass === 2 && gout.edge < 0.7) shred('lick', lifted, 0.72, long * 0.7, { color: INK, alpha: dying });
      return;
    }
    case 'sand': {
      if (hot) {
        if (pass === 2)
          shred('lick', state.heading, 0.8, 3, {
            color: mixColor(ramp[2], SAND_UMBER, 0.25),
            core: ramp[3],
            alpha: 0.9 * dying * (1 - 0.4 * far),
          });
        return;
      }
      const sunk = risen(state.heading, -0.08 * far);
      if (pass === 0)
        shred('wisp', sunk, 1.75, 2.9, { color: mixColor(ramp[0], SAND_DEEP, 0.6), alpha: 0.95 * state.left });
      if (pass === 1)
        shred('wisp', sunk, 1.28, 2.6, {
          color: mixColor(SAND_UMBER, ramp[1], 0.4),
          core: mixColor(ramp[1], ramp[2], 0.6),
          alpha: 0.92 * state.left,
        });
      if (pass === 2 && gout.variant < 3)
        shred('lick', sunk, 0.75, 2.2, {
          color: mixColor(ramp[1], ramp[2], 0.55),
          core: mixColor(ramp[2], ramp[3], 0.35),
          alpha: 0.85 * dying,
        });
      return;
    }
    case 'holy':
      if (hot) {
        if (pass !== 2) return;
        push(glow(at, size * 1.4, ramp[5], 0.1 * state.left, forward));
        shred('wisp', state.heading, 1, 3, {
          color: ramp[4],
          core: '#ffffff',
          alpha: 0.22 * state.left,
          blend: 'light',
        });
        return;
      }
      if (pass !== 0) return;
      shred('wisp', risen(state.heading, 0.2), 1.4, 2.8, {
        color: ramp[1],
        core: ramp[3],
        alpha: 0.3 * state.left,
      });
      shred('wisp', risen(state.heading, 0.2), 1, 2.4, {
        color: ramp[3],
        core: ramp[5],
        alpha: 0.1 * state.left,
        blend: 'light',
      });
      return;
  }
}

/** A streak down the stream, drawn out by its speed: what shows how fast it blows. */
function streakOf(
  look: BreathLook,
  ramp: readonly string[],
  at: Point,
  gout: Gout,
  state: GoutState,
  cell: number,
  forward: number
): EffectMote[] {
  const fading = state.left * (1 - 0.5 * Math.min(1, state.along));
  const velocity = { x: state.heading.x * gout.pace, y: state.heading.y * gout.pace, z: state.heading.z * gout.pace };
  const streak = (color: string, alpha: number, trail: number): EffectMote => ({
    ...ball(at, gout.size, color, alpha * fading, forward, 0),
    shape: 'spark',
    velocity,
    trail,
  });
  switch (look.element) {
    case 'fire':
      return [streak(gout.variant < 2 ? '#ffffff' : ramp[5], 0.9, 0.05)];
    case 'ice':
      return [streak('#ffffff', 0.8, 0.06)];
    case 'poison':
      return [
        {
          ...ball(at, gout.size * 1.6, mixColor(SICKLY, ramp[3], 0.25), 0.85 * fading, forward, gout.variant),
          shape: 'comet',
          velocity,
          trail: 0.03,
        },
      ];
    case 'thunder':
      return [streak(gout.variant < 3 ? '#ffffff' : ramp[5], 0.9, 0.04)];
    case 'wind':
      return [{ ...streak(ramp[3], 0.5, 0.12), size: gout.size * 2.2 }, streak('#ffffff', 0.95, 0.1)];
    case 'dark':
      return [streak(gout.variant < 2 ? ramp[4] : ramp[3], 0.65, 0.05)];
    case 'holy':
      return [streak(ramp[5], 0.5, 0.08), glow(at, cell * 0.14, ramp[4], 0.3 * fading, forward)];
    case 'sand':
      return [{ ...streak(SAND_DEEP, 0.85, 0.06), size: gout.size * 1.4 }, streak(ramp[3], 0.9, 0.05)];
  }
}

/** What curls off the edge of the stream: turning from the way it blows out and back as it goes. */
function curlOf(
  brush: StreamBrush,
  at: Point,
  size: number,
  gout: Gout,
  state: GoutState,
  forward: number
): EffectMote[] {
  const { look, ramp } = brush;
  const middle = brush.axisAt(state.along);
  const off = { x: at.x - middle.x, y: at.y - middle.y, z: at.z - middle.z };
  const far = Math.hypot(off.x, off.y, off.z) || 1;
  const turned = 0.4 + 1.9 * Math.min(1, state.along);
  const ahead = Math.cos(turned);
  const out = Math.sin(turned) / far;
  const leaning = {
    x: gout.axis.way.x * ahead + off.x * out,
    y: gout.axis.way.y * ahead + off.y * out,
    z: Math.max(0.1, gout.axis.way.z * ahead + off.z * out + 0.25),
  };
  const wide = gout.size * (0.9 + 0.7 * Math.min(1, state.along));
  const long = wide * (1.5 + 0.6 * Math.min(1, state.along));
  const left = state.left * (1 - 0.6 * Math.min(1, state.along));
  switch (look.element) {
    case 'fire':
      return [
        drawnOut(ball(at, wide * 0.8, ramp[2], left, forward, gout.variant), 'tongue', leaning, long),
        drawnOut(ball(at, wide * 0.45, ramp[4], left, forward, gout.variant + 2), 'tongue', leaning, long * 0.7),
      ];
    case 'dark':
      return [
        drawnOut(ball(at, wide * 0.8, ramp[2], 0.9 * left, forward, gout.variant), 'tongue', leaning, long),
        drawnOut(ball(at, wide * 0.4, ramp[4], 0.8 * left, forward, gout.variant + 2), 'tongue', leaning, long * 0.6),
      ];
    case 'ice':
      return [
        drawnOut(smokePuff(at, wide, mixColor(ramp[5], '#ffffff', 0.5), 0.4 * left, forward), 'plume', leaning, long),
      ];
    case 'poison':
      return [smokePuff(at, size * 1.5, mixColor(ramp[1], INK, 0.35), 0.4 * left, forward)];
    case 'wind':
      return [smokePuff(at, size, DUST, 0.28 * left, forward)];
    case 'sand':
      return [
        drawnOut(
          smokePuff(at, wide * 1.2, mixColor(ramp[1], SAND_DEEP, 0.3), 0.62 * left, forward),
          'plume',
          leaning,
          long
        ),
      ];
    default:
      return [];
  }
}

/** What the stream carries along its way: embers, crystals, bubbles, sparks of a current, leaves and grit, shadows, or stars. */
function carriedOf(brush: StreamBrush, at: Point, gout: Gout, state: GoutState, forward: number): EffectMote[] {
  const { look, ramp, seconds } = brush;
  const left = state.left;
  const turn = (seconds - gout.bornAt) * (3 + gout.variant) + gout.variant;
  const glint = 0.55 + 0.45 * Math.sin(seconds * 9 + gout.variant * 3);
  switch (look.element) {
    case 'fire':
      return [
        glow(
          at,
          gout.size,
          ramp[gout.variant < 3 ? 5 : 4],
          left * (0.6 + 0.4 * Math.sin(seconds * 27 + gout.variant * 2.3)),
          forward
        ),
      ];
    case 'ice':
      return [
        {
          ...ball(at, gout.size, gout.variant < 2 ? ramp[4] : '#ffffff', left * glint, forward, 0),
          shape: 'flake',
          spin: turn,
        },
      ];
    case 'poison': {
      const swollen = gout.size * (0.6 + 0.8 * Math.min(1, state.along));
      const bubble = mixColor('#b8e04a', ramp[3], 0.2);
      return [
        ball(at, swollen, mixColor(SICKLY, ramp[1], 0.2), left, forward, gout.variant),
        ball({ ...at, z: at.z + swollen * 0.12 }, swollen * 0.62, bubble, left, forward, gout.variant + 1),
      ];
    }
    case 'thunder':
      return glint > 0.6
        ? [{ ...ball(at, gout.size, '#ffffff', left, forward, 0), shape: 'star', spin: gout.variant }]
        : [];
    case 'wind': {
      const stone = gout.variant < 1.5;
      const color = stone ? STONE : mixColor(LEAVES[Math.floor(gout.variant) % LEAVES.length], ramp[2], 0.25);
      return [
        {
          ...ball(at, gout.size * (stone ? 0.7 : 1), color, Math.min(1, left * 2), forward, gout.variant),
          shape: 'chunk',
          spin: turn * 1.5,
        },
      ];
    }
    case 'dark':
      return [
        glow(at, gout.size * 2.2, ramp[2], 0.4 * left, forward),
        ball(at, gout.size, mixColor(INK, ramp[0], 0.3), left, forward, gout.variant),
      ];
    case 'holy':
      return [
        glow(at, gout.size * 1.6, ramp[1], 0.6 * left * glint, forward),
        { ...ball(at, gout.size, ramp[1], left * glint, forward, 0), shape: 'star', spin: gout.variant },
        { ...ball(at, gout.size * 0.6, '#ffffff', left * glint, forward, 0), shape: 'star', spin: gout.variant },
      ];
    case 'sand':
      return [
        {
          ...ball(
            at,
            gout.size,
            PEBBLES[Math.floor(gout.variant) % PEBBLES.length],
            Math.min(1, left * 2),
            forward,
            gout.variant
          ),
          shape: 'chunk',
          spin: turn * 2,
        },
      ];
  }
}

/** The colour of the thin haze about the stream of an element, and how much of it shows. */
export function hazeOf(look: BreathLook, ramp: readonly string[]): { readonly color: string; readonly alpha: number } {
  switch (look.element) {
    case 'fire':
      return { color: hueOf(ramp), alpha: 0.22 };
    case 'ice':
      return { color: mixColor(ramp[4], '#ffffff', 0.4), alpha: 0.25 };
    case 'poison':
      return { color: mixColor(ramp[1], ramp[2], 0.5), alpha: 0.3 };
    case 'thunder':
      return { color: hueOf(ramp), alpha: 0.15 };
    case 'wind':
      return { color: mixColor(ramp[2], '#ffffff', 0.35), alpha: 0.16 };
    case 'dark':
      return { color: mixColor(INK, ramp[0], 0.3), alpha: 0.4 };
    case 'holy':
      return { color: ramp[2], alpha: 0.12 };
    case 'sand':
      return { color: mixColor(ramp[1], DUST, 0.35), alpha: 0.38 };
  }
}
