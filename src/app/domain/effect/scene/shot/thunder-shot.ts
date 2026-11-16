import { EFFECT_MOTE_OPTIONS, effectMoteOf } from '@axe/domain/effect/effect-motes';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import { type Staged } from '@axe/domain/effect/scene/choreography';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { acrossOf, ball as solid, floorMark, glow, hueOf, lightBall, type Point } from '@axe/domain/effect/scene/parts';
import { boltAfterimage, boltRibbons, boltShape } from '@axe/domain/effect/scene/storm/lightning';

/*
 * A shot of lightning in flight: a hard-edged ball of violet, pale within and white at its heart, in a
 * dark rim that keeps it on a bright table, wound about with thin bolts that take a new shape every
 * few hundredths of a second; a jagged track glowing behind it along the way it has come, sparks
 * shed off it, and now and then a thread of lightning dropped from it to the floor it passes over.
 * A bolt that lands in a bolt of lightning is such a shot, unless it is of another element.
 */

/** The families that have an element other than lightning: a shot of one of them is of that element, whatever it lands in. */
const OTHER_ELEMENTS: ReadonlySet<string> = new Set(['炎', '氷', '風', '闇', '聖', '状態異常', '土', '回復', '強化']);
/** The particles of the other elements: a shot that carries one of them along its way is of that element. */
const OTHER_MOTES: ReadonlySet<string> = new Set(['frost', 'leaf', 'haze']);

/**
 * Whether a shot is a shot of lightning: a bolt that lands in a bolt of lightning, unless what it
 * carries along its way says it is of another element. Its own choice of particle says first, and
 * with none chosen its family says. Any other shot is drawn as its look has it.
 */
export function isThunderShot(preset: EffectPreset): boolean {
  if (preset.effectKind !== 'projectile' || preset.projectileLook !== 'bolt' || preset.impactEffectKind !== 'bolt') {
    return false;
  }
  const chosen = preset.moteStyle !== '' && EFFECT_MOTE_OPTIONS.includes(preset.moteStyle);
  return chosen ? !OTHER_MOTES.has(effectMoteOf(preset)) : !OTHER_ELEMENTS.has(preset.tagName.trim());
}

/** The dark laid under the ball, so that it reads on a bright floor. */
const SHEATH = '#1b0f3d';
/** How wide the ball is, in cells, and how many bolts are wound about it. */
const BALL = 0.75;
const WOUND = 4;

/** A shot of lightning as it flies: where it is, which way it flies, and the way it has come. */
export interface ThunderFlight {
  readonly at: Point;
  readonly way: Point;
  /** How wide a cell is drawn for it, in table pixels. */
  readonly cell: number;
  /** How far along its flight it is, from 0 to 1, and where it is at any share of it. */
  readonly share: number;
  readonly pathAt: (along: number) => Point;
  readonly seconds: number;
  readonly seed: number;
  readonly floorZ: number;
  readonly forward: number;
  /** How many shots of its volley fly with it: the more there are, the fewer bolts each is wound with. */
  readonly shots?: number;
}

/** Draws a shot of lightning in flight. */
export function drawThunderShot(drawn: Staged, flight: ThunderFlight, ramp: readonly string[]): void {
  const { at, way, cell, share, seconds, seed, forward } = flight;
  const hue = hueOf(ramp);
  const flicker = Math.floor(seconds / 0.04);
  const next = seededRun(seed * 71 + flicker * 19);
  const { side, lift } = acrossOf(way);
  const ball = cell * BALL;
  const was = flight.pathAt(Math.max(0, share - 0.16));
  const alone = (flight.shots ?? 1) <= 1;
  const track = boltShape(was, at, seed, flicker, { breaks: alone ? 4 : 3, jag: 0.12 });
  drawn.ribbons.push(...boltAfterimage(track, cell, ramp, 0.9, 2));
  const wavers = seed % 6;
  drawn.motes.push(glow(at, ball * 2.4, ramp[4], 0.55, forward - 3));
  drawn.motes.push(solid(at, ball * 1.25, SHEATH, 0.85, forward - 2, wavers));
  drawn.motes.push(solid(at, ball, ramp[1], 1, forward - 1, wavers + 1));
  drawn.motes.push(solid(at, ball * 0.72, ramp[3], 1, forward, wavers + 2));
  drawn.motes.push(lightBall(at, ball * 0.46, '#ffffff', 1, forward + 1));
  const wound = Math.max(2, Math.round(WOUND / Math.sqrt(flight.shots ?? 1)));
  for (let bolt = 0; bolt < wound; bolt++) {
    const turn = next() * Math.PI * 2;
    const tilt = (next() - 0.5) * 1.6;
    const out = (reach: number, spun: number): Point => ({
      x: at.x + (side.x * Math.cos(spun) + lift.x * Math.sin(spun)) * reach + way.x * tilt * reach,
      y: at.y + (side.y * Math.cos(spun) + lift.y * Math.sin(spun)) * reach + way.y * tilt * reach,
      z: at.z + (side.z * Math.cos(spun) + lift.z * Math.sin(spun)) * reach + way.z * tilt * reach,
    });
    const shape = boltShape(out(ball * 0.75, turn), out(ball * 0.85, turn + 1.6 + next() * 1.6), seed + bolt, flicker, {
      breaks: 3,
      jag: 0.34,
      forks: alone ? 1 : 0,
      forkReach: 0.7,
    });
    drawn.ribbons.push(...boltRibbons(shape, cell, ramp, 0.95, 0.36));
  }
  if (flicker % (alone ? 3 : 5) === 0 && at.z - flight.floorZ < cell * 2.5) {
    const lands = {
      x: at.x - way.x * cell * 0.4 + (next() - 0.5) * cell * 0.6,
      y: at.y - way.y * cell * 0.4 + (next() - 0.5) * cell * 0.6,
      z: flight.floorZ + cell * 0.04,
    };
    const thread = boltShape(at, lands, seed + 9, flicker, { breaks: 4, jag: 0.14 });
    drawn.ribbons.push(...boltRibbons(thread, cell, ramp, 0.85, 0.3));
    drawn.motes.push({ ...glow(lands, cell * 0.26, '#ffffff', 1, forward), shape: 'star', spin: flicker });
    drawn.floor.push(floorMark('disc', lands, cell * 0.5, 1, ramp[4], 0.5, 'light', 0));
  }
  for (let shed = 1; shed <= 5; shed++) {
    const behind = share - shed * 0.045;
    if (behind < 0) continue;
    const age = shed / 6;
    const where = flight.pathAt(behind);
    const off = Math.sin(seed * 3 + shed * 2.1) * cell * 0.2;
    const fall = Math.cos(seed + shed * 1.7) * cell * 0.12 - age * age * cell * 0.4;
    drawn.motes.push({
      ...glow(
        { x: where.x + side.x * off, y: where.y + side.y * off, z: where.z + fall },
        cell * 0.06 * (1 - 0.4 * age),
        age < 0.5 ? '#ffffff' : ramp[4],
        1 - age,
        forward
      ),
      shape: 'spark',
      velocity: { x: -way.x * cell * 2, y: -way.y * cell * 2, z: -way.z * cell * 2 - age * cell * 3 },
      trail: 0.08,
    });
  }
  drawn.floor.push(floorMark('disc', { x: at.x, y: at.y, z: flight.floorZ }, cell * 1.1, 1, hue, 0.22, 'light', 0));
  drawn.lights.push({ ...at, color: ramp[4], strength: 1.3, reachPx: cell * 3.2 });
}
