import { outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { floorMark, glow, haze, type Point } from '@axe/domain/effect/scene/parts';
import { layBoldBand, layBoldFloorRing } from '@axe/domain/effect/scene/space/space-bold';
import { scatterOf, tippedCircle } from '@axe/domain/effect/scene/space/space-parts';
import { type SummonTones } from '@axe/domain/effect/scene/space/summon-circle';

/*
 * What rises out of a summoning's circle: rays welling up through its lines, the pillar they gather
 * into about the one it calls, a soft body of its deep colour with a gold heart and heavy streaks of it
 * running up its sides, rings running up it and motes winding up within it; and the arrival, as the
 * pillar flares, heavy rings race out over the floor and light is thrown up and out.
 */

/** How many lines of light the pillar is made of, and how wide it is against the circle. */
const PILLAR_LINES = 12;
const PILLAR_SHARE = 0.5;

/** Rays of light welling up through the lines of the circle, more and faster as it wakes. */
export function drawRisingRays(
  drawn: Staged,
  stage: Stage,
  floor: Point,
  reach: number,
  tones: SummonTones,
  amount: number,
  forward: number
): void {
  if (amount <= 0.01) return;
  const { cell } = stage;
  const t = stage.seconds;
  const rays = Math.round(14 + 30 * amount);
  for (let ray = 0; ray < rays; ray++) {
    const life = 0.35 + 0.35 * scatterOf(ray, 3);
    const age = (t / life + scatterOf(ray, 5)) % 1;
    const turn = scatterOf(ray, 7) * Math.PI * 2;
    const out = reach * (ray % 3 === 0 ? 0.7 : 0.86 + 0.1 * (scatterOf(ray, 9) - 0.5));
    const rise = cell * (0.8 + 1.6 * amount) * (0.6 + 0.6 * scatterOf(ray, 11));
    const at = {
      x: floor.x + Math.cos(turn) * out,
      y: floor.y + Math.sin(turn) * out,
      z: floor.z + rise * age,
    };
    const fade = Math.min(1, age * 6, (1 - age) * 2.5) * amount;
    const velocity = { x: 0, y: 0, z: rise / life };
    drawn.motes.push({
      ...at,
      size: cell * 0.2,
      color: tones.rim,
      alpha: 0.85 * fade,
      blend: 'color',
      shape: 'spark',
      velocity,
      trail: 0.12,
      forward,
    });
    drawn.motes.push({
      ...at,
      size: cell * 0.12,
      color: tones.body,
      alpha: fade,
      blend: 'color',
      shape: 'spark',
      velocity,
      trail: 0.12,
      forward: forward + 0.5,
    });
    drawn.motes.push({
      ...at,
      size: cell * 0.06,
      color: ray % 4 === 0 ? '#ffffff' : tones.gold,
      alpha: fade,
      blend: 'light',
      shape: 'spark',
      velocity,
      trail: 0.12,
      forward: forward + 1,
    });
  }
}

/**
 * The pillar about the one called, a soft body of its deep colour with a gold heart and streaks
 * running up its sides: growing up out of the circle as it wakes, flaring as what it calls arrives,
 * then rising away off the floor and thinning out.
 */
export function drawPillar(
  drawn: Staged,
  stage: Stage,
  floor: Point,
  reach: number,
  tones: SummonTones,
  welling: number,
  since: number,
  forward: number
): void {
  const { cell } = stage;
  const t = stage.seconds;
  const flare = since >= 0 ? Math.max(0, 1 - since / 0.45) : 0;
  const away = since >= 0 ? outCubic(within(since, 0.1, 1.1)) : 0;
  const shown = since >= 0 ? 1 - away : welling;
  if (shown <= 0.01) return;
  const radius = reach * PILLAR_SHARE * (1 + 0.15 * flare);
  const high = cell * (0.4 + 2.4 * welling + 1.6 * (since >= 0 ? Math.min(1, since / 0.2) : 0));
  const base = floor.z + cell * 4 * away;
  const top = base + high * (1 - 0.5 * away);
  drawn.ribbons.push({
    points: [0, 0.5, 1].map((share) => ({ x: floor.x, y: floor.y, z: base + (top - base) * share })),
    widths: [radius * 2.1, radius * 2, radius * 1.7],
    color: tones.body,
    core: mixColor(tones.gold, '#ffffff', flare),
    alpha: (0.5 + 0.3 * flare) * shown,
    alphas: [1, 0.75, 0],
    blend: 'color',
    soft: 0.7,
    torn: 0.2,
    flowed: -t * 3,
  });
  for (let line = 0; line < PILLAR_LINES; line++) {
    const turn = (line / PILLAR_LINES) * Math.PI * 2 + t * 0.6;
    const flicker = 0.75 + 0.25 * Math.sin(t * 19 + line * 2.7);
    const from = (top - base) * 0.3 * scatterOf(line, 11);
    const reachUp = top - (top - base) * 0.45 * scatterOf(line, 13);
    const points = [0, 0.5, 1].map((share) => ({
      x: floor.x + Math.cos(turn) * radius,
      y: floor.y + Math.sin(turn) * radius,
      z: base + from + (reachUp - base - from) * share,
    }));
    const about = points.map((point) => ({ x: floor.x, y: floor.y, z: point.z }));
    layBoldBand(
      drawn,
      points,
      {
        rim: tones.rim,
        body: tones.body,
        core: mixColor(tones.gold, '#ffffff', flare),
        glow: flare > 0.3 ? '#ffffff' : tones.gold,
        lit: 0.6 * shown * flicker * (1 + flare),
        wide: cell * (0.08 + 0.08 * flare),
        alpha: 0.8 * shown,
        alphas: [0.4, 1, 0],
        torn: 0.5,
        flowed: t * 4 + line,
      },
      about,
      0.45
    );
  }
  for (let ring = 0; ring < 3; ring++) {
    const rise = (t * 0.9 + ring / 3) % 1;
    const middle = { x: floor.x, y: floor.y, z: base + (top - base) * rise };
    const alpha = shown * (1 - rise) * Math.min(1, rise * 6);
    layBoldBand(
      drawn,
      tippedCircle(middle, radius * (1.08 - 0.25 * rise), 32, 0, 0),
      {
        rim: tones.rim,
        body: tones.body,
        core: tones.gold,
        glow: tones.gold,
        lit: 0.6 * alpha,
        wide: cell * 0.13,
        alpha,
      },
      middle,
      0.6
    );
  }
  const middle = { x: floor.x, y: floor.y, z: (base + top) / 2 };
  for (let step = -1; step <= 1; step++) {
    const at = { ...middle, z: middle.z + step * (top - base) * 0.3 };
    drawn.motes.push(haze(at, radius * 2.3, tones.body, 0.32 * shown, forward * 0.5));
    drawn.motes.push(glow(at, radius * 1.4, tones.gold, (0.2 + 0.5 * flare) * shown, forward * 0.5));
  }
  for (let mote = 0; mote < 26; mote++) {
    const climb = (t * (0.35 + 0.3 * scatterOf(mote, 17)) + scatterOf(mote, 19)) % 1;
    const turn = scatterOf(mote, 23) * Math.PI * 2 + climb * 5 + t;
    const out = radius * (0.25 + 0.65 * scatterOf(mote, 29));
    const at = {
      x: floor.x + Math.cos(turn) * out,
      y: floor.y + Math.sin(turn) * out,
      z: base + (top - base) * climb,
    };
    drawn.motes.push({
      ...glow(
        at,
        cell * 0.15,
        mote % 3 === 0 ? '#ffffff' : tones.gold,
        shown * Math.min(1, climb * 5, (1 - climb) * 3),
        forward
      ),
      shape: 'star',
      spin: mote + t * 3,
    });
  }
  if (flare > 0) {
    drawn.motes.push({
      ...glow({ ...floor, z: floor.z + cell * 0.2 }, cell * 0.5 * flare, '#ffffff', flare, forward + 2),
      velocity: { x: 0, y: 0, z: 1000 },
      shape: 'spark',
      trail: (high * 1.3) / 1000,
    });
  }
}

/**
 * The arrival over the circle: the floor lit white for an instant, a ring racing out over it from the
 * rim of the circle and a second slower after it.
 */
export function drawArrival(
  drawn: Staged,
  stage: Stage,
  middle: Point,
  reach: number,
  tones: SummonTones,
  since: number
): void {
  const { cell } = stage;
  if (since < 0.16) {
    const left = 1 - since / 0.16;
    drawn.floor.push(floorMark('disc', middle, reach * 1.6, 1, tones.gold, 0.45 * left, 'light', 0));
    drawn.floor.push(floorMark('disc', middle, reach * 0.9, 1, '#ffffff', 0.4 * left, 'light', 0));
  }
  if (since < 0.5) {
    drawn.lights.push({
      ...middle,
      z: middle.z + cell,
      color: '#ffffff',
      strength: 2.2 * (1 - since / 0.5),
      reachPx: reach * 2.2,
    });
  }
  for (const [delay, lasts, to, thick] of [
    [0, 0.7, 2.3, 0.32],
    [0.12, 1, 1.8, 0.2],
  ] as const) {
    const share = (since - delay) / lasts;
    if (share < 0 || share >= 1) continue;
    const left = 1 - share;
    const radius = reach * (0.95 + (to - 0.95) * outCubic(share));
    const width = (cell * thick * (0.35 + 0.65 * left)) / radius;
    layBoldFloorRing(
      drawn,
      middle,
      radius,
      width,
      { rim: tones.ink, body: tones.body, core: tones.gold },
      left,
      left,
      tones.gold
    );
  }
}

/** The light about the one called as it arrives: a glow about it, and light thrown up and out to fall slowly back. */
export function drawArrivingLight(
  drawn: Staged,
  stage: Stage,
  floor: Point,
  chest: Point,
  tones: SummonTones,
  since: number,
  forward: number
): void {
  const { cell } = stage;
  if (since < 0.5) drawn.motes.push(glow(chest, cell * 4.4, tones.gold, 0.6 * (1 - since / 0.5), forward));
  for (let glint = 0; glint < 34; glint++) {
    const born = scatterOf(glint, 31) * 0.08;
    const age = since - born;
    if (age < 0 || age >= 1.6) continue;
    const turn = scatterOf(glint, 37) * Math.PI * 2;
    const fast = cell * (1.5 + 3.5 * scatterOf(glint, 41));
    const up = cell * (2 + 4 * scatterOf(glint, 43));
    const slowed = (1 - Math.exp(-2.6 * age)) / 2.6;
    const at = {
      x: chest.x + Math.cos(turn) * fast * slowed,
      y: chest.y + Math.sin(turn) * fast * slowed,
      z: Math.max(floor.z + cell * 0.05, chest.z + up * slowed - cell * 0.9 * age * age),
    };
    drawn.motes.push({
      ...glow(
        at,
        cell * (0.18 - 0.06 * (age / 1.6)),
        glint % 3 === 0 ? '#ffffff' : tones.gold,
        1 - age / 1.6,
        forward + 1
      ),
      shape: 'star',
      spin: glint + age * 4,
    });
  }
}
