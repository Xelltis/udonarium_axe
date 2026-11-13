/**
 * A particle thrown by an effect: where it starts, in table pixels (x to the east, y to the south and
 * z up), how fast it goes, in table pixels a second, when it is thrown and how long it lives, in
 * seconds from the effect's start, how hard it falls, how the air slows it, and how much of its speed
 * it keeps off the floor. Sparks fly out fast, are slowed and fall, and bounce; debris tumbles,
 * bounces and settles; smoke and embers rise, which is a fall the other way.
 */
export interface ThrownMote {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  readonly bornAt: number;
  readonly life: number;
  /** How fast it is pulled down, in table pixels a second squared; below nothing it rises. */
  readonly gravity: number;
  /** How much of its speed the air takes each second, as a rate: fast out, slow drift. */
  readonly drag: number;
  /** How much of its upward speed it keeps off the floor; nothing settles it where it lands. */
  readonly bounce: number;
  /** Where the floor is under it, in table pixels up. */
  readonly floorZ: number;
}

/** Where a thrown particle is at a moment, how fast it goes, how far through its life it is, and whether it lies still. */
export interface MoteState {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  /** How far through its life it is, from 0 as it is thrown to 1 as it is gone. */
  readonly age: number;
  readonly landed: boolean;
}

/** How long one step of the motion is, in seconds: fine enough that a fast spark bounces where it lands. */
export const MOTE_STEP_S = 1 / 120;
/** Below this upward speed a particle that meets the floor stays on it. */
const SETTLES_BELOW = 30;

interface Stepped {
  step: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  landed: boolean;
}

/** The last place each particle was stepped to, so a later moment carries on from it rather than from its throw. */
const lastStepped = new WeakMap<ThrownMote, Stepped>();

/**
 * Where a thrown particle is a while after the effect started, in seconds, or null before it is
 * thrown and once it is gone. It is stepped at a fixed rate from its throw, so it is at the same
 * place at the same moment however the frames fall, on every seat.
 */
export function moteAt(mote: ThrownMote, timeS: number): MoteState | null {
  const since = timeS - mote.bornAt;
  if (since < 0 || since >= mote.life) return null;
  const steps = Math.floor(since / MOTE_STEP_S);
  const kept = lastStepped.get(mote);
  const state =
    kept && kept.step <= steps
      ? kept
      : {
          step: 0,
          x: mote.x,
          y: mote.y,
          z: mote.z,
          vx: mote.vx,
          vy: mote.vy,
          vz: mote.vz,
          landed: false,
        };
  const keep = Math.exp(-mote.drag * MOTE_STEP_S);
  while (state.step < steps) {
    stepOnce(state, mote, keep);
    state.step++;
  }
  lastStepped.set(mote, state);
  const part = since - steps * MOTE_STEP_S;
  return {
    x: state.x + state.vx * part,
    y: state.y + state.vy * part,
    z: Math.max(mote.floorZ, state.z + state.vz * part),
    vx: state.vx,
    vy: state.vy,
    vz: state.vz,
    age: since / mote.life,
    landed: state.landed,
  };
}

function stepOnce(state: Stepped, mote: ThrownMote, keep: number): void {
  if (state.landed) {
    // Lying on the floor it slides to a stop.
    state.vx *= keep * keep;
    state.vy *= keep * keep;
    state.x += state.vx * MOTE_STEP_S;
    state.y += state.vy * MOTE_STEP_S;
    return;
  }
  state.vz -= mote.gravity * MOTE_STEP_S;
  state.vx *= keep;
  state.vy *= keep;
  state.vz *= keep;
  state.x += state.vx * MOTE_STEP_S;
  state.y += state.vy * MOTE_STEP_S;
  state.z += state.vz * MOTE_STEP_S;
  if (state.z > mote.floorZ || mote.gravity <= 0) return;
  state.z = mote.floorZ;
  const up = -state.vz * mote.bounce;
  if (up < SETTLES_BELOW) {
    state.vz = 0;
    state.landed = true;
    return;
  }
  state.vz = up;
  // The floor takes some of its way across as it strikes it.
  state.vx *= 0.7;
  state.vy *= 0.7;
}

/** A seeded run of numbers from 0 to 1, the same for the same seed on every seat. */
export function seededRun(seed: number): () => number {
  let state = Math.floor(seed) | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state ^ (state >>> 15);
    t = Math.imul(t, 1 | t);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
