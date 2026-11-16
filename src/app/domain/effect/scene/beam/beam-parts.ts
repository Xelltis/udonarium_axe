import { ballBand, type BeamLine, beamRingOf, onLine } from '@axe/domain/effect/scene/beam/beam-body';
import { type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import {
  floorMark,
  glow,
  haze,
  hueOf,
  lightBall,
  type Point,
  smokePuff,
  starBurst,
} from '@axe/domain/effect/scene/parts';

/*
 * What a great beam is built of besides its body: the gathering at its muzzle before it fires, with
 * light drawn in from all about, rings closing and the floor darkened and lit; the ball it pours
 * from; the white instant of its release; what breaks off it where a piece stands in it; the trench
 * it burns along the floor, glowing and cooling to soot; and the embers of light it breaks up into.
 */

/** The dark laid on the floor about a gathering, against which its light reads. */
const GLOOM = '#070916';
/** The colours of what a beam burns into the floor: soot, smoke about it, and the glow of what is still hot. */
const SOOT = '#0e0b10';
const SMOKE = '#221d26';
const EMBER = '#ff7a2c';
const EMBER_DEEP = '#c2330f';

/**
 * A ball of light in a dark rim, which keeps it on a bright floor: a glow about it, the dark, its
 * colour paling inwards and a white heart, its edges licking as fire does. It is laid as bands, so
 * that it lies over the body of the beam that pours from it.
 */
export function layOrb(
  drawn: Staged,
  at: Point,
  way: Point,
  size: number,
  ramp: readonly string[],
  alpha: number,
  seconds: number
): void {
  if (alpha <= 0 || size <= 0) return;
  const hue = hueOf(ramp);
  const radius = size / 2;
  const flowed = seconds * 3;
  drawn.motes.push({ ...glow(at, size * 2.6, hue, 0.45 * alpha, size * 0.3), exactDepth: true });
  drawn.ribbons.push(
    ballBand(at, way, radius * 1.18, mixColor(ramp[0], GLOOM, 0.55), 0.9 * alpha, { torn: 0.12, flowed }),
    ballBand(at, way, radius, hue, alpha, { core: ramp[3], torn: 0.16, flowed: flowed * 1.3 + 3 }),
    ballBand(at, way, radius * 0.66, '#ffffff', alpha, { torn: 0.24, flowed: flowed * 2.2 + 11 })
  );
}

/** What a gathering is laid out by. */
export interface Gathering {
  /** Where the ball gathers, and the floor under the one who gathers it. */
  readonly at: Point;
  readonly floor: Point;
  /** The line the beam will take, which the rings about the ball stand across. */
  readonly line: BeamLine;
  readonly cell: number;
  /** How large the ball is once it is gathered, in table pixels. */
  readonly size: number;
  readonly seconds: number;
  readonly seed: number;
  /** How many streaks of light are drawn in at the most. */
  readonly streaks: number;
  /** The colours the streaks drawn in are of, in turn. */
  readonly colors: readonly string[];
}

/**
 * A beam gathering, `gather` of the way to its release: the floor about it darkens and is lit from
 * the ball, rings close on it along the floor and about it in the air, each faster than the last,
 * streaks of light are drawn in from every side, quicker and more of them as it goes, and the ball
 * swells, slowly at first, and is squeezed white in the last instant.
 */
export function layGathering(drawn: Staged, gathering: Gathering, ramp: readonly string[], gather: number): void {
  if (gather <= 0 || gather >= 1) return;
  const { at, floor, cell, seconds, seed, line } = gathering;
  const hue = hueOf(ramp);
  const forward = cell * 0.4;
  const grown = Math.pow(gather, 1.15);
  const squeezed = within(gather, 0.9, 1);
  const size = gathering.size * (0.3 + 0.7 * grown) * (1 - 0.22 * squeezed) * (1 + 0.05 * Math.sin(seconds * 47));

  drawn.floor.push(floorMark('disc', floor, cell * 4.4, 1, GLOOM, 0.66 * Math.sqrt(gather), 'color', 0));
  drawn.floor.push(floorMark('disc', floor, cell * (1.6 + 1.6 * grown), 1, hue, 0.5 * grown, 'light', 0));
  drawn.floor.push(floorMark('disc', floor, cell * (0.7 + 0.6 * grown), 1, ramp[5], 0.55 * grown, 'light', 0));
  for (let ring = 0; ring < 3; ring++) {
    const closing = (gather * gather * 4.2 + ring / 3) % 1;
    const radius = cell * (3.6 - 3.1 * closing);
    const shown = Math.min(1, closing * 4) * (1 - closing * 0.3) * Math.min(1, gather * 5);
    drawn.floor.push(floorMark('ring', floor, radius, 0.07, hue, 0.7 * shown, 'color', 0));
    drawn.floor.push(floorMark('ring', floor, radius, 0.03, ramp[5], 0.9 * shown, 'light', 0));
  }
  for (let ring = 0; ring < 2; ring++) {
    const closing = (gather * gather * 3.4 + ring / 2) % 1;
    const about = beamRingOf(
      line,
      {
        along: 0,
        radius: gathering.size * (2.1 - 1.5 * closing) * (0.5 + 0.5 * grown),
        thick: cell * 0.05,
        color: ramp[5],
        alpha: Math.min(1, closing * 3) * Math.min(1, gather * 4),
      },
      floor.z + 1
    );
    drawn.ribbons.push(about.far, about.near);
  }

  const next = seededRun(seed * 37 + 9);
  const shown = Math.round(gathering.streaks * (0.3 + 0.7 * gather));
  for (let index = 0; index < gathering.streaks; index++) {
    const turn = next() * Math.PI * 2;
    const tilt = next() * 1.25 - 0.1;
    const phase = next();
    const pace = 1.7 + 2.6 * gather + next() * 0.8;
    if (index >= shown) continue;
    const run = (seconds * pace + phase) % 1;
    const far = cell * (3.9 - 1.3 * gather) * (1 - run * run);
    const out = { x: Math.cos(turn) * Math.cos(tilt), y: Math.sin(turn) * Math.cos(tilt), z: Math.sin(tilt) };
    const point = { x: at.x + out.x * far, y: at.y + out.y * far, z: Math.max(floor.z + 2, at.z + out.z * far) };
    const speed = cell * (5 + 16 * run) * (0.6 + 0.4 * gather);
    drawn.motes.push({
      ...glow(
        point,
        cell * (0.11 + 0.09 * run),
        gathering.colors[index % gathering.colors.length],
        Math.min(1, run * 3),
        forward
      ),
      shape: 'spark',
      velocity: { x: -out.x * speed, y: -out.y * speed, z: -out.z * speed },
      trail: 0.09,
    });
  }

  const white = squeezed > 0 ? ramp.map((step) => mixColor(step, '#ffffff', squeezed * 0.7)) : ramp;
  layOrb(drawn, at, line.way, size, white, 1, seconds);
  drawn.lights.push({
    ...at,
    color: mixColor(ramp[4], hue, 0.5),
    strength: 0.3 + 0.9 * grown,
    reachPx: cell * (2.5 + 2 * grown),
  });
}

/**
 * The white instant a great beam is let go, `t` seconds after: a hard white heart at the muzzle far
 * wider than the beam, a star of light across it, the floor under it bleached, and the table lit
 * hard; then rings thrown off the muzzle about the beam's line, one after another.
 */
export function layRelease(
  drawn: Staged,
  line: BeamLine,
  floor: Point,
  cell: number,
  wide: number,
  ramp: readonly string[],
  t: number,
  spin: number
): void {
  if (t < 0 || t >= 0.5) return;
  const hue = hueOf(ramp);
  const forward = cell * 0.5;
  const flash = 1 - within(t, 0.02, 0.15);
  if (flash > 0) {
    drawn.motes.push(haze(line.from, wide * 3.6, hue, 0.5 * flash, forward));
    drawn.motes.push(lightBall(line.from, wide * (2.6 - 0.8 * (1 - flash)), ramp[4], 0.8 * flash, forward + 1));
    drawn.motes.push(lightBall(line.from, wide * (1.9 - 0.7 * (1 - flash)), '#ffffff', flash, forward + 2));
    drawn.motes.push(...starBurst(line.from, wide * 4.2, ramp[4], within(t, 0, 0.3), forward + 3, 8, spin));
    drawn.floor.push(floorMark('disc', floor, cell * 3, 1, hue, 0.4 * flash, 'light', 0));
    drawn.floor.push(floorMark('disc', floor, cell * 1.4, 1, ramp[5], 0.5 * flash, 'light', 0));
  }
  for (let ring = 0; ring < 3; ring++) {
    const since = t - ring * 0.07;
    if (since < 0 || since >= 0.34) continue;
    const share = since / 0.34;
    const thrown = beamRingOf(
      line,
      {
        along: wide * (0.3 + 1.6 * share + ring * 0.3),
        radius: wide * (0.7 + 1.5 * (1 - (1 - share) * (1 - share))),
        thick: wide * 0.09 * (1 - share * 0.6),
        color: ring === 0 ? '#ffffff' : ramp[5],
        alpha: 1 - share,
      },
      floor.z + 1
    );
    drawn.ribbons.push(thrown.far, thrown.near);
  }
}

/** A piece standing in a beam: its foot, how wide it is, and how far along the beam's line it stands. */
export interface Washed {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly widthPx: number;
  readonly along: number;
}

/**
 * What breaks off a beam on a piece standing in it: a bow of light on the side the beam comes from,
 * flickering, and streaks of light thrown off it to either side and up, over and over, for as long
 * as the beam pours over it.
 */
export function layBowWash(
  drawn: Staged,
  line: BeamLine,
  piece: Washed,
  cell: number,
  wide: number,
  colors: readonly string[],
  seconds: number,
  seed: number,
  power: number,
  count: number
): void {
  if (power <= 0) return;
  const forward = cell * 0.5;
  const front = onLine(line, Math.max(0, piece.along - piece.widthPx * 0.35));
  const flicker = 0.75 + 0.25 * Math.sin(seconds * 53 + seed);
  drawn.motes.push(glow(front, wide * 1.5, colors[0], 0.6 * power * flicker, forward));
  drawn.motes.push(lightBall(front, wide * 0.5 * flicker, '#ffffff', 0.9 * power, forward + 1));
  const next = seededRun(seed * 53 + 17);
  for (let index = 0; index < count; index++) {
    const turn = next() * Math.PI * 2;
    const back = 0.2 + next() * 0.7;
    const pace = 2.2 + next() * 2.4;
    const phase = next();
    const run = (seconds * pace + phase) % 1;
    const out = {
      x: line.side.x * Math.cos(turn) + line.lift.x * Math.sin(turn) + line.way.x * back,
      y: line.side.y * Math.cos(turn) + line.lift.y * Math.sin(turn) + line.way.y * back,
      z: Math.abs(line.side.z * Math.cos(turn) + line.lift.z * Math.sin(turn)) + line.way.z * back,
    };
    const far = wide * (0.35 + 1.5 * run);
    const speed = wide * 6 * (1 - run * 0.6);
    drawn.motes.push({
      ...glow(
        { x: front.x + out.x * far, y: front.y + out.y * far, z: front.z + out.z * far },
        cell * 0.09,
        colors[index % colors.length],
        (1 - run) * power,
        forward
      ),
      shape: 'spark',
      velocity: { x: out.x * speed, y: out.y * speed, z: out.z * speed },
      trail: 0.05,
    });
  }
}

/** A trench burnt along the floor: where it runs from and to, how wide it is, and what tells its cracks apart. */
export interface Trench {
  readonly from: Point;
  readonly to: Point;
  readonly wide: number;
  readonly seed: number;
}

/**
 * A trench burnt along the floor under a beam, `t` seconds after the beam began to burn it: soot
 * laid along it, white-hot down its middle while the beam is on it, then glowing
 * like embers in a ragged seam half as wide and cooling over `coolS` seconds from when the beam `stops`, the end the beam left
 * first cooling first; gone as `clearing` falls to nothing. `marks` is how many smudges its glow is laid in, and its soot in half as many.
 */
export function layTrench(
  drawn: Staged,
  trench: Trench,
  ramp: readonly string[],
  t: number,
  stops: number,
  coolS: number,
  clearing: number,
  marks: number
): void {
  if (t < 0 || clearing <= 0) return;
  const { from, to, wide } = trench;
  const long = Math.hypot(to.x - from.x, to.y - from.y);
  if (long < 1) return;
  const laid = Math.min(1, t / 0.12);
  const places = Array.from({ length: marks }, (_unused, index) => (index + 0.5) / marks).filter(
    (share) => share <= laid
  );
  const at = (share: number): Point => ({
    x: from.x + (to.x - from.x) * share,
    y: from.y + (to.y - from.y) * share,
    z: from.z + (to.z - from.z) * share,
  });
  const ragged = (index: number) => 0.85 + 0.3 * Math.sin(index * 2.7 + trench.seed);
  places.forEach((share, index) => {
    if (index % 2 === 1) return;
    drawn.floor.push(floorMark('disc', at(share), wide * 1.25 * ragged(index), 1, SMOKE, 0.7 * clearing, 'color', 0));
    drawn.floor.push(floorMark('disc', at(share), wide * 0.8 * ragged(index), 1, SOOT, 0.75 * clearing, 'color', 0));
  });
  const heatAt = (share: number) => (t < stops ? 1 : Math.max(0, 1 - (t - stops - share * 0.25) / coolS));
  const narrowed = t < stops ? 1 : 0.5;
  places.forEach((share, index) => {
    const heat = heatAt(share);
    if (heat <= 0) return;
    const shown = Math.min(1, heat * 2.5) * clearing;
    drawn.floor.push(
      floorMark(
        'disc',
        at(share),
        wide * (0.62 + 0.14 * heat) * narrowed * ragged(index * 3 + 1),
        1,
        t < stops ? hueOf(ramp) : EMBER_DEEP,
        0.85 * shown,
        'color',
        0
      )
    );
  });
  places.forEach((share, index) => {
    const heat = heatAt(share);
    if (heat <= 0) return;
    const shown = Math.min(1, heat * 2.5) * clearing;
    const hot = t < stops ? ramp[4] : mixColor(EMBER, ramp[5], Math.max(0, heat * 2.2 - 1.2));
    drawn.floor.push(
      floorMark(
        'disc',
        at(share),
        wide * (0.3 + 0.22 * heat) * narrowed * ragged(index * 5 + 2),
        1,
        hot,
        shown,
        'color',
        0
      )
    );
  });
}

/** Wisps of smoke rising off a trench once the beam has left it, `t` seconds after, thinning as they rise. */
export function layTrenchSmoke(
  drawn: Staged,
  trench: Trench,
  cell: number,
  t: number,
  lasts: number,
  count: number
): void {
  if (t < 0 || t >= lasts) return;
  const next = seededRun(trench.seed * 71 + 3);
  for (let index = 0; index < count; index++) {
    const share = next();
    const born = next() * lasts * 0.4;
    const life = lasts * (0.45 + 0.3 * next());
    const age = (t - born) / life;
    if (age < 0 || age >= 1) continue;
    const at = {
      x: trench.from.x + (trench.to.x - trench.from.x) * share + (next() - 0.5) * trench.wide,
      y: trench.from.y + (trench.to.y - trench.from.y) * share + (next() - 0.5) * trench.wide,
      z: trench.from.z + cell * (0.15 + 1.1 * age),
    };
    drawn.motes.push(
      smokePuff(at, cell * (0.5 + 0.8 * age), '#4b4650', 0.4 * Math.min(1, age * 5) * (1 - age), cell * 0.3)
    );
  }
}

/**
 * The embers of light a beam breaks up into, `t` seconds after it began to fail: motes left along
 * its line, those by the muzzle first, each drifting up and on the way the beam ran, twinkling, and
 * dying over `lasts` seconds.
 */
export function layBeamEmbers(
  drawn: Staged,
  line: BeamLine,
  cell: number,
  wide: number,
  colors: readonly string[],
  t: number,
  lasts: number,
  seed: number,
  count: number
): void {
  if (t < 0 || t >= lasts + 0.4) return;
  const next = seededRun(seed * 43 + 29);
  for (let index = 0; index < count; index++) {
    const share = next();
    const aside = (next() - 0.5) * wide * 0.9;
    const up = (next() - 0.5) * wide * 0.7;
    const born = share * 0.35 + next() * 0.1;
    const life = lasts * (0.5 + 0.5 * next());
    const drift = 0.4 + next() * 0.9;
    const age = (t - born) / life;
    if (age < 0 || age >= 1) continue;
    const eased = 1 - (1 - age) * (1 - age);
    const at = onLine(line, line.length * share + cell * 1.6 * drift * eased, aside * (1 + 0.5 * eased), up);
    const twinkle = 0.55 + 0.45 * Math.sin(t * 23 + index * 2.3);
    const color = colors[index % colors.length];
    const point = { ...at, z: at.z + cell * 0.9 * drift * eased };
    if (index % 5 === 0) {
      drawn.motes.push({
        ...glow(point, cell * 0.55 * (1 - age * 0.5), '#ffffff', (1 - age) * twinkle, cell * 0.3),
        shape: 'star',
        spin: index + t * 2,
      });
    }
    drawn.motes.push(
      glow(point, cell * (0.3 + 0.2 * (index % 3)) * (1 - age * 0.6), color, (1 - age) * twinkle, cell * 0.3)
    );
  }
}
