import {
  type Choreography,
  nothingStaged,
  outCubic,
  type Stage,
  type Staged,
  within,
} from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import {
  type Cloud,
  drawFire,
  drawFireThrow,
  type FireBall,
  type FireThrow,
  SMOKE,
  WARM,
} from '@axe/domain/effect/scene/fire/fire-parts';
import {
  floorMark,
  glow,
  keptFor,
  type Point,
  stageKey,
  type Thrower,
  throwerFor,
} from '@axe/domain/effect/scene/parts';

/*
 * A piece set ablaze: tongues of flame stand in a ring round its feet, leaning in over it, and more
 * lick up its body from its waist and shoulders past its head, all flickering in height and swaying;
 * red at their edge, yellow within and white at the heart of the fire. Blobs of flame break off their tips and rise, cooling, some to smoke, which rises away dark
 * over the fire. Embers are carried up, sparks pop, the floor under it is lit warm and blackens as it
 * burns. Near its end the fire sinks, the tongues shorten, and coals are left glowing on the floor
 * while the last smoke clears.
 */

/** How long a fire lingers after its playback while its smoke clears and its coals die, in seconds. */
const LINGER_S = 1.6;
/** How many tongues of flame stand round a piece's feet at the middle grade. */
const TONGUES = 5;
/** How many lick up its body at the middle grade. */
const BODY_TONGUES = 4;
/** How many blobs of flame break off the tongues a second at the middle grade. */
const BLOBS_A_SECOND = 12;
/** How long the fire takes to catch, and the longest it takes to die down, in seconds. */
const CATCHES_S = 0.3;
const DIES_S = 0.8;

const thrownByStage = new Map<string, FlameThrow>();

export const flame: Choreography = { lingerS: LINGER_S, draw: drawFlame };

/** How fiercely it burns at a moment, from nothing as it catches to whole, and back to nothing as it dies down. */
function fierceness(t: number, duration: number): number {
  const dies = Math.min(DIES_S, duration * 0.25);
  return Math.min(outCubic(within(t, 0, CATCHES_S)), 1 - within(t, duration - dies, duration));
}

function drawFlame(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const ends = duration + LINGER_S;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const forward = cell * 0.15;
  const fierce = fierceness(t, duration);
  const flicker = 0.85 + 0.1 * Math.sin(t * 23 + stage.seed) + 0.05 * Math.sin(t * 57 + stage.seed * 1.7);
  const thrown = keptFor(thrownByStage, stageKey(stage, ends), () =>
    throwFire(throwerFor(stage, ends), floor, stage.z, duration)
  );

  // The floor: lit warm while it burns, a bed of embers under the fire, and soot spreading as it burns.
  const burnt = within(t, 0, duration);
  const clearing = 1 - within(t, ends - 0.6, ends);
  drawn.floor.push(
    floorMark('scorch', floor, cell * (0.25 + 0.4 * burnt), 1, SMOKE, 0.5 * clearing, 'color', (stage.seed % 89) + 1)
  );
  if (fierce > 0) {
    drawn.floor.push(floorMark('disc', floor, cell * 1.5, 1, WARM, 0.3 * fierce * flicker, 'light', 0));
    drawn.floor.push(
      floorMark('scorch', floor, cell * 0.5, 1, ramp[4], 0.55 * fierce * flicker, 'light', (stage.seed % 61) + 3)
    );
  }
  // Coals left glowing on the floor as the fire dies, fading as they cool.
  const cooling = within(t, duration - Math.min(DIES_S, duration * 0.25), ends - 0.3);
  if (cooling > 0 && cooling < 1) {
    for (const [index, coal] of thrown.coals.entries()) {
      const pulse = 0.7 + 0.3 * Math.sin(t * 5 + index * 1.9);
      drawn.motes.push(glow(coal, cell * 0.12, ramp[cooling < 0.5 ? 4 : 3], (1 - cooling) * pulse, forward));
    }
  }

  drawFireThrow(drawn, { ...thrown, fire: [] }, t, cell, ramp, forward);
  drawTongues(drawn, thrown.tongues, floor, t, fierce, cell, ramp, forward);
  for (const blob of thrown.fire) drawFire(drawn, blob, t, cell, ramp, forward);

  if (fierce > 0.02) {
    const heart = { x: stage.x, y: stage.y, z: stage.z + cell * 0.5 };
    drawn.lights.push({
      ...heart,
      color: mixColor(ramp[4], WARM, 0.5),
      strength: 1.0 * fierce * flicker,
      reachPx: cell * 2.8,
    });
  }
  return drawn;
}

/** A tongue of flame standing round the piece: where it stands, how wide and tall, and how it flickers. */
interface Tongue {
  readonly angle: number;
  readonly out: number;
  /** How high up the piece it is rooted, in cells: nothing for one standing on the floor. */
  readonly rise: number;
  readonly width: number;
  readonly height: number;
  readonly phases: readonly [number, number, number];
  readonly rates: readonly [number, number, number];
  readonly variant: number;
}

interface FlameThrow extends FireThrow {
  readonly tongues: readonly Tongue[];
  /** Where coals lie on the floor as the fire dies. */
  readonly coals: readonly Point[];
}

/** Where a tongue stands on the floor, which way and how far it reaches from there at a moment, in table pixels. */
function tongueAt(tongue: Tongue, floor: Point, t: number, fierce: number, cell: number) {
  const [p1, p2, p3] = tongue.phases;
  const [w1, w2, w3] = tongue.rates;
  const tall = cell * tongue.height * fierce * (0.74 + 0.18 * Math.sin(w1 * t + p1) + 0.1 * Math.sin(w2 * t + p2));
  const leanX = -Math.cos(tongue.angle) * 0.18 + 0.14 * Math.sin(w3 * t + p3);
  const leanY = -Math.sin(tongue.angle) * 0.18 + 0.14 * Math.cos(w3 * 0.7 * t + p1);
  const root = {
    x: floor.x + Math.cos(tongue.angle) * tongue.out * cell,
    y: floor.y + Math.sin(tongue.angle) * tongue.out * cell,
    z: floor.z + cell * (0.02 + tongue.rise),
  };
  return { root, tall, leanX, leanY, tip: { x: root.x + leanX * tall, y: root.y + leanY * tall, z: root.z + tall } };
}

/**
 * The tongues at a moment, each three tongues a step apart in colour, the hotter the smaller: all
 * the outer ones first, then the inner, then the hearts, so the fire is one body hottest within.
 */
function drawTongues(
  drawn: Staged,
  tongues: readonly Tongue[],
  floor: Point,
  t: number,
  fierce: number,
  cell: number,
  ramp: readonly string[],
  forward: number
): void {
  if (fierce <= 0.02) return;
  const layers = [
    { step: 1, wide: 1.12, tall: 1.04 },
    { step: 2, wide: 1, tall: 0.96 },
    { step: 4, wide: 0.66, tall: 0.7 },
    { step: 5, wide: 0.36, tall: 0.42 },
  ] as const;
  const standing = tongues.map((tongue) => ({ tongue, at: tongueAt(tongue, floor, t, fierce, cell) }));
  for (const layer of layers) {
    for (const { tongue, at } of standing) {
      const tall = at.tall * layer.tall;
      const width = cell * tongue.width * layer.wide * (0.6 + 0.4 * fierce);
      const reach = Math.max(tall - width, 2);
      drawn.motes.push({
        x: at.root.x + at.leanX * tall,
        y: at.root.y + at.leanY * tall,
        z: at.root.z + tall,
        size: width,
        color: ramp[layer.step],
        alpha: 1,
        blend: 'color',
        shape: 'tongue',
        velocity: { x: at.leanX * reach, y: at.leanY * reach, z: reach },
        trail: 1,
        variant: tongue.variant + t * 1.7,
        forward,
      });
    }
  }
  // The heart of the fire gives light.
  drawn.motes.push(
    glow({ x: floor.x, y: floor.y, z: floor.z + cell * 0.3 }, cell * 1.1, ramp[4], 0.35 * fierce, forward)
  );
}

/** Throws the whole fire from its catching to its dying, tongue by tongue, each as fierce as the fire is when it rises. */
function throwFire(th: Thrower, floor: Point, footZ: number, duration: number): FlameThrow {
  const U = th.cell;
  const fire: FireBall[] = [];
  const clouds: Cloud[] = [];
  const embers: ThrownMote[] = [];
  const sparks: ThrownMote[] = [];
  const count = th.count(TONGUES);
  const onFloor: Tongue[] = Array.from({ length: count }, (_unused, index) => ({
    angle: ((index + th.range(-0.3, 0.3)) / count) * Math.PI * 2,
    out: th.range(0.2, 0.42),
    rise: 0,
    width: th.range(0.24, 0.34),
    height: th.range(0.85, 1.3),
    phases: [th.range(0, 6.3), th.range(0, 6.3), th.range(0, 6.3)],
    rates: [th.range(9, 14), th.range(17, 25), th.range(4, 7)],
    variant: th.range(0, 6),
  }));
  const onBody = th.count(BODY_TONGUES);
  const upBody: Tongue[] = Array.from({ length: onBody }, (_unused, index) => ({
    angle: ((index + 0.5 + th.range(-0.3, 0.3)) / onBody) * Math.PI * 2,
    out: th.range(0.14, 0.24),
    rise: th.range(0.3, 0.85),
    width: th.range(0.18, 0.26),
    height: th.range(0.6, 0.95),
    phases: [th.range(0, 6.3), th.range(0, 6.3), th.range(0, 6.3)],
    rates: [th.range(10, 15), th.range(18, 26), th.range(4, 7)],
    variant: th.range(0, 6),
  }));
  const tongues = [...onFloor, ...upBody];
  // Blobs of flame breaking off the tips of the tongues and rising, cooling, some to smoke.
  for (let born = 0.15; born < duration; born += 1 / th.count(BLOBS_A_SECOND)) {
    const bornAt = born + th.range(0, 0.05);
    const fierce = fierceness(bornAt, duration);
    if (fierce < 0.2) continue;
    const tongue = tongues[Math.floor(th.range(0, tongues.length))];
    const { tip } = tongueAt(tongue, floor, bornAt, fierce, U);
    const smokes = th.chance(0.35);
    fire.push({
      mote: th.mote({
        x: tip.x,
        y: tip.y,
        z: tip.z - 0.1 * U,
        vx: th.range(-0.3, 0.3) * U,
        vy: th.range(-0.3, 0.3) * U,
        vz: th.range(1.2, 2) * U,
        bornAt,
        life: th.lifeOf(bornAt, smokes ? 0.8 : 0.35, smokes ? 1.3 : 0.6),
        gravity: -U,
        drag: 1.2,
        bounce: 0,
      }),
      size: th.range(0.18, 0.3) * (0.6 + 0.4 * fierce),
      burns: smokes ? th.range(0.45, 0.55) : 1,
      variant: th.range(0, 6),
      hottest: 3,
      taper: 0.5,
    });
  }
  // Smoke rolling off the top of the fire, dark over it, spreading out as it rises slowly, so it is
  // seen round the piece rather than only over its head.
  for (let born = 0.25; born < duration; born += 1 / th.count(4)) {
    const bornAt = born + th.range(0, 0.2);
    const fierce = fierceness(bornAt, duration);
    if (fierce < 0.15) continue;
    const drift = th.outward();
    clouds.push({
      mote: th.mote({
        x: floor.x + drift.cos * 0.2 * U,
        y: floor.y + drift.sin * 0.2 * U,
        z: footZ + th.range(0.9, 1.3) * U,
        vx: drift.cos * th.range(0.7, 1.2) * U,
        vy: drift.sin * th.range(0.7, 1.2) * U,
        vz: th.range(0.15, 0.3) * U,
        bornAt,
        life: th.lifeOf(bornAt, 1.6, 2.4),
        gravity: -0.15 * U,
        drag: 0.6,
        bounce: 0,
      }),
      size: th.range(0.6, 1) * (0.6 + 0.4 * fierce),
      color: SMOKE,
      alpha: 0.75,
    });
  }
  // Embers carried up out of the fire.
  for (let born = 0.1; born < duration; born += 1 / th.count(10)) {
    const bornAt = born + th.range(0, 0.1);
    if (fierceness(bornAt, duration) < 0.2) continue;
    const way = th.outward();
    embers.push(
      th.mote({
        x: floor.x + way.cos * th.range(0, 0.35) * U,
        y: floor.y + way.sin * th.range(0, 0.35) * U,
        z: footZ + th.range(0.3, 0.9) * U,
        vx: way.cos * th.range(0.2, 0.8) * U,
        vy: way.sin * th.range(0.2, 0.8) * U,
        vz: th.range(1.8, 3.4) * U,
        bornAt,
        life: th.lifeOf(bornAt, 0.8, 1.6),
        gravity: -th.range(0.3, 0.9) * U,
        drag: 1.4,
        bounce: 0,
      })
    );
  }
  // Sparks popping out of the fire now and then, a few at a time.
  for (let born = 0.2; born < duration - 0.3; born += th.range(0.18, 0.4)) {
    const at = {
      x: floor.x + th.range(-0.25, 0.25) * U,
      y: floor.y + th.range(-0.25, 0.25) * U,
      z: footZ + th.range(0.2, 0.7) * U,
    };
    for (let index = 0; index < 3; index++) {
      const way = th.outward();
      const fast = th.range(2, 4.5) * U;
      sparks.push(
        th.mote({
          ...at,
          vx: way.cos * fast * 0.6,
          vy: way.sin * fast * 0.6,
          vz: th.range(0.6, 1.2) * fast,
          bornAt: born,
          life: th.lifeOf(born, 0.25, 0.55),
          gravity: th.fall,
          drag: 1.6,
          bounce: 0.35,
        })
      );
    }
  }
  const coals = Array.from({ length: th.count(7) }, () => {
    const way = th.outward();
    const out = th.range(0.05, 0.45) * U;
    return { x: floor.x + way.cos * out, y: floor.y + way.sin * out, z: th.floorZ + 0.03 * U };
  });
  return { fire, clouds, sparks, embers, brands: [], bits: [], coals, tongues };
}
