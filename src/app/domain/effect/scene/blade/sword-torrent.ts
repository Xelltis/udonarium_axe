import type { GreatSwordTiming } from '@axe/domain/effect/great-sword-looks';
import { substanceBands, type SwordPaint, whitened } from '@axe/domain/effect/scene/blade/sword-paint';
import {
  alongTorrent,
  bladeWay,
  type SwordPose,
  underTorrent,
  upBlade,
} from '@axe/domain/effect/scene/blade/sword-pose';
import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import { outCubic, type Staged, type StageTarget, within } from '@axe/domain/effect/scene/choreography';
import { floorMark, glow, lightBall, type Point } from '@axe/domain/effect/scene/parts';
import { scatter, smooth } from '@axe/domain/effect/scene/wind/wind-parts';

/*
 * The swing of a great sword and the torrent it looses. As the blade comes down it leaves a vast fan
 * of its substance behind it, bright along the way its point went and thinning back to where the
 * swing began. As it comes level the torrent erupts along the line it lies on: one wide body from
 * just before its wielder, down to the floor and on through the target and well past it, laid as the
 * blade is from a white heart out to a torn sheath, cells wide, flaring as it goes to a blunt torn head, surges
 * and lines of speed running down it, streaks racing along it and shreds peeling off its edges; it breaks about every piece standing in it. Then it thins from
 * its wielder's end and its last runs on and is gone.
 */

/** How long the torrent takes to run its whole length, in seconds. */
const RUNS_S = 0.18;
/** How long the fan the swing left takes to fade once the blade is down, in seconds. */
const FAN_FADES_S = 0.34;
/** How many points the torrent's body, and each arc of the fan, are drawn through. */
const BODY_POINTS = 20;
const FAN_STEPS = 14;
/** Where up the blade the arcs of the fan lie, and how wide each is, as shares of the blade's height. */
const FAN_ARCS: readonly (readonly [at: number, wide: number])[] = [
  [0.2, 0.3],
  [0.45, 0.3],
  [0.7, 0.28],
  [0.9, 0.2],
];
/** How many streaks race along the torrent, and how many shreds peel off its edges. */
const STREAKS = 72;
const SHREDS = 30;
/** How many surges run down the torrent at once, and where along each its band is drawn through, from its tail to its head. */
const SURGES = 6;
const SURGE_SHARES = [-1, -0.6, -0.2, 0.2, 0.6, 1];
/** How many lines of speed run along it; and how many lines and streaks run along one of wind, whose own bands would be lost among more. */
const LINES = 26;
const WIND_LINES = 6;
const WIND_STREAKS = 24;
/** How fast the streaks race, in cells a second. */
const STREAK_CELLS_S = 30;

/** Where the torrent is at a moment. */
export interface TorrentLook {
  /** How far along it its head has run and its tail has thinned to, in table pixels from its root. */
  readonly head: number;
  readonly tail: number;
  readonly alpha: number;
  /** How long since it was let go, in seconds. */
  readonly since: number;
  readonly seed: number;
}

/** Where the torrent of a great sword is at a moment of its playback; null before it is let go and once it has passed. */
export function torrentAt(pose: SwordPose, timing: GreatSwordTiming, t: number, seed: number): TorrentLook | null {
  const since = t - timing.releasesAt;
  if (since < 0 || t >= timing.spentAt) return null;
  const from = Math.min(pose.runs, pose.tall * 0.8);
  const head = from + (pose.runs - from) * outCubic(within(since, 0, RUNS_S));
  const tail = pose.runs * Math.pow(within(t, timing.thinsAt, timing.spentAt), 1.4);
  return { head, tail, alpha: 1 - within(t, timing.spentAt - 0.12, timing.spentAt), since, seed };
}

/** How wide the torrent is a distance along it, in table pixels. */
export function torrentWidthAt(pose: SwordPose, look: TorrentLook, by: number): number {
  const U = pose.cell;
  if (by <= look.tail || by >= look.head) return 0;
  const flared = (0.22 + 0.78 * smooth(0, U * 2.4, by)) * (0.82 + 0.36 * (by / pose.runs));
  const thinned = look.tail > 0 ? smooth(0, U * 2.6, by - look.tail) : 1;
  const blunt = Math.pow(Math.min(1, (look.head - by) / (U * 1.2)), 0.45);
  const bulge =
    1 + 0.1 * Math.sin(by / (U * 0.45) - look.since * 46) + 0.06 * Math.sin(by / (U * 0.21) - look.since * 71);
  const burst = 1 + 0.25 * (1 - within(look.since, 0, 0.22));
  return pose.thick * flared * thinned * blunt * bulge * burst;
}

/** The fan a great sword leaves behind its swing, given how it was held at each moment; see the head of this file. */
export function drawSwingFan(
  drawn: Staged,
  pose: SwordPose,
  paint: SwordPaint,
  timing: GreatSwordTiming,
  t: number,
  tiltAt: (seconds: number) => number
): void {
  if (t <= timing.swingsAt) return;
  const spent = within(t, timing.releasesAt, timing.releasesAt + FAN_FADES_S);
  if (spent >= 1) return;
  const head = Math.min(t, timing.releasesAt);
  const tail = timing.swingsAt + (head - timing.swingsAt) * 0.8 * spent;
  const shares = Array.from({ length: FAN_STEPS + 1 }, (_unused, index) => index / FAN_STEPS);
  const ways = shares.map((share) => bladeWay(pose, tiltAt(tail + (head - tail) * share)));
  const alphas = shares.map((share) => Math.pow(share, 1.3));
  const fade = Math.pow(1 - spent, 1.3);
  const dark = paint.element === 'dark';
  FAN_ARCS.forEach(([at, wide], arc) => {
    const points = ways.map((way) => upBlade(pose, way, at));
    const widths = shares.map((share) => pose.tall * wide * (0.35 + 0.65 * share));
    drawn.ribbons.push(
      {
        points,
        widths: widths.map((width) => width * 1.3),
        color: paint.halo,
        alpha: 0.24 * fade,
        alphas,
        blend: dark ? 'color' : 'light',
        soft: 1,
      },
      {
        points,
        widths,
        color: paint.sheath,
        core: arc >= 2 ? paint.inner : paint.body,
        alpha: (0.5 + 0.1 * arc) * fade,
        alphas,
        blend: 'color',
        torn: 0.5,
        soft: 0.55,
        flowed: (t - timing.swingsAt) * 7 + arc * 2.3,
      }
    );
  });
  const edge = ways.map((way) => upBlade(pose, way, 0.985));
  const fine = shares.map((share) => pose.cell * 0.16 * Math.pow(share, 0.7));
  drawn.ribbons.push(
    {
      points: edge,
      widths: fine.map((width) => width * 2),
      color: paint.rim,
      alpha: 0.75 * fade,
      alphas,
      blend: 'color',
    },
    {
      points: edge,
      widths: fine,
      color: dark ? paint.rim : '#ffffff',
      alpha: fade,
      alphas,
      blend: dark ? 'light' : 'color',
    }
  );
}

/** The body of the torrent; see the head of this file. `flash` whitens it, as it is at the instant it is let go. */
export function drawTorrent(drawn: Staged, pose: SwordPose, paint: SwordPaint, look: TorrentLook, flash: number): void {
  const U = pose.cell;
  const { head, tail, since, seed } = look;
  if (head - tail < U * 0.2 || look.alpha <= 0.01) return;
  const at = Array.from({ length: BODY_POINTS + 1 }, (_unused, index) => tail + ((head - tail) * index) / BODY_POINTS);
  const points = at.map((by) => alongTorrent(pose, by));
  const widths = at.map((by) => torrentWidthAt(pose, look, by));
  const flowed = -(since * STREAK_CELLS_S * 0.6 * U) / pose.thick;
  const span = head - tail;
  const dark = paint.element === 'dark';
  const windy = paint.element === 'wind';
  for (let surge = 0; surge < SURGES; surge++) {
    const middle = tail + span * ((since * 2.1 + surge / SURGES) % 1);
    const reach = U * (1.6 + 0.9 * scatter(surge, seed + 11));
    const along = SURGE_SHARES.map((share) => Math.min(head, Math.max(tail, middle + share * reach)));
    drawn.ribbons.push({
      points: along.map((by) => alongTorrent(pose, by)),
      widths: along.map(
        (by, index) => torrentWidthAt(pose, look, by) * (1 + 0.42 * (1 - Math.abs(SURGE_SHARES[index])))
      ),
      color: paint.sheath,
      alpha: look.alpha,
      blend: 'color',
      torn: 0.65,
      soft: 0.1,
      flowed: flowed * 1.2 + surge * 2.7,
    });
  }
  drawn.ribbons.push(
    ...substanceBands(points, widths, whitened(paint, flash * 0.75), { alpha: look.alpha, torn: 0.4, flowed })
  );
  for (let line = 0; line < (windy ? WIND_LINES : LINES); line++) {
    const outside = line % 3 === 0;
    const middle = tail + span * ((since * (2.6 + 1.8 * scatter(line, seed + 12)) + scatter(line, seed + 13)) % 1);
    const reach = U * (0.9 + 1.2 * scatter(line, seed + 14));
    const off =
      (line % 2 === 0 ? 1 : -1) *
      (outside ? 0.62 + 0.25 * scatter(line, seed + 15) : 0.2 + 0.26 * scatter(line, seed + 15));
    const lean = scatter(line, seed + 16) * Math.PI;
    const through = [-1, 0, 1].map((share) => {
      const by = Math.min(head, Math.max(tail, middle + share * reach));
      const at = alongTorrent(pose, by);
      const wide = torrentWidthAt(pose, look, by) * off;
      return {
        x: at.x - pose.way.y * wide * Math.cos(lean),
        y: at.y + pose.way.x * wide * Math.cos(lean),
        z: Math.max(pose.floorZ + U * 0.03, at.z + wide * Math.sin(lean)),
      };
    });
    drawn.ribbons.push({
      points: through,
      widths: [0, U * (outside ? 0.1 : 0.15), 0],
      color: outside ? paint.sheath : dark ? paint.rim : '#ffffff',
      core: outside ? paint.inner : undefined,
      alpha: (outside ? 0.85 : 0.9) * look.alpha,
      blend: 'color',
    });
  }
  const forward = U * 0.3;
  const pace = STREAK_CELLS_S * U;
  for (let index = 0; index < (windy ? WIND_STREAKS : STREAKS); index++) {
    const by =
      tail + ((since * pace * (0.7 + 0.6 * scatter(index, seed + 1)) + scatter(index, seed + 2) * span) % span);
    const wide = torrentWidthAt(pose, look, by);
    if (wide < U * 0.1) continue;
    const middle = alongTorrent(pose, by);
    const aside = (scatter(index, seed + 3) * 2 - 1) * wide * 0.4;
    const lift = (scatter(index, seed + 4) * 2 - 1) * wide * 0.36;
    drawn.motes.push({
      ...glow(
        {
          x: middle.x - pose.way.y * aside,
          y: middle.y + pose.way.x * aside,
          z: Math.max(pose.floorZ + U * 0.04, middle.z + lift),
        },
        U * (0.06 + 0.05 * scatter(index, 5)),
        dark ? paint.rim : index % 3 === 0 ? paint.spark : '#ffffff',
        look.alpha,
        forward
      ),
      shape: 'spark',
      velocity: { x: pose.way.x * pace, y: pose.way.y * pace, z: 0 },
      trail: 0.03 + 0.02 * scatter(index, 6),
    });
  }
  for (let index = 0; index < SHREDS; index++) {
    const cycle = (since * (1.6 + scatter(index, seed + 7)) + scatter(index, seed + 8)) % 1;
    const by = tail + span * (0.05 + 0.9 * ((scatter(index, seed + 9) + since * 1.3) % 1));
    const wide = torrentWidthAt(pose, look, by);
    if (wide < U * 0.2) continue;
    const middle = alongTorrent(pose, by);
    const up = index % 3 !== 0;
    const out = (index % 2 === 0 ? 1 : -1) * (up ? 0.2 : 0.5) * wide;
    const root = {
      x: middle.x - pose.way.y * out,
      y: middle.y + pose.way.x * out,
      z: middle.z + (up ? wide * 0.34 : 0),
    };
    const lean = {
      x: pose.way.x - pose.way.y * Math.sign(out) * 0.3,
      y: pose.way.y + pose.way.x * Math.sign(out) * 0.3,
      z: up ? 0.5 + 0.5 * cycle : 0.1,
    };
    drawn.motes.push(
      flowingMote(
        'lick',
        root,
        lean,
        pose.thick * (0.3 + 0.18 * scatter(index, 10)) * (1 - 0.5 * cycle),
        pose.thick * (0.6 + 0.9 * cycle),
        since * 6 + index,
        {
          color: paint.sheath,
          core: index % 2 === 0 ? paint.body : undefined,
          alpha: Math.min(1, cycle * 6, (1 - cycle) * 2.5) * look.alpha,
          forward,
          variant: index,
        }
      )
    );
  }
  if (since < RUNS_S + 0.08) {
    const left = 1 - within(since, RUNS_S * 0.5, RUNS_S + 0.08);
    const front = alongTorrent(pose, Math.max(tail, head - pose.thick * 0.4));
    drawn.motes.push(glow(front, pose.thick * 2.2, paint.halo, 0.6 * left, forward));
    drawn.motes.push(lightBall(front, pose.thick * 0.8, dark ? paint.rim : '#ffffff', 0.9 * left, forward + 1));
  }
}

/** The torrent breaking about each piece that stands in it: its light piled up before the piece and thrown up and aside off it. */
export function drawBroken(
  drawn: Staged,
  pose: SwordPose,
  paint: SwordPaint,
  look: TorrentLook,
  pieces: readonly StageTarget[]
): void {
  const U = pose.cell;
  for (const [index, piece] of pieces.entries()) {
    const dx = piece.x - pose.foot.x;
    const dy = piece.y - pose.foot.y;
    const by = dx * pose.way.x + dy * pose.way.y - pose.rootAt;
    const aside = Math.abs(-dx * pose.way.y + dy * pose.way.x);
    const wide = torrentWidthAt(pose, look, by);
    if (wide < U * 0.2 || aside > wide * 0.5 + piece.widthPx * 0.5) continue;
    const before = by - piece.widthPx * 0.45;
    const chest: Point = { ...alongTorrent(pose, before), z: piece.z + piece.widthPx * 0.6 };
    const flicker = 0.75 + 0.25 * Math.sin(look.since * 61 + index * 2.3);
    drawn.motes.push(glow(chest, piece.widthPx * 2.2, paint.halo, 0.5 * look.alpha * flicker, U * 0.5));
    drawn.motes.push(
      glow(
        chest,
        piece.widthPx * 1.1,
        paint.element === 'dark' ? paint.rim : '#ffffff',
        0.7 * look.alpha * flicker,
        U * 0.5 + 1
      )
    );
    for (let shred = 0; shred < 4; shred++) {
      const cycle = (look.since * 3.1 + shred / 4 + index * 0.37) % 1;
      const out = shred % 2 === 0 ? 1 : -1;
      const lean = {
        x: pose.way.x * 0.6 - pose.way.y * out * 0.7,
        y: pose.way.y * 0.6 + pose.way.x * out * 0.7,
        z: 0.5 + 0.5 * (shred >> 1),
      };
      drawn.motes.push(
        flowingMote(
          'lick',
          chest,
          lean,
          piece.widthPx * 0.7,
          piece.widthPx * (0.9 + 1.3 * cycle),
          look.since * 7 + shred,
          {
            color: paint.sheath,
            core: paint.inner,
            alpha: Math.min(1, cycle * 6, (1 - cycle) * 2) * look.alpha,
            forward: U * 0.5,
            variant: shred + index,
          }
        )
      );
    }
  }
}

/**
 * The floor under the torrent: lit for as long as it flows, and scored along the line it ran, the
 * score glowing while it is hot and cooling through `heat` from 1 to 0, and everything clearing as
 * `clearing` falls to nothing. `reached` is how far the torrent has ever run, in table pixels.
 */
export function layTorrentFloor(
  drawn: Staged,
  pose: SwordPose,
  paint: SwordPaint,
  look: TorrentLook | null,
  reached: number,
  heat: number,
  clearing: number,
  seed: number
): void {
  const U = pose.cell;
  const dark = paint.element === 'dark';
  if (look) {
    const steps = 12;
    for (let index = 0; index <= steps; index++) {
      const by = look.tail + ((look.head - look.tail) * index) / steps;
      const wide = torrentWidthAt(pose, look, by);
      if (wide < U * 0.1) continue;
      const flicker = 0.8 + 0.2 * Math.sin(look.since * 53 + index * 1.7);
      drawn.floor.push(
        floorMark(
          'disc',
          underTorrent(pose, by),
          wide * 1.15,
          1,
          dark ? '#020104' : paint.halo,
          (dark ? 0.4 : 0.48) * look.alpha * flicker,
          dark ? 'color' : 'light',
          0
        )
      );
    }
  }
  if (reached < U * 0.6 || clearing <= 0) return;
  const from = U * 0.5;
  const middle = underTorrent(pose, (from + reached) / 2);
  const half = (reached - from) / 2;
  const turn = Math.atan2(-pose.way.y, pose.way.x);
  const pick = (seed % 97) / 9.7;
  drawn.floor.push(
    floorMark('fissure', middle, half, (pose.thick * 0.3) / half, paint.score, 0.85 * clearing, 'color', pick, turn)
  );
  for (let patch = 0; patch < 12; patch++) {
    const by = from + (reached - from) * ((patch + 0.5) / 12);
    const aside = (scatter(patch, seed + 21) * 2 - 1) * pose.thick * 0.3;
    drawn.floor.push(
      floorMark(
        'scorch',
        underTorrent(pose, by, aside),
        U * (0.8 + 0.6 * scatter(patch, seed + 22)),
        1,
        paint.score,
        0.45 * clearing,
        'color',
        patch + (seed % 31)
      )
    );
  }
  if (heat <= 0.02) return;
  const glowing = heat > 0.7 ? paint.inner : heat > 0.35 ? paint.ember : paint.sheath;
  drawn.floor.push(
    floorMark(
      'fissure',
      middle,
      half,
      (pose.thick * 0.17) / half,
      dark ? paint.rim : glowing,
      clearing * Math.min(1, heat * 1.5),
      'light',
      pick,
      turn
    )
  );
}
