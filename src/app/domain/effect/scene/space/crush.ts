import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { moteAt, type ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { STONE } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  floorMark,
  glow,
  haze,
  keptFor,
  type Point,
  smokePuff,
  stageKey,
  throwerFor,
} from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';
import { drawLens, layDish, type Pebble, pebbleAt, pebblesOf } from '@axe/domain/effect/scene/space/crush-parts';
import {
  layFloorRing,
  layWound,
  scatterOf,
  type SpaceTones,
  spaceTonesOf,
  tippedCircle,
} from '@axe/domain/effect/scene/space/space-parts';
import { crushLetsGoAt, spaceBeatAt } from '@axe/domain/effect/space-looks';

/*
 * A crush. A lens of black opens over the target's head, a bright ring wound round it, and the air
 * bends in towards it: rings close on the piece and climb to it, rings close over the floor, and grit,
 * dust and pebbles streak in off the floor and up into it. Then it comes down: a white beat, the floor
 * struck flat, a ring thrown out over it and dust blown out low, the floor cracking and sinking into a
 * dish under the piece, which is pressed down hard and held, weight falling on it in streaks while
 * the cracks burn. The lens lets go and falls in on itself; the pebbles it held drop and bounce, and
 * the dust settles over the dish and its cracks.
 */

const LINGER_S = SCENE_LINGER_S.gravity ?? 1.5;
const DUST = '#7a6a5c';
/** How much colour the bodies of gravity are taken to at the least, as a deep colour and a pale one run through greys between them. */
const VIVID = 0.62;

interface CrushThrow {
  readonly pebbles: readonly Pebble[];
  readonly dropped: readonly ThrownMote[];
}
const crushByStage = new Map<string, CrushThrow>();

/** The air bending in on the piece: rings closing on it and climbing to the lens, and rings closing over the floor. */
function drawBending(
  drawn: Staged,
  floor: Point,
  lens: Point,
  tones: SpaceTones,
  cell: number,
  t: number,
  bent: number
): void {
  if (bent <= 0.01) return;
  for (let ring = 0; ring < 3; ring++) {
    const closing = (t * 1.25 + ring / 3) % 1;
    const middle = { x: floor.x, y: floor.y, z: floor.z + (lens.z - floor.z) * (0.15 + 0.85 * closing * closing) };
    const alpha = bent * Math.min(1, closing * 4) * (1 - closing);
    layWound(drawn, tippedCircle(middle, cell * (0.35 + 1.25 * (1 - closing)), 36, 0, 0), middle, {
      sheath: tones.deep,
      light: tones.glow,
      wide: cell * 0.06,
      alpha: 0.8 * alpha,
      lit: alpha,
      nearShare: 0.6,
    });
    const radius = cell * (0.3 + 2 * (1 - closing));
    layFloorRing(drawn, floor, radius, 0.07, tones, alpha);
  }
}

/** Grit and dust streaking in off the floor and up into the lens, faster as they close on it. */
function drawStreaking(
  drawn: Staged,
  stage: Stage,
  floor: Point,
  lens: Point,
  tones: SpaceTones,
  pull: number,
  forward: number
): void {
  if (pull <= 0.01) return;
  const { cell } = stage;
  const t = stage.seconds;
  for (let streak = 0; streak < 26; streak++) {
    const turn = scatterOf(streak, 3) * Math.PI * 2;
    const out = cell * (0.5 + 1.5 * scatterOf(streak, 5));
    const closing = (t * (1.1 + scatterOf(streak, 7)) + scatterOf(streak, 11)) % 1;
    const eased = closing * closing;
    const from = { x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: floor.z + cell * 0.03 };
    const at = {
      x: from.x + (lens.x - from.x) * eased,
      y: from.y + (lens.y - from.y) * eased,
      z: from.z + (lens.z - from.z) * eased,
    };
    const speed = cell * (2 + 10 * closing);
    const far = Math.hypot(lens.x - from.x, lens.y - from.y, lens.z - from.z) || 1;
    const velocity = {
      x: ((lens.x - from.x) / far) * speed,
      y: ((lens.y - from.y) / far) * speed,
      z: ((lens.z - from.z) / far) * speed,
    };
    const fade = Math.min(1, closing * 5, (1 - closing) * 6) * pull;
    const spark = { ...at, shape: 'spark' as const, velocity, trail: 0.06 };
    drawn.motes.push({
      ...spark,
      size: cell * 0.08,
      color: streak % 2 ? DUST : tones.deep,
      alpha: 0.85 * fade,
      blend: 'color',
      forward,
    });
    if (streak % 2 === 0) {
      drawn.motes.push({ ...spark, size: cell * 0.16, color: tones.glow, alpha: 0.5 * fade, blend: 'light', forward });
      drawn.motes.push({
        ...spark,
        size: cell * 0.035,
        color: tones.pale,
        alpha: fade,
        blend: 'color',
        forward: forward + 1,
      });
    }
  }
}

/** The beat as the lens comes down: the floor struck white for an instant and a ring and dust thrown out low over it. */
function drawStrike(
  drawn: Staged,
  stage: Stage,
  floor: Point,
  lens: Point,
  tones: SpaceTones,
  since: number,
  forward: number
): void {
  const { cell } = stage;
  if (since < 0.11) {
    const fell = since / 0.11;
    const middle = { x: floor.x, y: floor.y, z: lens.z - (lens.z - floor.z - cell * 0.04) * Math.sqrt(fell) };
    layWound(drawn, tippedCircle(middle, cell * (0.5 + 1.3 * fell), 40, 0, 0), middle, {
      sheath: tones.edge,
      light: tones.glow,
      heart: '#ffffff',
      wide: cell * (0.2 - 0.08 * fell),
      alpha: 1,
      lit: 1,
      nearShare: 0.8,
    });
  }
  if (since < 0.12) {
    const left = 1 - since / 0.12;
    drawn.floor.push(floorMark('disc', floor, cell * 2.6, 1, tones.glow, 0.3 * left, 'light', 0));
    drawn.motes.push(glow(lens, cell * 2.4, tones.glow, 0.8 * left, forward + 2));
    drawn.motes.push({ ...glow(lens, cell * 0.4, '#ffffff', left, forward + 3), shape: 'flare', trail: 10, spin: 0 });
    drawn.motes.push({
      ...glow(floor, cell * 0.5, '#ffffff', left, forward + 3),
      velocity: { x: 0, y: 0, z: -1000 },
      shape: 'spark',
      trail: (lens.z - floor.z) / 1000,
    });
    drawn.lights.push({
      ...floor,
      z: floor.z + cell * 0.3,
      color: tones.glow,
      strength: 1.6 * left,
      reachPx: cell * 3.2,
    });
  }
  const share = since / 0.5;
  if (share < 1) {
    const left = 1 - share;
    const radius = cell * (0.4 + 2.4 * outCubic(share));
    const width = (cell * (0.04 + 0.16 * left)) / radius;
    drawn.floor.push(floorMark('ring', floor, radius, width * 3, tones.glow, 0.6 * left, 'light', 0));
    drawn.floor.push(floorMark('ring', floor, radius, width * 2.2, tones.ink, 0.85 * left, 'color', 0));
    drawn.floor.push(floorMark('ring', floor, radius, width * 0.8, tones.pale, left, 'color', 0));
    for (let gust = 0; gust < 12; gust++) {
      const turn = (gust / 12) * Math.PI * 2 + stage.seed * 0.7;
      const root = {
        x: floor.x + Math.cos(turn) * radius * 0.85,
        y: floor.y + Math.sin(turn) * radius * 0.85,
        z: floor.z + cell * 0.04,
      };
      drawn.motes.push({
        ...root,
        size: cell * 0.3 * (0.5 + 0.5 * left),
        color: '#6f5d4c',
        core: '#b9a585',
        alpha: 0.8 * left,
        blend: 'color',
        shape: 'gust',
        velocity: { x: Math.cos(turn) * 100, y: Math.sin(turn) * 100, z: 8 },
        trail: (cell * 0.8 * (0.4 + left)) / 100,
        spin: since * 5 + gust,
        variant: gust,
        forward,
      });
    }
  }
}

/** Weight falling on the piece in streaks and in rings pressing down over it while it is held down. */
function drawWeight(
  drawn: Staged,
  stage: Stage,
  floor: Point,
  lens: Point,
  tones: SpaceTones,
  held: number,
  forward: number
): void {
  if (held <= 0.01) return;
  const { cell } = stage;
  const t = stage.seconds;
  for (let ring = 0; ring < 3; ring++) {
    const fall = (t * 2.2 + ring / 3) % 1;
    const middle = { x: floor.x, y: floor.y, z: lens.z - (lens.z - floor.z - cell * 0.05) * fall * fall };
    const alpha = held * Math.min(1, fall * 4) * (1 - fall * 0.6);
    layWound(drawn, tippedCircle(middle, cell * (0.4 + 0.75 * fall), 32, 0, 0), middle, {
      sheath: tones.deep,
      light: tones.glow,
      heart: tones.pale,
      wide: cell * (0.05 + 0.05 * fall),
      alpha: 0.85 * alpha,
      lit: alpha,
      nearShare: 0.55,
    });
  }
  for (let streak = 0; streak < 18; streak++) {
    const fall = (t * (2.4 + scatterOf(streak, 13)) + scatterOf(streak, 17)) % 1;
    const turn = scatterOf(streak, 19) * Math.PI * 2;
    const out = cell * (0.15 + 0.75 * scatterOf(streak, 23));
    const at = {
      x: floor.x + Math.cos(turn) * out,
      y: floor.y + Math.sin(turn) * out,
      z: lens.z - (lens.z - floor.z) * fall,
    };
    const velocity = { x: 0, y: 0, z: -cell * 9 };
    const fade = Math.min(1, fall * 5, (1 - fall) * 5) * held;
    const spark = { ...at, shape: 'spark' as const, velocity, trail: 0.06 };
    drawn.motes.push({ ...spark, size: cell * 0.18, color: tones.glow, alpha: 0.45 * fade, blend: 'light', forward });
    drawn.motes.push({ ...spark, size: cell * 0.09, color: tones.deep, alpha: 0.8 * fade, blend: 'color', forward });
    drawn.motes.push({
      ...spark,
      size: cell * 0.04,
      color: tones.pale,
      alpha: fade,
      blend: 'color',
      forward: forward + 1,
    });
  }
}

/** A crush: see the header. */
export function drawCrush(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration, tall } = stage;
  const t = stage.seconds;
  const ends = duration + LINGER_S;
  if (t >= ends) return drawn;
  const strikes = stage.blowsAt[0] ?? spaceBeatAt('crush', duration);
  const letsGo = Math.max(strikes + 0.2, crushLetsGoAt(duration));
  const since = t - strikes;
  const tones = spaceTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7), VIVID);
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const lens = { x: stage.x, y: stage.y, z: stage.z + tall + cell * 0.8 };
  const forward = cell * 0.5;
  const thrown = keptFor(crushByStage, stageKey(stage, ends), () => {
    const pebbles = pebblesOf(stage.seed, 9, cell);
    const th = throwerFor(stage, ends);
    const dropped = pebbles.map((pebble) => {
      const at = pebbleAt(pebble, floor, lens, letsGo, strikes, cell);
      return th.mote({
        ...at,
        vx: th.range(-0.6, 0.6) * cell,
        vy: th.range(-0.6, 0.6) * cell,
        vz: th.range(0, 0.8) * cell,
        bornAt: letsGo,
        life: th.lifeOf(letsGo, 1.6, 2.4),
        gravity: th.fall,
        drag: 0.3,
        bounce: 0.3,
      });
    });
    return { pebbles, dropped };
  });
  const opened = outCubic(within(t, 0.02, strikes * 0.7));
  const freed = within(t, letsGo, letsGo + 0.14);
  const lensOf =
    since < 0 ? opened * (1 - 0.2 * within(t, strikes * 0.6, strikes)) : (1 - freed) * (1 + 0.08 * Math.sin(t * 22));
  drawLens(
    drawn,
    lens,
    cell * 0.36 * lensOf,
    tones,
    since >= 0 ? Math.max(0, 1 - since / 0.2) : within(t, strikes * 0.6, strikes),
    t,
    stage.seed,
    forward
  );
  if (t < letsGo) {
    for (const pebble of thrown.pebbles) {
      const at = pebbleAt(pebble, floor, lens, t, strikes, cell);
      drawn.motes.push({
        ...at,
        size: cell * pebble.size,
        color: STONE,
        alpha: Math.min(1, t * 8),
        blend: 'color',
        shape: 'chunk',
        spin: t * pebble.spin,
        variant: pebble.variant,
        forward,
      });
    }
  } else {
    for (const [index, mote] of thrown.dropped.entries()) {
      const at = moteAt(mote, t);
      if (!at) continue;
      drawn.motes.push({
        ...at,
        size: cell * thrown.pebbles[index].size,
        color: STONE,
        alpha: Math.min(1, (1 - at.age) * 3),
        blend: 'color',
        shape: 'chunk',
        spin: at.landed ? index : t * thrown.pebbles[index].spin,
        variant: thrown.pebbles[index].variant,
        forward,
      });
    }
  }
  if (since < 0) {
    drawn.floor.push(floorMark('disc', floor, cell * 2, 1, tones.ink, 0.4 * opened, 'color', 0));
    drawn.motes.push(haze(lens, cell * 2.2, '#000000', 0.18 * opened, forward * 0.5));
    drawBending(drawn, floor, lens, tones, cell, t, opened);
    drawStreaking(drawn, stage, floor, lens, tones, opened, forward);
    drawn.lights.push({ ...lens, color: tones.glow, strength: 0.4 + 0.8 * opened, reachPx: cell * 2.4 });
    return drawn;
  }
  const held = 1 - within(t, letsGo - 0.05, letsGo + 0.1);
  layDish(drawn, floor, cell, tones, since, ends - strikes, held, stage.seed);
  drawStrike(drawn, stage, floor, lens, tones, since, forward);
  drawWeight(drawn, stage, floor, lens, tones, held, forward);
  if (t >= letsGo && t < letsGo + 0.3) {
    const left = 1 - (t - letsGo) / 0.3;
    drawn.motes.push({ ...glow(lens, cell * 0.9 * left, '#ffffff', left, forward + 3), shape: 'star', spin: 0.4 });
    drawn.motes.push(glow(lens, cell * 1.6, tones.glow, 0.5 * left, forward + 2));
  }
  for (let puff = 0; puff < 8; puff++) {
    const age = (since - 0.1 - puff * 0.05) / 2;
    if (age < 0 || age >= 1) continue;
    const turn = puff * 0.79 + stage.seed;
    const out = cell * (1 + 1.2 * outCubic(age));
    drawn.motes.push(
      smokePuff(
        {
          x: floor.x + Math.cos(turn) * out,
          y: floor.y + Math.sin(turn) * out,
          z: floor.z + cell * (0.12 + 0.3 * age),
        },
        cell * (0.5 + 0.6 * age),
        '#8a7b6b',
        0.55 * Math.min(1, age * 8) * (1 - age),
        forward
      )
    );
  }
  if (held > 0.01) drawn.lights.push({ ...lens, color: tones.glow, strength: 0.9 * held, reachPx: cell * 2.6 });
  return drawn;
}
