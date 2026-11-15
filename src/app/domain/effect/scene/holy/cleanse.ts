import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import {
  drawClean,
  drawClinging,
  drawClot,
  drawCrown,
  layWaterRing,
  MURK,
  MURK_DEEP,
} from '@axe/domain/effect/scene/holy/cleanse-parts';
import {
  layLifeRing,
  layRipple,
  layWound,
  mendTonesOf,
  twinkle,
  windBand,
} from '@axe/domain/effect/scene/holy/mend-parts';
import { floorMark, glow, haze, starBurst } from '@axe/domain/effect/scene/parts';

/*
 * The cleansings: what ails a piece is seen on it, and is seen to leave.
 *
 * A purging, the lesser: a murk clings to the body. A ring of water rises from the feet to over the
 * head, and as it passes, the murk is driven out of the body before it, each clot of it caught in a
 * bubble that floats off; as the sound rings the ring breaks over the head in a crown of drops, and
 * the bubbles burst one after another, each in a flash of light that leaves nothing of what it held.
 *
 * A washing, the greater: a drop of light falls on the head and breaks, and a wave runs down the body
 * from it, streams winding down with it; the murk on the body is carried down before the wave and
 * out over the floor as a dark ring, which a ring of light runs after, overtakes and puts out in a
 * round of twinkles.
 */

/** A purging: see the header. `lingers` is how long after its playback what it leaves is still drawn, in seconds. */
export function drawPurge(stage: Stage, lingers: number): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const ends = duration + lingers;
  if (t < 0 || t >= ends) return drawn;
  const tones = mendTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const forward = cell * 0.3;
  const breaksAt = Math.min(0.9, duration * 0.4);
  const startsAt = Math.min(0.28, breaksAt * 0.3);
  const top = stage.tall + cell * 0.4;
  const climbed = within(t, startsAt, breaksAt);
  const height = top * climbed;
  const radius = cell * (0.92 - 0.14 * Math.sin(climbed * Math.PI));
  const ring = { ...floor, z: floor.z + height };
  const leaving = 1 - within(t, duration, ends);

  layLifeRing(drawn, floor, cell * 1.15 * outCubic(within(t, 0, 0.25)), tones, leaving, t * 0.6, stage.seed);
  layRipple(drawn, floor, cell * 0.4, cell * 2, tones, within(t, 0, 0.45));
  layRipple(drawn, floor, cell * 0.4, cell * 2.6, tones, within(t, breaksAt, breaksAt + 0.55));
  const ailing = Math.min(1, t / 0.12) * (t < breaksAt ? 1 : 0);
  drawClinging(drawn, stage, floor, height, Infinity, ailing, forward);
  drawn.motes.push(
    haze({ ...floor, z: floor.z + stage.tall * 0.55 }, cell * 1.6, MURK, 0.42 * ailing * (1 - climbed), forward)
  );

  if (t < breaksAt) {
    const shown = Math.min(1, t / startsAt);
    layWaterRing(drawn, ring, radius, cell * 0.32, tones, shown);
    layWaterRing(drawn, { ...ring, z: ring.z - cell * 0.22 * climbed }, radius * 1.1, cell * 0.12, tones, 0.8 * shown);
    const veil = [0, 0.5, 1].map((share) => ({ ...floor, z: floor.z + height * share }));
    drawn.ribbons.push({
      points: veil,
      widths: radius * 2,
      color: tones.body,
      alpha: 0.34 * shown,
      alphas: [0.2, 0.6, 1],
      blend: 'color',
      soft: 1,
      torn: 0.2,
      flowed: -t * 2,
    });
    drawn.motes.push(glow(ring, radius * 2.6, tones.bright, 0.45 * shown, forward));
  } else {
    const since = t - breaksAt;
    const left = 1 - within(since, 0, 0.34);
    const head = { ...floor, z: floor.z + top };
    layWaterRing(drawn, head, radius + cell * 1.6 * outCubic(1 - left), cell * 0.3 * left, tones, left);
    drawCrown(drawn, head, cell, tones, since, 14, forward);
    if (since < 0.16) {
      drawn.motes.push(...starBurst(head, cell * 1.9, tones.bright, since / 0.16, forward, 4, 0.4));
      drawn.motes.push(haze(head, cell * 1.8, tones.pale, 0.7 * (1 - since / 0.16), forward));
    }
  }

  const next = seededRun(stage.seed * 37 + 2);
  const clots = 9;
  const lastBursts = Math.max(breaksAt + 0.3, duration * 0.78);
  for (let index = 0; index < clots; index++) {
    const turn = (index / clots) * Math.PI * 2 + next() * 0.6;
    const share = 0.12 + (0.8 * ((index * 4) % clots)) / clots;
    const born = startsAt + (breaksAt - startsAt) * share;
    const bursts = breaksAt + 0.05 + ((lastBursts - breaksAt) * index) / clots + next() * 0.04;
    const far = cell * (1.45 + next() * 0.8);
    const size = cell * (0.34 + next() * 0.14);
    const since = t - born;
    if (since < 0) continue;
    const pushed = 1 - Math.exp(-since * 4);
    const floats = cell * 0.5 * since + cell * 0.07 * Math.sin(since * 6 + index);
    const out = cell * 0.25 + (far - cell * 0.25) * pushed;
    const at = {
      x: floor.x + Math.cos(turn) * out,
      y: floor.y + Math.sin(turn) * out,
      z: floor.z + top * share + cell * 0.15 + floats,
    };
    if (t < bursts) {
      const caught = within(since, 0.1, 0.3);
      const dissolving = 1 - 0.5 * within(t, born + 0.3, bursts);
      drawClot(drawn, at, size * dissolving, Math.min(1, since * 12), index, forward);
      if (caught > 0) {
        drawn.motes.push(haze(at, size * 2.2 * (0.6 + 0.4 * caught), tones.bright, 0.25 * caught, forward + 0.8));
        drawn.motes.push({
          ...haze(at, size * 2.4 * (0.6 + 0.4 * caught), tones.bright, caught, forward + 1),
          shape: 'bubble',
          spin: 0,
        });
        drawn.motes.push(glow(at, size * 2.2, tones.bright, 0.35 * caught, forward + 1));
      }
      continue;
    }
    const gone = (t - bursts) / 0.3;
    if (gone >= 1) continue;
    drawn.motes.push(...starBurst(at, size * 4, tones.bright, gone, forward + 1, 4, index));
    drawn.motes.push({
      ...haze(at, size * (2.4 + 3 * outCubic(gone)), tones.pale, 1 - gone, forward + 1),
      shape: 'hoop',
      spin: 0,
    });
    drawn.motes.push(haze(at, size * 1.6 * (1 - gone), '#ffffff', 0.9 * (1 - gone), forward + 1.5));
    for (let drop = 0; drop < 6; drop++) {
      const way = (drop / 6) * Math.PI * 2 + index;
      const flung = size * 3.4 * outCubic(gone);
      const where = {
        x: at.x + Math.cos(way) * flung,
        y: at.y + Math.sin(way) * flung * 0.5,
        z: Math.max(floor.z + size * 0.2, at.z + Math.sin(way) * flung * 0.7 - cell * 0.5 * gone * gone),
      };
      drawn.motes.push(haze(where, size * 0.5 * (1 - gone), tones.bright, 1 - gone, forward + 1));
    }
  }

  drawClean(drawn, stage, floor, tones, breaksAt + 0.25, ends);
  const lit = Math.min(1, t / 0.2) * (1 - within(t, duration - 0.3, duration + 0.2));
  drawn.lights.push({ ...ring, color: tones.bright, strength: 0.9 * lit, reachPx: cell * 2.8 });
  return drawn;
}

/** A washing: see the header. `lingers` is how long after its playback what it leaves is still drawn, in seconds. */
export function drawWash(stage: Stage, lingers: number): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const ends = duration + lingers;
  if (t < 0 || t >= ends) return drawn;
  const tones = mendTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const forward = cell * 0.3;
  const landsAt = Math.min(0.32, duration * 0.16);
  const groundsAt = Math.min(0.82, duration * 0.38);
  const top = stage.tall + cell * 0.35;
  const head = { ...floor, z: floor.z + top };
  const run = within(t, landsAt, groundsAt);
  const height = top * (1 - run * run);
  const leaving = 1 - within(t, duration, ends);

  layLifeRing(
    drawn,
    floor,
    cell * 1.15 * outCubic(within(t, landsAt, groundsAt)),
    tones,
    leaving,
    -t * 0.6,
    stage.seed
  );
  const ailing = Math.min(1, t / 0.1) * (t < groundsAt ? 1 : 0);
  drawClinging(drawn, stage, floor, 0, t < landsAt ? Infinity : height, ailing, forward);
  drawn.motes.push(
    haze({ ...floor, z: floor.z + stage.tall * 0.5 }, cell * 1.6, MURK, 0.42 * ailing * (1 - run), forward)
  );

  if (t < landsAt) {
    const fallen = t / landsAt;
    const from = top + cell * 4;
    const at = { ...floor, z: floor.z + from + (top - from) * fallen * fallen };
    const way = { x: 0, y: 0, z: -cell * 14 };
    drawn.motes.push({ ...haze(at, cell * 0.8, tones.shade, 0.9, forward), shape: 'comet', velocity: way, trail: 0.1 });
    drawn.motes.push({
      ...haze(at, cell * 0.62, tones.body, 1, forward + 0.3),
      shape: 'comet',
      velocity: way,
      trail: 0.09,
    });
    drawn.motes.push({
      ...haze(at, cell * 0.34, tones.pale, 1, forward + 0.6),
      shape: 'comet',
      velocity: way,
      trail: 0.07,
    });
    drawn.motes.push(glow(at, cell * 1.6, tones.bright, 0.8, forward + 1));
    twinkle(drawn, at, cell * 0.7, tones, 0.9, t * 9, forward + 1.2);
  } else {
    const since = t - landsAt;
    drawCrown(drawn, head, cell, tones, since, 14, forward);
    if (since < 0.14) {
      drawn.motes.push(...starBurst(head, cell * 1.8, tones.bright, since / 0.14, forward, 4, 0.2));
      drawn.motes.push(haze(head, cell * 1.7, tones.pale, 0.7 * (1 - since / 0.14), forward));
    }
    const thrown = within(since, 0, 0.34);
    layWaterRing(drawn, head, cell * (0.3 + 1.5 * outCubic(thrown)), cell * 0.2 * (1 - thrown), tones, 1 - thrown);
  }

  if (t >= landsAt && t < groundsAt) {
    const radius = cell * (0.5 + 0.55 * run);
    const ring = { ...floor, z: floor.z + height };
    layWaterRing(drawn, ring, radius, cell * 0.34, tones, 1);
    const veil = [0, 0.5, 1].map((share) => ({ ...floor, z: floor.z + height + (top - height) * share }));
    drawn.ribbons.push({
      points: veil,
      widths: [radius * 2.1, radius * 1.7, cell * 0.7],
      color: tones.body,
      alpha: 0.42,
      alphas: [1, 0.6, 0.15],
      blend: 'color',
      soft: 1,
      torn: 0.25,
      flowed: t * 3,
    });
    for (let stream = 0; stream < 2; stream++) {
      const from = (stage.seed % 6) + stream * Math.PI;
      layWound(
        drawn,
        windBand(
          floor,
          [top, 0],
          [cell * 0.34, cell * 1],
          [from, from + Math.PI * 3],
          [Math.max(0, run - 0.45), run],
          cell * 0.22
        ),
        tones,
        0.9,
        tones.pale
      );
    }
    drawn.motes.push(glow(ring, radius * 2.4, tones.bright, 0.45, forward));
  }

  const since = t - groundsAt;
  if (since >= 0) {
    const flows = Math.min(1.0, duration * 0.44);
    const spread = within(since, 0, flows);
    const reach = cell * (1.05 + 1.75 * (1 - (1 - spread) * (1 - spread)));
    const chase = within(since, flows * 0.3, flows);
    const caught = cell * (0.3 + 2.6 * chase * chase);
    const murk = (1 - within(since, flows * 0.8, flows)) * (caught < reach ? 1 : 0);
    if (murk > 0.01) {
      drawn.floor.push(floorMark('ring', floor, reach, 0.14, MURK_DEEP, 0.85 * murk, 'color', 0));
      drawn.floor.push(floorMark('ring', floor, reach * 0.98, 0.07, MURK, 0.9 * murk, 'color', 0));
      for (let clot = 0; clot < 12; clot++) {
        const turn = (clot / 12) * Math.PI * 2 + stage.seed;
        const at = {
          x: floor.x + Math.cos(turn) * reach,
          y: floor.y + Math.sin(turn) * reach,
          z: floor.z + cell * 0.12,
        };
        drawClot(drawn, at, cell * (0.2 + 0.1 * (clot % 3)), murk, clot, forward);
      }
    }
    if (since < flows) {
      layRipple(drawn, floor, cell * 0.3, cell * 2.9, tones, chase);
      layRipple(drawn, floor, cell * 0.5, cell * 1.8, tones, within(since, 0, 0.4));
    }
    const out = since - flows * 0.9;
    if (out >= 0 && out < 0.5) {
      const left = 1 - out / 0.5;
      for (let spark = 0; spark < 12; spark++) {
        const turn = (spark / 12) * Math.PI * 2 + stage.seed;
        const at = {
          x: floor.x + Math.cos(turn) * cell * 2.75,
          y: floor.y + Math.sin(turn) * cell * 2.75,
          z: floor.z + cell * (0.12 + 0.7 * (1 - left)),
        };
        twinkle(drawn, at, cell * 0.7 * left, tones, left, spark + out * 6, forward);
      }
      drawn.floor.push(
        floorMark('ring', floor, cell * 2.8, 0.12, mixColor(tones.pale, '#ffffff', 0.5), left, 'light', 0)
      );
      drawn.floor.push(floorMark('ring', floor, cell * 2.8, 0.1, tones.bright, left, 'color', 0));
    }
    drawClean(drawn, stage, floor, tones, groundsAt + 0.1, ends);
  }
  const lit = Math.min(1, t / 0.2) * (1 - within(t, duration - 0.3, duration + 0.2));
  drawn.lights.push({ ...head, color: tones.bright, strength: 0.9 * lit, reachPx: cell * 2.8 });
  return drawn;
}
