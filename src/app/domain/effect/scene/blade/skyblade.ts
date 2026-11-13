import {
  type Choreography,
  nothingStaged,
  outCubic,
  type Stage,
  type Staged,
  within,
} from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { drawEmber, layShockRing, risingEmbers } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  glow,
  haze,
  hueOf,
  keptFor,
  type Point,
  stageKey,
  starBurst,
  throwerFor,
} from '@axe/domain/effect/scene/parts';

/*
 * A great blade of light: light rises in a column from the caster's feet and gathers into a vast
 * blade standing over it, white at its heart and its edge in the colour, embers drawn up about it;
 * then it falls, turning about its foot, its tip sweeping down through the air in a trail of light
 * onto the target, and where it strikes the look it was given goes off, and the blade breaks into
 * light and is gone.
 */

/** Where in its playback the light has risen, the blade has formed, and the blade has fallen. */
const RISEN = 0.24;
const FORMED = 0.5;
/** The shortest the blade is, in cells, so it reads as a sword however near its target. */
const SHORTEST = 6;
/** How long the blade takes to break into light after it strikes, in seconds. */
const BREAKS_S = 0.35;

/** How the look it strikes with is drawn, as the table of looks drawn in the scene gives it. */
export type ImpactLook = (stage: Stage) => Staged;

const thrownByStage = new Map<string, readonly ThrownMote[]>();

/** The great blade, striking with the look `impactOf` gives for its preset's kind of landing, which lingers `lingerS`. */
export function skybladeWith(impactOf: (stage: Stage) => Staged, lingerS: number): Choreography {
  return { lingerS, draw: (stage) => drawSkyblade(stage, impactOf) };
}

function drawSkyblade(stage: Stage, impactOf: (stage: Stage) => Staged): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const strikes = stage.blowsAt[0] ?? duration * 0.68;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const foot = stage.origin
    ? { x: stage.origin.x, y: stage.origin.y, z: stage.groundZ }
    : { x: stage.x - cell * 3, y: stage.y + cell * 3, z: stage.groundZ };
  const target = { x: stage.x, y: stage.y, z: stage.groundZ };
  const toward = { x: target.x - foot.x, y: target.y - foot.y };
  const span = Math.hypot(toward.x, toward.y) || 1;
  const way = { x: toward.x / span, y: toward.y / span };
  const length = Math.max(span, cell * SHORTEST);
  // Once it has fallen it lies along the way to the target, leaning down so its tip meets the floor there.
  const fallen = Math.atan2(-cell * 0.3, span);
  const embers = keptFor(thrownByStage, stageKey(stage, duration + 1), () => {
    const th = throwerFor(stage, duration + 1);
    return risingEmbers(th, { ...foot, z: foot.z + cell * 0.2 }, th.count(28), [0, strikes], 0.4);
  });
  const forward = cell * 0.4;

  const rising = within(t, 0, RISEN * duration);
  const forming = within(t, RISEN * duration, FORMED * duration);
  const falling = within(t, FORMED * duration, strikes);
  const breaking = within(t, strikes, strikes + BREAKS_S);
  // The way the blade points: straight up while it forms, turning down onto the target as it falls.
  const tilt = Math.PI / 2 + (fallen - Math.PI / 2) * (falling * falling);
  const pointing = (angle: number) => ({ x: way.x * Math.cos(angle), y: way.y * Math.cos(angle), z: Math.sin(angle) });

  for (const [index, ember] of embers.entries()) drawEmber(drawn, ember, t, cell, ramp, index, forward);

  if (breaking < 1) {
    // While the light rises it is a column; as it forms it is a blade of its full length.
    // Falling, it is drawn in to just reach the target, so its tip comes down on it rather than past it.
    const standing = rising < 1 ? length * 0.6 * outCubic(rising) : length * (0.6 + 0.4 * outCubic(forming));
    const tall = standing + (Math.hypot(span, cell * 0.3) - standing) * falling * falling;
    const wide = cell * (rising < 1 ? 0.6 * rising : 0.6 + 0.6 * forming) * (1 - breaking);
    const flash = breaking > 0 ? 1 - breaking : 1;
    const dir = pointing(tilt);
    for (const [colour, share] of [
      [ramp[1], 1.15],
      [ramp[3], 1],
      [ramp[5], 0.6],
      ['#ffffff', 0.3],
    ] as const) {
      const reach = Math.max(tall - wide * share, 2);
      drawn.motes.push({
        x: foot.x + dir.x * tall,
        y: foot.y + dir.y * tall,
        z: foot.z + dir.z * tall,
        size: wide * share,
        color: colour,
        alpha: flash,
        blend: 'color',
        shape: 'tongue',
        velocity: { x: dir.x * reach, y: dir.y * reach, z: dir.z * reach },
        trail: 1,
        variant: stage.seed + t,
        forward,
      });
    }
    // A halo of its colour all along the blade.
    const shining = flash * Math.max(rising, forming);
    for (let along = 1; along <= 4; along++) {
      const share = along / 4;
      const at = {
        x: foot.x + dir.x * tall * share * 0.9,
        y: foot.y + dir.y * tall * share * 0.9,
        z: foot.z + dir.z * tall * share * 0.9,
      };
      drawn.motes.push(haze(at, wide * 4, hueOf(ramp), 0.3 * shining, forward));
      drawn.motes.push(glow(at, wide * 3, ramp[4], 0.3 * shining, forward));
    }
    // As it falls its tip sweeps a trail of light behind it.
    if (falling > 0 && falling < 1) {
      const points: Point[] = [];
      for (let back = 10; back >= 0; back--) {
        const was = Math.max(0, falling - back * 0.035);
        const angle = Math.PI / 2 + (fallen - Math.PI / 2) * was * was;
        const d = pointing(angle);
        points.push({ x: foot.x + d.x * tall * 0.97, y: foot.y + d.y * tall * 0.97, z: foot.z + d.z * tall * 0.97 });
      }
      const shares = points.map((_point, index) => index / (points.length - 1));
      drawn.ribbons.push({
        points,
        widths: shares.map((share) => cell * 1.6 * share),
        color: hueOf(ramp),
        core: ramp[5],
        alpha: 0.9,
        alphas: shares,
        blend: 'light',
      });
    }
  }
  if (t >= strikes) {
    drawn.motes.push(...lightAt(target, cell, ramp, t - strikes, forward));
    layShockRing(drawn, target, cell * 0.4, cell * 3.4, cell * 0.2, hueOf(ramp), t - strikes, 0.5);
    drawn.motes.push(
      ...starBurst(
        { ...target, z: target.z + cell * 0.5 },
        cell * 3,
        hueOf(ramp),
        (t - strikes) / 0.3,
        forward * 2,
        8,
        stage.seed
      )
    );
    const impact = impactOf({
      ...stage,
      seconds: t - strikes,
      duration: Math.max(0.4, duration - strikes),
      blowsAt: [0],
    });
    drawn.motes.push(...impact.motes);
    drawn.ribbons.push(...impact.ribbons);
    drawn.floor.push(...impact.floor);
    drawn.lights.push(...impact.lights);
  }
  const shining = Math.max(rising < 1 ? rising : 1 - falling * 0.5, 0) * (1 - breaking);
  if (shining > 0.05 && t < strikes) {
    const middle = pointing(tilt);
    drawn.lights.push({
      x: foot.x + middle.x * length * 0.3,
      y: foot.y + middle.y * length * 0.3,
      z: foot.z + middle.z * length * 0.3,
      color: ramp[4],
      strength: 0.9 * shining,
      reachPx: cell * 3,
    });
  }
  return drawn;
}

/** The blade breaking into light where it strikes. */
function lightAt(at: Point, cell: number, ramp: readonly string[], since: number, forward: number) {
  if (since > 0.25) return [];
  const left = 1 - since / 0.25;
  return [glow({ ...at, z: at.z + cell * 0.4 }, cell * 2.4 * (1.2 - left * 0.2), ramp[5], left, forward * 2)];
}
