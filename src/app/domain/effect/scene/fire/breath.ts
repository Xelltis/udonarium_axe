import { type EffectMote as WayMote, effectMoteOf } from '@axe/domain/effect/effect-motes';
import {
  type Choreography,
  nothingStaged,
  type Stage,
  type Staged,
  within,
} from '@axe/domain/effect/scene/choreography';
import { isFiery, mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { moteAt, type ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import {
  type Cloud,
  drawFireThrow,
  type FireBall,
  type FireThrow,
  layScorch,
  SMOKE,
  WARM,
} from '@axe/domain/effect/scene/fire/fire-parts';
import {
  floorMark,
  glow,
  keptFor,
  lerpPoint,
  type Point,
  smokePuff,
  stageKey,
  type Thrower,
  throwerFor,
} from '@axe/domain/effect/scene/parts';
import { lightningRibbons } from '@axe/domain/effect/scene/shot/streams';

/*
 * A breath of fire: it bursts out of the caster's mouth in a pulsing stream of flame, white-hot at the
 * mouth, widening, cooling and rolling as it goes; where it strikes the target it splashes, licks out
 * along the floor round it and burns there, and smoke rises off it. When the breath fails the stream
 * breaks off at the mouth, the last of it runs on to the target, and smoke and embers are left as the
 * fire on the floor dies. What it carries along the way is as its kind of particle says: embers for
 * fire, crystals of ice, a current crackling along it, leaves, or wisps of shadow.
 */

/** How long it lingers after its playback while its smoke clears, in seconds. */
const LINGER_S = 1.5;
/** How long the stream takes to reach the target, in seconds. */
const REACHES_S = 0.32;
/** The share of its playback after which the breath fails. */
const FAILS_AT = 0.78;
/** How many balls of flame it breathes out a second at the middle grade. */
const BREATHED_A_SECOND = 40;

const thrownByStage = new Map<string, FireThrow>();

export const breath: Choreography = { lingerS: LINGER_S, draw: drawBreath };

function drawBreath(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const ends = duration + LINGER_S;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const struck = { x: stage.x, y: stage.y, z: stage.z + cell * 0.4 };
  const mouth = stage.origin ?? { x: stage.x - cell * 3, y: stage.y + cell * 2, z: stage.z + cell * 0.8 };
  const fails = duration * FAILS_AT;
  const forward = cell * 0.4;
  const thrown = keptFor(thrownByStage, `${stageKey(stage, ends)}|${mouth.x}|${mouth.y}|${mouth.z}`, () =>
    throwBreath(throwerFor(stage, ends), mouth, struck, floor, fails, isFiery(stage.preset.colorSecondary), ramp)
  );
  const breathing = Math.min(within(t, 0, 0.08), 1 - within(t, fails - 0.1, fails));
  const burning = Math.min(
    within(t, REACHES_S, REACHES_S + 0.2),
    1 - within(t, fails + REACHES_S, fails + REACHES_S + 0.8)
  );
  const flicker = 0.85 + 0.15 * Math.sin(t * 29 + stage.seed);

  // The floor round the target: lit warm and blackening while the fire licks over it.
  const clearing = 1 - within(t, ends - 0.6, ends);
  if (t > REACHES_S)
    layScorch(
      drawn,
      floor,
      cell * 0.8 * Math.min(1, (t - REACHES_S) / 0.6 + 0.3),
      ramp,
      t - REACHES_S,
      fails,
      clearing,
      (stage.seed % 89) + 1
    );
  if (burning > 0) drawn.floor.push(floorMark('disc', floor, cell * 1.6, 1, WARM, 0.3 * burning * flicker, 'light', 0));

  const carried = effectMoteOf(stage.preset);
  drawFireThrow(drawn, carried === 'spark' ? thrown : { ...thrown, embers: [] }, t, cell, ramp, forward);
  if (carried !== 'spark' && carried !== 'none') {
    drawCarried(drawn, carried, thrown.embers, t, cell, ramp, forward);
  }
  if (carried === 'arc' && breathing > 0) drawCrackling(drawn, stage, mouth, struck, t, ramp, breathing);

  // The mouth glows while it breathes.
  if (breathing > 0) {
    drawn.motes.push(glow(mouth, cell * 0.7, ramp[5], 0.6 * breathing * flicker, cell * 0.3));
    drawn.motes.push(glow(mouth, cell * 0.3, '#ffffff', 0.7 * breathing, cell * 0.3));
  }
  const light = Math.max(burning, breathing * 0.6);
  if (light > 0.02) {
    drawn.lights.push({
      ...(burning > 0.1 ? struck : mouth),
      color: mixColor(ramp[4], WARM, 0.5),
      strength: 1.1 * light * flicker,
      reachPx: cell * 2.6,
    });
  }
  return drawn;
}

/** What a breath carries along its way, at a moment, where its embers would be, as its kind of particle says. */
function drawCarried(
  drawn: Staged,
  carried: WayMote,
  carriers: readonly ThrownMote[],
  t: number,
  cell: number,
  ramp: readonly string[],
  forward: number
): void {
  for (const [index, carrier] of carriers.entries()) {
    const at = moteAt(carrier, t);
    if (!at) continue;
    const left = 1 - at.age;
    const turn = (t - carrier.bornAt) * (4 + (index % 5)) + index;
    if (carried === 'frost') {
      drawn.motes.push({
        ...glow(at, cell * 0.11, index % 3 === 0 ? '#ffffff' : ramp[4], left, forward),
        shape: 'flake',
        spin: turn,
      });
    } else if (carried === 'leaf') {
      drawn.motes.push({
        ...glow(at, cell * 0.12, mixColor(index % 2 === 0 ? '#7a8f3a' : '#9aa84a', ramp[2], 0.25), left, forward),
        blend: 'color',
        shape: 'chunk',
        spin: turn * 1.5,
        variant: index,
      });
    } else if (carried === 'haze') {
      drawn.motes.push(
        smokePuff(at, cell * (0.25 + at.age * 0.35), mixColor('#1a1020', ramp[1], 0.35), 0.55 * left, forward)
      );
    } else {
      drawn.motes.push({ ...glow(at, cell * 0.06, '#ffffff', left, forward), shape: 'spark', trail: 0.04 });
    }
  }
}

/** Small bolts leaping along the stream between points of it, taking another shape every few hundredths of a second. */
function drawCrackling(
  drawn: Staged,
  stage: Stage,
  mouth: Point,
  struck: Point,
  t: number,
  ramp: readonly string[],
  breathing: number
): void {
  const flicker = Math.floor(t / 0.05);
  for (let bolt = 0; bolt < 3; bolt++) {
    const from = ((flicker * 0.37 + bolt * 0.31) % 0.8) + 0.05;
    const to = Math.min(1, from + 0.2);
    drawn.ribbons.push(
      ...lightningRibbons(
        lerpPoint(mouth, struck, from),
        lerpPoint(mouth, struck, to),
        stage.seed + bolt,
        flicker,
        stage.cell,
        ramp,
        0.8 * breathing,
        stage.groundZ,
        0.3
      )
    );
  }
}

/** Throws the breath from its first burst to its failing: the stream from the mouth, the fire licking over the floor at the target, and its smoke. */
function throwBreath(
  th: Thrower,
  mouth: Point,
  struck: Point,
  floor: Point,
  fails: number,
  fiery: boolean,
  ramp: readonly string[]
): FireThrow {
  const U = th.cell;
  const fire: FireBall[] = [];
  const clouds: Cloud[] = [];
  const embers: ThrownMote[] = [];
  const sparks: ThrownMote[] = [];
  const toward = { x: struck.x - mouth.x, y: struck.y - mouth.y, z: struck.z - mouth.z };
  const length = Math.max(1, Math.hypot(toward.x, toward.y, toward.z));
  const way = { x: toward.x / length, y: toward.y / length, z: toward.z / length };
  // Two ways across the stream, for it to spread in.
  const side = normalised({ x: -way.y, y: way.x, z: 0 });
  const lift = normalised(cross(way, side));
  const drag = 6;
  // Fast enough out of the mouth to reach the target in its time, slowed by the air after.
  const speed = (length * drag) / (1 - Math.exp(-drag * REACHES_S));
  const rate = th.count(BREATHED_A_SECOND);
  for (let born = 0; born < fails; born += 1 / rate) {
    const bornAt = born + th.range(0, 0.4 / rate);
    // It pulses: breathed out in surges, never evenly.
    const surge = 1 + 0.18 * Math.sin(bornAt * 14);
    const spread = th.range(-0.3, 0.3);
    const rise = th.range(-0.15, 0.25);
    const fast = speed * th.range(0.92, 1.08);
    // A breath of anything but fire leaves no smoke.
    const smokes = fiery && th.chance(0.35);
    fire.push({
      mote: th.mote({
        x: mouth.x,
        y: mouth.y,
        z: mouth.z,
        vx: (way.x + side.x * spread + lift.x * rise) * fast,
        vy: (way.y + side.y * spread + lift.y * rise) * fast,
        vz: (way.z + side.z * spread + lift.z * rise) * fast,
        bornAt,
        life: th.lifeOf(bornAt, smokes ? 0.9 : 0.5, smokes ? 1.3 : 0.75),
        gravity: -th.range(0.5, 1.5) * U,
        drag,
        bounce: 0,
      }),
      size: th.range(0.32, 0.5) * surge,
      burns: smokes ? th.range(0.5, 0.62) : 1,
      variant: th.range(0, 6),
      // Narrow at the mouth and widening as it goes: a ball grows as it flies rather than shrinking.
      taper: -1,
      streak: 0.05,
      soft: !fiery,
    });
  }
  // The fire licking out over the floor round the target while the stream strikes it.
  for (let born = REACHES_S; born < fails + REACHES_S; born += 1 / th.count(18)) {
    const bornAt = born + th.range(0, 0.04);
    const out = th.outward();
    const fast = th.range(1.2, 2.8) * U;
    const smokes = fiery && th.chance(0.4);
    fire.push({
      mote: th.mote({
        x: floor.x + out.cos * th.range(0, 0.3) * U,
        y: floor.y + out.sin * th.range(0, 0.3) * U,
        z: floor.z + 0.15 * U,
        vx: out.cos * fast,
        vy: out.sin * fast,
        vz: th.range(0.2, 0.7) * U,
        bornAt,
        life: th.lifeOf(bornAt, smokes ? 0.8 : 0.4, smokes ? 1.2 : 0.7),
        gravity: -th.range(0.6, 1.4) * U,
        drag: 2.4,
        bounce: 0,
      }),
      size: th.range(0.3, 0.5),
      burns: smokes ? th.range(0.45, 0.6) : 1,
      variant: th.range(0, 6),
      hottest: 4,
      soft: !fiery,
    });
  }
  // Smoke rising off the fire at the target.
  for (let born = REACHES_S + 0.2; born < fails + REACHES_S + 0.4; born += 1 / th.count(4)) {
    const drift = th.outward();
    clouds.push({
      mote: th.mote({
        x: floor.x + th.range(-0.3, 0.3) * U,
        y: floor.y + th.range(-0.3, 0.3) * U,
        z: floor.z + th.range(0.6, 0.9) * U,
        vx: drift.cos * th.range(0.2, 0.6) * U,
        vy: drift.sin * th.range(0.2, 0.6) * U,
        vz: th.range(0.5, 0.9) * U,
        bornAt: born,
        life: th.lifeOf(born, 1.4, 2.2),
        gravity: -0.2 * U,
        drag: 0.8,
        bounce: 0,
      }),
      size: th.range(0.6, 0.95),
      color: fiery ? SMOKE : mixColor(ramp[4], '#ffffff', 0.4),
      alpha: fiery ? 0.6 : 0.35,
    });
  }
  // Embers carried along the stream, slowed by the air as the stream is so as to come down about the
  // target rather than far past it, and up off the fire.
  for (let born = 0.1; born < fails + REACHES_S; born += 1 / th.count(14)) {
    const atTarget = born > REACHES_S && th.chance(0.5);
    const from = atTarget ? { ...floor, z: floor.z + 0.4 * U } : mouth;
    const out = th.outward();
    const fast = atTarget ? th.range(0.3, 1) * U : speed * th.range(0.75, 1.05);
    embers.push(
      th.mote({
        ...from,
        vx: atTarget ? out.cos * fast : way.x * fast + out.cos * U,
        vy: atTarget ? out.sin * fast : way.y * fast + out.sin * U,
        vz: atTarget ? th.range(1.5, 3) * U : way.z * fast + th.range(0.5, 1.5) * U,
        bornAt: born,
        life: th.lifeOf(born, 0.7, 1.4),
        gravity: -th.range(0.3, 0.8) * U,
        drag: atTarget ? 1.8 : drag,
        bounce: 0,
      })
    );
  }
  // Sparks thrown off where the stream strikes.
  for (let born = REACHES_S; born < fails + REACHES_S - 0.1; born += th.range(0.06, 0.14)) {
    const out = th.outward();
    const fast = th.range(3, 7) * U;
    sparks.push(
      th.mote({
        ...struck,
        vx: out.cos * fast,
        vy: out.sin * fast,
        vz: th.range(0.3, 1) * fast,
        bornAt: born,
        life: th.lifeOf(born, 0.2, 0.5),
        gravity: th.fall,
        drag: 2,
        bounce: 0.35,
      })
    );
  }
  return { fire, clouds, sparks, embers, brands: [], bits: [] };
}

function cross(a: Point, b: Point): Point {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function normalised(v: Point): Point {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}
