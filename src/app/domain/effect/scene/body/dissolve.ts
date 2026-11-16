import { seededRandom } from '@axe/core/util/seeded-random';
import { bladeTonesOf } from '@axe/domain/effect/scene/blade/blade-tones';
import { drawCrackLight, drawLetGo, drawStreaming } from '@axe/domain/effect/scene/body/dissolve-burst';
import {
  type Choreography,
  nothingStaged,
  outCubic,
  type Stage,
  type Staged,
  within,
} from '@axe/domain/effect/scene/choreography';
import type { EffectMote } from '@axe/domain/effect/scene/effect-scene';
import { floorMark, glow, haze, keptFor, type Point, stageKey } from '@axe/domain/effect/scene/parts';
import { scatter } from '@axe/domain/effect/scene/wind/wind-parts';
import {
  DISSOLVE_TAKES_OVER_S,
  dissolvePictureRise,
  type DissolveShard,
  dissolveShards,
  shardPoseAt,
} from '@axe/domain/effect/timeline/body';

/*
 * A piece crumbling to nothing. A band of light runs up it from its feet, cracks of light opening
 * behind it, and as it reaches its head the piece flares white and its own picture, cut into shards,
 * takes its place. The cracks between the shards open and a hard light blazes up behind it, pouring
 * out through them; then it lets go in a burst, a flash and rays, a ring thrown out over the floor,
 * splinters of light flung every way and dust kicked up; see `dissolve-burst`. The shards peel away
 * from its windward edge, each flashing as it breaks off and rimmed in light as the wind carries it
 * off, breaking up into motes, dust streaming off with them and flakes of light whirling away; where
 * they peel from, the shape of the piece is left standing as a pale afterimage, fading. Last of all
 * motes of light rise from where it stood and a ring of light on the floor closes on the spot.
 *
 * The shards are drawn over the table as `timeline/body` has them; what is drawn here about them is
 * set off across the screen from the middle of the picture as they are, so it moves with them.
 */

/** When the band of light runs up the piece, and when the piece flares white as its picture takes its place, in seconds. */
const RUNS_UP_S: readonly [number, number] = [0.05, 0.4];
const FLARES_S: readonly [number, number] = [0.26, 0.6];
/** How long before a shard peels away it starts to glow, in seconds. */
const GLOWS_BEFORE_S = 0.3;
/** When the afterimage has faded, as a share of the playback, and when the ring on the floor closes and the last motes rise. */
const AFTERIMAGE_GONE = 0.78;
const CLOSES_FROM = 0.7;
/** How many motes of light rise from where it stood at the last. */
const LAST_MOTES = 18;

const shardsByStage = new Map<string, DissolveShard[]>();

/** A piece crumbling: see the head of this file. */
export const dissolve: Choreography = {
  lingerS: 0,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell, duration } = stage;
    const t = stage.seconds;
    const tones = bladeTonesOf(stage.preset.colorPrimary, stage.preset.colorSecondary);
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const middle = { x: stage.x, y: stage.y, z: stage.z + dissolvePictureRise(cell) };
    const forward = cell * 0.5;
    const shards = keptFor(shardsByStage, stageKey(stage, duration), () =>
      dissolveShards(duration, seededRandom(stage.seed))
    );
    layRunningBand(drawn, stage, tones, t, forward);
    const flaring =
      within(t, FLARES_S[0], DISSOLVE_TAKES_OVER_S[1]) * (1 - within(t, DISSOLVE_TAKES_OVER_S[1], FLARES_S[1]));
    if (flaring > 0) {
      drawn.motes.push(haze(middle, cell * 1.7, tones.pale, 0.55 * flaring, forward));
      drawn.motes.push(haze(middle, cell * 1.05, '#ffffff', 0.75 * flaring, forward + 1));
    }
    drawCrackLight(drawn, stage, shards, middle, tones, forward);
    drawLetGo(drawn, stage, middle, floor, tones, t - shards[0].letsGoAt, forward);
    drawStreaming(drawn, stage, shards, middle, tones, forward);
    for (const shard of shards) drawShardLight(drawn, stage, shard, middle, tones, forward);
    drawWind(drawn, stage, shards, middle, tones, forward);
    layFloor(drawn, stage, floor, tones, t);
    drawLastMotes(drawn, stage, floor, tones, t, forward);
    const lit = Math.max(flaring, within(t, 0.3, 0.6) * (1 - within(t, duration * 0.6, duration)));
    if (lit > 0.02) drawn.lights.push({ ...middle, color: tones.glow, strength: 0.9 * lit, reachPx: cell * 2.4 });
    return drawn;
  },
};

/** How many streaks of the wind blow across the piece while it crumbles, and how long each takes to cross, in seconds. */
const WIND_STREAKS = 9;
const WIND_CROSSES_S = 0.75;

/**
 * The wind the shards are carried off on, seen as streaks of light blowing across where the piece
 * stood, the way the shards go, from as the first shard peels until the last has gone.
 */
function drawWind(
  drawn: Staged,
  stage: Stage,
  shards: readonly DissolveShard[],
  middle: Point,
  tones: { pale: string; glow: string },
  forward: number
): void {
  const { cell } = stage;
  const t = stage.seconds;
  const from = Math.min(...shards.map((shard) => shard.peelsAt)) - 0.1;
  const until = Math.max(...shards.map((shard) => shard.peelsAt + shard.flies * 0.6));
  const blowing = within(t, from, from + 0.3) * (1 - within(t, until - 0.4, until));
  if (blowing <= 0) return;
  const rise = 0.42;
  for (let streak = 0; streak < WIND_STREAKS; streak++) {
    const crosses = WIND_CROSSES_S * (0.8 + 0.4 * scatter(streak, stage.seed + 71));
    const cycle = ((t - from) / crosses + scatter(streak, stage.seed + 72)) % 1;
    const high = (scatter(streak, stage.seed + 73) - 0.5) * cell * 1.5;
    const right = (cycle - 0.4) * cell * 3;
    const seen = Math.sin(cycle * Math.PI) * blowing;
    drawn.motes.push(
      besideShard(middle, right, -high - right * Math.tan(rise) * 0.5, {
        ...glow(
          middle,
          cell * (0.08 + 0.05 * scatter(streak, stage.seed + 74)),
          streak % 3 === 0 ? '#ffffff' : tones.pale,
          seen,
          forward + 2
        ),
        shape: 'flare',
        trail: 9 + 6 * scatter(streak, stage.seed + 75),
        spin: rise * 0.5,
      })
    );
  }
}

/** A mote set off across the screen from the middle of the picture, as far right and down as a shard is. */
function besideShard(at: Point, right: number, down: number, mote: EffectMote): EffectMote {
  return { ...mote, x: at.x, y: at.y, z: at.z, aside: { right, up: -down } };
}

/**
 * What is drawn about one shard: a glow gathering where it sits before it peels; a flash as it breaks
 * off, then light rimming it as it flies and the motes it breaks up into trailing it; and, once it
 * has gone, a pale patch where it sat, the afterimage, fading.
 */
function drawShardLight(
  drawn: Staged,
  stage: Stage,
  shard: DissolveShard,
  middle: Point,
  tones: { pale: string; glow: string; body: string },
  forward: number
): void {
  const { cell, duration } = stage;
  const t = stage.seconds;
  const sits = shardPoseAt(shard, Math.max(DISSOLVE_TAKES_OVER_S[1], shard.peelsAt - 0.01), cell);
  if (!sits) return;
  const before = within(t, shard.peelsAt - GLOWS_BEFORE_S, shard.peelsAt);
  if (before > 0 && before < 1) {
    drawn.motes.push(
      besideShard(middle, sits.x, sits.y, glow(middle, cell * 0.5 * before, tones.glow, 0.9 * before, forward))
    );
    drawn.motes.push(
      besideShard(middle, sits.x, sits.y, glow(middle, cell * 0.2 * before, '#ffffff', before, forward + 1))
    );
  }
  const fading = within(t, shard.peelsAt + 0.2, duration * AFTERIMAGE_GONE);
  if (t >= shard.peelsAt && fading < 1) {
    const ghost = Math.min(1, (t - shard.peelsAt) * 5) * (1 - fading);
    drawn.motes.push(
      besideShard(middle, sits.x, sits.y, haze(middle, cell * 0.5, tones.pale, 0.6 * ghost, forward - 2))
    );
  }
  const pose = shardPoseAt(shard, t, cell);
  if (!pose || pose.flown < 0) return;
  const left = 1 - pose.flown;
  if (pose.flown < 0.18) {
    const flash = 1 - pose.flown / 0.18;
    drawn.motes.push(
      besideShard(middle, pose.x, pose.y, {
        ...glow(middle, cell * 0.55 * flash, '#ffffff', flash, forward + 2),
        shape: 'star',
        spin: shard.index,
      })
    );
  }
  drawn.motes.push(
    besideShard(middle, pose.x, pose.y, glow(middle, cell * 0.75 * pose.scale + cell * 0.12, tones.glow, left, forward))
  );
  drawn.motes.push(
    besideShard(
      middle,
      pose.x,
      pose.y,
      glow(middle, cell * 0.22 * pose.scale + cell * 0.05, tones.pale, left, forward + 1)
    )
  );
  const blown = Math.atan2(shard.drift[1], shard.drift[0]);
  drawn.motes.push(
    besideShard(middle, pose.x - Math.cos(blown) * cell * 0.3, pose.y + Math.sin(blown) * cell * 0.3, {
      ...glow(middle, cell * 0.09, tones.pale, Math.min(1, pose.flown * 6) * left, forward + 1),
      shape: 'flare',
      trail: 6 + 8 * pose.flown,
      spin: blown,
    })
  );
  for (let mote = 0; mote < 3; mote++) {
    const lag = 0.06 + mote * 0.07;
    const behind = shardPoseAt(shard, t - lag * shard.flies, cell);
    if (!behind || behind.flown < 0) continue;
    const scattered = (scatter(shard.index * 3 + mote, stage.seed) - 0.5) * cell * 0.25 * pose.flown;
    drawn.motes.push(
      besideShard(middle, behind.x + scattered, behind.y - scattered * 0.6, {
        ...glow(middle, cell * (0.1 + 0.05 * (mote % 2)), mote === 0 ? '#ffffff' : tones.pale, left, forward + 1),
        shape: mote === 2 ? 'flake' : 'glow',
        spin: t * 6 + mote,
      })
    );
  }
}

/** The band of light running up the piece from its feet, and the cracks of light it leaves opening behind it. */
function layRunningBand(
  drawn: Staged,
  stage: Stage,
  tones: { pale: string; glow: string; body: string; rim: string },
  t: number,
  forward: number
): void {
  const running = within(t, RUNS_UP_S[0], RUNS_UP_S[1]);
  const gone = 1 - within(t, DISSOLVE_TAKES_OVER_S[1], FLARES_S[1]);
  if (running <= 0 || gone <= 0) return;
  const { cell } = stage;
  const high = stage.tall * outCubic(running);
  const at = { x: stage.x, y: stage.y, z: stage.z + high };
  const radius = Math.max(cell * 0.36, stage.tall * 0.32) * (1 - 0.3 * running);
  const points = Array.from({ length: 25 }, (_unused, index) => {
    const turn = (index / 24) * Math.PI * 2;
    return { x: at.x + Math.cos(turn) * radius, y: at.y + Math.sin(turn) * radius, z: at.z };
  });
  const about = points.map(() => at);
  for (const half of ['far', 'near'] as const) {
    drawn.ribbons.push(
      { points, about, half, widths: cell * 0.14, color: tones.body, alpha: 0.9 * gone, blend: 'color' },
      { points, about, half, widths: cell * 0.065, color: '#ffffff', alpha: gone, blend: 'light' }
    );
  }
  for (let crack = 0; crack < 7; crack++) {
    const up = scatter(crack, stage.seed + 51) * 0.9;
    if (up * stage.tall > high) continue;
    const opened = Math.min(1, (high - up * stage.tall) / (cell * 0.3));
    const across = (scatter(crack, stage.seed + 52) - 0.5) * cell * 0.5;
    drawn.motes.push({
      ...glow(
        { x: stage.x, y: stage.y, z: stage.z + up * stage.tall },
        cell * 0.05,
        '#ffffff',
        opened * gone,
        forward + 2
      ),
      shape: 'flare',
      trail: 5 + 4 * scatter(crack, stage.seed + 53),
      spin: Math.PI / 2 + (scatter(crack, stage.seed + 54) - 0.5) * 1.2,
      aside: { right: across, up: 0 },
    });
  }
}

/** The floor under the piece: a pale pool while it crumbles, and the ring of light that closes on the spot at the last. */
function layFloor(
  drawn: Staged,
  stage: Stage,
  floor: Point,
  tones: { pale: string; glow: string; body: string },
  t: number
): void {
  const { cell, duration } = stage;
  const pooled = within(t, 0.25, 0.6) * (1 - within(t, duration * 0.6, duration * 0.9));
  if (pooled > 0) {
    drawn.floor.push(floorMark('disc', floor, cell * 0.8, 1, tones.body, 0.25 * pooled, 'color', 0));
    drawn.floor.push(floorMark('ring', floor, cell * 0.75, 0.12, tones.pale, 0.6 * pooled, 'light', 0));
  }
  const closing = within(t, duration * CLOSES_FROM, duration);
  if (closing <= 0 || closing >= 1) return;
  const radius = cell * (1.4 - 1.3 * outCubic(closing));
  const shown = Math.min(1, closing * 6) * (1 - within(closing, 0.85, 1));
  drawn.floor.push(floorMark('ring', floor, radius, (cell * 0.1) / radius, tones.body, 0.8 * shown, 'color', 0));
  drawn.floor.push(floorMark('ring', floor, radius, (cell * 0.05) / radius, '#ffffff', shown, 'light', 0));
}

/** The last motes of light rising from where the piece stood, twinkling out, and a glint as the ring closes. */
function drawLastMotes(
  drawn: Staged,
  stage: Stage,
  floor: Point,
  tones: { pale: string; glow: string },
  t: number,
  forward: number
): void {
  const { cell, duration } = stage;
  const from = duration * 0.5;
  for (let mote = 0; mote < LAST_MOTES; mote++) {
    const born = from + scatter(mote, stage.seed + 61) * (duration - from - 0.6);
    const age = within(t, born, born + 0.9 + 0.5 * scatter(mote, stage.seed + 62));
    if (age <= 0 || age >= 1) continue;
    const round = scatter(mote, stage.seed + 63) * Math.PI * 2;
    const out = cell * 0.45 * Math.sqrt(scatter(mote, stage.seed + 64));
    const at = {
      x: floor.x + Math.cos(round) * out,
      y: floor.y + Math.sin(round) * out,
      z: floor.z + cell * (0.1 + 1.6 * age),
    };
    const seen = Math.min(1, age * 5, (1 - age) * 2.5) * (0.6 + 0.4 * Math.sin(t * 17 + mote));
    drawn.motes.push(
      glow(at, cell * (0.08 + 0.05 * (mote % 3)), mote % 2 === 0 ? tones.pale : '#ffffff', seen, forward)
    );
  }
  const glint = within(t, duration * 0.93, duration);
  if (glint > 0 && glint < 1) {
    const left = 1 - glint;
    drawn.motes.push({
      ...glow({ ...floor, z: floor.z + cell * 0.1 }, cell * 0.7 * left, '#ffffff', left, forward),
      shape: 'star',
      spin: 0.4,
    });
  }
}
