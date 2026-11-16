import { isMirror } from '@axe/domain/effect/blessing-looks';
import {
  type Choreography,
  nothingStaged,
  outCubic,
  type Stage,
  type Staged,
  within,
} from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { drawMirror } from '@axe/domain/effect/scene/holy/mirror';
import {
  layPane,
  layShellLine,
  layShellRing,
  layShellSeal,
  type ShellTones,
  shellTonesOf,
} from '@axe/domain/effect/scene/holy/shell-parts';
import { circlePoints, glow, haze, type Point } from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';

/*
 * A ward: a dome of hexagonal panes of glass, a honeycomb, snapping into place about a piece row upon
 * row from the floor to its crown, each flashing white as it lands, as a ring races out over the floor
 * from under it. The edges of the panes lie on the dome itself, so it is seen as a dome from any side:
 * its far side stands behind the piece in full, its near side before it thin enough to see the piece
 * through, and a veil of its glass fills each row. It stands for as long as it sounds: a hard glint
 * runs over it from one side to the other, and again, hoops of light climb it, and it hums. Then it
 * folds away from its crown down, each pane shrinking and falling off it.
 */

const LINGER_S = SCENE_LINGER_S.barrier ?? 0.8;
/** The rows of the dome from its foot to its crown: how high up it each stands, in radians, and how many panes it has. */
const ROWS: readonly (readonly [lat: number, panes: number])[] = [
  [0.24, 11],
  [0.55, 10],
  [0.9, 8],
  [1.22, 5],
];
/** How far up and down the dome a pane reaches from its middle, in radians, and how much of its room it takes. */
const PANE_HALF = 0.235;
const PANE_FILLS = 0.88;
/** How high up the dome the cap at its crown stands, in radians. */
const CAP_LAT = 1.47;
/** How far up and down the dome the veil of a row reaches from its middle, in radians. */
const VEIL_HALF = 0.19;
/** How long a row waits on the row below it, how long a pane takes to land, and how long its flash lasts, in seconds. */
const ROW_AFTER_S = 0.045;
const LANDS_S = 0.09;
const FLASH_S = 0.16;
/** How long a glint takes to cross the dome, in seconds, and where through the playback each sets off. */
const GLINT_S = 0.3;
const GLINTS_AT = [0.3, 0.62];
/** How long a pane takes to fall away, and how long a row waits on the row above it, in seconds. */
const FALLS_S = 0.3;
const FOLDS_ROW_S = 0.07;
/** The way across the dome a glint runs, as a unit way from one side of it to the other. */
const GLINT_WAY = { x: 0.74, y: 0.3, z: 0.6 };

/** A point of the dome: at a height up it and a turn round it, as far out as `out` times its radius and as high as `up` times its height. */
function domePoint(
  floor: Point,
  radius: number,
  tall: number,
  lat: number,
  turn: number,
  out: number,
  up = out
): Point {
  const level = Math.cos(Math.min(lat, Math.PI / 2)) * radius * out;
  return {
    x: floor.x + Math.cos(turn) * level,
    y: floor.y + Math.sin(turn) * level,
    z: floor.z + Math.sin(Math.min(lat, Math.PI / 2)) * tall * up,
  };
}

/** The dome a ward stands as: where its foot is, how wide and how tall it is, and what it stands about. */
interface Dome {
  readonly floor: Point;
  readonly radius: number;
  readonly tall: number;
  readonly about: Point;
}

/** How brightly a glint lights a point of the dome at a moment, from none to 1. */
function glintAt(dome: Dome, at: Point, t: number, duration: number): number {
  const across =
    ((at.x - dome.floor.x) * GLINT_WAY.x + (at.y - dome.floor.y) * GLINT_WAY.y + (at.z - dome.about.z) * GLINT_WAY.z) /
    dome.radius;
  let most = 0;
  for (const starts of GLINTS_AT) {
    const sweep = -1.5 + 3 * within(t, duration * starts, duration * starts + GLINT_S);
    if (sweep <= -1.5 || sweep >= 1.5) continue;
    most = Math.max(most, Math.exp(-((across - sweep) * (across - sweep)) / 0.11));
  }
  return most;
}

/**
 * The six corners of a pane about its middle, closed back to the first: as far up and down the dome
 * and round it from its middle as `half` and `wide` say, in radians, and as far out and up as `out` and
 * `up` times the dome, sunk by `sunk`.
 */
function paneCorners(
  dome: Dome,
  lat: number,
  turn: number,
  half: number,
  wide: number,
  out: number,
  up: number,
  sunk: number
): Point[] {
  return [
    [1, 0],
    [0.5, 1],
    [-0.5, 1],
    [-1, 0],
    [-0.5, -1],
    [0.5, -1],
    [1, 0],
  ].map(([along, aside]) => {
    const at = domePoint(dome.floor, dome.radius, dome.tall, lat + along * half, turn + aside * wide, out, up);
    return { ...at, z: Math.max(dome.floor.z + 1, at.z - sunk) };
  });
}

/** The veil of glass filling one row of the dome, by halves: a level band as wide as the row is high. */
function layVeil(drawn: Staged, dome: Dome, lat: number, tones: ShellTones, alpha: number, points: number): void {
  if (alpha <= 0.01) return;
  const { floor, radius, tall } = dome;
  const low = domePoint(floor, radius, tall, lat - VEIL_HALF, 0, 1);
  const high = domePoint(floor, radius, tall, lat + VEIL_HALF, 0, 1);
  const middle = { ...floor, z: (low.z + high.z) / 2 };
  const ring = circlePoints(middle, (low.x - floor.x + high.x - floor.x) / 2, points);
  const about = ring.map(() => middle);
  const wide = Math.hypot(high.x - low.x, high.z - low.z);
  for (const [half, seen] of [
    ['far', 1],
    ['near', 0.35],
  ] as const) {
    drawn.ribbons.push({
      points: ring,
      about,
      half,
      widths: wide,
      color: tones.glass,
      core: mixColor(tones.glass, tones.pale, 0.4),
      alpha: 0.42 * alpha * seen,
      blend: 'color',
      soft: 0.35,
    });
  }
}

/** A ward: see the header. */
function drawWard(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const ends = duration + LINGER_S;
  if (t < 0 || t >= ends) return drawn;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const tones = shellTonesOf(ramp);
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const radius = cell * 1.1;
  const tall = Math.max(radius * 1.2, stage.tall + cell * 0.45);
  const dome: Dome = { floor, radius, tall, about: { ...floor, z: floor.z + tall * 0.45 } };
  const crowded = stage.targets.length > 2;
  const foldsAt = Math.max(duration - 0.05, 0.4);
  const standing = 1 - within(t, foldsAt, foldsAt + ROWS.length * FOLDS_ROW_S + FALLS_S);
  const hum = 0.85 + 0.15 * Math.sin(t * 38);
  const lineWide = cell * 0.075;

  ROWS.forEach(([lat, count], row) => {
    const landsAt = row * ROW_AFTER_S;
    const fallsAt = foldsAt + (ROWS.length - row) * FOLDS_ROW_S;
    const veiled = outCubic(within(t, landsAt + LANDS_S * 0.5, landsAt + LANDS_S * 2));
    layVeil(drawn, dome, lat, tones, veiled * (1 - within(t, fallsAt, fallsAt + FALLS_S)), crowded ? 20 : 28);
    for (let pane = 0; pane < count; pane++) {
      const turn = ((pane + (row % 2) * 0.5) / count) * Math.PI * 2 + (stage.seed % 5);
      const jitter = ((pane * 7 + row * 3) % 5) * 0.008;
      const since = t - landsAt - jitter;
      if (since < 0) continue;
      const landed = outCubic(within(since, 0, LANDS_S));
      const fallen = within(t, fallsAt + jitter * 3, fallsAt + jitter * 3 + FALLS_S);
      if (fallen >= 1) continue;
      const out = 1 + 0.45 * (1 - landed) + 0.3 * fallen * fallen;
      const up = 1 + 0.4 * (1 - landed);
      const sunk = fallen * fallen * cell * 0.4;
      const grown = (0.55 + 0.45 * landed) * (1 - 0.6 * fallen);
      const half = PANE_HALF * PANE_FILLS * grown;
      const wide = (Math.PI / count) * PANE_FILLS * grown;
      const middle = domePoint(floor, radius, tall, lat, turn, 1);
      const flash = Math.max(1 - since / FLASH_S, 0);
      const glint = glintAt(dome, middle, t, duration);
      const lit = Math.max(flash, glint, 0.35 * hum, fallen > 0 ? 0.8 * (1 - fallen) : 0);
      layShellLine(drawn, paneCorners(dome, lat, turn, half, wide, out, up, sunk), floor, lineWide, {
        rim: mixColor(tones.rim, '#0a1830', 0.35),
        light: tones.pale,
        alpha: 0.95 * landed * (1 - fallen),
        lit: lit * (1 - fallen * 0.5),
        nearShare: 0.5,
        nearRim: !crowded,
        nearLit: !crowded || lit > 0.5,
      });
      const shine = Math.max(flash, glint);
      if (shine > 0.02) {
        const spine = [-1, -0.45, 0.45, 1].map((along) =>
          domePoint(floor, radius, tall, lat + along * half, turn, out, up)
        );
        const across = Math.cos(lat) * radius * wide * 2;
        layPane(drawn, spine, [0, across, across, 0], dome.about, {
          rim: tones.pale,
          glass: tones.pale,
          alpha: 0,
          nearShare: 0.6,
          lit: shine,
          light: mixColor(tones.pale, '#ffffff', 0.5),
        });
      }
    }
  });
  const capAt = ROWS.length * ROW_AFTER_S;
  const capped = outCubic(within(t, capAt, capAt + LANDS_S));
  const capFalls = within(t, foldsAt, foldsAt + FALLS_S);
  if (capped > 0 && capFalls < 1) {
    const cap = domePoint(floor, radius, tall, CAP_LAT, 0, 1);
    const ring = circlePoints({ ...floor, z: cap.z - capFalls * capFalls * cell * 0.3 }, cap.x - floor.x, 6);
    layShellLine(drawn, ring, floor, lineWide, {
      rim: mixColor(tones.rim, '#0a1830', 0.35),
      light: tones.pale,
      alpha: 0.95 * capped * (1 - capFalls),
      lit: Math.max(1 - (t - capAt) / FLASH_S, 0.35 * hum) * (1 - capFalls),
      nearShare: 0.5,
      nearRim: !crowded,
    });
  }

  const crownAt = capAt + LANDS_S;
  layShellRing(drawn, floor, radius * 0.4, radius * 2.6, tones, within(t, 0, 0.4));
  layShellRing(drawn, floor, radius, radius * 2.1, tones, within(t, crownAt, crownAt + 0.35));
  layShellSeal(drawn, floor, radius * 1.04 * outCubic(within(t, 0, 0.12)), tones, standing, t * 0.5);
  if (standing > 0.02 && t > crownAt) {
    for (let hoop = 0; hoop < 2; hoop++) {
      const climbed = (t * 1.3 + hoop / 2) % 1;
      const lat = climbed * 1.4;
      const ring = circlePoints(
        { ...floor, z: floor.z + Math.sin(lat) * tall * 1.01 },
        Math.cos(lat) * radius * 1.02,
        24
      );
      layShellLine(drawn, ring, floor, cell * 0.06, {
        rim: tones.rim,
        light: '#ffffff',
        alpha: 0.5 * Math.min(1, climbed * 6, (1 - climbed) * 3) * standing,
        lit: Math.min(1, climbed * 6, (1 - climbed) * 3) * standing,
        nearShare: 0.6,
        nearRim: false,
      });
    }
  }
  const since = t - crownAt;
  if (since >= 0 && since < 0.14) {
    const left = 1 - since / 0.14;
    drawn.motes.push(glow(dome.about, radius * 3.4, '#ffffff', 0.7 * left, cell * 0.3));
  }
  drawn.motes.push(
    haze(dome.about, radius * 2.2, tones.glass, 0.16 * standing * outCubic(within(t, 0, 0.2)), cell * 0.1)
  );
  drawn.lights.push({
    ...dome.about,
    color: tones.glow,
    strength: (0.8 + 1.2 * Math.max(0, 1 - t / 0.25)) * standing,
    reachPx: cell * 2.6,
  });
  return drawn;
}

/** A barrier: a ward of panes, or at the highest grade a mirror that throws back what strikes it. */
export const barrier: Choreography = {
  lingerS: LINGER_S,
  draw: (stage) => (isMirror(stage.preset) ? drawMirror(stage, LINGER_S) : drawWard(stage)),
};
