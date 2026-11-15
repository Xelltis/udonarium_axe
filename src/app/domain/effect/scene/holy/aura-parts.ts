import { type Staged } from '@axe/domain/effect/scene/choreography';
import { flameRampOf, mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { type HolyTones } from '@axe/domain/effect/scene/holy/holy-parts';
import { circlePoints, floorMark, glow, haze, type Point } from '@axe/domain/effect/scene/parts';

/*
 * The parts of an aura: flames of spirit standing in a ring about a piece and streaming up, each a
 * band with torn edges that wavers as it climbs, drawn by halves so those behind the piece stand in
 * full and those before it are thin enough to see it through; the floor cracked under it; pebbles
 * lifted off the floor and hung in the air; streaks racing up; and rings thrown out over the floor.
 *
 * Every length here is in table pixels.
 */

/** The colours of an aura: its shadow, the deep and full colours of its flames, its gold, and its pale heart. */
export interface AuraTones {
  readonly shade: string;
  readonly rim: string;
  readonly body: string;
  readonly gold: string;
  readonly pale: string;
}

/**
 * The colours of an aura, from an effect's two colours: taken through a full orange and a golden
 * yellow where they are the colours of flame, as a fire's are, so its body is fire and not flesh.
 */
export function auraTonesOf(light: string, dark: string): AuraTones {
  const ramp = flameRampOf(light, dark);
  return {
    shade: mixColor(ramp[0], '#2a0c00', 0.3),
    rim: mixColor(ramp[0], ramp[1], 0.8),
    body: ramp[2],
    gold: ramp[3],
    pale: ramp[5],
  };
}

/** The colours of an aura as those of a light, for the parts of light drawn in them: a pillar, a hoop, sparks. */
export function auraLightOf(tones: AuraTones): HolyTones {
  return { shade: tones.shade, amber: tones.body, gold: tones.gold, pale: tones.pale, hot: tones.pale };
}

/** One flame of an aura. */
export interface AuraFlame {
  /** Where round the piece it is rooted, in radians, and how far out. */
  readonly turn: number;
  readonly out: number;
  readonly tall: number;
  readonly wide: number;
  /** How far it is drawn in towards the piece as it climbs, from 0 for standing straight to 1 for meeting over it. */
  readonly gathers: number;
  /** What sets its wavering apart from the next one's. */
  readonly phase: number;
}

/** How wide a flame is along it, from its root to its tip, as shares of its width. */
const FLAME_SHARES = [0, 0.12, 0.3, 0.5, 0.7, 0.87, 1];
const FLAME_WIDTHS = [0.75, 1, 0.92, 0.7, 0.42, 0.18, 0];
/** How much of a flame is seen where it stands before the piece, against where it stands behind it. */
const SEEN_BEFORE = 0.24;
/**
 * The sheets the flames are laid in, the widest first: a soft halo of their deep colour, their bodies,
 * the gold within them, and their hearts of light.
 */
const FLAME_SHEETS = [
  { wide: 1.45, tint: 'shade', core: undefined, alpha: 0.75, torn: 0.6, soft: 0.45, blend: 'color' },
  { wide: 1, tint: 'rim', core: 'body', alpha: 0.95, torn: 0.75, soft: 0, blend: 'color' },
  { wide: 0.62, tint: 'body', core: 'gold', alpha: 1, torn: 0.65, soft: 0, blend: 'color' },
  { wide: 0.34, tint: 'gold', core: 'pale', alpha: 0.55, torn: 0.3, soft: 0.5, blend: 'light' },
] as const;

/**
 * Lays the flames of an aura about a foot, a sheet at a time over all of them so they run together
 * into one body: a soft halo of their deep colour, their bodies, the gold within them, and their
 * hearts of light. Each sways as it climbs and is drawn in towards the piece.
 */
export function layAuraFlames(
  drawn: Staged,
  foot: Point,
  flames: readonly AuraFlame[],
  tones: AuraTones,
  t: number,
  alpha: number
): void {
  if (alpha <= 0.01) return;
  const bands = flames
    .filter((flame) => flame.tall > flame.wide * 0.4)
    .map((flame) => {
      const points: Point[] = [];
      const about: Point[] = [];
      for (const share of FLAME_SHARES) {
        const sway = Math.sin(t * 5.3 + flame.phase + share * 6.2) * 0.24 * share;
        const turn = flame.turn + sway;
        const out =
          flame.out * (1 - flame.gathers * Math.pow(share, 1.3)) +
          Math.sin(t * 7.1 + flame.phase * 1.7 + share * 5) * flame.wide * 0.22 * share;
        const z = foot.z + flame.tall * share;
        points.push({ x: foot.x + Math.cos(turn) * out, y: foot.y + Math.sin(turn) * out, z });
        about.push({ x: foot.x, y: foot.y, z });
      }
      return { flame, points, about, widths: FLAME_WIDTHS.map((share) => share * flame.wide) };
    });
  for (const sheet of FLAME_SHEETS) {
    for (const band of bands) {
      for (const [half, seen] of [
        ['far', 1],
        ['near', SEEN_BEFORE],
      ] as const) {
        drawn.ribbons.push({
          points: band.points,
          about: band.about,
          half,
          widths: band.widths.map((wide) => wide * sheet.wide),
          color: tones[sheet.tint],
          core: sheet.core ? tones[sheet.core] : undefined,
          alpha: sheet.alpha * alpha * seen,
          blend: sheet.blend,
          torn: sheet.torn,
          soft: sheet.soft,
          flowed: -t * 3.4 + band.flame.phase,
        });
      }
    }
  }
}

/**
 * How much of its detail an aura keeps as the cast takes in more pieces, each with an aura of its own:
 * all of it on one, and less on each as they grow, so all of them together stay within what a frame draws.
 */
export function auraDetailOf(pieces: number): number {
  return pieces <= 1 ? 1 : pieces <= 2 ? 0.8 : pieces <= 4 ? 0.6 : 0.45;
}

/**
 * The flames of an aura standing in a ring: as many, as far out, as wide, and as tall at the most,
 * each of its own height from `least` of that up, flickering.
 */
export function ringOfFlames(
  count: number,
  out: number,
  tall: number,
  wide: number,
  gathers: number,
  least: number,
  t: number,
  seed: number
): AuraFlame[] {
  const next = seededRun(seed * 19 + 7);
  return Array.from({ length: count }, (_unused, index) => {
    const phase = next() * 6.28;
    const flicker = 0.8 + 0.14 * Math.sin(t * 11 + phase) + 0.06 * Math.sin(t * 27 + phase * 2);
    return {
      turn: (index / count) * Math.PI * 2 + next() * 0.3,
      out,
      tall: tall * (least + (1 - least) * next()) * flicker,
      wide: wide * (0.8 + 0.4 * next()),
      gathers,
      phase,
    };
  });
}

/** The floor cracked under an aura: dark cracks run out from under the piece, and light in them while it burns. */
export function layAuraCracks(
  drawn: Staged,
  floor: Point,
  reach: number,
  tones: AuraTones,
  alpha: number,
  lit: number,
  seed: number
): void {
  if (alpha <= 0.01 || reach < 1) return;
  const spokes = (seed % 17) / 17;
  drawn.floor.push(floorMark('cracks', floor, reach, 0.32, '#1d120c', 0.9 * alpha, 'color', spokes));
  drawn.floor.push(floorMark('cracks', floor, reach * 0.97, 0.17, tones.body, 0.9 * alpha * lit, 'color', spokes));
  drawn.floor.push(floorMark('cracks', floor, reach * 0.94, 0.1, tones.pale, alpha * lit, 'light', spokes));
  drawn.floor.push(floorMark('disc', floor, reach * 0.7, 1, tones.gold, 0.35 * alpha * lit, 'light', 0));
}

/** A ring of an aura's colours racing out over the floor: a dark line, a line of colour and a line of light, thinning as it goes. */
export function layAuraRing(
  drawn: Staged,
  floor: Point,
  from: number,
  to: number,
  thick: number,
  tones: AuraTones,
  share: number
): void {
  if (share <= 0 || share >= 1) return;
  const radius = from + (to - from) * (1 - (1 - share) * (1 - share) * (1 - share));
  const left = 1 - share;
  const width = Math.max(0.02, (thick * (0.3 + 0.7 * left)) / radius);
  drawn.floor.push(floorMark('ring', floor, radius * 1.03, width * 1.7, tones.shade, 0.7 * left, 'color', 0));
  drawn.floor.push(floorMark('ring', floor, radius, width, tones.gold, left, 'color', 0));
  drawn.floor.push(floorMark('ring', floor, radius, width * 0.7, tones.pale, left, 'light', 0));
}

/** A hoop of an aura's colours climbing a body, drawn by halves. */
export function layAuraHoop(
  drawn: Staged,
  middle: Point,
  radius: number,
  thick: number,
  tones: AuraTones,
  alpha: number
): void {
  if (alpha <= 0.01 || radius < 1) return;
  const points = circlePoints(middle, radius, 32);
  const about = points.map(() => middle);
  for (const [half, seen] of [
    ['far', 1],
    ['near', 0.7],
  ] as const) {
    drawn.ribbons.push(
      { points, about, half, widths: thick * 1.7, color: tones.shade, alpha: 0.7 * alpha * seen, blend: 'color' },
      { points, about, half, widths: thick, color: tones.gold, core: tones.pale, alpha: alpha * seen, blend: 'color' },
      {
        points,
        about,
        half,
        widths: thick * 0.6,
        color: '#ffffff',
        alpha: 0.8 * alpha * seen,
        blend: 'light',
        soft: 0.5,
      }
    );
  }
}

/** When and how far pebbles are lifted. */
export interface Lifted {
  readonly count: number;
  /** How far out from the piece they lie, at the least and at the most. */
  readonly out: readonly [number, number];
  /** How high they are lifted, at the least and at the most. */
  readonly high: readonly [number, number];
  /** When the first and the last of them leave the floor, how long each takes to rise, and when they are let fall, in seconds. */
  readonly lifts: readonly [number, number];
  readonly risesFor: number;
  readonly drops: number;
  /** When the last of them is gone, in seconds. */
  readonly ends: number;
}

/**
 * Pebbles lifted off the floor about a piece: each trembles where it lies, rises, hangs in the air
 * turning slowly and bobbing, and is let fall, to lie where it lands and fade.
 */
export function drawPebbles(
  drawn: Staged,
  seed: number,
  floor: Point,
  cell: number,
  t: number,
  lifted: Lifted,
  tones: AuraTones,
  forward: number
): void {
  const next = seededRun(seed * 43 + 11);
  for (let index = 0; index < lifted.count; index++) {
    const turn = next() * Math.PI * 2;
    const out = lifted.out[0] + (lifted.out[1] - lifted.out[0]) * Math.sqrt(next());
    const high = lifted.high[0] + (lifted.high[1] - lifted.high[0]) * next();
    const leaves = lifted.lifts[0] + (lifted.lifts[1] - lifted.lifts[0]) * next();
    const size = cell * (0.09 + 0.12 * next() * next());
    const phase = next() * 6.28;
    const since = t - leaves;
    if (since < 0 || t >= lifted.ends) continue;
    const risen = 1 - Math.pow(1 - Math.min(1, since / lifted.risesFor), 3);
    const falling = Math.max(0, t - lifted.drops - (phase / 6.28) * 0.15);
    const hung = high * risen + cell * 0.05 * Math.sin(t * 3.1 + phase) * risen;
    const z = Math.max(size * 0.4, hung - 13 * cell * falling * falling);
    const landed = z <= size * 0.4 && falling > 0;
    const fade = Math.min(1, since * 10, (lifted.ends - t) * 3);
    const at = { x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: floor.z + z };
    drawn.motes.push({
      ...haze(at, size * 1.35, '#1c1410', fade, forward),
      shape: 'chunk',
      spin: landed ? phase : phase + t * (1.2 + (index % 3)),
      variant: index % 6,
    });
    drawn.motes.push({
      ...haze(at, size, index % 2 === 0 ? '#8a7558' : '#6a5a4a', fade, forward + 0.3),
      shape: 'chunk',
      spin: landed ? phase : phase + t * (1.2 + (index % 3)),
      variant: index % 6,
    });
    if (!landed && risen > 0.1) {
      drawn.motes.push(glow({ ...at, z: at.z - size * 0.5 }, size * 2.4, tones.gold, 0.5 * fade * risen, forward));
    }
  }
}

/** Streaks of light racing up about a piece, born again and again. */
export function drawUpdraft(
  drawn: Staged,
  seed: number,
  floor: Point,
  cell: number,
  t: number,
  count: number,
  out: readonly [number, number],
  tall: number,
  tones: AuraTones,
  alpha: number,
  forward: number
): void {
  if (alpha <= 0.01) return;
  const next = seededRun(seed * 59 + 3);
  for (let index = 0; index < count; index++) {
    const turn = next() * Math.PI * 2;
    const far = out[0] + (out[1] - out[0]) * next();
    const pace = 1.1 + next() * 1.3;
    const rise = (t * pace + next()) % 1;
    const at = {
      x: floor.x + Math.cos(turn) * far,
      y: floor.y + Math.sin(turn) * far,
      z: floor.z + cell * 0.1 + rise * tall,
    };
    const fade = Math.min(1, rise * 6, (1 - rise) * 2.5) * alpha;
    const way = { x: 0, y: 0, z: tall * pace };
    drawn.motes.push({
      ...haze(at, cell * 0.1, tones.rim, 0.8 * fade, forward),
      shape: 'spark',
      velocity: way,
      trail: 0.09,
    });
    drawn.motes.push({
      ...glow(at, cell * 0.07, tones.pale, fade, forward + 0.5),
      shape: 'spark',
      velocity: way,
      trail: 0.08,
    });
  }
}
