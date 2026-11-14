import { type BreathLook } from '@axe/domain/effect/scene/breath/breath-looks';
import { type Gout, type GoutState } from '@axe/domain/effect/scene/breath/breath-stream';
import { type Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { type EffectMote } from '@axe/domain/effect/scene/effect-scene';
import { DUST, SMOKE, STONE } from '@axe/domain/effect/scene/fire/fire-parts';
import { ball, glow, haze, hueOf, type Point, smokePuff } from '@axe/domain/effect/scene/parts';

/*
 * How the gouts of a breath are drawn, by element and by the layer of the stream they are of. Light
 * is drawn under colour, so what is to show over the body of a stream, its bright heart and its
 * streaks, is colour too, and light is kept for what glows about it. Everything of the stream is held
 * to its own depth, so a piece the stream passes behind hides it.
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

/** Draws one gout of a stream as its element and its layer have it. */
export function drawGout(brush: StreamBrush, layer: GoutLayer, gout: Gout, state: GoutState): void {
  const { drawn, look, ramp, cell } = brush;
  const forward = cell * NEARER_CELLS;
  const dying = state.left < 0.3 ? state.left / 0.3 : 1;
  const size = gout.size * state.grown * (0.45 + 0.55 * Math.min(1, state.left * 1.4));
  const at = { x: state.x, y: state.y, z: Math.max(state.z, brush.floorZ + size * OVER_FLOOR) };
  const push = (...motes: EffectMote[]) => {
    for (const mote of motes) drawn.motes.push(deep(mote));
  };
  if (layer === 'streak') {
    push(...streakOf(look, ramp, at, gout, state, cell, forward));
    return;
  }
  if (layer === 'carried') {
    push(...carriedOf(brush, at, gout, state, forward));
    return;
  }
  if (layer === 'curl') {
    push(...curlOf(brush, at, size, gout, state, forward));
    return;
  }
  const hot = layer === 'core';
  switch (look.element) {
    case 'fire': {
      if (hot) {
        const step = state.along < 0.45 ? 5 : 4;
        push(ball(at, size, ramp[step], dying, forward, gout.variant));
        if (state.along < 0.35) push(ball(at, size * 0.55, '#ffffff', dying, forward, gout.variant + 1.7));
        return;
      }
      const heat = 1 - Math.min(1, state.along * (0.5 + 0.5 * gout.edge) + 0.3 * state.breaking);
      if (look.fiery && heat < 0.16 && gout.variant < 6 * (0.2 + 0.4 * gout.edge)) {
        push(smokePuff(at, size * 1.15, mixColor(SMOKE, ramp[0], 0.25), 0.55 * state.left, forward));
        return;
      }
      const step = heat > 0.8 ? 5 : heat > 0.6 ? 4 : heat > 0.38 ? 3 : heat > 0.18 ? 2 : 1;
      push(ball(at, size, ramp[step - 1], dying, forward, gout.variant));
      push(ball({ ...at, z: at.z + size * 0.09 }, size * 0.76, ramp[step], dying, forward, gout.variant + 1.3));
      if (heat > 0.5) {
        push(ball({ ...at, z: at.z + size * 0.16 }, size * 0.42, ramp[step + 1], dying, forward, gout.variant + 2.9));
      }
      return;
    }
    case 'ice': {
      if (hot) {
        push(haze(at, size * 1.3, '#ffffff', 0.55 * state.left, forward));
        return;
      }
      const fog = mixColor(ramp[4], '#ffffff', 0.4 - 0.3 * gout.edge);
      push(smokePuff(at, size * 1.3, fog, 0.5 * state.left, forward));
      if (gout.variant < 3)
        push(haze(at, size * 0.7, '#ffffff', 0.3 * state.left * (1 - Math.min(1, state.along)), forward));
      return;
    }
    case 'poison': {
      if (hot) {
        push(glow(at, size * 1.6, ramp[3], 0.22 * state.left, forward));
        push(haze(at, size * 1.1, mixColor(SICKLY, '#ffffff', 0.35), 0.3 * state.left, forward));
        return;
      }
      const tone = gout.variant < 3.6 ? mixColor(ramp[1], ramp[2], 0.5) : mixColor(SICKLY, ramp[1], 0.3);
      push(smokePuff(at, size * 1.25, tone, 0.7 * state.left, forward));
      push(haze(at, size * 0.7, mixColor(INK, ramp[0], 0.6), 0.25 * state.left, forward));
      return;
    }
    case 'thunder':
      push(haze(at, size * 1.3, hueOf(ramp), 0.22 * state.left, forward));
      push(glow(at, size * 1.1, ramp[3], 0.28 * state.left, forward));
      return;
    case 'wind':
      push(haze(at, size * 1.5, mixColor(ramp[2], '#ffffff', 0.35), 0.2 * state.left, forward));
      return;
    case 'dark': {
      if (hot) {
        push(haze(at, size * 1.4, '#000000', 0.6 * state.left, forward));
        return;
      }
      if (gout.edge > 0.72) push(haze(at, size * 1.7, ramp[2], 0.4 * state.left, forward));
      push(smokePuff(at, size * 1.25, mixColor(INK, ramp[0], 0.3), 0.78 * state.left, forward));
      return;
    }
    case 'holy':
      if (hot) {
        push(glow(at, size * 1.6, ramp[5], 0.25 * state.left, forward));
        push(haze(at, size * 1.3, '#ffffff', 0.3 * state.left, forward));
        return;
      }
      push(glow(at, size * 1.5, ramp[3], 0.13 * state.left, forward));
      push(haze(at, size * 1.1, ramp[2], 0.16 * state.left, forward));
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
      return [{ ...streak(ramp[3], 0.5, 0.09), size: gout.size * 2.2 }, streak('#ffffff', 0.9, 0.07)];
    case 'dark':
      return [streak(ramp[3], 0.6, 0.05)];
    case 'holy':
      return [streak(ramp[5], 0.5, 0.08), glow(at, cell * 0.14, ramp[4], 0.3 * fading, forward)];
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
        glow(at, gout.size * 1.4, ramp[4], 0.45 * left * glint, forward),
        { ...ball(at, gout.size, '#ffffff', left * glint, forward, 0), shape: 'star', spin: gout.variant },
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
  }
}
