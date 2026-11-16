import { outCubic, type Staged } from '@axe/domain/effect/scene/choreography';
import { roundDisc } from '@axe/domain/effect/scene/dark/dark-parts';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { STONE } from '@axe/domain/effect/scene/fire/fire-parts';
import { glow, haze, type Point } from '@axe/domain/effect/scene/parts';
import { type HoleLook } from '@axe/domain/effect/scene/space/singularity-parts';
import { type BoldTones, layBoldBand, layBoldScreenLine } from '@axe/domain/effect/scene/space/space-bold';
import { scatterOf, screenArc, tippedCircle } from '@axe/domain/effect/scene/space/space-parts';

/*
 * The heavy bodies of a singularity: the hole, a body of black rimmed in burning colour; the disc it
 * wears, in bands from a white heart through its hot colour and its full colour out to a dark sheath;
 * the streams of debris it drags in off the whole of the floor it takes in; the body of the shock it
 * throws out as it falls in, a ring of its colour racing out at its height and a surge of dust rolling
 * out over the floor; and the air still bent where it was once it has gone.
 */

const DUST = '#6f5d4c';
const DUST_LIT = '#b9a585';

/** The hole itself: light glowing about it, a dark sheath, a burning rim and black within, since colour is laid over light. */
export function drawBoldHole(
  drawn: Staged,
  at: Point,
  look: HoleLook,
  tones: BoldTones,
  cell: number,
  forward: number
): void {
  if (look.radius < 0.5) return;
  const wide = look.radius * 2;
  drawn.motes.push(glow(at, cell * (2 + 3 * look.spun), tones.hot, 0.3 + 0.3 * look.spun, forward));
  drawn.motes.push(haze(at, wide * 2.8, tones.rim, 0.6, forward));
  drawn.motes.push(...roundDisc(at, wide * 1.36, tones.hot, 1, forward + 2));
  drawn.motes.push(...roundDisc(at, wide * 1.18, look.fallen > 0.3 ? '#ffffff' : tones.core, 1, forward + 2.5));
  drawn.motes.push(...roundDisc(at, wide * 1.08, '#000000', 1, forward + 3));
}

/** How far the disc is tipped from level, in radians. */
const DISC_TILT = 0.45;

/** How many steps the body of the hole is laid in, from its foot to its top. */
const HOLE_STEPS = 12;

/**
 * The body of the hole laid as a band standing up through it, as wide as the hole at each height, so
 * that it covers the far half of the disc behind it, as the particles of the hole cannot: its burning
 * rim, and black within.
 */
function layHoleBody(drawn: Staged, at: Point, radius: number, tones: BoldTones): void {
  if (radius < 0.5) return;
  for (const [share, color] of [
    [1.36, tones.hot],
    [1.1, '#000000'],
  ] as const) {
    const points = Array.from({ length: HOLE_STEPS + 1 }, (_unused, step) => ({
      x: at.x,
      y: at.y,
      z: at.z + radius * share * (-1 + (2 * step) / HOLE_STEPS),
    }));
    const widths = points.map((_point, step) => {
      const v = -1 + (2 * step) / HOLE_STEPS;
      return 2 * radius * share * Math.sqrt(Math.max(0, 1 - v * v));
    });
    drawn.ribbons.push({ points, widths, color, alpha: 1, blend: 'color' });
  }
}

/** The bands of the disc, from the hole out: how far out, how wide, as shares of the hole, and which of its colours. */
const DISC_BANDS: readonly {
  readonly out: number;
  readonly wide: number;
  readonly speed: number;
  readonly tone: 'core' | 'hot' | 'body' | 'deep' | 'rim';
}[] = [
  { out: 1.55, wide: 0.5, speed: 7, tone: 'core' },
  { out: 2.05, wide: 0.6, speed: 5.2, tone: 'hot' },
  { out: 2.65, wide: 0.66, speed: 3.8, tone: 'body' },
  { out: 3.3, wide: 0.6, speed: 2.7, tone: 'deep' },
  { out: 3.95, wide: 0.5, speed: 2, tone: 'rim' },
];

/**
 * The disc the hole wears, a heavy body of bands whirling round at different speeds, a white heart
 * nearest the hole through its hot and full colours to the deep at its edge, each over a dark rim,
 * clumped and torn as they whirl: its far half behind the hole first, darkened, then the body of the
 * hole over it, then its near half before it; and sparks of its hot colour streaming round.
 */
export function drawBoldDisc(
  drawn: Staged,
  at: Point,
  look: HoleLook,
  tones: BoldTones,
  cell: number,
  forward: number
): void {
  const shown = look.spun;
  if (shown <= 0.01 || look.radius < 0.5) return;
  const shrunk = (1 - look.fallen) * (1 - look.fallen);
  const reachOf = (out: number) => look.radius * out * (0.6 + 0.4 * shown) * shrunk + look.radius * 1.2 * (1 - shrunk);
  const deep = mixColor(tones.body, tones.rim, 0.45);
  const colours = {
    core: tones.core,
    hot: tones.hot,
    body: tones.body,
    deep,
    rim: mixColor(tones.rim, tones.body, 0.3),
  };
  for (const near of [false, true]) {
    if (near) layHoleBody(drawn, at, look.radius, tones);
    DISC_BANDS.forEach((band, index) => {
      const phase = look.t * band.speed * (1 + 2 * look.fallen);
      const ring = tippedCircle(at, reachOf(band.out), 36, DISC_TILT, look.heading, phase, phase + Math.PI * 2);
      const body = colours[band.tone];
      layBoldBand(
        drawn,
        ring,
        {
          rim: index === 0 ? tones.hot : tones.rim,
          body: near ? body : mixColor(body, tones.rim, 0.45),
          core: near ? (index < 2 ? '#ffffff' : index < 4 ? tones.hot : tones.body) : body,
          glow: near && index < 2 ? tones.hot : undefined,
          lit: shown,
          wide: look.radius * band.wide * (0.5 + 0.5 * shown),
          alpha: shown,
          alphas: ring.map((_point, step) => 0.6 + 0.4 * Math.abs(Math.sin(step * 0.39 + index * 1.3))),
          torn: 0.25,
          flowed: phase * 2,
        },
        at,
        near ? 1 : 0,
        near ? 0 : 1
      );
    });
  }
  for (let stream = 0; stream < 24; stream++) {
    const out = reachOf(1.6 + 2.2 * scatterOf(stream, 3));
    const turn = scatterOf(stream, 7) * Math.PI * 2 + look.t * (9 - out / look.radius) * (1 + 2 * look.fallen);
    const [point, ahead] = tippedCircle(at, out, 1, DISC_TILT, look.heading, turn, turn + 0.25);
    const velocity = {
      x: (ahead.x - point.x) * 20,
      y: (ahead.y - point.y) * 20,
      z: (ahead.z - point.z) * 20,
    };
    drawn.motes.push({
      ...point,
      size: cell * 0.2,
      color: tones.hot,
      alpha: 0.7 * shown,
      blend: 'light',
      shape: 'spark',
      velocity,
      trail: 0.03,
      forward,
    });
  }
}

/**
 * The streams of debris the hole drags in off the whole of the floor it takes in: heavy arms of dust
 * and earth wound in from the edge of the area, lifting off the floor as they close on it and running
 * up into its disc, their pattern running in along them, as strong as `pull`.
 */
export function drawStreams(
  drawn: Staged,
  floor: Point,
  hole: Point,
  reach: number,
  holeRadius: number,
  tones: BoldTones,
  cell: number,
  t: number,
  pull: number
): void {
  if (pull <= 0.01) return;
  const arms = 6;
  const steps = 18;
  for (let arm = 0; arm < arms; arm++) {
    const points: Point[] = [];
    const widths: number[] = [];
    const alphas: number[] = [];
    const from = reach * (0.95 + 0.15 * scatterOf(arm, 3));
    for (let step = 0; step <= steps; step++) {
      const u = step / steps;
      const out = from * Math.pow(1 - u, 1.15) + holeRadius * 3.4 * u;
      const turn = (arm * Math.PI * 2) / arms - t * 0.8 + 3.4 * u;
      const lift = Math.pow(u, 2.4);
      points.push({
        x: floor.x + (hole.x - floor.x) * lift + Math.cos(turn) * out,
        y: floor.y + (hole.y - floor.y) * lift + Math.sin(turn) * out,
        z: floor.z + cell * 0.12 + (hole.z - floor.z - cell * 0.12) * lift,
      });
      widths.push(cell * (0.14 + 0.42 * (1 - u)) * pull);
      alphas.push(Math.min(1, u * 6) * Math.min(1, (1 - u) * 5));
    }
    drawn.ribbons.push({
      points,
      widths: widths.map((wide) => wide * 1.4 + 2),
      color: mixColor(DUST, '#000000', 0.55),
      alpha: 0.85 * pull,
      alphas,
      blend: 'color',
      torn: 0.85,
      soft: 0.3,
      flowed: t * 5 + arm,
    });
    drawn.ribbons.push({
      points,
      widths,
      color: DUST,
      core: mixColor(DUST_LIT, tones.body, 0.15),
      alpha: 0.9 * pull,
      alphas,
      blend: 'color',
      torn: 0.85,
      soft: 0.3,
      flowed: t * 5 + arm + 0.5,
    });
    for (let stone = 0; stone < 3; stone++) {
      const along = (t * 0.55 + stone / 3 + arm * 0.13) % 1;
      const step = Math.min(steps - 1, Math.floor(along * steps));
      const share = along * steps - step;
      const from = points[step];
      const to = points[step + 1];
      drawn.motes.push({
        x: from.x + (to.x - from.x) * share,
        y: from.y + (to.y - from.y) * share,
        z: from.z + (to.z - from.z) * share,
        size: cell * (0.22 - 0.1 * along),
        color: STONE,
        alpha: pull * Math.min(1, along * 8, (1 - along) * 6),
        blend: 'color',
        shape: 'chunk',
        spin: t * 8 + stone + arm,
        variant: arm * 3 + stone,
        forward: cell * 0.3,
      });
    }
  }
}

/**
 * The body of the shock thrown out as the hole falls in: a heavy ring of its colour racing out at its
 * height, a second behind it, and a surge of dust rolling out over the floor of the whole area.
 */
export function drawShockBody(
  drawn: Staged,
  hole: Point,
  floor: Point,
  reach: number,
  tones: BoldTones,
  cell: number,
  since: number,
  forward: number
): void {
  for (const [delay, lasts, to, thick] of [
    [0, 0.7, 5, 0.75],
    [0.1, 0.85, 3.4, 0.45],
  ] as const) {
    const share = (since - delay) / lasts;
    if (share < 0 || share >= 1) continue;
    const left = 1 - share;
    const middle = { ...hole, z: hole.z - cell * 0.6 * share };
    const radius = cell * (0.6 + to * outCubic(share));
    layBoldBand(
      drawn,
      tippedCircle(middle, radius, 40, 0.2, 0),
      {
        rim: tones.rim,
        body: share < 0.2 ? tones.hot : tones.body,
        core: share < 0.15 ? '#ffffff' : tones.hot,
        glow: tones.hot,
        lit: left,
        wide: cell * (0.14 + thick * 0.8 * left),
        alpha: Math.min(1, left * 2),
        torn: 0.55,
        flowed: since * 6,
      },
      middle,
      0.85
    );
    if (delay > 0) continue;
    for (let cloud = 0; cloud < 30; cloud++) {
      const turn = (cloud / 30) * Math.PI * 2 + scatterOf(cloud, 9) * 0.2;
      drawn.motes.push({
        x: middle.x + Math.cos(turn) * radius * 1.04,
        y: middle.y + Math.sin(turn) * radius * 1.04,
        z: middle.z + cell * 0.1 * (scatterOf(cloud, 13) - 0.5),
        size: cell * (0.7 + 0.9 * share),
        color: mixColor(tones.body, tones.rim, 0.5),
        core: mixColor(tones.hot, tones.body, 0.4),
        alpha: 0.85 * Math.min(1, left * 1.8),
        blend: 'color',
        shape: 'billow',
        velocity: { x: Math.cos(turn) * 100, y: Math.sin(turn) * 100, z: 0 },
        trail: (cell * 0.5) / 100,
        spin: since * 3 + cloud,
        variant: cloud,
        forward,
      });
    }
  }
  for (let cloud = 0; cloud < 22; cloud++) {
    const age = (since - 0.04 - 0.08 * scatterOf(cloud, 3)) / 1.9;
    if (age < 0 || age >= 1) continue;
    const turn = (cloud / 22) * Math.PI * 2 + scatterOf(cloud, 5) * 0.3;
    const out = reach * (0.15 + 1.25 * outCubic(Math.min(1, age * 1.5)));
    drawn.motes.push({
      x: floor.x + Math.cos(turn) * out,
      y: floor.y + Math.sin(turn) * out,
      z: floor.z + cell * (0.3 + 0.6 * age),
      size: cell * (0.9 + 1 * age),
      color: mixColor(DUST, tones.rim, 0.35),
      core: mixColor(DUST_LIT, tones.hot, 0.2 * (1 - age)),
      alpha: 0.85 * Math.min(1, age * 12) * (1 - age),
      blend: 'color',
      shape: 'billow',
      velocity: { x: Math.cos(turn) * 100, y: Math.sin(turn) * 100, z: 30 },
      trail: (cell * 0.45) / 100,
      spin: age * 2.5 + cloud,
      variant: cloud,
      forward,
    });
  }
}

/**
 * What lingers where the hole was once it has gone: the air still bent there, a dark lens wavering
 * about a last pinpoint of black rimmed in its hot colour and arcs of bent light turning about it,
 * fading out as `shown` falls.
 */
export function drawLingering(
  drawn: Staged,
  hole: Point,
  tones: BoldTones,
  cell: number,
  t: number,
  shown: number,
  forward: number
): void {
  if (shown <= 0.01) return;
  const waver = 1 + 0.12 * Math.sin(t * 9);
  drawn.motes.push(haze(hole, cell * 2.6 * waver, tones.rim, 0.55 * shown, forward));
  drawn.motes.push(haze(hole, cell * 1.1 * waver, tones.ink, 0.6 * shown, forward + 0.5));
  drawn.motes.push(...roundDisc(hole, cell * 0.5 * shown * waver, tones.hot, shown, forward + 1));
  drawn.motes.push(...roundDisc(hole, cell * 0.38 * shown * waver, '#000000', shown, forward + 1.5));
  for (let arc = 0; arc < 3; arc++) {
    const from = scatterOf(arc, 5) * Math.PI * 2 + t * (0.9 + 0.4 * arc) * (arc % 2 === 0 ? 1 : -1);
    layBoldScreenLine(drawn, hole, screenArc(cell * (0.8 + 0.35 * arc) * waver, from, from + 1.4, 6), {
      rim: tones.rim,
      body: tones.body,
      core: tones.hot,
      glow: tones.hot,
      alpha: shown * (0.7 + 0.3 * Math.sin(t * 13 + arc * 2.3)),
      lit: 0.4 * shown,
      wide: cell * 0.13,
      forward: forward + 1,
    });
  }
}
