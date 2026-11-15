import { beamLineOf, beamRingOf, onLine } from '@axe/domain/effect/scene/beam/beam-body';
import { type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import {
  floorMark,
  glow,
  hueOf,
  lerpPoint,
  lightBall,
  type Point,
  smokePuff,
  starBurst,
} from '@axe/domain/effect/scene/parts';

/*
 * A shot of a blaster: the muzzle flashes, a ring of light opening about the line of fire, and a bolt
 * of light leaves it, long and thick, white at its heart in a sheath of its colour and a dark rim that
 * keeps it on a bright floor. The line it flew hangs in the air behind it for a moment. Where it
 * strikes, light sprays back the way it came, a spot of the floor is burnt and a thread of smoke
 * rises. Each shot of a burst leaves the muzzle a little off the last, so a burst rattles.
 */

/** How long the bolt is, and how wide its sheath, in cells. */
const LONG = 2.8;
const WIDE = 0.52;
/** How long the flash at the muzzle lasts, how long the line of a shot hangs, and how long light sprays where it strikes, in seconds. */
const FLASH_S = 0.13;
const HANGS_S = 0.36;
const SPRAY_S = 0.32;
/** How long the spot it burns glows, and how long the thread of smoke off it rises, in seconds. */
const SPOT_S = 0.7;
const SMOKE_S = 0.9;
/** How far each shot of a burst leaves the muzzle off the last, in cells. */
const RATTLES = 0.14;
const SHADOW = '#190608';
const SOOT = '#0e0b10';
const EMBER = '#ff7a2c';

/** One shot of a blaster on its own clock. */
export interface BlasterShot {
  /** Where it is fired from and where it strikes. */
  readonly from: Point;
  readonly to: Point;
  readonly cell: number;
  readonly floorZ: number;
  /** The moment now, and the moments it is fired and it strikes, in seconds. */
  readonly seconds: number;
  readonly launch: number;
  readonly lands: number;
  /** Which shot of its burst it is, and of how many. */
  readonly index: number;
  readonly shots: number;
  readonly seed: number;
}

/** Where a shot of a burst leaves the muzzle: a little off the muzzle, to another side for each. */
function muzzleOf(shot: BlasterShot): Point {
  if (shot.shots <= 1) return shot.from;
  const next = seededRun(shot.seed * 29 + shot.index * 7 + 1);
  const off = shot.cell * RATTLES;
  return {
    x: shot.from.x + (next() - 0.5) * 2 * off,
    y: shot.from.y + (next() - 0.5) * 2 * off,
    z: shot.from.z + (next() - 0.5) * 2 * off,
  };
}

/** Draws one shot of a blaster at a moment: see the header. */
export function drawBlasterShot(drawn: Staged, shot: BlasterShot, ramp: readonly string[]): void {
  const { cell, seconds: t } = shot;
  const since = t - shot.launch;
  if (since < 0) return;
  const hue = hueOf(ramp);
  const dark = mixColor(ramp[0], SHADOW, 0.6);
  const forward = cell * 0.5;
  const muzzle = muzzleOf(shot);
  const line = beamLineOf(muzzle, shot.to);
  const flies = Math.max(shot.lands - shot.launch, 0.02);
  const head = Math.min(1, since / flies) * line.length;

  if (since < FLASH_S) {
    const share = since / FLASH_S;
    const ring = beamRingOf(
      line,
      {
        along: cell * (0.15 + 0.5 * share),
        radius: cell * (0.2 + 0.75 * (1 - (1 - share) * (1 - share))),
        thick: cell * 0.09 * (1 - share * 0.6),
        color: ramp[5],
        alpha: 1 - share,
      },
      shot.floorZ + 1
    );
    drawn.ribbons.push(ring.far, ring.near);
    drawn.motes.push(...starBurst(muzzle, cell * 2.1, hue, share, forward, 6, 0.3 + shot.index));
    drawn.motes.push(lightBall(muzzle, cell * 0.6 * (1 - share * 0.5), '#ffffff', 1 - share, forward + 1));
    drawn.lights.push({ ...muzzle, color: ramp[4], strength: 1.5 * (1 - share), reachPx: cell * 3 });
  }

  if (since < flies) {
    const tail = Math.max(0, head - cell * LONG);
    const points = [0, 0.45, 0.82, 1].map((share) => onLine(line, tail + (head - tail) * share));
    const U = cell * WIDE;
    drawn.ribbons.push(
      { points, widths: [0, U * 1.2, U * 1.6, U * 0.9], color: dark, alpha: 0.85, blend: 'color', soft: 0.35 },
      { points, widths: [0, U * 0.8, U, U * 0.55], color: hue, core: ramp[4], alpha: 1, blend: 'color' },
      { points, widths: [0, U * 0.3, U * 0.46, U * 0.3], color: '#ffffff', alpha: 1, blend: 'color' }
    );
    const at = onLine(line, head);
    drawn.motes.push(glow(at, cell * 1.5, hue, 0.7, forward));
    drawn.motes.push(lightBall(at, cell * 0.3, '#ffffff', 1, forward + 1));
    drawn.lights.push({ ...at, color: ramp[4], strength: 0.9, reachPx: cell * 2.2 });
  }

  if (since < HANGS_S) {
    const left = 1 - since / HANGS_S;
    const points = [muzzle, onLine(line, head * 0.5), onLine(line, head)];
    drawn.ribbons.push({
      points,
      widths: cell * 0.34 * (0.4 + 0.6 * left),
      color: hue,
      alpha: 0.75 * left,
      blend: 'color',
      soft: 0.7,
    });
    drawn.ribbons.push({ points, widths: cell * 0.1 * left, color: ramp[5], alpha: left, blend: 'color' });
  }

  const struck = t - shot.lands;
  if (struck < 0) return;
  if (struck < SPRAY_S) {
    const share = struck / SPRAY_S;
    const next = seededRun(shot.seed * 41 + shot.index * 13 + 5);
    drawn.motes.push(
      ...starBurst(shot.to, cell * 2.6, hue, within(struck, 0, 0.2), forward + 1, 6, shot.seed + shot.index)
    );
    drawn.motes.push(lightBall(shot.to, cell * 0.75 * (1 - share), '#ffffff', 1 - within(struck, 0, 0.1), forward + 2));
    drawn.lights.push({ ...shot.to, color: ramp[4], strength: 1.3 * (1 - share), reachPx: cell * 3 });
    for (let index = 0; index < 14; index++) {
      const turn = next() * Math.PI * 2;
      const back = 0.5 + next() * 1.3;
      const fast = cell * (5 + next() * 8);
      const out = {
        x: line.side.x * Math.cos(turn) + line.lift.x * Math.sin(turn) - line.way.x * back,
        y: line.side.y * Math.cos(turn) + line.lift.y * Math.sin(turn) - line.way.y * back,
        z: Math.abs(line.side.z * Math.cos(turn) + line.lift.z * Math.sin(turn)) - line.way.z * back + 0.3,
      };
      const far = fast * struck * (1 - share * 0.5);
      const at = {
        x: shot.to.x + out.x * far,
        y: shot.to.y + out.y * far,
        z: Math.max(shot.floorZ + 1, shot.to.z + out.z * far),
      };
      drawn.motes.push({
        ...glow(at, cell * 0.08, share < 0.4 ? '#ffffff' : ramp[4], 1 - share, forward),
        shape: 'spark',
        velocity: { x: out.x * fast, y: out.y * fast, z: out.z * fast },
        trail: 0.04,
      });
    }
  }
  const spot = { x: shot.to.x, y: shot.to.y, z: shot.floorZ };
  const heat = Math.pow(Math.max(0, 1 - struck / SPOT_S), 1.5);
  if (struck < SMOKE_S)
    drawn.floor.push(
      floorMark('disc', spot, cell * 0.4, 1, SOOT, 0.6 * (1 - within(struck, SMOKE_S - 0.3, SMOKE_S)), 'color', 0)
    );
  if (heat > 0) drawn.floor.push(floorMark('disc', spot, cell * (0.25 + 0.2 * heat), 1, EMBER, 0.8 * heat, 'light', 0));
  if (struck > 0.08 && struck < SMOKE_S) {
    const rose = within(struck, 0.08, SMOKE_S);
    drawn.motes.push(
      smokePuff(
        lerpPoint(shot.to, { ...shot.to, z: shot.to.z + cell * 1.4 }, rose),
        cell * (0.3 + 0.6 * rose),
        '#4b4650',
        0.4 * (1 - rose),
        cell * 0.3
      )
    );
  }
}
