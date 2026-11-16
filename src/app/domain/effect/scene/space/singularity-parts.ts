import { type Staged } from '@axe/domain/effect/scene/choreography';
import { roundDisc } from '@axe/domain/effect/scene/dark/dark-parts';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { type EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { glow, haze, lightBall, type Point } from '@axe/domain/effect/scene/parts';
import {
  layScreenLine,
  layWound,
  scatterOf,
  screenArc,
  type SpaceTones,
  tippedCircle,
} from '@axe/domain/effect/scene/space/space-parts';
import { debrisKindOf, debrisRibbon } from '@axe/domain/effect/scene/wind/wind-parts';

/*
 * The parts of a singularity: the hole, black within a pale rim of bent light; the ring of light it
 * wears, whirling round it in bands, and the jets thrown off its poles; arcs of light bent round it on
 * every side; the spiral its pull lays over the floor; and what it drags in off the floor along it.
 */

/** How many arms the spiral its pull lays over the floor has, and the earth they are scoured into. */
const SPIRAL_ARMS = 9;
const SOIL = '#3a2a24';

/** How the hole is at a moment: how large, how far its ring is spun up, how strong its jets, and how far it has fallen in. */
export interface HoleLook {
  readonly radius: number;
  readonly spun: number;
  readonly jets: number;
  readonly fallen: number;
  readonly t: number;
  readonly heading: number;
}

/** The hole itself: light glowing about it, a pale rim of bent light, a deep edge, and black within, since colour is laid over light. */
export function drawHole(
  drawn: Staged,
  at: Point,
  look: HoleLook,
  tones: SpaceTones,
  cell: number,
  forward: number
): void {
  if (look.radius < 0.5) return;
  const wide = look.radius * 2;
  drawn.motes.push(glow(at, cell * (1.6 + 2.6 * look.spun), tones.glow, 0.35 + 0.35 * look.spun, forward));
  drawn.motes.push(lightBall(at, wide * 1.42, look.fallen > 0.3 ? '#ffffff' : tones.pale, 1, forward + 1));
  drawn.motes.push(haze(at, wide * 2.6, mixColor(tones.edge, '#000000', 0.3), 0.5, forward));
  drawn.motes.push(...roundDisc(at, wide * 1.2, tones.deep, 1, forward + 2));
  drawn.motes.push(...roundDisc(at, wide * 1.08, '#000000', 1, forward + 3));
}

/** Arcs of light bent round the hole on every side, turning slowly, flickering as they are pulled at. */
export function drawBentLight(
  drawn: Staged,
  at: Point,
  look: HoleLook,
  tones: SpaceTones,
  cell: number,
  forward: number
): void {
  const shown = look.spun * (1 - look.fallen);
  if (shown <= 0.01) return;
  for (let arc = 0; arc < 4; arc++) {
    const radius = look.radius * (2.4 + 0.75 * arc) * (1 - 0.6 * look.fallen);
    const from = scatterOf(arc, 5) * Math.PI * 2 + look.t * (0.5 + 0.3 * arc) * (arc % 2 === 0 ? 1 : -1);
    const span = 0.9 + 0.7 * scatterOf(arc, 9);
    layScreenLine(drawn, at, screenArc(radius, from, from + span, 6), {
      sheath: tones.deep,
      light: tones.glow,
      heart: tones.pale,
      alpha: shown * (0.65 + 0.35 * Math.sin(look.t * 17 + arc * 2.3)),
      wide: cell * 0.03,
      forward: forward + 4,
    });
  }
}

/**
 * The ring of light the hole wears, in bands whirling round it at different speeds, hottest nearest
 * it, drawn by halves about it, and the streams of light along it.
 */
export function drawDisc(
  drawn: Staged,
  at: Point,
  look: HoleLook,
  tones: SpaceTones,
  cell: number,
  forward: number
): void {
  const shown = look.spun;
  if (shown <= 0.01 || look.radius < 0.5) return;
  const shrunk = (1 - look.fallen) * (1 - look.fallen);
  const bands = [
    { out: 1.75, wide: 0.5, speed: 7, sheath: tones.edge, heart: '#ffffff' },
    { out: 2.35, wide: 0.42, speed: 5, sheath: tones.edge, heart: tones.pale },
    { out: 3, wide: 0.36, speed: 3.6, sheath: tones.deep, heart: tones.glow },
    { out: 3.8, wide: 0.28, speed: 2.4, sheath: tones.deep, heart: tones.glow },
  ];
  bands.forEach((band, index) => {
    const radius = look.radius * band.out * (0.6 + 0.4 * shown) * shrunk + look.radius * 1.2 * (1 - shrunk);
    const phase = look.t * band.speed * (1 + 2 * look.fallen);
    const ring = tippedCircle(at, radius, 40, 0.32, look.heading, phase, phase + Math.PI * 2);
    layWound(drawn, ring, at, {
      sheath: band.sheath,
      light: tones.glow,
      heart: band.heart,
      wide: look.radius * band.wide * (0.5 + 0.5 * shown),
      alpha: shown * (index < 2 ? 1 : 0.85),
      lit: shown * (index < 2 ? 1 : 0.6),
      nearShare: 1,
      alphas: ring.map((_point, step) => 0.55 + 0.45 * Math.abs(Math.sin(step * 0.39 + index))),
    });
  });
  for (let stream = 0; stream < 28; stream++) {
    const out = look.radius * (1.6 + 2.4 * scatterOf(stream, 3)) * shrunk + look.radius * 1.1 * (1 - shrunk);
    const turn = scatterOf(stream, 7) * Math.PI * 2 + look.t * (9 - out / look.radius) * (1 + 2 * look.fallen);
    const [point, ahead] = tippedCircle(at, out, 1, 0.32, look.heading, turn, turn + 0.25);
    const fast = out * 0.25 * 20;
    const velocity = {
      x: ((ahead.x - point.x) / (out * 0.25)) * fast,
      y: ((ahead.y - point.y) / (out * 0.25)) * fast,
      z: ((ahead.z - point.z) / (out * 0.25)) * fast,
    };
    drawn.motes.push({
      ...point,
      size: cell * 0.16,
      color: tones.glow,
      alpha: 0.7 * shown,
      blend: 'light',
      shape: 'spark',
      velocity,
      trail: 0.03,
      forward,
    });
  }
}

/** The jets thrown off the poles of the hole: a long one up, and a short one down that stops well over the pieces. */
export function drawJets(
  drawn: Staged,
  at: Point,
  look: HoleLook,
  tones: SpaceTones,
  cell: number,
  floorZ: number
): void {
  const shown = look.jets * (1 - look.fallen);
  if (shown <= 0.01) return;
  const flicker = 0.8 + 0.2 * Math.sin(look.t * 37);
  for (const [way, long] of [
    [1, cell * (2.6 + 1.6 * shown)],
    [-1, Math.min(cell * 0.6, (at.z - floorZ) * 0.25)],
  ] as const) {
    const points = [0.15, 0.5, 1].map((share) => ({
      x: at.x,
      y: at.y,
      z: at.z + way * (look.radius * 1.2 + long * share),
    }));
    const widths = [look.radius * 1.1, look.radius * 0.7, look.radius * 0.2].map((wide) => wide * flicker * shown);
    const band: Omit<EffectRibbon, 'color' | 'alpha' | 'blend'> = { points, widths, alphas: [1, 0.85, 0.2] };
    drawn.ribbons.push({
      ...band,
      widths: widths.map((wide) => wide * 2.4),
      color: tones.glow,
      alpha: 0.75 * shown,
      blend: 'light',
      soft: 0.85,
    });
    drawn.ribbons.push({
      ...band,
      color: tones.edge,
      core: '#ffffff',
      alpha: shown,
      blend: 'color',
      torn: 0.3,
      flowed: -look.t * 6,
    });
  }
}

/**
 * The spiral the pull lays over the floor: arms wound in towards the middle, turning in, dark grooves
 * with a thread of light down each; `burnt` leaves them as scoured grooves, their light gone.
 */
export function laySpiral(
  drawn: Staged,
  floor: Point,
  reach: number,
  tones: SpaceTones,
  turned: number,
  shown: number,
  lit: number,
  cell: number
): void {
  if (shown <= 0.01) return;
  for (let arm = 0; arm < SPIRAL_ARMS; arm++) {
    const points: Point[] = [];
    const widths: number[] = [];
    for (let step = 0; step <= 22; step++) {
      const u = step / 22;
      const out = reach * (0.12 + (0.7 + 0.4 * scatterOf(arm, 13)) * u);
      const turn = turned + (arm * Math.PI * 2) / SPIRAL_ARMS + 2.6 * (1 - u) * (1 - u);
      points.push({ x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: floor.z + 1 });
      widths.push(cell * (0.1 + 0.08 * scatterOf(arm, 17)) * Math.sin(Math.PI * Math.min(1, u * 1.15 + 0.05)) ** 0.7);
    }
    const alphas = points.map((_point, step) => Math.min(1, (step / 22) * 4) * Math.min(1, (1 - step / 22) * 5));
    if (lit > 0.01) {
      drawn.ribbons.push({
        points,
        widths: widths.map((wide) => wide * 1.6),
        color: tones.glow,
        alpha: 0.5 * lit,
        alphas,
        blend: 'light',
        soft: 0.8,
      });
    }
    drawn.ribbons.push({
      points,
      widths,
      color: tones.ink,
      core: lit > 0.01 ? mixColor(SOIL, tones.glow, 0.75 * lit) : mixColor(SOIL, '#000000', 0.35),
      alpha: 0.8 * shown,
      alphas,
      blend: 'color',
      torn: 0.35,
      flowed: turned * 3,
    });
  }
}

/** One thing dragged in along the spiral: a fleck of dust or grass, or a leaf, a twig or a stone, as it is at a moment. */
export function drawDragged(
  drawn: Staged,
  floor: Point,
  hole: Point,
  reach: number,
  tones: SpaceTones,
  cell: number,
  t: number,
  pull: number,
  forward: number
): void {
  if (pull <= 0.01) return;
  const greens = ['#5b7a2a', '#8fa94a', '#7a6a5c', '#a89272'];
  for (let fleck = 0; fleck < 64; fleck++) {
    const pace = 0.35 + 0.35 * scatterOf(fleck, 3);
    const p = (t * pace * (0.6 + 0.8 * pull) + scatterOf(fleck, 5)) % 1;
    const start = 0.35 + 0.65 * scatterOf(fleck, 7);
    const out = reach * start * Math.pow(1 - p, 1.3);
    const turn = scatterOf(fleck, 11) * Math.PI * 2 + 3.4 * p * p;
    const lifted = Math.max(0, (p - 0.7) / 0.3);
    const at = {
      x: floor.x + (hole.x - floor.x) * lifted * lifted + Math.cos(turn) * out,
      y: floor.y + (hole.y - floor.y) * lifted * lifted + Math.sin(turn) * out,
      z: floor.z + cell * 0.05 + (hole.z - floor.z) * lifted * lifted,
    };
    const fast = cell * (2 + 9 * p) * (0.4 + 0.6 * pull);
    const velocity = {
      x: (-Math.cos(turn) * 0.6 - Math.sin(turn) * 0.8) * fast,
      y: (-Math.sin(turn) * 0.6 + Math.cos(turn) * 0.8) * fast,
      z: lifted > 0 ? fast * 0.8 : 0,
    };
    const fade = Math.min(1, p * 6, (1 - p) * 8) * pull;
    if (fleck % 8 === 0) {
      const kind = debrisKindOf(fleck / 8);
      drawn.ribbons.push(
        debrisRibbon({
          kind,
          at,
          size: cell * (kind === 'stone' ? 0.16 : 0.24),
          turn: t * 9 + fleck,
          tip: Math.sin(t * 7 + fleck),
          alpha: fade,
          variant: fleck,
        })
      );
      continue;
    }
    drawn.motes.push({
      ...at,
      size: cell * 0.13,
      color: greens[fleck % greens.length],
      alpha: 0.9 * fade,
      blend: 'color',
      shape: 'spark',
      velocity,
      trail: 0.05,
      forward,
    });
    if (fleck % 3 === 0) {
      drawn.motes.push({
        ...at,
        size: cell * 0.14,
        color: tones.glow,
        alpha: 0.5 * fade,
        blend: 'light',
        shape: 'spark',
        velocity,
        trail: 0.06,
        forward,
      });
    }
  }
}
