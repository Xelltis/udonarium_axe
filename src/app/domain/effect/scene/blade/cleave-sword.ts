import type { BladeTones } from '@axe/domain/effect/scene/blade/blade-tones';
import { greatBlade } from '@axe/domain/effect/scene/blade/great-blade';
import type { CutFrame } from '@axe/domain/effect/scene/blade/slash-swing';
import type { Stage, Staged } from '@axe/domain/effect/scene/choreography';
import type { Point } from '@axe/domain/effect/scene/parts';

/*
 * The great blade of a cleave. It is raised high over the target, held from a little on its caster's
 * side and drawn back over that side, and brought down over the top: it turns about its hilt half way
 * round and more in an instant as its hilt drops, until it lies slanting down through the target with
 * its point buried in the ground just past it. The arc its point and its length sweep is left as a
 * fan, dark at its rim and the blade's colour within, white along the point's own path, and two
 * afterimages of the blade hang behind it as it falls.
 */

/** How long the blade is, in cells, and against how tall the target stands, at the least. */
const LENGTH_CELLS = 2.2;
const LENGTH_BY_TALL = 1.8;
/** Where along the blade, from its point, it is held. */
const HELD_AT = 0.86;
/** How far over the target's head it is held raised, and on its caster's side, in cells. */
const RAISED_OVER = 1;
const RAISED_ASIDE = 0.35;
/** How far back over its caster's side it is drawn as it is held raised, and further just before it falls, in radians from upright. */
const DRAWN_BACK = 0.4;
const PULLED_BACK = 0.3;
/** How steeply it lies once it is down, below level, in radians, and how far past the target its point is buried, in cells. */
const LIES = 0.87;
const BURIED_PAST = 0.5;
const BURIED_DEEP = 0;
/** Where along the blade, from its point, the middle of its fan lies, and how wide the fan is, as shares of its length. */
const FAN_AT = 0.08;
const FAN_WIDE = 0.24;
/** How much broader its blade is than a great sword's, how broad that is against its length, and where its shoulders are from its point. */
const BROAD = 1.75;
const BROAD_WIDE = 0.14 * BROAD;
const SHOULDERS = 0.72;
/** How wide the edge about the blade is along it, from its point to its shoulders, against its width there. */
const EDGE_SHAPE: readonly (readonly [along: number, wide: number])[] = [
  [0, 0.1],
  [0.06, 0.5],
  [0.2, 0.8],
  [0.5, 0.94],
  [1, 1],
];
const FAN_STEPS = 12;
/** How far behind it, through its fall, each afterimage hangs. */
const GHOSTS_LAG = [0.22, 0.42];

/** Where the great blade of a cleave is held: as it is raised, as it lies once down, and the ways about it. */
export interface CleaveSword {
  readonly cell: number;
  readonly length: number;
  /** Its hilt held raised, and once it is down. */
  readonly raised: Point;
  readonly down: Point;
  /** Level and towards its caster, and up. */
  readonly toward: Point;
}

/** Where the blade of a cleave on a stage is held; see the head of this file. */
export function cleaveSwordOf(stage: Stage, frame: CutFrame): CleaveSword {
  const U = stage.cell;
  const length = Math.max(U * LENGTH_CELLS, stage.tall * LENGTH_BY_TALL);
  const top = stage.z + Math.max(stage.tall, U * 0.5);
  const { toward } = frame;
  const tip = {
    x: stage.x - toward.x * U * BURIED_PAST,
    y: stage.y - toward.y * U * BURIED_PAST,
    z: stage.groundZ - U * BURIED_DEEP,
  };
  const lies = pointing(toward, -Math.PI / 2 - LIES);
  const held = length * HELD_AT;
  return {
    cell: U,
    length,
    raised: {
      x: stage.x + toward.x * U * RAISED_ASIDE,
      y: stage.y + toward.y * U * RAISED_ASIDE,
      z: top + U * RAISED_OVER,
    },
    down: { x: tip.x - lies.x * held, y: tip.y - lies.y * held, z: tip.z - lies.z * held },
    toward,
  };
}

/** The way a blade points turned a number of radians from upright towards its caster: below nothing, away. */
function pointing(toward: Point, turn: number): Point {
  return { x: toward.x * Math.sin(turn), y: toward.y * Math.sin(turn), z: Math.cos(turn) };
}

/** How the blade of a cleave is held at a moment: its hilt and the way its point lies, of length one. */
export interface CleaveHold {
  readonly hilt: Point;
  readonly way: Point;
}

/**
 * How the blade is held as it is raised: `risen` from below to high over the target, `drawn` from
 * upright back over its caster's side and on as it is pulled back before the fall, `tremble` its shiver.
 */
export function raisedHold(
  sword: CleaveSword,
  risen: number,
  drawn: number,
  pulled: number,
  tremble: number
): CleaveHold {
  const low = sword.cell * 0.6 * (1 - risen);
  return {
    hilt: { ...sword.raised, z: sword.raised.z - low },
    way: pointing(sword.toward, DRAWN_BACK * drawn + PULLED_BACK * pulled + tremble),
  };
}

/** How the blade is held `fallen` of the way through its fall, from 0 pulled back to 1 down: turned over the top as its hilt drops. */
export function fallenHold(sword: CleaveSword, fallen: number): CleaveHold {
  const from = DRAWN_BACK + PULLED_BACK;
  const to = -Math.PI / 2 - LIES;
  return {
    hilt: {
      x: sword.raised.x + (sword.down.x - sword.raised.x) * fallen,
      y: sword.raised.y + (sword.down.y - sword.raised.y) * fallen,
      z: sword.raised.z + (sword.down.z - sword.raised.z) * fallen,
    },
    way: pointing(sword.toward, from + (to - from) * fallen),
  };
}

/** A point of the blade held so, a share of its length from its point towards its pommel. */
export function upCleave(sword: CleaveSword, hold: CleaveHold, share: number): Point {
  const out = sword.length * (HELD_AT - share);
  return { x: hold.hilt.x + hold.way.x * out, y: hold.hilt.y + hold.way.y * out, z: hold.hilt.z + hold.way.z * out };
}

/** How the blade of a cleave is drawn at a moment: its steel, and the colours of the light about its edge. */
export interface CleaveLook {
  readonly ramp: readonly string[];
  readonly tones: BladeTones;
  readonly alpha: number;
  readonly formed: number;
  readonly glint: number;
  readonly forward: number;
}

/**
 * The blade held so: a great sword broad as a cleaver, its steel deep within pale edges, and about
 * its blade an edge of its own colour, light thrown about that.
 */
export function drawCleaveSword(drawn: Staged, sword: CleaveSword, hold: CleaveHold, look: CleaveLook): void {
  const axis = { x: -hold.way.x, y: -hold.way.y, z: -hold.way.z };
  const tip = upCleave(sword, hold, 0);
  if (look.alpha > 0.01) {
    const points = EDGE_SHAPE.map(([share]) => upCleave(sword, hold, share * SHOULDERS));
    const widths = EDGE_SHAPE.map(([, wide]) => sword.length * BROAD_WIDE * wide * (0.3 + 0.7 * look.formed));
    drawn.ribbons.push(
      {
        points,
        widths: widths.map((width) => width * 2.4),
        color: look.tones.glow,
        alpha: 0.35 * look.alpha,
        blend: 'light',
        soft: 1,
      },
      {
        points,
        widths: widths.map((width) => width * 1.32 + sword.cell * 0.03),
        color: look.tones.body,
        core: look.tones.pale,
        alpha: look.alpha,
        blend: 'color',
      }
    );
  }
  const blade = greatBlade(tip, axis, sword.length, { ...look, broad: BROAD });
  drawn.ribbons.push(...blade.ribbons);
  drawn.motes.push(...blade.motes);
}

/** The afterimages of the blade hanging behind it `fallen` of the way through its fall. */
export function drawFallGhosts(drawn: Staged, sword: CleaveSword, fallen: number, look: CleaveLook): void {
  GHOSTS_LAG.forEach((lag, index) => {
    const behind = fallen - lag;
    if (behind <= 0) return;
    drawCleaveSword(drawn, sword, fallenHold(sword, behind), { ...look, alpha: look.alpha * (0.42 - 0.18 * index) });
  });
}

/**
 * The fan the fall leaves, from `tail` to `head` of the way through it: a crescent swept by the
 * blade's length from its point half way up, widening towards where the blade is, dark at its rim
 * and the blade's colour within, and a white line along the point's own path.
 */
export function drawFallFan(
  drawn: Staged,
  sword: CleaveSword,
  tail: number,
  head: number,
  tones: BladeTones,
  alpha: number
): void {
  if (head - tail < 0.02 || alpha <= 0.01) return;
  const shares = Array.from({ length: FAN_STEPS + 1 }, (_unused, index) => index / FAN_STEPS);
  const holds = shares.map((share) => fallenHold(sword, tail + (head - tail) * share));
  const alphas = shares.map((share) => Math.pow(share, 1.4));
  const points = holds.map((hold) => upCleave(sword, hold, FAN_AT));
  const widths = shares.map((share) => sword.length * FAN_WIDE * Math.pow(share, 0.8));
  const edge = holds.map((hold) => upCleave(sword, hold, 0));
  drawn.ribbons.push(
    {
      points,
      widths: widths.map((width) => width * 1.1 + sword.cell * 0.05),
      color: tones.rim,
      alpha: 0.9 * alpha,
      alphas,
      blend: 'color',
    },
    { points, widths, color: tones.body, core: tones.pale, leans: -0.5, alpha, alphas, blend: 'color' },
    {
      points: edge,
      widths: shares.map((share) => sword.cell * 0.14 * Math.pow(share, 0.6)),
      color: '#ffffff',
      alpha,
      alphas,
      blend: 'color',
    }
  );
}
