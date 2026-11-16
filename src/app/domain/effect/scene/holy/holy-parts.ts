import { outCubic, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { circlePoints, floorMark, glow, haze, lightBall, type Point } from '@axe/domain/effect/scene/parts';

/*
 * The parts of holy light that strikes: a pillar of light poured down from the sky, the white beat as
 * it lands, rings thrown out over the floor, the stain of light it leaves, sparks, motes of light
 * rising and feathers drifting down. Every part that is light is laid over a body of warm gold, so it
 * reads on a bright table, where light alone would wash out to nothing.
 */

/** The colours of holy light: a gold deep enough to be its shadow, its body, its glow, and its pale and white heart. */
export interface HolyTones {
  readonly shade: string;
  readonly amber: string;
  readonly gold: string;
  readonly pale: string;
  readonly hot: string;
}

/** The colours of holy light, from an effect's ramp. */
export function holyTonesOf(ramp: readonly string[]): HolyTones {
  return { shade: mixColor(ramp[0], ramp[1], 0.45), amber: ramp[1], gold: ramp[2], pale: ramp[4], hot: ramp[5] };
}

/**
 * A pillar of light standing from a point up to a height: a body of gold, pale down its middle, its
 * edges soft and running downwards, a white heart, and a glow about it; thinning away into the sky.
 */
export function drawPillar(
  drawn: Staged,
  foot: Point,
  top: number,
  wide: number,
  tones: HolyTones,
  shown: number,
  t: number
): void {
  if (shown <= 0.01 || wide < 0.5 || top <= foot.z) return;
  const shares = [1, 0.8, 0.55, 0.3, 0.12, 0];
  const points = shares.map((share) => ({ x: foot.x, y: foot.y, z: foot.z + (top - foot.z) * share }));
  const alphas = shares.map((share) => 1 - share * share * share);
  const flicker = 0.9 + 0.1 * Math.sin(t * 47);
  drawn.ribbons.push(
    {
      points,
      widths: wide * 1.7,
      color: tones.amber,
      alpha: 0.42 * shown,
      alphas,
      blend: 'color',
      soft: 1,
      torn: 0.3,
      flowed: t * 2.2,
    },
    {
      points,
      widths: wide,
      color: tones.amber,
      core: tones.pale,
      alpha: 0.95 * shown,
      alphas,
      blend: 'color',
      soft: 0.3,
      torn: 0.22,
      flowed: t * 3.1,
    },
    { points, widths: wide * 0.46, color: tones.hot, core: '#ffffff', alpha: shown, alphas, blend: 'color', soft: 0.2 },
    { points, widths: wide * 2.6, color: tones.gold, alpha: 0.4 * shown * flicker, alphas, blend: 'light', soft: 1 },
    {
      points,
      widths: wide * 0.8,
      color: tones.pale,
      core: '#ffffff',
      alpha: 0.7 * shown * flicker,
      alphas,
      blend: 'light',
      soft: 0.5,
    }
  );
}

/** A level hoop of light at a height, as a band of gold with a band of light over it. */
export function drawHoop(
  drawn: Staged,
  middle: Point,
  radius: number,
  thick: number,
  tones: HolyTones,
  alpha: number
): void {
  if (alpha <= 0.01 || radius <= 1) return;
  const points = circlePoints(middle, radius, 36);
  drawn.ribbons.push(
    { points, widths: thick * 1.9, color: tones.amber, alpha: 0.6 * alpha, blend: 'color', soft: 0.5 },
    { points, widths: thick, color: tones.gold, core: tones.hot, alpha: 0.95 * alpha, blend: 'color' },
    { points, widths: thick * 1.2, color: tones.pale, core: '#ffffff', alpha, blend: 'light', soft: 0.4 }
  );
}

/**
 * The white beat as a light lands: for an instant a white disc on the floor, a soft blaze of white
 * over one of pale gold at the struck point, and streaks of light across it and up from it.
 */
export function drawBeat(
  drawn: Staged,
  floor: Point,
  wide: number,
  tones: HolyTones,
  since: number,
  lasts = 0.07
): void {
  if (since < 0 || since >= lasts) return;
  const left = 1 - since / lasts;
  const struck = { ...floor, z: floor.z + wide * 0.35 };
  const near = wide * 0.6;
  drawn.floor.push(floorMark('disc', floor, wide * 1.5, 1, '#ffffff', 0.7 * left, 'light', 0));
  drawn.floor.push(floorMark('disc', floor, wide * 1.15, 1, tones.hot, 0.7 * left, 'color', 0));
  drawn.motes.push(haze(struck, wide * 1.9, tones.gold, 0.75, near));
  drawn.motes.push(haze(struck, wide * 1.25, '#ffffff', 0.95, near + 1));
  drawn.motes.push(lightBall(struck, wide * 0.5, '#ffffff', left, near + 2));
  drawn.motes.push({ ...glow(struck, wide * 0.42, '#ffffff', left, near + 3), shape: 'flare', trail: 6, spin: 0 });
  drawn.motes.push({
    ...glow({ ...struck, z: struck.z + wide * 0.8 }, wide * 0.4, tones.hot, left, near + 3),
    shape: 'flare',
    trail: 7,
    spin: Math.PI / 2,
  });
}

/** A ring of light racing out over the floor, a band of gold under a band of light, thinning and fading over `lifeS` seconds. */
export function layLightRing(
  drawn: Staged,
  floor: Point,
  from: number,
  to: number,
  thick: number,
  tones: HolyTones,
  since: number,
  lifeS: number
): void {
  const left = 1 - since / lifeS;
  if (since < 0 || left <= 0) return;
  const radius = from + (to - from) * (1 - left * left * left);
  const width = Math.max(thick * 0.25, thick * left + thick * 0.1) / radius;
  drawn.floor.push(floorMark('ring', floor, radius, width * 1.5, tones.amber, Math.min(0.6, left), 'color', 0));
  drawn.floor.push(floorMark('ring', floor, radius, width * 0.8, tones.gold, Math.min(0.9, left * 1.4), 'color', 0));
  drawn.floor.push(floorMark('ring', floor, radius, width, tones.hot, Math.min(1, left * 1.6), 'light', 0));
}

/**
 * The stain of light a strike leaves on the floor: a ragged patch of gold, bright at once and cooling,
 * a crest burnt into it, and a pool of light over it while it is hot; gone over `lasts` seconds.
 */
export function layLightScorch(
  drawn: Staged,
  floor: Point,
  reach: number,
  tones: HolyTones,
  since: number,
  lasts: number,
  seed: number
): void {
  if (since < 0 || since >= lasts) return;
  const left = 1 - since / lasts;
  const hot = Math.pow(Math.max(0, 1 - since / Math.min(lasts, 1.4)), 1.5);
  const spread = reach * Math.min(1, since / 0.06 + 0.3);
  const fading = Math.min(1, left * 2.5);
  drawn.floor.push(floorMark('scorch', floor, spread, 1, tones.shade, 0.5 * fading, 'color', (seed % 89) + 1));
  drawn.floor.push(floorMark('crest', floor, spread * 0.82, 0.16, tones.amber, 0.85 * fading, 'color', 0, seed % 7));
  if (hot <= 0.01) return;
  drawn.floor.push(floorMark('scorch', floor, spread * 0.85, 1, tones.gold, 0.8 * hot, 'light', (seed % 89) + 1));
  drawn.floor.push(floorMark('crest', floor, spread * 0.82, 0.1, tones.hot, hot, 'light', 0, seed % 7));
  drawn.floor.push(floorMark('disc', floor, reach * 2.4, 1, tones.gold, 0.35 * hot, 'light', 0));
}

/** Sparks of light thrown out from a struck point, flying out fast, slowed, and falling; gone within two thirds of a second. */
export function drawLightSparks(
  drawn: Staged,
  seed: number,
  heart: Point,
  count: number,
  cell: number,
  since: number,
  tones: HolyTones,
  forward: number
): void {
  if (since < 0 || since > 0.66) return;
  const next = seededRun(seed * 31 + 7);
  for (let index = 0; index < count; index++) {
    const turn = next() * Math.PI * 2;
    const fast = cell * (3.5 + next() * 6);
    const up = cell * (1 + next() * 5);
    const life = 0.24 + next() * 0.4;
    if (since >= life) continue;
    const slowed = Math.exp(-3 * since);
    const gone = (fast * (1 - slowed)) / 3;
    const rising = up - 13 * cell * since;
    const age = since / life;
    drawn.motes.push({
      x: heart.x + Math.cos(turn) * gone,
      y: heart.y + Math.sin(turn) * gone,
      z: Math.max(heart.z, heart.z + up * since - 6.5 * cell * since * since),
      size: cell * (index % 3 === 0 ? 0.07 : 0.045),
      color: age < 0.35 ? '#ffffff' : age < 0.7 ? tones.hot : tones.gold,
      alpha: 1 - age * age,
      blend: 'light',
      shape: 'spark',
      velocity: { x: Math.cos(turn) * fast * slowed, y: Math.sin(turn) * fast * slowed, z: rising },
      trail: 0.03,
      forward,
    });
  }
}

/** Where and when motes of light rise: about a point, as far out as `out`, born over a span of time. */
export interface RisingLights {
  readonly count: number;
  /** How far out from the point they are born, in table pixels, at the least and at the most. */
  readonly out: readonly [number, number];
  /** When they are born, in seconds, from the first to the last. */
  readonly born: readonly [number, number];
  /** How fast they rise, in table pixels a second. */
  readonly rise: number;
}

/**
 * Motes of light rising from the floor about a point and twinkling as they go, each a dot of gold with
 * a glow over it, one in three with a star in it.
 */
export function drawRisingLights(
  drawn: Staged,
  seed: number,
  heart: Point,
  cell: number,
  t: number,
  tones: HolyTones,
  lights: RisingLights,
  forward: number
): void {
  const next = seededRun(seed * 53 + 11);
  for (let index = 0; index < lights.count; index++) {
    const turn = next() * Math.PI * 2;
    const out = lights.out[0] + (lights.out[1] - lights.out[0]) * Math.sqrt(next());
    const born = lights.born[0] + (lights.born[1] - lights.born[0]) * next();
    const life = 0.9 + next() * 0.9;
    const pace = 0.6 + next() * 0.8;
    const since = t - born;
    if (since < 0 || since >= life) continue;
    const age = since / life;
    const sway = Math.sin(since * 3.1 + index * 1.9) * cell * 0.08;
    const at = {
      x: heart.x + Math.cos(turn) * out + sway,
      y: heart.y + Math.sin(turn) * out + sway * 0.6,
      z: heart.z + cell * 0.08 + lights.rise * pace * since,
    };
    const fade = Math.min(1, age * 7, (1 - age) * 2.5);
    drawn.motes.push(haze(at, cell * 0.11, tones.amber, 0.85 * fade, forward));
    drawn.motes.push(glow(at, cell * 0.16, tones.hot, fade, forward + 1));
    if (index % 3 === 0) {
      const twinkle = Math.abs(Math.sin(t * 9 + index * 2.3));
      drawn.motes.push({
        ...glow(at, cell * 0.34, '#ffffff', fade * twinkle, forward + 2),
        shape: 'star',
        spin: index,
      });
    }
  }
}

/** Where and when feathers fall: about a point, from a height, born over a span of time. */
export interface Feathers {
  readonly count: number;
  /** How far out from the point they are born, in table pixels, at the least and at the most. */
  readonly out: readonly [number, number];
  /** How high over the floor they are born, in table pixels, at the least and at the most. */
  readonly high: readonly [number, number];
  /** When they are born, in seconds, from the first to the last. */
  readonly born: readonly [number, number];
  /** When the last of them must be gone, in seconds. */
  readonly ends: number;
}

/**
 * Feathers drifting down about a point: each rocks from side to side as it falls, tilting the way it
 * slides, comes to rest on the floor, and fades.
 */
export function drawFeathers(
  drawn: Staged,
  seed: number,
  heart: Point,
  cell: number,
  t: number,
  tones: HolyTones,
  feathers: Feathers,
  forward: number
): void {
  const next = seededRun(seed * 71 + 3);
  for (let index = 0; index < feathers.count; index++) {
    const turn = next() * Math.PI * 2;
    const out = feathers.out[0] + (feathers.out[1] - feathers.out[0]) * Math.sqrt(next());
    const high = feathers.high[0] + (feathers.high[1] - feathers.high[0]) * next();
    const born = feathers.born[0] + (feathers.born[1] - feathers.born[0]) * next();
    const falls = cell * (0.75 + next() * 0.55);
    const rocks = 2.4 + next() * 1.6;
    const phase = next() * Math.PI * 2;
    const size = cell * (0.3 + next() * 0.18);
    const lean = (next() - 0.5) * 1.2;
    const life = Math.min(high / falls + 0.9, feathers.ends - born);
    const since = t - born;
    if (since < 0 || since >= life) continue;
    const down = Math.min(high, falls * since);
    const resting = down >= high;
    const swing = resting ? Math.sin(phase + rocks * (high / falls)) : Math.sin(phase + rocks * since);
    const fade = Math.min(1, since * 5, (life - since) * 1.6);
    const at = {
      x: heart.x + Math.cos(turn) * out + swing * cell * 0.22,
      y: heart.y + Math.sin(turn) * out + swing * cell * 0.08,
      z: heart.z + high - down + size * 0.4,
    };
    drawn.motes.push({
      ...at,
      size,
      color: index % 2 === 0 ? '#fffaf0' : tones.pale,
      alpha: 0.95 * fade,
      blend: 'color',
      shape: 'feather',
      spin: lean + swing * 0.75,
      forward,
    });
    if (!resting) drawn.motes.push(glow(at, size * 1.5, tones.gold, 0.3 * fade, forward));
  }
}

/** How strong something that comes and goes is: up over `rises` seconds from its start, and gone over `falls` before its end. */
export function swell(t: number, from: number, to: number, rises: number, falls: number): number {
  return Math.min(outCubic(within(t, from, from + rises)), 1 - within(t, to - falls, to));
}
