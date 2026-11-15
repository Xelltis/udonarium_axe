import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { crag } from '@axe/domain/effect/scene/earth/earth-parts';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import {
  auraDetailOf,
  auraLightOf,
  type AuraTones,
  auraTonesOf,
  drawPebbles,
  drawUpdraft,
  layAuraCracks,
  layAuraFlames,
  layAuraHoop,
  layAuraRing,
  ringOfFlames,
} from '@axe/domain/effect/scene/holy/aura-parts';
import { drawPillar } from '@axe/domain/effect/scene/holy/holy-parts';
import { floorMark, glow, haze, lightningPaths, type Point } from '@axe/domain/effect/scene/parts';

/*
 * The greatest aura: a power gathered and let go.
 *
 * While it gathers the table holds its breath: a shadow spreads over the floor about the piece, a
 * seal opens under its feet and spins up, streaks of light are drawn in to it from every side, low
 * flames shiver about its feet, cracks creep out from under it and the pebbles round it start off
 * the floor. Then it breaks out: for an instant everything is white; a pillar of spirit goes up into
 * the sky, wide as the piece and more; rings race out over the floor, which breaks, slabs of it
 * heaved up round the piece and its cracks alight; pebbles are flung up and hang there. The pillar
 * narrows into a tall body of flame that goes on raging, hoops of light running up it and lightning
 * crawling over the piece. At the last the flames are drawn into the piece, a single glint crosses it
 * at the height of its eyes, and what was lifted is let fall.
 */

/** Where through the playback it breaks out, where no blow tells: as its sound does. */
const BREAKS_OUT_AT = 0.16;
/** How long the flames take to be drawn in at the end, and how long before the end the glint crosses, in seconds. */
const DRAWS_IN_S = 0.5;
const GLINT_BEFORE_END_S = 0.26;
/** How tall the pillar stands, in cells, and how long it takes to narrow into the body of flame, in seconds. */
const PILLAR_CELLS = 8;
const NARROWS_S = 0.95;
/** How far the shadow, the first ring and the second reach, in cells. */
const SHADOW_CELLS = 5.5;
const RING_CELLS = [3.6, 5.2] as const;

/** The streaks of light drawn in to the piece from every side as it gathers. */
function drawGathering(drawn: Staged, stage: Stage, heart: Point, tones: AuraTones, t: number, breaksAt: number): void {
  const { cell } = stage;
  const next = seededRun(stage.seed * 61 + 5);
  const forward = cell * 0.3;
  for (let streak = 0; streak < 22; streak++) {
    const turn = next() * Math.PI * 2;
    const born = (breaksAt - 0.2) * next();
    const from = cell * (2.4 + next() * 1.4);
    const high = cell * (0.2 + next() * 1.6);
    const age = (t - born) / 0.24;
    if (age < 0 || age >= 1) continue;
    const near = from * (1 - age * age);
    const at = {
      x: heart.x + Math.cos(turn) * near,
      y: heart.y + Math.sin(turn) * near,
      z: heart.z + (high - cell * 0.5) * (1 - age),
    };
    const way = { x: -Math.cos(turn) * from * 6, y: -Math.sin(turn) * from * 6, z: 0 };
    const fade = Math.min(1, age * 5);
    drawn.motes.push({
      ...haze(at, cell * 0.2, tones.shade, 0.9 * fade, forward),
      shape: 'spark',
      velocity: way,
      trail: 0.05,
    });
    drawn.motes.push({
      ...haze(at, cell * 0.12, tones.gold, fade, forward + 0.5),
      shape: 'spark',
      velocity: way,
      trail: 0.045,
    });
  }
}

/** Slabs of the floor heaved up round the piece as the aura breaks out, leaning away from it, their cracks alight. */
function drawSlabs(drawn: Staged, stage: Stage, floor: Point, tones: AuraTones, since: number, sinking: number): void {
  if (since < 0 || sinking >= 1) return;
  const { cell } = stage;
  const next = seededRun(stage.seed * 47 + 9);
  const heaved = outCubic(within(since, 0, 0.12));
  for (let slab = 0; slab < 8; slab++) {
    const turn = (slab / 8) * Math.PI * 2 + next() * 0.4;
    const out = cell * (1.05 + next() * 0.5);
    const tall = cell * (0.45 + next() * 0.5) * heaved * (1 - sinking);
    const lean = 0.5 + next() * 0.3;
    const root = { x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: floor.z };
    const way = { x: Math.cos(turn) * Math.sin(lean), y: Math.sin(turn) * Math.sin(lean), z: Math.cos(lean) };
    if (tall < cell * 0.08) continue;
    drawn.motes.push(
      crag(root, way, tall, cell * (0.3 + next() * 0.14), '#6d5c48', 1, {
        variant: slab * 1.7,
        broken: 0.25 + next() * 0.3,
        veins: 0.7 * (1 - within(since, 0.3, 1.6)),
        glow: tones.gold,
      })
    );
  }
}

/** Lightning crawling over the piece: short forked lines that jump from place to place, a dark sheath under each white line. */
function drawCrawl(drawn: Staged, stage: Stage, floor: Point, tones: AuraTones, t: number, alpha: number): void {
  if (alpha <= 0.01) return;
  const { cell } = stage;
  const flicker = Math.floor(t * 16);
  const next = seededRun(stage.seed * 7 + flicker * 131);
  for (let twig = 0; twig < 3; twig++) {
    const turn = next() * Math.PI * 2;
    const swing = turn + (next() - 0.5) * 2.4;
    const from = {
      x: floor.x + Math.cos(turn) * cell * 0.34,
      y: floor.y + Math.sin(turn) * cell * 0.34,
      z: floor.z + stage.tall * (0.1 + 0.5 * next()),
    };
    const to = {
      x: floor.x + Math.cos(swing) * cell * 0.75,
      y: floor.y + Math.sin(swing) * cell * 0.75,
      z: floor.z + stage.tall * (0.5 + 0.8 * next()),
    };
    const paths = lightningPaths(from, to, stage.seed + twig, flicker, {
      bends: 6,
      jag: 0.22,
      forks: 1,
      floorZ: floor.z,
    });
    for (const [points, wide] of [[paths.main, 1], ...paths.forks.map((fork) => [fork, 0.6] as const)] as const) {
      drawn.ribbons.push(
        { points: [...points], widths: cell * 0.11 * wide, color: tones.shade, alpha: 0.85 * alpha, blend: 'color' },
        { points: [...points], widths: cell * 0.06 * wide, color: tones.pale, core: '#ffffff', alpha, blend: 'color' },
        {
          points: [...points],
          widths: cell * 0.12 * wide,
          color: tones.gold,
          alpha: 0.6 * alpha,
          blend: 'light',
          soft: 0.6,
        }
      );
    }
  }
}

/** The greatest aura: see the header. `lingers` is how long after its playback what it leaves is still drawn, in seconds. */
export function drawBreakout(stage: Stage, lingers: number): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const ends = duration + lingers;
  if (t < 0 || t >= ends) return drawn;
  const tones = auraTonesOf(stage.preset.colorPrimary, stage.preset.colorSecondary);
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const forward = cell * 0.25;
  const breaksAt = stage.blowsAt[0] ?? duration * BREAKS_OUT_AT;
  const since = t - breaksAt;
  const drawsInAt = duration - DRAWS_IN_S;
  const drawnIn = within(t, drawsInAt, duration);
  const leaving = 1 - within(t, duration, ends);
  const body = { ...floor, z: floor.z + stage.tall * 0.55 };
  const gathered = within(t, 0, breaksAt);

  const shadow = since < 0 ? gathered : 1 - within(since, 0.05, 0.5);
  drawn.floor.push(
    floorMark('disc', floor, cell * SHADOW_CELLS * (0.6 + 0.4 * gathered), 1, '#070403', 0.85 * shadow, 'color', 0)
  );
  const sealed = since < 0 ? outCubic(gathered) : 1;
  const spin = (stage.seed % 7) + (since < 0 ? gathered * gathered * 5 : 5 + since * 1.2);
  const sealAlpha = leaving * (since < 0 ? 1 : 0.55 + 0.45 * (1 - within(since, 0, 0.5))) * (1 - 0.6 * drawnIn);
  drawn.floor.push(
    floorMark('crest', floor, cell * 1.55 * sealed, 0.09, tones.shade, 0.85 * sealAlpha, 'color', 0, spin)
  );
  drawn.floor.push(floorMark('crest', floor, cell * 1.55 * sealed, 0.055, tones.gold, sealAlpha, 'color', 0, spin));
  drawn.floor.push(floorMark('crest', floor, cell * 1.55 * sealed, 0.035, tones.pale, sealAlpha, 'light', 0, spin));

  drawPebbles(
    drawn,
    stage.seed,
    floor,
    cell,
    t,
    {
      count: 18,
      out: [cell * 0.6, cell * 2.2],
      high: [cell * 0.5, cell * 2.6],
      lifts: [breaksAt, breaksAt + 0.12],
      risesFor: 0.3,
      drops: duration - 0.12,
      ends,
    },
    tones,
    forward
  );

  if (since < 0) {
    layAuraCracks(drawn, floor, cell * 0.95 * gathered, tones, 1, 0.5 * gathered, stage.seed);
    drawGathering(drawn, stage, body, tones, t, breaksAt);
    const shiver = 0.75 + 0.25 * Math.sin(t * 60);
    layAuraFlames(
      drawn,
      floor,
      ringOfFlames(9, cell * 0.5, cell * (0.4 + 0.5 * gathered) * shiver, cell * 0.36, 0.5, 0.5, t, stage.seed),
      tones,
      t,
      Math.min(1, gathered * 3)
    );
    drawn.motes.push(haze(body, cell * (1.9 - 0.9 * gathered), tones.body, 0.4 * gathered, forward));
    drawn.motes.push(glow(body, cell * (2.6 - 1.4 * gathered), tones.pale, 0.9 * gathered * gathered, forward));
    return drawn;
  }

  const lit = 1 - within(since, 0.4, 1.8);
  layAuraCracks(
    drawn,
    floor,
    cell * (0.95 + 1.6 * outCubic(within(since, 0, 0.14))),
    tones,
    leaving,
    Math.max(lit, 0.25 * (1 - drawnIn)),
    stage.seed
  );
  layAuraRing(drawn, floor, cell * 0.5, cell * RING_CELLS[0], cell * 0.4, tones, within(since, 0, 0.42));
  layAuraRing(drawn, floor, cell * 0.3, cell * RING_CELLS[1], cell * 0.3, tones, within(since, 0.08, 0.7));
  drawSlabs(drawn, stage, floor, tones, since, within(t, duration, ends - 0.2));
  if (since < 0.09) {
    const left = 1 - since / 0.09;
    drawn.floor.push(floorMark('disc', floor, cell * 3.8, 1, '#ffffff', 0.8 * left, 'light', 0));
    drawn.floor.push(floorMark('disc', floor, cell * 2.6, 1, tones.pale, 0.8 * left, 'color', 0));
    drawn.motes.push(haze(body, cell * 3, '#ffffff', 0.9 * left, forward));
    drawn.motes.push(glow(body, cell * 4.6, '#ffffff', 0.85 * left, forward));
    for (let ray = 0; ray < 6; ray++) {
      drawn.motes.push({
        ...glow(body, cell * 0.7, '#ffffff', left, forward + 1),
        shape: 'flare',
        trail: ray % 2 === 0 ? 9 : 5,
        spin: (ray / 6) * Math.PI + (stage.seed % 3),
      });
    }
  }

  const narrowed = outCubic(within(since, 0.06, NARROWS_S));
  const stands = (1 - within(since, NARROWS_S * 0.75, NARROWS_S + 0.35)) * outCubic(within(since, 0, 0.05));
  drawPillar(
    drawn,
    floor,
    floor.z + cell * PILLAR_CELLS * outCubic(within(since, 0, 0.1)),
    cell * (2.4 - 1.7 * narrowed),
    auraLightOf(tones),
    stands,
    t
  );

  const rages = (1 - drawnIn) * outCubic(within(since, 0, 0.12));
  if (rages > 0.01) {
    const surge = Math.exp(-since / 0.5);
    const tall = (stage.tall + cell * 3.2) * (1 + 0.45 * surge) * (1 - 0.6 * drawnIn);
    const close = 1 - 0.5 * drawnIn;
    const detail = auraDetailOf(stage.targets.length);
    const outer = ringOfFlames(
      Math.round(13 * detail),
      cell * 0.62 * close,
      tall,
      cell * 0.7 * close,
      0.6,
      0.35,
      t,
      stage.seed
    );
    const inner = ringOfFlames(
      Math.round(6 * detail),
      cell * 0.3 * close,
      tall * 1.3,
      cell * 0.7 * close,
      0.9,
      0.75,
      t,
      stage.seed + 3
    );
    layAuraFlames(drawn, floor, [...outer, ...inner], tones, t, Math.min(1, rages * 1.5));
    for (let hoop = 0; hoop < (detail < 0.7 ? 1 : 2); hoop++) {
      const climbed = (since * 1.5 + hoop / 2) % 1;
      layAuraHoop(
        drawn,
        { ...floor, z: floor.z + tall * 0.8 * climbed },
        cell * (0.85 - 0.35 * climbed),
        cell * 0.1,
        tones,
        Math.min(1, climbed * 5, (1 - climbed) * 2) * rages
      );
    }
    drawCrawl(drawn, stage, floor, tones, t, rages * within(since, 0.25, 0.4));
    drawUpdraft(drawn, stage.seed, floor, cell, t, 22, [cell * 0.3, cell * 1.3], tall * 1.2, tones, rages, forward);
    drawn.motes.push(haze(body, cell * 2.2, tones.body, 0.32 * rages, forward));
    drawn.motes.push(glow(body, cell * (2.2 + 1.4 * surge), tones.gold, (0.45 + 0.4 * surge) * rages, forward));
  }

  const glintAt = duration - GLINT_BEFORE_END_S;
  const glinted = t - glintAt;
  if (glinted >= 0 && glinted < 0.3) {
    const left = 1 - glinted / 0.3;
    const eyes = { ...floor, z: floor.z + stage.tall * 0.82 };
    drawn.motes.push({
      ...glow(eyes, cell * 0.5 * (0.4 + 0.6 * left), '#ffffff', left, forward + cell * 0.4),
      shape: 'flare',
      trail: 12,
      spin: 0,
    });
    drawn.motes.push({
      ...glow(eyes, cell * 0.8 * left, tones.gold, left, forward + cell * 0.4),
      shape: 'flare',
      trail: 7,
      spin: 0,
    });
    drawn.motes.push({
      ...glow(eyes, cell * 1.1 * left, '#ffffff', left, forward + cell * 0.4),
      shape: 'star',
      spin: 0.4,
    });
    layAuraRing(drawn, floor, cell * 0.4, cell * 2.4, cell * 0.14, tones, glinted / 0.3);
  }
  const strength = since < 0.4 ? 2.4 - 2.5 * since : 1.4 * rages;
  if (strength > 0.02)
    drawn.lights.push({
      ...body,
      color: since < 0.15 ? '#ffffff' : tones.gold,
      strength,
      reachPx: cell * (since < 0.4 ? 5 : 3.6),
    });
  return drawn;
}
