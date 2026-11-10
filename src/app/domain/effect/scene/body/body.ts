import { type Choreography, nothingStaged, outCubic, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { moteAt, type ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { drawSpark, layShockRing, thrownSparks } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  ball,
  floorMark,
  glow,
  haze,
  hueOf,
  keptFor,
  type Point,
  stageKey,
  starBurst,
  type Thrower,
  throwerFor,
} from '@axe/domain/effect/scene/parts';

/*
 * What strikes a piece down. Blood bursts from a wound: a spray of drops flung out and falling, each
 * splashing where it lands and leaving a splat; jets pulse out of the wound, and a pool spreads under
 * the piece. A cut through the piece is a single white line flashing through it, the seam glowing
 * and blood gushing from it. A piece crumbling to dust breaks into shards of light that drift up and
 * fade, a ring of light running out from it.
 *
 * The piece's own picture, cut in two or broken into pieces, is drawn over the table as it was: only
 * what is drawn about it is drawn here.
 */

/** A drop of blood: where it is flung, how large it is, and how dark. */
interface Drop {
  readonly mote: ThrownMote;
  readonly size: number;
  readonly dark: number;
}

const dropsByStage = new Map<string, { drops: Drop[]; sparks: ThrownMote[] }>();

/** Drops of blood flung from a wound: out every way and up, slowed by the air, falling to splash. */
function flungDrops(th: Thrower, wound: Point, count: number, from: number, until: number, reach: number): Drop[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const way = th.outward();
    const speed = th.range(1, 3.4) * U * reach;
    const bornAt = th.range(from, until);
    return {
      mote: th.mote({
        x: wound.x + way.cos * th.range(0, 0.15) * U,
        y: wound.y + way.sin * th.range(0, 0.15) * U,
        z: wound.z,
        vx: way.cos * speed,
        vy: way.sin * speed,
        vz: th.range(0.3, 1.2) * speed + U,
        bornAt,
        life: th.lifeOf(bornAt, 1.6, 2.4),
        gravity: th.fall,
        drag: 1.2,
        bounce: 0,
      }),
      size: th.range(0.06, 0.16),
      dark: th.range(0, 1),
    };
  });
}

/**
 * How many of the drops that land on one target leave a splat of their own on the floor: past that,
 * splats lie over one another and are not told apart, and only every so many is laid.
 */
const SPLATS_AT_MOST = 32;

/** Drops of blood at a moment: flying as streaks of red, and once landed, splats on the floor fading slowly. */
function drawDrops(
  drawn: Staged,
  drops: readonly Drop[],
  t: number,
  cell: number,
  blood: readonly string[],
  fade: number,
  forward: number
): void {
  const splatEvery = Math.ceil(drops.length / SPLATS_AT_MOST);
  for (const [index, drop] of drops.entries()) {
    const at = moteAt(drop.mote, t);
    if (!at) continue;
    const colour = drop.dark > 0.5 ? blood[0] : blood[1];
    if (at.landed) {
      if (index % splatEvery !== 0) continue;
      const splat = Math.min(1, (t - drop.mote.bornAt) * 4);
      drawn.floor.push(
        floorMark(
          'scorch',
          { x: at.x, y: at.y, z: drop.mote.floorZ },
          cell * drop.size * (1 + 0.6 * splat),
          1,
          colour,
          0.85 * fade,
          'color',
          (index % 13) + 1
        )
      );
      continue;
    }
    const speed = Math.hypot(at.vx, at.vy, at.vz);
    drawn.motes.push({
      ...ball(at, cell * drop.size, colour, 1, forward, index),
      shape: speed > cell ? 'comet' : 'puff',
      velocity: { x: at.vx, y: at.vy, z: at.vz },
      trail: 0.035,
    });
  }
}

/** The colours of blood for a look: its dark colour and its light, held to the reds of blood whatever they are. */
function bloodOf(ramp: readonly string[]): readonly [string, string, string] {
  return [mixColor(ramp[1], '#7a0a12', 0.5), mixColor(ramp[2], '#b3121c', 0.5), mixColor(ramp[3], '#e0303a', 0.4)];
}

/** Blood bursting from a wound: see the header. */
export const gore: Choreography = {
  lingerS: 1.4,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell, duration } = stage;
    const t = stage.seconds;
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const blood = bloodOf(ramp);
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const wound = { x: stage.x, y: stage.y, z: stage.z + cell * 0.6 };
    const ends = duration + 1.4;
    const fade = 1 - within(t, ends - 0.6, ends);
    const forward = cell * 0.5;
    const thrown = keptFor(dropsByStage, stageKey(stage, ends), () => {
      const th = throwerFor(stage, ends);
      // A burst at the blow, then smaller spurts as the jets pulse.
      return {
        drops: [
          ...flungDrops(th, wound, th.count(40), 0, 0.05, 1),
          ...flungDrops(th, wound, th.count(24), 0.15, duration * 0.6, 0.6),
        ],
        sparks: [],
      };
    });
    // The pool spreading under the piece, and the burst of it at the blow.
    const pooling = outCubic(within(t, 0.1, duration));
    drawn.floor.push(
      floorMark(
        'scorch',
        floor,
        cell * (0.3 + 0.55 * pooling),
        1,
        blood[0],
        0.75 * fade,
        'color',
        (stage.seed % 89) + 1
      )
    );
    drawn.floor.push(
      floorMark('scorch', floor, cell * (0.2 + 0.4 * pooling), 1, blood[1], 0.6 * fade, 'color', (stage.seed % 61) + 7)
    );
    if (t < 0.25) {
      drawn.motes.push(haze(wound, cell * (0.8 + t * 3), blood[1], 0.8 * (1 - t / 0.25), forward));
      drawn.motes.push(...starBurst(wound, cell * 1.2, blood[2], t / 0.2, forward * 1.2, 5, stage.seed));
    }
    // Jets pulsing out of the wound, each thinner.
    for (let pulse = 0; pulse < 3; pulse++) {
      const born = 0.12 + pulse * 0.28;
      const local = within(t, born, born + 0.35);
      if (local <= 0 || local >= 1) continue;
      const angle = stage.seed * 0.7 + pulse * 2.1;
      const reach = cell * (0.9 - pulse * 0.2) * outCubic(local);
      const lean = { x: Math.cos(angle), y: Math.sin(angle) };
      const points = Array.from({ length: 7 }, (_unused, index) => {
        const share = index / 6;
        return {
          x: wound.x + lean.x * reach * share,
          y: wound.y + lean.y * reach * share,
          z: wound.z + reach * share * 0.6 - reach * share * share * 0.9,
        };
      });
      drawn.ribbons.push({
        points,
        widths: points.map((_point, index) => cell * (0.16 - pulse * 0.03) * (1 - index / 7)),
        color: blood[1],
        core: blood[2],
        alpha: 1 - local,
        blend: 'color',
      });
    }
    drawDrops(drawn, thrown.drops, t, cell, blood, fade, forward);
    return drawn;
  },
};

/** The parts of a cut and the dust of a crumbling, thrown once. */
const cutByStage = new Map<string, { drops: Drop[]; sparks: ThrownMote[] }>();

/** How long the cut takes to pass through, as a share of the playback, as the picture cut in two has it. */
const CUT_ENDS = 0.22;
/** How the cut is turned on the screen, as the picture cut in two has it, in degrees. */
const CUT_ANGLE = -28;

/** A cut through the piece: the line through it, the seam glowing and blood gushing from it; see the header. */
export const bisect: Choreography = {
  lingerS: 0,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell, duration } = stage;
    const t = stage.seconds;
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const blood = bloodOf(
      rampOf(stage.preset.colorSecondary, mixColor(stage.preset.colorSecondary, '#000000', 0.4), 7)
    );
    const body = { x: stage.x, y: stage.y, z: stage.z + cell * 0.9 };
    const cuts = duration * CUT_ENDS;
    const fade = 1 - within(t, duration * 0.75, duration);
    const forward = cell * 1.2;
    const thrown = keptFor(cutByStage, stageKey(stage, duration), () => {
      const th = throwerFor(stage, duration);
      return {
        drops: flungDrops(th, body, th.count(36), cuts, cuts + 0.3, 1),
        sparks: thrownSparks(th, body, th.count(26), [4, 10], [cuts * 0.6, cuts * 0.6 + 0.02]),
      };
    });
    // The line of the cut, laid across the screen at the picture's angle and drawn through it at once.
    const angle = (CUT_ANGLE * Math.PI) / 180;
    const drawing = within(t, 0, cuts);
    if (t < cuts + 0.3) {
      const left = t < cuts ? 1 : 1 - (t - cuts) / 0.3;
      const reach = cell * (1 + 2.2 * outCubic(drawing));
      drawn.motes.push({
        ...glow(body, cell * 0.5 * left, ramp[2], left, forward),
        shape: 'flare',
        trail: reach / (cell * 0.5),
        spin: -angle,
      });
      drawn.motes.push({
        ...glow(body, cell * 0.22 * left, '#ffffff', left, forward + 1),
        shape: 'flare',
        trail: (reach / (cell * 0.22)) * 1.1,
        spin: -angle,
      });
      if (t >= cuts * 0.6)
        drawn.motes.push(...starBurst(body, cell * 2, ramp[2], (t - cuts * 0.6) / 0.25, forward + 2, 6, 0.4));
      if (t < cuts + 0.12) drawn.lights.push({ ...body, color: '#ffffff', strength: 0.9 * left, reachPx: cell * 2 });
    }
    // The seam glowing along the cut, and blood gushing from it.
    if (t >= cuts) {
      const seam = 1 - within(t, cuts, duration * 0.8);
      drawn.motes.push({
        ...glow(body, cell * 0.24 * seam, blood[2], seam * fade, forward),
        shape: 'flare',
        trail: 10,
        spin: -angle,
      });
      drawn.motes.push(haze(body, cell * 1.6, blood[1], 0.45 * seam * fade, forward - 2));
      drawDrops(drawn, thrown.drops, t, cell, blood, fade, forward);
      const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
      const pooling = outCubic(within(t, cuts, duration));
      drawn.floor.push(
        floorMark(
          'scorch',
          floor,
          cell * (0.3 + 0.6 * pooling),
          1,
          blood[0],
          0.75 * fade,
          'color',
          (stage.seed % 89) + 1
        )
      );
    }
    for (const [index, spark] of thrown.sparks.entries()) drawSpark(drawn, spark, t, cell, ramp, index, forward);
    return drawn;
  },
};

/** Shards of light the piece breaks into, drifting up and turning. */
interface Shard {
  readonly mote: ThrownMote;
  readonly size: number;
  readonly turnRate: number;
}
const shardsByStage = new Map<string, Shard[]>();

/** A piece crumbling: shards of light drifting up and fading, a ring running out; see the header. */
export const dissolve: Choreography = {
  lingerS: 0,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell, duration } = stage;
    const t = stage.seconds;
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const body = { x: stage.x, y: stage.y, z: stage.z + cell * 0.8 };
    const forward = cell * 0.8;
    const fade = 1 - within(t, duration * 0.7, duration);
    const shards = keptFor(shardsByStage, stageKey(stage, duration), () => {
      const th = throwerFor(stage, duration);
      return Array.from({ length: th.count(60) }, () => {
        const way = th.outward();
        const bornAt = th.range(duration * 0.05, duration * 0.6);
        const out = th.range(0, 0.4) * cell;
        return {
          mote: th.mote({
            x: body.x + way.cos * out,
            y: body.y + way.sin * out,
            z: floor.z + th.range(0.1, 1.5) * cell,
            vx: way.cos * th.range(0.2, 0.9) * cell,
            vy: way.sin * th.range(0.2, 0.9) * cell,
            vz: th.range(0.5, 1.6) * cell,
            bornAt,
            life: th.lifeOf(bornAt, 0.8, 1.6),
            gravity: -th.range(0.2, 0.6) * cell,
            drag: 0.8,
            bounce: 0,
          }),
          size: th.range(0.06, 0.16),
          turnRate: th.range(-8, 8),
        };
      });
    });
    const breaking = Math.min(within(t, 0, duration * 0.15), fade);
    drawn.motes.push(haze(body, cell * 2.2, hueOf(ramp), 0.4 * breaking, forward - 2));
    drawn.motes.push(glow(body, cell * 1.6, ramp[3], 0.45 * breaking, forward - 1));
    for (const shard of shards) {
      const at = moteAt(shard.mote, t);
      if (!at) continue;
      const life = Math.min(1, at.age * 5, (1 - at.age) * 2);
      const spin = (t - shard.mote.bornAt) * shard.turnRate;
      drawn.motes.push({
        ...ball(at, cell * shard.size, ramp[4], life, forward, spin),
        blend: 'light',
        shape: 'flake',
        spin,
      });
      if (shard.size > 0.12)
        drawn.motes.push({
          ...glow(at, cell * shard.size * 2.6, hueOf(ramp), 0.5 * life, forward),
          shape: 'star',
          spin,
        });
    }
    layShockRing(drawn, floor, cell * 0.4, cell * 2.6, cell * 0.12, hueOf(ramp), t - duration * 0.05, duration * 0.6);
    drawn.floor.push(floorMark('disc', floor, cell * 1.4, 1, hueOf(ramp), 0.35 * breaking, 'light', 0));
    drawn.lights.push({ ...body, color: ramp[3], strength: 0.9 * breaking, reachPx: cell * 2.5 });
    return drawn;
  },
};
