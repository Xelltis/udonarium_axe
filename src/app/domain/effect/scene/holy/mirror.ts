import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import {
  layPane,
  layShellRing,
  layShellSeal,
  type ShellTones,
  shellTonesOf,
} from '@axe/domain/effect/scene/holy/shell-parts';
import { glow, haze, type Point, starBurst } from '@axe/domain/effect/scene/parts';

/*
 * A mirror: a crystal of tall bright faces about a piece, narrow at its foot, wide at its belt and
 * drawn to a point over the head, its edges running through the colours of a prism. Its faces fly in
 * from every side, turning, and lock together in a white flash; a sheen runs across them as across a
 * mirror, again and again. Three times something comes at it out of the air, and each time the face
 * it strikes flashes white and throws it back, brighter than it came, with shards of light after it.
 * Then its faces fall open as petals do and are gone.
 */

/** How many faces the crystal has. */
const FACES = 8;
/** The line of a face from its foot to the point of the crystal: how far out it is, as a share of the crystal's radius, and how high, as a share of its height. */
const PROFILE: readonly (readonly [out: number, high: number])[] = [
  [0.5, 0.02],
  [1, 0.42],
  [0.84, 0.74],
  [0.04, 1.1],
];
/** When the faces lock together, and when the crystal is struck, in seconds, each at the most a share of the playback: as its sound rings. */
const LOCKS_AT: readonly [number, number] = [0.16, 0.14];
const STRUCK_AT: readonly (readonly [number, number])[] = [
  [0.3, 0.255],
  [0.42, 0.36],
  [0.76, 0.65],
];
/** How long what strikes it is seen coming, how long the struck face flashes, and how long what is thrown back flies, in seconds. */
const COMES_S = 0.12;
const FLASH_S = 0.16;
const THROWN_S = 0.42;
/** How far off what strikes it comes from, and how far it is thrown back, in cells. */
const FROM_CELLS = 3.4;
const BACK_CELLS = 3.8;
/** How long the faces take to fall open, in seconds. */
const OPENS_S = 0.4;

/** A full colour of the prism at a share of the way round it. */
function prism(share: number): string {
  const at = (((share % 1) + 1) % 1) * 6;
  const rise = Math.round(255 * (at % 1));
  const fall = 255 - rise;
  const [r, g, b] = [
    [255, rise, 40],
    [fall, 255, 40],
    [40, 255, rise],
    [40, fall, 255],
    [rise, 40, 255],
    [255, 40, fall],
  ][Math.floor(at) % 6];
  return `#${[r, g, b].map((channel) => Math.max(40, channel).toString(16).padStart(2, '0')).join('')}`;
}

/** What is thrown back from a struck face: a ray of light out along the way it came, and shards flying after it. */
function drawThrownBack(
  drawn: Staged,
  stage: Stage,
  struck: Point,
  way: Point,
  since: number,
  order: number,
  tones: ShellTones
): void {
  if (since < 0 || since >= THROWN_S) return;
  const { cell } = stage;
  const share = since / THROWN_S;
  const left = 1 - share;
  const forward = cell * 0.4;
  const head = outCubic(within(since, 0, 0.14));
  const tail = within(since, 0.1, THROWN_S);
  const reach = cell * BACK_CELLS;
  const at = (far: number) => ({
    x: struck.x + way.x * reach * far,
    y: struck.y + way.y * reach * far,
    z: struck.z + cell * 0.5 * far,
  });
  const points = [0, 0.25, 0.5, 0.75, 1].map((step) => at(tail + (head - tail) * step));
  const widths = [0.1, 0.5, 0.8, 1, 0.3].map((wide) => wide * cell * 0.34 * (0.4 + 0.6 * left));
  drawn.ribbons.push(
    {
      points,
      widths: widths.map((wide) => wide * 1.6),
      color: prism(order / 3 + since),
      alpha: 0.85 * left,
      blend: 'color',
      soft: 0.3,
    },
    { points, widths, color: tones.pale, core: '#ffffff', alpha: left, blend: 'color' },
    { points, widths: widths.map((wide) => wide * 1.3), color: '#ffffff', alpha: left, blend: 'light', soft: 0.5 }
  );
  const next = seededRun(stage.seed * 13 + order * 101);
  for (let shard = 0; shard < 9; shard++) {
    const aside = (next() - 0.5) * 1.1;
    const fast = cell * (5 + next() * 7);
    const up = cell * (0.5 + next() * 3);
    const turn = Math.atan2(way.y, way.x) + aside;
    const gone = (fast * (1 - Math.exp(-3.5 * since))) / 3.5;
    const where = {
      x: struck.x + Math.cos(turn) * gone,
      y: struck.y + Math.sin(turn) * gone,
      z: Math.max(stage.groundZ + cell * 0.05, struck.z + up * since - 6 * cell * since * since),
    };
    const hue = prism(shard / 9 + order * 0.3);
    drawn.motes.push({
      ...haze(where, cell * 0.22, hue, left, forward),
      shape: 'chunk',
      spin: since * 14 + shard,
      variant: shard % 6,
    });
    drawn.motes.push({
      ...glow(where, cell * 0.34, '#ffffff', left, forward + 1),
      shape: 'flake',
      spin: since * 9 + shard,
    });
  }
}

/** A mirror: see the header. `lingers` is how long after its playback its faces are still falling open, in seconds. */
export function drawMirror(stage: Stage, lingers: number): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const ends = duration + lingers;
  if (t < 0 || t >= ends) return drawn;
  const tones = shellTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const radius = cell * 0.9;
  const tall = Math.max(cell * 1.5, stage.tall + cell * 0.5);
  const about = { ...floor, z: floor.z + tall * 0.45 };
  const forward = cell * 0.4;
  const locksAt = Math.min(LOCKS_AT[0], duration * LOCKS_AT[1]);
  const opensAt = Math.max(duration - 0.05, locksAt + 0.2);
  const closed = outCubic(within(t, 0, locksAt));
  const opened = within(t, opensAt, opensAt + OPENS_S);
  const standing = 1 - opened;
  const from = (stage.seed % 7) * 0.9;
  const spun = from + (1 - closed) * 1.6;
  const lean = { x: 0.74, y: 0.3, z: -0.6 };
  const strikes = STRUCK_AT.map(([seconds, share], order) => ({
    at: Math.min(seconds, duration * share),
    face: (order * 3 + (stage.seed % FACES)) % FACES,
  }));

  for (let face = 0; face < FACES; face++) {
    const turn = spun + (face / FACES) * Math.PI * 2;
    const wide = ((Math.PI * 2 * radius) / FACES) * 0.95;
    const far = 1 + 1.4 * (1 - closed);
    const points = PROFILE.map(([out, high]) => {
      const fallen = out + opened * opened * high * 1.5;
      return {
        x: floor.x + Math.cos(turn) * radius * fallen * far,
        y: floor.y + Math.sin(turn) * radius * fallen * far,
        z: floor.z + tall * high * (1 - 0.75 * opened * opened),
      };
    });
    const widths = PROFILE.map(([out]) => wide * out);
    const belt = points[1];
    const across = ((belt.x - floor.x) * lean.x + (belt.y - floor.y) * lean.y) / radius;
    const sweep = -1.5 + 3 * ((t * 2.3) % 1);
    const sheen = t > locksAt ? Math.exp(-((across - sweep) * (across - sweep)) / 0.2) : 0;
    const locked = Math.max(0, 1 - (t - locksAt) / FLASH_S) * (t >= locksAt ? 1 : 0);
    const struck = strikes.reduce((most, strike) => {
      const since = t - strike.at;
      const off = Math.min((face - strike.face + FACES) % FACES, (strike.face - face + FACES) % FACES);
      return since < 0 || since >= FLASH_S || off > 1
        ? most
        : Math.max(most, (1 - since / FLASH_S) * (off === 0 ? 1 : 0.5));
    }, 0);
    layPane(drawn, points, widths, about, {
      rim: mixColor(tones.rim, tones.glow, 0.35),
      glass: face % 2 === 0 ? mixColor(tones.glow, '#ffffff', 0.45) : mixColor(tones.glow, tones.pale, 0.3),
      backing: mixColor(tones.rim, '#2a1400', 0.4),
      alpha: 0.9 * Math.min(1, closed * 2) * standing,
      nearShare: 0.24,
      lit: Math.max(locked, struck, sheen, 0.12) * standing,
      light: tones.pale,
    });
    const edge = turn + Math.PI / FACES;
    const line = PROFILE.map(([out, high]) => {
      const fallen = out / Math.cos(Math.PI / FACES) + opened * opened * high * 1.5;
      return {
        x: floor.x + Math.cos(edge) * radius * fallen * far,
        y: floor.y + Math.sin(edge) * radius * fallen * far,
        z: floor.z + tall * high * (1 - 0.75 * opened * opened),
      };
    });
    const hubs = line.map(() => about);
    for (const [half, seen] of [
      ['far', 1],
      ['near', 0.45],
    ] as const) {
      drawn.ribbons.push(
        {
          points: line,
          about: hubs,
          half,
          widths: cell * 0.16,
          color: mixColor(tones.rim, '#2a1400', 0.4),
          alpha: 0.8 * closed * standing * seen,
          blend: 'color',
        },
        {
          points: line,
          about: hubs,
          half,
          widths: cell * 0.1,
          color: prism(face / FACES + t * 0.35 + 0.08),
          alpha: closed * standing * seen,
          blend: 'color',
        },
        {
          points: line,
          about: hubs,
          half,
          widths: cell * 0.05,
          color: '#ffffff',
          alpha: 0.8 * closed * standing * seen,
          blend: 'light',
          soft: 0.4,
        }
      );
    }
  }

  strikes.forEach((strike, order) => {
    const turn = from + (strike.face / FACES) * Math.PI * 2;
    const way = { x: Math.cos(turn), y: Math.sin(turn), z: 0 };
    const struck = { x: floor.x + way.x * radius, y: floor.y + way.y * radius, z: floor.z + tall * 0.45 };
    const coming = within(t, strike.at - COMES_S, strike.at);
    if (coming > 0 && coming < 1) {
      const out = cell * FROM_CELLS * (1 - coming);
      const at = { x: struck.x + way.x * out, y: struck.y + way.y * out, z: struck.z + cell * 0.4 * (1 - coming) };
      const flies = { x: -way.x * cell * 28, y: -way.y * cell * 28, z: -cell * 3 };
      drawn.motes.push({
        ...haze(at, cell * 0.34, '#1d1238', 0.95, forward),
        shape: 'comet',
        velocity: flies,
        trail: 0.05,
      });
      drawn.motes.push({
        ...haze(at, cell * 0.2, '#b06cff', 1, forward + 0.5),
        shape: 'comet',
        velocity: flies,
        trail: 0.04,
      });
      drawn.motes.push(glow(at, cell * 0.5, '#d9b8ff', 0.7, forward + 1));
    }
    const since = t - strike.at;
    if (since < 0) return;
    if (since < 0.14) {
      drawn.motes.push(...starBurst(struck, cell * 1.5, tones.pale, since / 0.14, forward + 2, 6, order));
      drawn.motes.push(haze(struck, cell * 0.9, '#ffffff', 0.9 * (1 - since / 0.14), forward + 1));
    }
    if (since < 0.3) {
      const left = 1 - since / 0.3;
      drawn.motes.push({
        ...haze(struck, cell * (0.3 + 1.5 * outCubic(1 - left)), prism(order / 3), left, forward + 1),
        shape: 'hoop',
        spin: 0,
      });
    }
    drawThrownBack(drawn, stage, struck, way, since, order, tones);
  });

  layShellRing(drawn, floor, radius * 2.4, radius * 0.9, tones, within(t, 0, locksAt));
  layShellRing(drawn, floor, radius, radius * 2.8, tones, within(t, locksAt, locksAt + 0.4));
  layShellRing(drawn, floor, radius, radius * 2.4, tones, opened);
  layShellSeal(drawn, floor, radius * 1.1 * closed, tones, standing, -t * 0.7);
  const since = t - locksAt;
  if (since >= 0 && since < 0.14) {
    const left = 1 - since / 0.14;
    drawn.motes.push(glow(about, radius * 4, '#ffffff', 0.85 * left, forward));
    drawn.motes.push(
      ...starBurst({ ...floor, z: floor.z + tall * 1.1 }, cell * 1.6, tones.pale, since / 0.14, forward, 4, 0.3)
    );
  }
  const point = { ...floor, z: floor.z + tall * 1.1 };
  const beat = 0.6 + 0.4 * Math.sin(t * 17);
  drawn.motes.push({
    ...glow(point, cell * 0.5, '#ffffff', closed * standing * beat, forward),
    shape: 'star',
    spin: t * 2,
  });
  drawn.motes.push(haze(about, radius * 2, tones.glow, 0.16 * closed * standing, cell * 0.1));
  drawn.lights.push({
    ...about,
    color: tones.pale,
    strength: (0.9 + 1.4 * Math.max(0, 1 - Math.abs(since) / 0.2)) * standing * closed,
    reachPx: cell * 3,
  });
  return drawn;
}
