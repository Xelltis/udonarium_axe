import type { BladeTones } from '@axe/domain/effect/scene/blade/blade-tones';
import { outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectMote } from '@axe/domain/effect/scene/effect-scene';
import { DUST } from '@axe/domain/effect/scene/fire/fire-parts';
import { floorMark, glow, lightBall, type Point, smokePuff, starBurst } from '@axe/domain/effect/scene/parts';
import { scatter } from '@axe/domain/effect/scene/wind/wind-parts';
import { crackedAt, type DissolveShard, pictureSpotOf } from '@axe/domain/effect/timeline/body';

/*
 * What breaks out of a crumbling piece, drawn in the scene behind its picture and about it. As the
 * cracks between its shards open, a hard light blazes up behind it, pouring out through every crack
 * and round its edge, the seams themselves lines of white, and it holds for as long as shards are
 * left. As the picture lets go it bursts: a white flash and rays round it, the floor under it lit and
 * two rings of its colour thrown out over it, splinters of light flung out every way, and dust kicked up
 * off the floor round its feet. While it crumbles dust streams off it on the wind and flakes of light
 * whirl away with the shards.
 *
 * Everything here is set off across the screen from the middle of the picture, as the shards are.
 */

/** How long each ring the burst throws out over the floor runs, the burst's flash, and how long its splinters fly, in seconds. */
const BURST_S = 0.5;
const FLASH_S = 0.16;
/** When after it lets go each ring is thrown out, in seconds, and how far it runs, in cells. */
const RINGS: readonly (readonly [after: number, reach: number])[] = [
  [0, 2.9],
  [0.1, 1.9],
];
const SPLINTERS_S = 0.75;
/** How many splinters of light are flung out as it lets go, how many clouds of dust are kicked up round its feet, and how many stream off it after. */
const SPLINTERS = 24;
const KICKED_CLOUDS = 8;
const STREAMING_CLOUDS = 12;
/** How many flakes of light whirl away with the shards, and how long each flies, in seconds. */
const FLAKES = 16;
const FLAKE_FLIES_S = 1.1;
/** How the wind blows, as the eye sees it: to the right and up by this much, in radians. */
const WIND_RISE = 0.42;

/** A mote set off across the screen from the middle of the picture, as far right and up as given. */
function beside(middle: Point, right: number, up: number, mote: EffectMote): EffectMote {
  return { ...mote, x: middle.x, y: middle.y, z: middle.z, aside: { right, up } };
}

/** How many of the shards have not yet peeled away at a moment, as a share of them all. */
function leftShare(shards: readonly DissolveShard[], t: number): number {
  return shards.filter((shard) => t < shard.peelsAt).length / Math.max(1, shards.length);
}

/**
 * The light behind the picture as it cracks: a hard light blazing up as the cracks open, dimming as
 * the shards go, and the seams between the shards still sitting drawn as lines of white.
 */
export function drawCrackLight(
  drawn: Staged,
  stage: Stage,
  shards: readonly DissolveShard[],
  middle: Point,
  tones: BladeTones,
  forward: number
): void {
  const { cell } = stage;
  const t = stage.seconds;
  const cracked = crackedAt(shards[0], t).opened;
  const lit = cracked * leftShare(shards, t);
  if (lit <= 0.01) return;
  drawn.motes.push(glow(middle, cell * 1.9, tones.glow, 0.8 * lit, forward - 3));
  drawn.motes.push(glow(middle, cell * 1.1, '#ffffff', lit, forward - 2));
  for (const shard of shards) {
    if (t >= shard.peelsAt) continue;
    const { spread } = crackedAt(shard, t);
    const near = within(t, shard.peelsAt - 0.5, shard.peelsAt);
    const [corner] = shard.outline;
    const seams = [
      corner[1] > 0 ? [corner, shard.outline[1]] : null,
      corner[0] > 0 ? [shard.outline[3], corner] : null,
    ];
    for (const seam of seams) {
      if (!seam) continue;
      const from = pictureSpotOf(seam[0], cell);
      const to = pictureSpotOf(seam[1], cell);
      const long = Math.hypot(to.x - from.x, to.y - from.y);
      const right = ((from.x + to.x) / 2) * spread;
      const down = ((from.y + to.y) / 2) * spread;
      drawn.motes.push(
        beside(middle, right, -down, {
          ...glow(middle, long * 0.22, near > 0.5 ? '#ffffff' : tones.pale, cracked * (0.7 + 0.3 * near), forward - 1),
          shape: 'flare',
          trail: 5,
          spin: Math.atan2(-(to.y - from.y), to.x - from.x),
        })
      );
    }
  }
}

/**
 * The burst as the picture lets go, `since` seconds after: a flash and rays round it, the floor lit
 * and a ring thrown out over it, splinters of light flung out every way and dust kicked up round its feet.
 */
export function drawLetGo(
  drawn: Staged,
  stage: Stage,
  middle: Point,
  floor: Point,
  tones: BladeTones,
  since: number,
  forward: number
): void {
  if (since < 0 || since >= Math.max(BURST_S, SPLINTERS_S, 1.4)) return;
  const { cell, seed } = stage;
  const flash = 1 - within(since, 0, FLASH_S);
  if (flash > 0) {
    drawn.motes.push(glow(middle, cell * 3.4, tones.glow, 0.85 * flash, forward + 2));
    drawn.motes.push(lightBall(middle, cell * 1.1 * (1 + 0.4 * (1 - flash)), '#ffffff', flash, forward + 3));
    drawn.floor.push(floorMark('disc', floor, cell * 1.8, 1, '#ffffff', 0.5 * flash, 'light', 0));
    drawn.lights.push({ ...middle, color: tones.pale, strength: 1.8 * flash, reachPx: cell * 3 });
  }
  drawn.motes.push(...starBurst(middle, cell * 4.2, tones.glow, since / 0.4, forward + 4, 10, seed));
  for (const [after, reach] of RINGS) {
    const ring = within(since - after, 0, BURST_S);
    if (ring <= 0 || ring >= 1) continue;
    const radius = cell * (0.4 + reach * outCubic(ring));
    const shown = 1 - ring * ring;
    drawn.floor.push(floorMark('ring', floor, radius, (cell * 0.14) / radius, tones.body, 0.85 * shown, 'color', 0));
    drawn.floor.push(floorMark('ring', floor, radius, (cell * 0.06) / radius, '#ffffff', shown, 'light', 0));
  }
  for (let splinter = 0; splinter < SPLINTERS; splinter++) {
    const age = within(
      since - scatter(splinter, seed + 81) * 0.05,
      0,
      SPLINTERS_S * (0.7 + 0.3 * scatter(splinter, seed + 82))
    );
    if (age <= 0 || age >= 1) continue;
    const turn = (splinter / SPLINTERS) * Math.PI * 2 + scatter(splinter, seed + 83) * 0.4;
    const out = cell * (0.7 + 2 * scatter(splinter, seed + 84)) * outCubic(age);
    drawn.motes.push(
      beside(middle, Math.cos(turn) * out, Math.sin(turn) * out - cell * 0.9 * age * age, {
        ...glow(
          middle,
          cell * (0.1 + 0.06 * (splinter % 3)),
          splinter % 3 === 0 ? '#ffffff' : tones.pale,
          1 - age,
          forward + 2
        ),
        blend: 'color',
        shape: 'flake',
        spin: since * (9 + (splinter % 5)) + splinter,
        variant: splinter,
      })
    );
  }
  const dust = mixColor(DUST, tones.body, 0.2);
  for (let cloud = 0; cloud < KICKED_CLOUDS; cloud++) {
    const age = within(since - scatter(cloud, seed + 85) * 0.08, 0, 1.3);
    if (age <= 0 || age >= 1) continue;
    const turn = (cloud / KICKED_CLOUDS) * Math.PI * 2 + scatter(cloud, seed + 86);
    const out = cell * (0.35 + 0.9 * outCubic(age));
    drawn.motes.push(
      smokePuff(
        {
          x: floor.x + Math.cos(turn) * out,
          y: floor.y + Math.sin(turn) * out * 0.8,
          z: floor.z + cell * (0.15 + 0.5 * age),
        },
        cell * (0.45 + 0.6 * outCubic(age)),
        dust,
        0.6 * Math.min(1, age * 8, (1 - age) * 1.8),
        forward - 4
      )
    );
  }
}

/** The dust streaming off the picture on the wind and the flakes of light whirling away with its shards, from as it lets go until the last shard has gone. */
export function drawStreaming(
  drawn: Staged,
  stage: Stage,
  shards: readonly DissolveShard[],
  middle: Point,
  tones: BladeTones,
  forward: number
): void {
  const { cell, seed } = stage;
  const t = stage.seconds;
  const from = shards[0].letsGoAt;
  const until = Math.max(...shards.map((shard) => shard.peelsAt));
  const span = Math.max(0.2, until - from);
  const wind = { right: Math.cos(WIND_RISE), up: Math.sin(WIND_RISE) };
  const dust = mixColor(DUST, tones.body, 0.25);
  for (let cloud = 0; cloud < STREAMING_CLOUDS; cloud++) {
    const born = from + scatter(cloud, seed + 91) * span;
    const age = within(t, born, born + 1.3);
    if (age <= 0 || age >= 1) continue;
    const startRight = (scatter(cloud, seed + 92) - 0.5) * cell * 0.9;
    const startUp = (scatter(cloud, seed + 93) - 0.5) * cell * 1.2;
    const carried = cell * (0.3 + 2.2 * age);
    drawn.motes.push(
      beside(
        middle,
        startRight + wind.right * carried,
        startUp + wind.up * carried,
        smokePuff(middle, cell * (0.35 + 0.55 * age), dust, 0.55 * Math.min(1, age * 6, (1 - age) * 1.6), forward - 4)
      )
    );
  }
  for (let flake = 0; flake < FLAKES; flake++) {
    const born = from + scatter(flake, seed + 94) * span;
    const age = within(t, born, born + FLAKE_FLIES_S);
    if (age <= 0 || age >= 1) continue;
    const startRight = (scatter(flake, seed + 95) - 0.5) * cell * 0.8;
    const startUp = (scatter(flake, seed + 96) - 0.5) * cell * 1.2;
    const carried = cell * 3 * (age * age * 0.5 + age * 0.5);
    const swirl = Math.sin(age * 9 + flake) * cell * 0.18;
    drawn.motes.push(
      beside(middle, startRight + wind.right * carried, startUp + wind.up * carried + swirl, {
        ...glow(
          middle,
          cell * (0.08 + 0.05 * (flake % 3)),
          flake % 2 === 0 ? '#ffffff' : tones.pale,
          1 - age,
          forward + 1
        ),
        blend: flake % 2 === 0 ? 'light' : 'color',
        shape: 'flake',
        spin: t * (5 + (flake % 4)) + flake,
        variant: flake,
      })
    );
  }
}
