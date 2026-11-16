import { type Staged, within } from '@axe/domain/effect/scene/choreography';
import { flowMote } from '@axe/domain/effect/scene/dark/dark-parts';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { type EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { floorMark, type Point } from '@axe/domain/effect/scene/parts';
import { type BoldTones, layBoldScreenLine } from '@axe/domain/effect/scene/space/space-bold';
import { scatterOf, screenArc } from '@axe/domain/effect/scene/space/space-parts';
import { debrisKindOf, debrisRibbon } from '@axe/domain/effect/scene/wind/wind-parts';

/*
 * The parts of a singularity: the jets thrown off the poles of its hole; arcs of light bent round it
 * on every side; the spiral its pull lays over the floor, burning while it pulls and cooling after;
 * what it drags in off the floor along it; and the scorched floor and the smoke it leaves.
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

/** Arcs of light bent round the hole on every side, turning slowly, flickering as they are pulled at. */
export function drawBentLight(
  drawn: Staged,
  at: Point,
  look: HoleLook,
  tones: BoldTones,
  cell: number,
  forward: number
): void {
  const shown = look.spun * (1 - look.fallen);
  if (shown <= 0.01) return;
  for (let arc = 0; arc < 4; arc++) {
    const radius = look.radius * (4.3 + 0.6 * arc) * (1 - 0.6 * look.fallen);
    const from = scatterOf(arc, 5) * Math.PI * 2 + look.t * (0.5 + 0.3 * arc) * (arc % 2 === 0 ? 1 : -1);
    const span = 0.9 + 0.7 * scatterOf(arc, 9);
    layBoldScreenLine(drawn, at, screenArc(radius, from, from + span, 6), {
      rim: tones.rim,
      body: tones.body,
      core: tones.core,
      glow: tones.hot,
      alpha: shown * (0.65 + 0.35 * Math.sin(look.t * 17 + arc * 2.3)),
      lit: 0.5 * shown,
      wide: cell * 0.11,
      forward: forward + 4,
    });
  }
}

/** The jets thrown off the poles of the hole: a long one up, and a short one down that stops well over the pieces. */
export function drawJets(
  drawn: Staged,
  at: Point,
  look: HoleLook,
  tones: BoldTones,
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
    const widths = [look.radius * 0.9, look.radius * 0.6, look.radius * 0.2].map((wide) => wide * flicker * shown);
    const band: Omit<EffectRibbon, 'color' | 'alpha' | 'blend'> = { points, widths, alphas: [1, 0.85, 0.2] };
    drawn.ribbons.push({
      ...band,
      widths: widths.map((wide) => wide * 2.2),
      color: tones.hot,
      alpha: 0.6 * shown,
      blend: 'light',
      soft: 0.85,
    });
    drawn.ribbons.push({
      ...band,
      widths: widths.map((wide) => wide * 1.4 + 2),
      color: tones.rim,
      alpha: shown,
      blend: 'color',
      torn: 0.3,
      flowed: -look.t * 6,
    });
    drawn.ribbons.push({
      ...band,
      color: tones.hot,
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
  tones: BoldTones,
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
      widths.push(cell * (0.17 + 0.1 * scatterOf(arm, 17)) * Math.sin(Math.PI * Math.min(1, u * 1.15 + 0.05)) ** 0.7);
    }
    const alphas = points.map((_point, step) => Math.min(1, (step / 22) * 4) * Math.min(1, (1 - step / 22) * 5));
    if (lit > 0.01) {
      drawn.ribbons.push({
        points,
        widths: widths.map((wide) => wide * 1.7),
        color: tones.hot,
        alpha: 0.4 * lit,
        alphas,
        blend: 'light',
        soft: 0.8,
      });
    }
    drawn.ribbons.push({
      points,
      widths: widths.map((wide) => wide * 1.35 + 2),
      color: tones.ink,
      alpha: 0.85 * shown,
      alphas,
      blend: 'color',
      torn: 0.35,
      flowed: turned * 3,
    });
    drawn.ribbons.push({
      points,
      widths,
      color: mixColor(SOIL, tones.rim, 0.5),
      core: lit > 0.01 ? mixColor(tones.body, tones.hot, lit) : mixColor(SOIL, '#000000', 0.35),
      alpha: 0.9 * shown,
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
  tones: BoldTones,
  cell: number,
  t: number,
  pull: number,
  forward: number
): void {
  if (pull <= 0.01) return;
  const greens = ['#4a6a22', '#7d9640', '#6a5a4c', '#8a7258'];
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
          size: cell * (kind === 'stone' ? 0.26 : 0.36),
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
      size: cell * 0.2,
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
        size: cell * 0.2,
        color: tones.hot,
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

/** Smoke curling up off the scar the hole leaves on the floor, along its spiral, over `lasts` seconds from `since` nothing. */
export function drawScarSmoke(
  drawn: Staged,
  floor: Point,
  reach: number,
  tones: BoldTones,
  cell: number,
  since: number,
  lasts: number,
  forward: number
): void {
  for (let wisp = 0; wisp < 16; wisp++) {
    const born = 0.35 + (wisp / 16) * Math.max(0.5, lasts - 1.6);
    const age = (since - born) / 1.5;
    if (age < 0 || age >= 1) continue;
    const u = 0.25 + 0.65 * scatterOf(wisp, 7);
    const turn = (wisp % 9) * ((Math.PI * 2) / 9) + 2.6 * (1 - u) * (1 - u) + scatterOf(wisp, 11) * 0.3;
    const out = reach * (0.12 + 0.75 * u);
    const root = { x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: floor.z + cell * 0.1 };
    drawn.motes.push(
      flowMote(
        'wisp',
        { ...root, z: root.z + cell * 0.7 * age },
        { x: 0.15, y: -0.1, z: 1 },
        cell * (0.35 + 0.35 * age),
        cell * (0.6 + 0.9 * age),
        age * 3 + wisp,
        {
          color: mixColor(tones.rim, '#3a3440', 0.45),
          core: mixColor(tones.body, '#000000', 0.4),
          alpha: 0.75 * Math.min(1, age * 6) * (1 - age),
          variant: wisp,
          forward,
        }
      )
    );
  }
}

/** The floor of the area left scorched after the hole has gone, darkest at its middle, fading out over `lasts` seconds. */
export function layScorchedArea(
  drawn: Staged,
  floor: Point,
  reach: number,
  tones: BoldTones,
  cell: number,
  since: number,
  lasts: number,
  seed: number
): void {
  const fading = 1 - within(since, lasts * 0.55, lasts);
  if (fading <= 0.01) return;
  drawn.floor.push(floorMark('disc', floor, reach * 1.25, 1, tones.rim, 0.35 * fading, 'color', 0));
  drawn.floor.push(floorMark('scorch', floor, cell * 1.9, 1, tones.ink, 0.75 * fading, 'color', (seed % 89) + 1));
  drawn.floor.push(floorMark('disc', floor, cell * 0.9, 1, '#000000', 0.55 * fading, 'color', 0));
}
