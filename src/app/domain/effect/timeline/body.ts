import { blank, clamp01, type EffectSprite, type Point3, takeRandoms } from '@axe/domain/effect/timeline/shared';

/*
 * The crumbling of a piece's own picture, laid over the table where the piece is drawn. As the piece
 * itself fades from the table its picture takes its place, whole, cut into shards along jagged lines.
 * Cracks open between the shards, each pushed out a little from the middle and shrunk about its own,
 * wider as its turn to go nears; the picture jolts outward as it lets go, and the shards peel away one
 * by one from its windward edge, its head and the side the wind comes from first and its feet last;
 * each is kicked out from the middle as it breaks off, caught by the wind and carried off to the right
 * and up as the eye sees it, turning about its own middle, shrinking and fading as it goes.
 *
 * What is drawn about it in the table's scene, the light rimming each shard and the motes it breaks
 * into, is laid out from the same shards, which `dissolveShards` throws from the same seed.
 */

const DISSOLVE_COLUMNS = 5;
const DISSOLVE_ROWS = 7;
/** How tall the picture that crumbles is drawn, against the size the effect is drawn at: as tall as a piece of one cell stands. */
export const DISSOLVE_PICTURE_HEIGHT = 1.4;
/** How wide it is drawn, against the same. */
const DISSOLVE_PICTURE_WIDTH = (DISSOLVE_PICTURE_HEIGHT * DISSOLVE_COLUMNS) / DISSOLVE_ROWS;
/** When the picture fades in over the piece as the piece itself fades from the table, in seconds, as its fall has it. */
export const DISSOLVE_TAKES_OVER_S: readonly [number, number] = [0.17, 0.4];
/**
 * When the first shard peels away, in seconds, how long a shard is carried on the wind before it is
 * gone, and over how much of the playback the rest follow, at the most in seconds; for a playback as
 * long as the bundled one, all of it, and for a shorter one all but the first sooner.
 */
const PEELS_FROM_S = 0.55;
const FLIES_S = 1.15;
const PEELS_SHARE = 0.9;
const PEELS_MOST_S = 1.9;
/** How long a playback is crumbled at the pace above, and the least share of that pace a shorter one is crumbled at, in seconds. */
const FULL_PACE_S = 4.4;
const LEAST_PACE = 0.35;
/** How far the corners where shards meet are thrown off a straight grid, as a share of a shard. */
const JAGGED = 0.32;
/**
 * How the picture cracks before it lets go: how far its shards are pushed out from its middle and
 * shrunk about their own, as shares, as the cracks open up to the moment it lets go, as each nears its
 * own peeling, and in the jolt of the moment it lets go, which lasts as long as `JOLT_S` seconds.
 */
const CRACK_SPREAD = 0.05;
const CRACK_SHRINK = 0.08;
const NEAR_SPREAD = 0.04;
const NEAR_SHRINK = 0.06;
const NEARS_S = 0.5;
const JOLT_SPREAD = 0.08;
const JOLT_S = 0.3;
/** How far out from the middle of the picture a shard is kicked as it peels away, as a share of how far out it sat. */
const KICKED = 0.4;

/** One shard of the picture: its outline, where it sits in the picture, and how it is peeled away and carried off. */
export interface DissolveShard {
  readonly index: number;
  /** Its corners, as shares of the picture across from its left and down from its top. */
  readonly outline: readonly (readonly [number, number])[];
  /** Where its middle sits, as shares of the picture across and down. */
  readonly middle: readonly [number, number];
  /** When it peels away, and how long it flies, in seconds. */
  readonly peelsAt: number;
  /** When the picture lets go and the first shards peel away, in seconds. */
  readonly letsGoAt: number;
  readonly flies: number;
  /** How far the wind carries it, to the right and up as the eye sees it, as shares of the size the effect is drawn at. */
  readonly drift: readonly [number, number];
  /** How far it turns as it flies, in degrees. */
  readonly spin: number;
}

/**
 * The shards a picture crumbles into for a playback of `lastsS` seconds, thrown from `random`: the
 * same seed throws the same shards for the picture and for what is drawn about it in the scene.
 */
export function dissolveShards(lastsS: number, random: () => number): DissolveShard[] {
  const corners = takeRandoms(random, (DISSOLVE_COLUMNS + 1) * (DISSOLVE_ROWS + 1) * 2);
  const corner = (column: number, row: number): [number, number] => {
    const at = (row * (DISSOLVE_COLUMNS + 1) + column) * 2;
    const inside = column > 0 && column < DISSOLVE_COLUMNS && row > 0 && row < DISSOLVE_ROWS;
    const jag = inside ? JAGGED : 0;
    return [
      (column + (corners[at] - 0.5) * jag) / DISSOLVE_COLUMNS,
      (row + (corners[at + 1] - 0.5) * jag) / DISSOLVE_ROWS,
    ];
  };
  const pace = Math.min(1, Math.max(LEAST_PACE, lastsS / FULL_PACE_S));
  const peelsFrom = DISSOLVE_TAKES_OVER_S[1] + (PEELS_FROM_S - DISSOLVE_TAKES_OVER_S[1]) * pace;
  const flying = FLIES_S * pace;
  const peelsFor = Math.min(PEELS_MOST_S, Math.max(0, (lastsS - peelsFrom - flying * 1.2) * PEELS_SHARE));
  const shards: DissolveShard[] = [];
  for (let row = 0; row < DISSOLVE_ROWS; row++) {
    for (let column = 0; column < DISSOLVE_COLUMNS; column++) {
      const [order, flies, right, up, spin] = takeRandoms(random, 5);
      const outline = [
        corner(column, row),
        corner(column + 1, row),
        corner(column + 1, row + 1),
        corner(column, row + 1),
      ];
      const windward = 0.55 * ((column + 0.5) / DISSOLVE_COLUMNS) + 0.45 * ((row + 0.5) / DISSOLVE_ROWS);
      shards.push({
        index: row * DISSOLVE_COLUMNS + column,
        outline,
        middle: [
          outline.reduce((sum, [x]) => sum + x, 0) / outline.length,
          outline.reduce((sum, [, y]) => sum + y, 0) / outline.length,
        ],
        peelsAt: peelsFrom + clamp01(windward + (order - 0.5) * 0.14) * peelsFor,
        letsGoAt: peelsFrom,
        flies: flying * (0.8 + 0.4 * flies),
        drift: [1.4 + 1.3 * right, 0.55 + 1.1 * up],
        spin: (spin - 0.5) * 300,
      });
    }
  }
  return shards;
}

/** Where a shard is at a moment, against where it sits in the picture, and how it shows; null once it is gone. */
export interface ShardPose {
  /** Where its middle is, to the right and down from the middle of the picture as the eye sees it, in table pixels. */
  readonly x: number;
  readonly y: number;
  readonly turned: number;
  /** How large it is against its size in the picture, and how far it shows. */
  readonly scale: number;
  readonly opacity: number;
  /** How far it is carried off, from 0 as it peels away to 1 gone; below nothing while it sits in the picture. */
  readonly flown: number;
}

/** Where a shard is `seconds` into the crumbling of a picture drawn at `base`: see the head of this file. */
export function shardPoseAt(shard: DissolveShard, seconds: number, base: number): ShardPose | null {
  const [from, to] = DISSOLVE_TAKES_OVER_S;
  const shown = clamp01((seconds - from) / (to - from));
  if (shown <= 0) return null;
  const sits = {
    x: (shard.middle[0] - 0.5) * DISSOLVE_PICTURE_WIDTH * base,
    y: (shard.middle[1] - 0.5) * DISSOLVE_PICTURE_HEIGHT * base,
  };
  const since = seconds - shard.peelsAt;
  const { spread, shrink } = crackedAt(shard, Math.min(seconds, shard.peelsAt));
  const at = { x: sits.x * spread, y: sits.y * spread };
  if (since < 0) return { ...at, turned: 0, scale: 1 - shrink, opacity: shown, flown: -1 };
  const flown = since / shard.flies;
  if (flown >= 1) return null;
  const carried = flown * flown * 0.6 + flown * 0.4;
  const kicked = KICKED * (1 - Math.pow(1 - Math.min(1, flown * 3), 3));
  return {
    x: at.x + sits.x * kicked + shard.drift[0] * base * carried,
    y: at.y + sits.y * kicked - shard.drift[1] * base * carried - base * 0.08 * Math.sin(flown * Math.PI),
    turned: shard.spin * flown,
    scale: (1 - shrink) * (1 - 0.7 * flown),
    opacity: shown * Math.pow(1 - flown, 1.2),
    flown,
  };
}

/**
 * How far the cracks about a shard have opened `seconds` into the crumbling: how far they have opened
 * up to the moment the picture lets go, from 0 to 1; how far the shard is pushed out from the middle
 * of the picture, as a share of where it sits; and how far it is shrunk about its own middle.
 */
export function crackedAt(
  shard: DissolveShard,
  seconds: number
): { readonly opened: number; readonly spread: number; readonly shrink: number } {
  const opensFrom = (DISSOLVE_TAKES_OVER_S[0] + DISSOLVE_TAKES_OVER_S[1]) / 2;
  const cracked = clamp01((seconds - opensFrom) / Math.max(0.01, shard.letsGoAt - opensFrom));
  const near = clamp01(1 + (seconds - shard.peelsAt) / NEARS_S);
  const jolted = (seconds - shard.letsGoAt) / JOLT_S;
  const jolt = jolted > 0 && jolted < 1 ? Math.sin(Math.PI * jolted) : 0;
  return {
    opened: cracked,
    spread: 1 + CRACK_SPREAD * cracked + NEAR_SPREAD * near + JOLT_SPREAD * jolt,
    shrink: CRACK_SHRINK * cracked + NEAR_SHRINK * near,
  };
}

/** Where a spot of a picture drawn at `base` lies from its middle, given as shares across it and down it: in table pixels to the right and down. */
export function pictureSpotOf(
  spot: readonly [number, number],
  base: number
): { readonly x: number; readonly y: number } {
  return { x: (spot[0] - 0.5) * DISSOLVE_PICTURE_WIDTH * base, y: (spot[1] - 0.5) * DISSOLVE_PICTURE_HEIGHT * base };
}

/** How high over its foot the middle of a crumbling picture drawn at `base` stands, in table pixels: on the floor. */
export function dissolvePictureRise(base: number): number {
  return (base * DISSOLVE_PICTURE_HEIGHT) / 2;
}

/**
 * The crumbling of a piece's own picture `progress` of the way through a playback of `lastsS` seconds:
 * see the head of this file. Nothing for a piece with no picture.
 */
export function appendDissolve(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  lastsS: number,
  random: () => number,
  image: string
): void {
  if (image.length < 1) return;
  const seconds = progress * lastsS;
  const width = base * DISSOLVE_PICTURE_WIDTH;
  const height = base * DISSOLVE_PICTURE_HEIGHT;
  for (const shard of dissolveShards(lastsS, random)) {
    const pose = shardPoseAt(shard, seconds, base);
    if (!pose) continue;
    const local = {
      x: (shard.middle[0] - 0.5) * width * pose.scale,
      y: (shard.middle[1] - 0.5) * height * pose.scale,
    };
    const turn = (pose.turned * Math.PI) / 180;
    sprites.push({
      ...blank(),
      key: `${prefix}-dissolve-piece-${shard.index}`,
      x: center.x,
      y: center.y,
      z: center.z + dissolvePictureRise(base),
      offsetX: pose.x - (local.x * Math.cos(turn) - local.y * Math.sin(turn)),
      offsetY: pose.y - (local.x * Math.sin(turn) + local.y * Math.cos(turn)),
      width: width * pose.scale,
      height: height * pose.scale,
      rotate: pose.turned,
      opacity: pose.opacity,
      background: `url(${image}) center bottom/contain no-repeat`,
      clipPath: outlinePath(shard.outline),
    });
  }
}

/** The clip that shows one shard of the picture. */
function outlinePath(outline: readonly (readonly [number, number])[]): string {
  return `polygon(${outline.map(([x, y]) => `${roundedPercent(x)} ${roundedPercent(y)}`).join(', ')})`;
}

/** A share of the picture as a percentage to two places, which keeps the clip written short. */
function roundedPercent(value: number): string {
  return `${Math.round(value * 10000) / 100}%`;
}
