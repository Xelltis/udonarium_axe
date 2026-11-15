import {
  afflictedOf,
  bodyVeil,
  byHead,
  countOf,
  fallingDrop,
  fallTimeOf,
  INK,
  litSign,
  onBody,
  popIn,
  roundOf,
  scatter,
  shaded,
  SIGN_RIGHT,
  SIGN_SIZE,
  SIGN_UP,
  takeHold,
} from '@axe/domain/effect/scene/ailment/ailment-parts';
import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import { nothingStaged, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { ball, floorMark, glow, type Point } from '@axe/domain/effect/scene/parts';

/*
 * The states that work on the blood: a poison, bubbles of it welling out of the piece and bursting,
 * murky drops running off it to hiss on a stain spreading under it, a skull hung at its shoulder and
 * a ring of its colour beating out over the floor; and a bleeding, three wounds that bead and drip
 * into a pool at the feet and spurt at every heartbeat, a drop of blood hung at the shoulder.
 */

/** How long a drop of poison swells on the body before it falls, as a share of its round. */
const DROP_SWELLS = 0.35;
/** How long a bubble lasts before it bursts, as a share of its round. */
const BUBBLE_BURSTS_AT = 0.8;

/** A poison: see the header. */
export function drawPoison(stage: Stage): Staged {
  const drawn = nothingStaged();
  const a = afflictedOf(stage, 'poison');
  if (a.shown <= 0) return drawn;
  const { cell, t } = a;
  const venom = a.light;
  const murk = mixColor(a.dark, INK, 0.2);
  const salt = stage.seed % 97;
  const spread = within(t, 0.1, Math.max(0.6, a.duration * 0.7));
  drawn.floor.push(floorMark('disc', a.floor, cell * (0.75 + 0.55 * spread), 1, murk, 0.75 * a.shown, 'color', 0));
  drawn.floor.push(
    floorMark('disc', a.floor, cell * (0.45 + 0.4 * spread), 1, mixColor(a.dark, venom, 0.3), 0.6 * a.shown, 'color', 0)
  );
  drawn.floor.push(floorMark('disc', a.floor, cell * (0.5 + 0.4 * spread), 1, venom, 0.25 * a.shown, 'light', 0));
  if (a.since >= 0) {
    drawn.floor.push(
      floorMark('ring', a.floor, cell * (0.4 + 0.9 * a.phase), 0.1, venom, 0.85 * (1 - a.phase) * a.shown, 'light', 0)
    );
  }
  bodyVeil(drawn, a, mixColor(venom, a.dark, 0.45), 0.24 + 0.3 * a.pulse);

  for (let index = 0; index < countOf(a, 5); index++) {
    const period = 0.95 + 0.4 * scatter(index, salt);
    const { life, round } = roundOf(t, period, scatter(index, salt + 3));
    const from = onBody(a, scatter(index + round * 5, salt + 1) * Math.PI * 2, 0.35 + 0.45 * scatter(index, 7), 0.32);
    if (life < DROP_SWELLS) {
      const size = cell * 0.16 * (life / DROP_SWELLS);
      drawn.motes.push(ball(from, size, murk, 0.95 * a.shown, a.over, index));
      drawn.motes.push(ball({ ...from, z: from.z + size * 0.15 }, size * 0.6, venom, 0.9 * a.shown, a.over + 1, index));
      continue;
    }
    const age = (life - DROP_SWELLS) * period;
    const drop = fallingDrop(from, age, a.floor.z, cell, cell * 0.13, venom, 0.95 * a.shown, a.over);
    if (drop) {
      drawn.motes.push({ ...drop, size: cell * 0.18, color: murk });
      drawn.motes.push({ ...drop, forward: a.over + 1 });
      continue;
    }
    const hiss = 1 - (age - fallTimeOf(from.z - a.floor.z, cell)) / 0.35;
    if (hiss <= 0) continue;
    const spot = { x: from.x, y: from.y, z: a.floor.z };
    drawn.floor.push(
      floorMark('disc', spot, cell * (0.16 + 0.22 * (1 - hiss)), 1, venom, 0.9 * hiss * a.shown, 'light', 0)
    );
    drawn.motes.push(
      flowingMote('wisp', spot, { x: 0, y: 0, z: 1 }, cell * 0.18, cell * (0.2 + 0.4 * (1 - hiss)), t * 2 + index, {
        color: mixColor(venom, '#ffffff', 0.3),
        alpha: 0.6 * hiss * a.shown,
        forward: cell * 0.1,
        variant: index,
      })
    );
  }

  for (let index = 0; index < countOf(a, 10); index++) {
    const period = 0.9 + 0.6 * scatter(index, salt + 11);
    const { life, round } = roundOf(t, period, scatter(index, salt + 13));
    const turn = scatter(index + round * 3, salt + 17) * Math.PI * 2;
    const from = onBody(a, turn, 0.12 + 0.8 * scatter(index + round, salt + 19), 0.32);
    const at = {
      x: from.x + Math.sin(t * 5 + index) * cell * 0.03,
      y: from.y + Math.cos(t * 4 + index * 2) * cell * 0.03,
      z: from.z + life * cell * 0.5,
    };
    const full = cell * (0.17 + 0.17 * scatter(index, salt + 23));
    if (life < BUBBLE_BURSTS_AT) {
      const size = full * (0.35 + 0.65 * Math.min(1, life * 3));
      drawn.motes.push(glow(at, size * 1.3, venom, 0.3 * a.shown, a.over));
      drawn.motes.push({
        ...ball(at, size, index % 3 === 0 ? mixColor(venom, a.dark, 0.5) : venom, 0.95 * a.shown, a.over + 1, 0),
        shape: 'bubble',
      });
      continue;
    }
    const burst = (life - BUBBLE_BURSTS_AT) / (1 - BUBBLE_BURSTS_AT);
    drawn.motes.push({
      ...glow(at, full * (1.6 + burst), venom, (1 - burst) * a.shown, a.over),
      shape: 'star',
      spin: index,
    });
    for (let fleck = 0; fleck < 3; fleck++) {
      const way = turn + fleck * 2.1;
      const out = full * (0.6 + 1.4 * burst);
      const flown = {
        x: at.x + Math.cos(way) * out,
        y: at.y + Math.sin(way) * out,
        z: at.z + full * (0.6 - burst) * burst * 2,
      };
      drawn.motes.push(ball(flown, full * 0.25, venom, (1 - burst) * a.shown, a.over + 1, fleck));
    }
  }

  const hung = byHead(a, SIGN_RIGHT, SIGN_UP + Math.sin(t * 2.6) * 0.03);
  litSign(
    drawn,
    'skull',
    hung.at,
    cell * SIGN_SIZE * popIn(a.since) * (1 + 0.12 * a.pulse),
    mixColor(venom, '#ffffff', 0.45),
    venom,
    a.shown,
    cell * 0.6,
    { core: a.dark, aside: hung.aside }
  );
  takeHold(drawn, a, venom, 0.8, 0.8);
  drawn.lights.push({
    ...onBody(a, 0, 0.5, 0),
    color: venom,
    strength: (0.3 + 0.45 * a.pulse) * a.shown,
    reachPx: cell * 1.8,
  });
  return drawn;
}

/** How long after the first thump of a heartbeat its second comes, as a share of the beat. */
const SECOND_THUMP_AT = 0.26;
/** How long a spurt of blood flies, in seconds. */
const SPURT_S = 0.36;
/** How long a bead of blood swells at a wound before it drops, as a share of its round. */
const BEAD_SWELLS = 0.4;
/** How hard blood falls, in cells a second squared. */
const BLOOD_FALL = 11;

/** A bleeding: see the header. */
export function drawBleed(stage: Stage): Staged {
  const drawn = nothingStaged();
  const a = afflictedOf(stage, 'bleed');
  if (a.shown <= 0) return drawn;
  const { cell, t } = a;
  const blood = mixColor(a.dark, a.light, 0.35);
  const bright = a.light;
  const clot = shaded(a.dark, 0.35);
  const salt = stage.seed % 89;
  const second = a.phase >= SECOND_THUMP_AT ? 0.7 * Math.exp(-(a.phase - SECOND_THUMP_AT) * 7) : 0;
  const thump = Math.max(a.pulse, a.since >= 0 ? second : 0);
  const grown = within(t, 0.15, Math.max(0.8, a.duration * 0.85));
  drawn.floor.push(floorMark('disc', a.floor, cell * (0.5 + 0.7 * grown), 1, clot, 0.9 * a.shown, 'color', 0));
  drawn.floor.push(floorMark('disc', a.floor, cell * (0.35 + 0.55 * grown), 1, blood, 0.9 * a.shown, 'color', 0));
  drawn.floor.push(floorMark('disc', a.floor, cell * (0.15 + 0.25 * grown), 1, bright, 0.3 * a.shown, 'light', 0));
  bodyVeil(drawn, a, blood, 0.2 + 0.32 * thump);

  const open = Math.min(1, Math.max(0, a.since + 0.05) * 12);
  for (const [index, share] of [0.72, 0.5, 0.3].entries()) {
    if (open <= 0) continue;
    const turn = scatter(index, salt) * Math.PI * 2;
    const wound = onBody(a, turn, share, 0.26);
    drawn.motes.push(ball(wound, cell * 0.2 * open, clot, 0.95 * a.shown, a.over, index));
    drawn.motes.push(ball(wound, cell * 0.13 * open, bright, 0.95 * a.shown, a.over + 1, index + 3));
    const run = cell * 0.3 * Math.min(1, a.since * 2 + 0.2);
    drawn.motes.push({
      ...ball({ ...wound, z: wound.z - run }, cell * 0.1, blood, 0.9 * a.shown, a.over, index),
      shape: 'comet',
      velocity: { x: 0, y: 0, z: -cell },
      trail: run / cell,
    });
    const period = 0.55 + 0.13 * index;
    const { life } = roundOf(Math.max(0, a.since), period, index * 0.37);
    const lip = { ...wound, z: wound.z - cell * 0.3 };
    const age = (life - BEAD_SWELLS) * period;
    const drop =
      age >= 0
        ? fallingDrop(lip, age, a.floor.z, cell, cell * 0.13, bright, 0.95 * a.shown, a.over + 1, BLOOD_FALL)
        : null;
    if (age < 0) {
      drawn.motes.push(ball(lip, cell * 0.13 * (life / BEAD_SWELLS), bright, 0.95 * a.shown, a.over + 1, index));
    } else if (drop) {
      drawn.motes.push(drop);
    } else {
      const ringed = 1 - (age - fallTimeOf(lip.z - a.floor.z, cell, BLOOD_FALL)) / 0.22;
      const spot = { x: lip.x, y: lip.y, z: a.floor.z };
      if (ringed > 0) {
        drawn.floor.push(
          floorMark('ring', spot, cell * (0.1 + 0.24 * (1 - ringed)), 0.3, bright, ringed * a.shown, 'color', 0)
        );
      }
    }
    for (const [which, startsAt] of [0, SECOND_THUMP_AT].entries()) {
      const flown = (a.phase - startsAt) * a.every;
      if (a.since < 0 || flown < 0 || flown > SPURT_S) continue;
      for (let fleck = 0; fleck < 4 - which; fleck++) {
        const way = turn + (scatter(fleck + a.beat * 3, index + which * 5) - 0.5) * 1.4;
        const fast = cell * (1.1 + 1.3 * scatter(fleck, index + a.beat)) * (which ? 0.7 : 1);
        const up = cell * (0.8 + 1.2 * scatter(fleck + 7, index + a.beat));
        const at: Point = {
          x: wound.x + Math.cos(way) * fast * flown,
          y: wound.y + Math.sin(way) * fast * flown,
          z: Math.max(a.floor.z, wound.z + up * flown - 4.5 * cell * flown * flown),
        };
        drawn.motes.push({
          ...ball(at, cell * 0.11, bright, (1 - flown / SPURT_S) * a.shown, a.over + 1, fleck),
          shape: 'comet',
          velocity: { x: Math.cos(way) * fast, y: Math.sin(way) * fast, z: up - 9 * cell * flown },
          trail: 0.035,
        });
      }
    }
  }

  if (a.since >= -0.06 && a.since < 0.2) {
    const left = 1 - (a.since + 0.06) / 0.26;
    const chest = onBody(a, 0, 0.55, 0);
    for (const turn of [0.7, -0.5]) {
      drawn.motes.push({
        ...glow(chest, cell * 0.2 * left, bright, left * a.shown, cell * 0.6),
        shape: 'flare',
        trail: 6,
        spin: turn,
      });
      drawn.motes.push({
        ...glow(chest, cell * 0.09 * left, '#ffffff', left * a.shown, cell * 0.6 + 1),
        shape: 'flare',
        trail: 8,
        spin: turn,
      });
    }
  }

  const swollen = popIn(a.since) * (1 + 0.16 * thump);
  if (swollen > 0) {
    const size = cell * SIGN_SIZE * 0.62 * swollen;
    const hung = byHead(a, SIGN_RIGHT, SIGN_UP - 0.25 + Math.sin(t * 2.2) * 0.02);
    const near = cell * 0.6;
    const drop = (wide: number, color: string, forward: number, lift: number) => ({
      ...ball({ ...hung.at, z: hung.at.z + lift }, wide, color, a.shown, forward, 0),
      shape: 'comet' as const,
      velocity: { x: 0, y: 0, z: -100 },
      trail: (wide * 0.75) / 100,
      aside: hung.aside,
    });
    drawn.motes.push({
      ...glow({ ...hung.at, z: hung.at.z + size * 0.5 }, size * 2, bright, 0.4 * a.shown, near),
      aside: hung.aside,
    });
    drawn.motes.push(drop(size * 1.28, clot, near + 1, -size * 0.14));
    drawn.motes.push(drop(size, bright, near + 2, 0));
    drawn.motes.push({
      ...ball({ ...hung.at, z: hung.at.z + size * 0.42 }, size * 0.22, '#ffffff', 0.85 * a.shown, near + 3, 0),
      aside: hung.aside,
    });
  }
  takeHold(drawn, a, bright, 0.6, 0.55);
  drawn.lights.push({
    ...onBody(a, 0, 0.5, 0),
    color: bright,
    strength: (0.2 + 0.5 * thump) * a.shown,
    reachPx: cell * 1.6,
  });
  return drawn;
}
